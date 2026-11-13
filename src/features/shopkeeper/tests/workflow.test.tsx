import '@testing-library/jest-dom/vitest';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PortalProvider } from '../PortalContext';
import QueuePage from '../jobs/QueuePage';
import UrgentPage from '../urgent/UrgentPage';
import SimulatorPage from '../simulation/SimulatorPage';
import { createLocalService } from '../services/localService';
import type { ShopkeeperService } from '../types';

let service: ShopkeeperService;
beforeEach(async () => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('IDBKeyRange', IDBKeyRange);
  localStorage.clear();
  service = createLocalService();
  await service.initialize();
});
afterEach(() => {
  cleanup();
  service.dispose();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function jobCard(token: string) {
  return within(screen.getByRole('article', { name: new RegExp(token) }));
}

describe('official shopkeeper workflow with IndexedDB service', () => {
  it('opens a job, persists its status, and requires confirmation before urgent reprioritization', async () => {
    const user = userEvent.setup();
    const initial = await service.getQueueSnapshot();
    const printing = initial.jobs.find(job => job.status === 'printing')!;
    const target = initial.jobs.find(job => job.status === 'queued' && job.priority === 'normal' && job.urgentRequestStatus === 'none' && job.queuePosition! > 3)!;
    const markUrgent = vi.spyOn(service, 'markJobUrgent');
    render(<MemoryRouter><PortalProvider service={service}><QueuePage /></PortalProvider></MemoryRouter>);
    await screen.findByRole('heading', { name: 'Print queue' });
    await user.click(jobCard(printing.token).getByRole('button', { name: 'View details' }));
    const details = within(screen.getByRole('dialog', { name: `Job details · ${printing.token}` }));
    await user.click(details.getByRole('button', { name: 'Mark Ready' }));
    await waitFor(() => expect(details.getAllByText('ready', { exact: true }).length).toBeGreaterThan(0));
    expect((await service.getJobById(printing.id)).status).toBe('ready');
    await user.click(details.getByRole('button', { name: 'Close' }));
    expect(jobCard(printing.token).getByText('ready', { exact: true })).toBeVisible();

    const beforeUrgency = await service.getQueueSnapshot();
    await user.click(jobCard(target.token).getByRole('button', { name: 'Mark Urgent' }));
    let confirmation = within(await screen.findByRole('dialog', { name: 'Mark this job urgent?' }));
    expect(confirmation.getByRole('table', { name: 'Current and proposed queue impact' })).toBeVisible();
    expect(markUrgent).not.toHaveBeenCalled();
    expect((await service.getJobById(target.id)).priority).toBe('normal');
    await user.click(confirmation.getByRole('button', { name: 'Cancel' }));
    expect((await service.getQueueSnapshot()).revision).toBe(beforeUrgency.revision);
    expect(markUrgent).not.toHaveBeenCalled();

    await user.click(jobCard(target.token).getByRole('button', { name: 'Mark Urgent' }));
    confirmation = within(await screen.findByRole('dialog', { name: 'Mark this job urgent?' }));
    await user.click(confirmation.getByRole('button', { name: 'Confirm urgency' }));
    await waitFor(() => expect(jobCard(target.token).getByText('urgent', { exact: true })).toBeVisible());
    expect(markUrgent).toHaveBeenCalledTimes(1);
    const after = await service.getQueueSnapshot();
    const promoted = after.jobs.find(job => job.id === target.id)!;
    expect(promoted.urgentRequestStatus).toBe('approved');
    expect(promoted.queuePosition).toBeLessThan(target.queuePosition!);
    expect(promoted.estimatedWaitMinutes).toBeLessThanOrEqual(beforeUrgency.jobs.find(job => job.id === target.id)!.estimatedWaitMinutes!);
    expect(new Set(after.jobs.map(job => job.id)).size).toBe(after.jobs.length);
  });

  it('starts a queued job and renders the persisted printing status', async () => {
    let snapshot = await service.getQueueSnapshot();
    const printing = snapshot.jobs.find(job => job.status === 'printing')!;
    snapshot = await service.updateJobStatus(printing.id, 'ready', snapshot.revision);
    const target = snapshot.jobs.find(job => job.status === 'queued' && job.queuePosition === 1)!;
    const user = userEvent.setup();
    render(<MemoryRouter><PortalProvider service={service}><QueuePage /></PortalProvider></MemoryRouter>);
    await screen.findByRole('heading', { name: 'Print queue' });
    await user.click(jobCard(target.token).getByRole('button', { name: 'Start Printing' }));
    await waitFor(() => expect(jobCard(target.token).getByText('printing', { exact: true })).toBeVisible());
    expect((await service.getJobById(target.id)).status).toBe('printing');
    expect(jobCard(target.token).getByRole('button', { name: 'Mark Ready' })).toBeEnabled();
  });

  it('renders unsafe document names as text and searches actual persisted data', async () => {
    const unsafeName = '<img src=x onerror="alert(1)">.pdf';
    const added = await service.addDemoJob({ documentName: unsafeName, pageCount: 2, copies: 1, colorMode: 'bw', duplex: false });
    const target = added.jobs.find(job => job.documentName === unsafeName)!;
    const user = userEvent.setup();
    render(<MemoryRouter><PortalProvider service={service}><QueuePage /></PortalProvider></MemoryRouter>);
    await screen.findByRole('heading', { name: 'Print queue' });
    await user.type(screen.getByRole('searchbox', { name: 'Search token or document' }), target.token);
    expect(screen.getAllByRole('article')).toHaveLength(1);
    expect(jobCard(target.token).getByRole('heading', { name: unsafeName })).toHaveTextContent(unsafeName);
    expect(document.querySelector('img[src="x"]')).toBeNull();
    await user.click(jobCard(target.token).getByRole('button', { name: 'View details' }));
    for (const heading of within(screen.getByRole('dialog')).getAllByRole('heading', { name: unsafeName })) {
      expect(heading).toBeVisible();
      expect(heading).toHaveTextContent(unsafeName);
    }
    expect(document.querySelector('[onerror]')).toBeNull();
  });

  it('cancels a pending request rejection, then records rejection without moving jobs', async () => {
    const initial = await service.getQueueSnapshot();
    const pending = initial.jobs.find(job => job.urgentRequestStatus === 'pending')!;
    const order = initial.jobs.filter(job => job.status === 'queued').map(job => [job.id, job.queuePosition]);
    const reject = vi.spyOn(service, 'rejectUrgentRequest');
    const user = userEvent.setup();
    render(<MemoryRouter><PortalProvider service={service}><UrgentPage /></PortalProvider></MemoryRouter>);
    await screen.findByRole('heading', { name: 'Urgent requests' });
    await user.click(screen.getByRole('button', { name: /^Reject$/ }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    expect(reject).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /^Reject$/ }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirm rejection' }));
    await screen.findByRole('heading', { name: 'No pending urgent requests' });
    expect((await service.getJobById(pending.id)).urgentRequestStatus).toBe('rejected');
    expect((await service.getQueueSnapshot()).jobs.filter(job => job.status === 'queued').map(job => [job.id, job.queuePosition])).toEqual(order);
  });

  it('keeps simulation isolated, allows cancellation, and blocks a stale confirmation', async () => {
    const initial = await service.getQueueSnapshot();
    const target = initial.jobs.find(job => job.status === 'queued')!;
    const user = userEvent.setup();
    const apply = vi.spyOn(service, 'applySimulation');
    render(<MemoryRouter><PortalProvider service={service}><SimulatorPage /></PortalProvider></MemoryRouter>);
    await screen.findByRole('heading', { name: 'What-if queue simulator' });
    await user.selectOptions(screen.getByRole('combobox', { name: 'Scenario' }), 'quantity');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Queued job' }), target.id);
    const quantity = screen.getByRole('spinbutton', { name: 'Number of copies' });
    await user.clear(quantity);
    await user.type(quantity, String(target.copies + 1));
    await user.click(screen.getByRole('button', { name: 'Run simulation' }));
    await screen.findByRole('table', { name: 'Current and proposed queue impact' });
    expect((await service.getJobById(target.id)).copies).toBe(target.copies);
    expect((await service.getQueueSnapshot()).revision).toBe(initial.revision);
    await user.click(screen.getByRole('button', { name: 'Apply Changes' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    expect(apply).not.toHaveBeenCalled();
    expect((await service.getJobById(target.id)).copies).toBe(target.copies);
    await user.click(screen.getByRole('button', { name: 'Apply Changes' }));
    await act(async () => {
      await service.updateSettings({ ...initial.settings, shopName: 'Changed in another view' }, initial.revision);
    });
    await waitFor(() => expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirm changes' })).toBeDisabled());
    expect(apply).not.toHaveBeenCalled();
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect((await service.getJobById(target.id)).copies).toBe(target.copies);
  });
});
