// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createDemoSnapshot } from '../../features/shopkeeper/services/demo';
import { calculateSnapshot } from '../../features/shopkeeper/services/engine';
import { calculateAnalytics, requestUrgency, transitionJob } from './mutations';
import {
  createConnectedPickupToken,
  decodePickupPayload,
  encodePickupPayload,
  MAX_PICKUP_INPUT_LENGTH,
} from './pickupCodec';
import { buildOperatingHours, projectStudentObservation } from './workspace';

const NOW = Date.UTC(2026, 10, 13, 4, 30, 0);

describe('shared printq domain', () => {
  it('projects student observations with privacy, alias, dataOrigin, documentLocation, and localGeneration', () => {
    const snapshot = createDemoSnapshot(NOW);
    const ownerJob = snapshot.jobs[0]!;
    const otherJob = snapshot.jobs[1]!;
    const observedAt = new Date(NOW).toISOString();

    const result = projectStudentObservation(
      {
        snapshot,
        observedAt,
        submissions: {
          [ownerJob.id]: {
            studentId: 'student-1',
            pageCountSource: 'exact',
            documentLocation: 'server',
          },
          [otherJob.id]: {
            studentId: 'student-2',
            pageCountSource: 'manual',
            documentLocation: 'local',
          },
        },
      },
      'student-1',
      (jobId) => `alias-${jobId}`,
      'shared',
      7,
    );

    expect(result.meta.dataOrigin).toBe('shared');
    expect(result.meta.localGeneration).toBe(7);

    const ownProjected = result.jobs.find((j) => j.id === ownerJob.id)!;
    const otherProjected = result.jobs.find((j) => j.id === otherJob.id)!;

    expect(ownProjected.isOwner).toBe(true);
    expect(ownProjected.documentLocation).toBe('server');
    expect(ownProjected.documentName).toBe(ownerJob.documentName);
    expect(ownProjected.pickupToken).toBe(ownerJob.token);

    expect(otherProjected.isOwner).toBe(false);
    expect(otherProjected.documentName).toBe(`alias-${otherJob.id}`);
    expect(otherProjected.pickupToken).toBeNull();
    expect(otherProjected.instructions).toBe('');
  });

  it('builds 30 Asia/Kolkata operating hour days', () => {
    const snapshot = createDemoSnapshot(NOW);
    const hours = buildOperatingHours(snapshot.settings, new Date(NOW).toISOString());
    expect(hours.timeZone).toBe('Asia/Kolkata');
    expect(hours.days).toHaveLength(30);
    expect(hours.days[0]!.opensAt).toContain('+05:30');
    expect(hours.days[0]!.closesAt).toContain('+05:30');
  });

  it('validates pickupCodec 160-char limit, qrOnly, UUID, and numeric tokens', () => {
    const numericToken = 'PQ-2026-1001';
    const uuidToken = createConnectedPickupToken();

    expect(decodePickupPayload(numericToken)).toBe(numericToken);
    expect(decodePickupPayload(encodePickupPayload(numericToken), true)).toBe(numericToken);
    expect(decodePickupPayload(numericToken, true)).toBeNull();

    expect(decodePickupPayload(uuidToken)).toBe(uuidToken);
    expect(decodePickupPayload(encodePickupPayload(uuidToken), true)).toBe(uuidToken);

    const overLimit = `PQ-2026-${'1'.repeat(MAX_PICKUP_INPUT_LENGTH)}`;
    expect(decodePickupPayload(overLimit)).toBeNull();
  });

  it('applies mutations for transitionJob, requestUrgency, and calculateAnalytics', () => {
    const snapshot = createDemoSnapshot(NOW);
    const readyJob = snapshot.jobs.find((j) => j.status === 'ready')!;
    expect(() => transitionJob(snapshot, readyJob.id, 'collected', NOW, false)).toThrow();
    transitionJob(snapshot, readyJob.id, 'collected', NOW, true);
    expect(readyJob.status).toBe('collected');

    const normalQueued = snapshot.jobs.find(
      (j) => j.status === 'queued' && j.priority === 'normal' && j.urgentRequestStatus === 'none',
    )!;
    requestUrgency(snapshot, normalQueued.id, NOW);
    expect(normalQueued.urgentRequestStatus).toBe('pending');

    const analytics = calculateAnalytics(snapshot, NOW);
    expect(analytics.submitted).toBe(snapshot.jobs.length);
  });

  it('computes integrated mode operatingTime in Asia/Kolkata regardless of local TZ', () => {
    const base = createDemoSnapshot(NOW);
    const integrated = {
      ...base,
      mode: 'integrated' as const,
      settings: {
        ...base.settings,
        opensAt: '09:00',
        closesAt: '21:00',
        pickupBufferMinutes: 15,
      },
    };
    // 2026-11-13 03:00:00 UTC is 08:30:00 IST (before 09:00 IST open)
    const beforeOpenUtc = Date.UTC(2026, 10, 13, 3, 0, 0);
    const calculated = calculateSnapshot(integrated, beforeOpenUtc);
    const printing = calculated.jobs.find((j) => j.status === 'printing')!;
    // 09:00 IST = 03:30 UTC; remainingMinutes = 4.6 -> 03:34:36 UTC
    const expectedPickupMs = Date.UTC(2026, 10, 13, 3, 30, 0) + printing.remainingMinutes! * 60000;
    expect(Date.parse(printing.estimatedPickupAt!)).toBeCloseTo(expectedPickupMs, -2);
  });
});
