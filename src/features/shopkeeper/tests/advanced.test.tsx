import { Blob as NodeBlob } from 'node:buffer';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Job, Language, ShopkeeperService, Snapshot, StoredDocument } from '../types';
import { createDemoSnapshot, createSampleDocument } from '../services/demo';
import { DocumentPanel, inspectDocument } from '../documents/DocumentPanel';
import PickupPage, { parsePickupToken } from '../qr/PickupPage';
import { Receipt } from '../receipts/Receipt';
import CompletedPage from '../receipts/CompletedPage';
import PrintersPage from '../printers/PrintersPage';
import SettingsPage from '../pages/SettingsPage';
import { deriveAnalytics } from '../analytics/AnalyticsPage';

const camera = vi.hoisted(() => ({ stop: vi.fn(), decode: vi.fn() }));
vi.mock('@zxing/browser', () => ({ BrowserQRCodeReader: class { decodeFromVideoDevice(...args: unknown[]) { return camera.decode(...args); } } }));
interface PortalFixture {
  snapshot: Snapshot; service: ShopkeeperService;
  run: (operation: () => Promise<Snapshot>, success?: string) => Promise<boolean>;
  t: (key: string) => string; notify: (message: string, kind?: 'error' | 'success' | 'info') => void;
  language: Language; setLanguage: (value: Language) => void;
  theme: 'light' | 'dark'; setTheme: (value: 'light' | 'dark') => void;
}
let portal: PortalFixture;
vi.mock('../PortalContext', () => ({ usePortal: () => portal }));
const service = {
  getDocument: vi.fn<(id: string) => Promise<StoredDocument>>(),
  verifyPickupToken: vi.fn<(token: string) => Promise<Job>>(),
  markCollected: vi.fn<(id: string, revision: number) => Promise<Snapshot>>(),
  updateSettings: vi.fn<ShopkeeperService['updateSettings']>(),
  addDemoJob: vi.fn<ShopkeeperService['addDemoJob']>(),
  requestDemoUrgency: vi.fn<ShopkeeperService['requestDemoUrgency']>(),
  resetDemo: vi.fn<ShopkeeperService['resetDemo']>(),
  updatePrinterStatus: vi.fn<ShopkeeperService['updatePrinterStatus']>(),
};
const createUrl = vi.fn(() => 'blob:printq-test-document');
const revokeUrl = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('Blob', NodeBlob);
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createUrl });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeUrl });
  createUrl.mockReturnValue('blob:printq-test-document');
  portal = {
    snapshot: createDemoSnapshot(), service: service as unknown as ShopkeeperService,
    t: key => key, notify: vi.fn(), language: 'en', setLanguage: vi.fn(), theme: 'light', setTheme: vi.fn(),
    run: vi.fn(async operation => { portal.snapshot = await operation(); return true; }),
  };
  service.getDocument.mockResolvedValue(createSampleDocument());
  service.verifyPickupToken.mockImplementation(async token => {
    const job = portal.snapshot.jobs.find(record => record.token === token);
    if (!job) throw new Error('No matching pickup token was found.');
    return job;
  });
  service.markCollected.mockImplementation(async id => ({ ...portal.snapshot, revision: portal.snapshot.revision + 1, jobs: portal.snapshot.jobs.map(job => job.id === id ? { ...job, status: 'collected', collectedAt: new Date().toISOString() } : job) }));
  service.resetDemo.mockImplementation(async () => createDemoSnapshot());
  service.updateSettings.mockImplementation(async settings => ({ ...portal.snapshot, settings }));
  service.updatePrinterStatus.mockImplementation(async (state, downtimeMinutes) => ({ ...portal.snapshot, printer: { ...portal.snapshot.printer, state, downtimeMinutes } }));
  camera.decode.mockResolvedValue({ stop: camera.stop });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

// These are consumer-visible interactions, not substitutes for the service's CAS and persistence tests.
describe('Document safety and availability', () => {
  it('renders filenames as text and explains a missing attachment', () => {
    const job = { ...portal.snapshot.jobs[0], documentName: '<img src=x onerror=alert(1)>' };
    const view = render(<DocumentPanel job={job} />);
    expect(screen.getByText(job.documentName)).toBeVisible();
    expect(screen.getByText('Document information available — no file attached.')).toBeVisible();
    expect(view.container.querySelector('img')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Download original' })).not.toBeInTheDocument();
  });
  it('blocks an HTML file renamed as PDF before preview or download', async () => {
    const job = portal.snapshot.jobs.find(record => record.documentId)!;
    service.getDocument.mockResolvedValue({ id: job.documentId!, name: 'unsafe.pdf', mimeType: 'application/pdf', blob: new Blob(['<script>alert(1)</script>'], { type: 'application/pdf' }) });
    render(<DocumentPanel job={job} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('file signature');
    expect(screen.queryByRole('button', { name: 'Preview file' })).not.toBeInTheDocument();
    expect(createUrl).not.toHaveBeenCalled();
  });
  it('downloads only checked blob URLs and revokes them on unmount', async () => {
    const job = portal.snapshot.jobs.find(record => record.documentId)!;
    const view = render(<DocumentPanel job={job} />);
    const download = await screen.findByRole('link', { name: 'Download original' });
    expect(download).toHaveAttribute('href', 'blob:printq-test-document');
    fireEvent.click(screen.getByRole('button', { name: 'Preview file' }));
    expect(screen.getByTitle('Document preview')).toHaveAttribute('sandbox', 'allow-same-origin allow-modals');
    view.unmount(); expect(revokeUrl).toHaveBeenCalledWith('blob:printq-test-document');
  });
  it('explains blocked previews without removing safe open or download access', async () => {
    const job = portal.snapshot.jobs.find(record => record.documentId)!;
    render(<DocumentPanel job={job} />);
    await screen.findByRole('link', { name: 'Download original' });
    fireEvent.click(screen.getByRole('button', { name: 'Preview file' }));
    expect(screen.getByText('If the browser cannot display this preview, open or download the original file.')).toBeVisible();
    const preview = screen.getByTitle('Document preview');
    fireEvent.error(preview);
    expect(screen.getByRole('alert')).toHaveTextContent('The browser could not display this preview.');
    expect(screen.getByRole('link', { name: 'Download original' })).toHaveAttribute('href', 'blob:printq-test-document');
    expect(screen.getByRole('link', { name: 'Open file' })).toHaveAttribute('href', 'blob:printq-test-document');
    expect(screen.getByRole('link', { name: 'Open file' })).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByRole('button', { name: 'Print document' })).toBeDisabled();
    expect(preview).toHaveAttribute('sandbox', 'allow-same-origin allow-modals');
    expect(revokeUrl).not.toHaveBeenCalled();
  });
  it('rejects empty, oversized, mismatched and truncated content; reports encryption honestly', async () => {
    const file = createSampleDocument();
    await expect(inspectDocument({ ...file, blob: new Blob([]) })).rejects.toThrow('20 MiB');
    await expect(inspectDocument({ ...file, blob: new Blob([new Uint8Array(20 * 1024 * 1024 + 1)], { type: 'application/pdf' }) })).rejects.toThrow('20 MiB');
    await expect(inspectDocument({ ...file, mimeType: 'text/html' })).rejects.toThrow('file type');
    await expect(inspectDocument({ ...file, blob: new Blob(['%PDF-1.4\ntruncated'], { type: 'application/pdf' }) })).rejects.toThrow('truncated');
    const result = await inspectDocument({ ...file, blob: new Blob(['%PDF-1.4\n/Encrypt 4 0 R\n%%EOF'], { type: 'application/pdf' }) });
    expect(result.warnings).toContain('This PDF declares encryption. Ask for an unlocked copy before printing.');
  });
});

describe('Pickup verification and collection', () => {
  it('accepts the agreed payload and rejects URLs, scripts, wrong versions and raw camera tokens', () => {
    expect(parsePickupToken(' printq:v1:PQ-2026-1008 ')).toBe('PQ-2026-1008');
    expect(parsePickupToken('PQ-2026-1008')).toBe('PQ-2026-1008');
    for (const input of ['javascript:alert(1)', '<script>bad</script>', 'https://evil.test/PQ-2026-1008', 'printq:v2:PQ-2026-1008', 'printq:v1:PQ-2026-1008:extra']) expect(() => parsePickupToken(input)).toThrow();
    expect(() => parsePickupToken('PQ-2026-1008', true)).toThrow();
  });
  it('never calls lookup for malformed input, and visibly reports unknown records', async () => {
    render(<PickupPage />);
    fireEvent.change(screen.getByLabelText('Pickup token'), { target: { value: '<script>bad</script>' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify token' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('valid pickup token');
    expect(service.verifyPickupToken).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Pickup token'), { target: { value: 'PQ-2026-9999' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify token' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No matching pickup token');
  });
  it('requires a ready record and explicit handover confirmation, then blocks duplicate collection', async () => {
    render(<PickupPage />);
    const token = portal.snapshot.jobs.find(job => job.status === 'ready')!.token;
    fireEvent.change(screen.getByLabelText('Pickup token'), { target: { value: token } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify token' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm collection' }));
    expect(service.markCollected).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Mark collected' }));
    await waitFor(() => expect(service.markCollected).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Verify token' }));
    expect(await screen.findByText('This order has already been collected. Duplicate collection is blocked.')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Confirm collection' })).not.toBeInTheDocument();
  });
  it('prevents collecting queued jobs and distrusts a mismatched service response', async () => {
    render(<PickupPage />);
    const queued = portal.snapshot.jobs.find(job => job.status === 'queued')!;
    fireEvent.change(screen.getByLabelText('Pickup token'), { target: { value: queued.token } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify token' }));
    expect(await screen.findByText('This order is not ready. Collection is blocked until printing is finished.')).toBeVisible();
    expect(service.markCollected).not.toHaveBeenCalled();
    service.verifyPickupToken.mockResolvedValue(portal.snapshot.jobs.find(job => job.status === 'ready')!);
    fireEvent.click(screen.getByRole('button', { name: 'Verify token' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('does not match');
  });
  it('decodes a versioned camera payload, stops scanning, and still requires confirmation', async () => {
    vi.stubGlobal('isSecureContext', true);
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn() } });
    render(<PickupPage />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Start camera' })); });
    const callback = camera.decode.mock.calls[0][2] as (result: { getText: () => string }, error: undefined, controls: { stop: () => void }) => void;
    const ready = portal.snapshot.jobs.find(job => job.status === 'ready')!;
    await act(async () => { callback({ getText: () => `printq:v1:${ready.token}` }, undefined, { stop: camera.stop }); });
    expect(await screen.findByRole('button', { name: 'Confirm collection' })).toBeVisible();
    expect(camera.stop).toHaveBeenCalled();
    expect(service.markCollected).not.toHaveBeenCalled();
  });
  it('stops camera controls on unmount and leaves manual entry usable after camera failure', async () => {
    vi.stubGlobal('isSecureContext', true);
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn() } });
    const view = render(<PickupPage />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Start camera' })); });
    expect(camera.decode).toHaveBeenCalledTimes(1);
    view.unmount(); expect(camera.stop).toHaveBeenCalled();
    camera.decode.mockRejectedValue(new Error('Permission denied'));
    render(<PickupPage />); fireEvent.click(screen.getByRole('button', { name: 'Start camera' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Camera could not start');
    expect(screen.getByLabelText('Pickup token')).toBeEnabled();
  });
});

describe('Acknowledgements, history and settings', () => {
  it('prints a safely rendered acknowledgement and never claims payment', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.push(callback); return frames.length; });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const job = { ...portal.snapshot.jobs[0], documentName: '<script>alert("receipt")</script>' };
    const view = render(<Receipt job={job} />);
    expect(screen.getByText(job.documentName)).toBeVisible();
    expect(screen.getByText('Order acknowledgement — not proof of payment')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Print receipt / save PDF' }));
    const printArea = document.querySelector('.printq-acknowledgement-print')!;
    expect(printArea.textContent).toContain(job.documentName);
    expect(printArea.querySelector('script')).toBeNull();
    act(() => { frames.forEach(callback => callback(0)); });
    expect(print).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.printq-acknowledgement-print')).not.toBeNull();
    act(() => { window.dispatchEvent(new Event('afterprint')); });
    expect(document.querySelector('.printq-acknowledgement-print')).toBeNull();
    expect(view.container.querySelector('script')).toBeNull();
  });
  it('shows collected history without mixing ready orders into completed counts', () => {
    render(<MemoryRouter><CompletedPage /></MemoryRouter>);
    for (const job of portal.snapshot.jobs.filter(job => job.status === 'collected')) expect(screen.getByText(job.token)).toBeVisible();
    for (const job of portal.snapshot.jobs.filter(job => job.status === 'ready')) expect(screen.queryByText(job.token)).not.toBeInTheDocument();
  });
  it('rejects invalid prices and reversed hours without persisting, and escapes shop names', async () => {
    const view = render(<MemoryRouter><SettingsPage /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText('B&W price per page (₹)'), { target: { value: '-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save shop settings' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Prices must be numbers');
    expect(service.updateSettings).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('B&W price per page (₹)'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Opens at'), { target: { value: '20:00' } });
    fireEvent.change(screen.getByLabelText('Closes at'), { target: { value: '08:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save shop settings' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Closing must be after opening');
    expect(service.updateSettings).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Shop display name'), { target: { value: '<script>not executable</script>' } });
    expect(view.container.querySelector('script')).toBeNull();
  });
  it('rejects disguised uploaded content before adding an incoming job', async () => {
    render(<MemoryRouter><SettingsPage /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText('Document name'), { target: { value: 'Untrusted upload' } });
    const disguised = Object.assign(new Blob(['<html><script>bad()</script></html>'], { type: 'application/pdf' }), { name: 'renamed.pdf' }) as File;
    fireEvent.change(screen.getByLabelText('Attach an original file (optional)'), { target: { files: [disguised] } });
    fireEvent.click(screen.getByRole('button', { name: 'Add incoming job' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('file signature');
    expect(service.addDemoJob).not.toHaveBeenCalled();
    expect(document.querySelector('script')).toBeNull();
  });
  it('confirms destructive demo reset and omits destructive controls in integrated mode', async () => {
    const view = render(<MemoryRouter><SettingsPage /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Reset demo' }));
    expect(service.resetDemo).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    expect(service.resetDemo).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Reset demo' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Reset demo data' }));
    await waitFor(() => expect(service.resetDemo).toHaveBeenCalledWith(0));
    view.unmount(); portal.snapshot = { ...portal.snapshot, mode: 'integrated' };
    render(<MemoryRouter><SettingsPage /></MemoryRouter>);
    expect(screen.queryByRole('button', { name: 'Reset demo' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add incoming job' })).not.toBeInTheDocument();
  });
  it('requires printer confirmation and keeps statuses intact when resuming', async () => {
    portal.snapshot = { ...portal.snapshot, printer: { ...portal.snapshot.printer, state: 'maintenance' } };
    const statuses = portal.snapshot.jobs.map(job => job.status);
    render(<MemoryRouter><PrintersPage /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Resume printing' }));
    expect(service.updatePrinterStatus).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirm availability change' }));
    await waitFor(() => expect(service.updatePrinterStatus).toHaveBeenCalledWith('operational', null, 0));
    expect(portal.snapshot.jobs.map(job => job.status)).toEqual(statuses);
  });
});

describe('Snapshot analytics and EcoPrint', () => {
  it('counts physical sheets by copy, excludes unprinted work and preserves zero datasets', () => {
    const base = portal.snapshot.jobs[0];
    const jobs: Job[] = [
      { ...base, id: 'printed-duplex', status: 'collected', pageCount: 5, copies: 3, duplex: true },
      { ...base, id: 'printed-simplex', status: 'ready', pageCount: 5, copies: 2, duplex: false },
      { ...base, id: 'unprinted-duplex', status: 'queued', pageCount: 100, copies: 10, duplex: true },
    ];
    expect(deriveAnalytics(jobs)).toMatchObject({ sheetsUsed: 19, sheetsSaved: 6, printedJobs: 2, duplexJobs: 1 });
    expect(deriveAnalytics([])).toMatchObject({ sheetsUsed: 0, sheetsSaved: 0, printedJobs: 0, averageWait: null, averageDuration: null, days: [], workload: [] });
  });
});
