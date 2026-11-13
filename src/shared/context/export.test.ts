// @vitest-environment node
import { decode } from '@toon-format/toon';
import { describe, expect, it } from 'vitest';
import { createDemoSnapshot } from '../../features/shopkeeper/services/demo';
import { calculateSnapshot } from '../../features/shopkeeper/services/engine';
import { encodeContext, projectContext } from './export';

const NOW = Date.UTC(2026, 10, 13, 4, 30, 0);

describe('shared context export', () => {
  it('round-trips losslessly through TOON decode and matches projectContext', () => {
    const snapshot = createDemoSnapshot(NOW);
    const projected = projectContext(snapshot);
    const encoded = encodeContext(snapshot);
    expect(decode(encoded)).toEqual(projected);
  });

  it('excludes tokens, names, instructions, file metadata, and activity', () => {
    const snapshot = createDemoSnapshot(NOW);
    const encoded = encodeContext(snapshot);
    const projected = projectContext(snapshot);
    const serialized = JSON.stringify(projected);

    for (const job of snapshot.jobs) {
      expect(serialized).not.toContain(job.token);
      expect(serialized).not.toContain(job.documentName);
      if (job.originalFileName) expect(serialized).not.toContain(job.originalFileName);
      if (job.documentId) expect(serialized).not.toContain(job.documentId);
      if (job.instructions) expect(serialized).not.toContain(job.instructions);
    }
    for (const entry of snapshot.activity) {
      expect(serialized).not.toContain(entry.message);
    }
    expect(encoded).not.toContain('PQ-');
    expect(projected).not.toHaveProperty('activity');
  });

  it('handles an empty queue cleanly', () => {
    const base = createDemoSnapshot(NOW);
    const emptySnapshot = calculateSnapshot(
      {
        ...base,
        jobs: [],
      },
      NOW,
    );
    const projected = projectContext(emptySnapshot);
    expect(projected.jobs).toEqual([]);
    expect(decode(encodeContext(emptySnapshot))).toEqual(projected);
  });

  it('rejects invalid snapshots', () => {
    const invalid = { ...createDemoSnapshot(NOW), revision: -1 };
    expect(() => projectContext(invalid)).toThrow();
    expect(() => encodeContext(invalid)).toThrow();
  });
});
