import { IDBFactory } from 'fake-indexeddb';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { PortalProvider } from '../PortalContext';
import Dashboard from '../pages/Dashboard';
import { createLocalService } from '../services/localService';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('keeps the running job actionable and updates actual pickup readiness without WebGL', async () => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('BroadcastChannel', undefined);
  const service = createLocalService();
  try {
    const initial = await service.initialize();
    const running = initial.jobs.find(job => job.status === 'printing')!;
    const user = userEvent.setup();
    render(<MemoryRouter><PortalProvider service={service}><Dashboard /></PortalProvider></MemoryRouter>);
    await screen.findByRole('heading', { name: 'Shop overview' });
    expect(screen.getAllByText(running.token).length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: 'Mark Ready' }));
    await waitFor(async () => expect((await service.getJobById(running.id)).status).toBe('ready'));
    expect(await screen.findByText('No job is printing')).toBeVisible();
    for (const link of screen.getAllByRole('link', { name: 'Open print queue' })) {
      expect(link).toHaveAttribute('href', '/shopkeeper/queue');
    }
    const persisted = await service.getQueueSnapshot();
    expect(persisted.jobs.filter(job => job.status === 'ready')).toHaveLength(initial.jobs.filter(job => job.status === 'ready').length + 1);
    expect(persisted.jobs.filter(job => job.status === 'printing')).toHaveLength(0);
  } finally {
    cleanup();
    service.dispose();
  }
});
