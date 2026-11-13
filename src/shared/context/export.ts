import { encode } from '@toon-format/toon';
import { validateSnapshot } from '../../features/shopkeeper/services/validation';
import type { ColorMode, Job, JobStatus, PrinterState, Snapshot } from '../../features/shopkeeper/types';

export interface ContextExportJob {
  id: string;
  status: JobStatus;
  priority: Job['priority'];
  pageCount: number;
  copies: number;
  colorMode: ColorMode;
  duplex: boolean;
  paperSize: Job['paperSize'];
  queuePosition: number | null;
  estimatedDurationMinutes: number;
  estimatedWaitMinutes: number | null;
  estimatedCost: number;
  estimatedPickupAt: string | null;
  pickupWindowEnd: string | null;
}

export interface ContextExport {
  schemaVersion: 1;
  revision: number;
  mode: Snapshot['mode'];
  printer: {
    state: PrinterState;
    downtimeMinutes: number | null;
    changedAt: string;
  };
  rates: {
    bwPrice: number;
    colourPrice: number;
    pickupBufferMinutes: number;
    opensAt: string;
    closesAt: string;
  };
  jobs: ContextExportJob[];
}

export function projectContext(snapshot: Snapshot): ContextExport {
  validateSnapshot(snapshot);
  return {
    schemaVersion: 1,
    revision: snapshot.revision,
    mode: snapshot.mode,
    printer: {
      state: snapshot.printer.state,
      downtimeMinutes: snapshot.printer.downtimeMinutes,
      changedAt: snapshot.printer.changedAt,
    },
    rates: {
      bwPrice: snapshot.settings.bwPrice,
      colourPrice: snapshot.settings.colourPrice,
      pickupBufferMinutes: snapshot.settings.pickupBufferMinutes,
      opensAt: snapshot.settings.opensAt,
      closesAt: snapshot.settings.closesAt,
    },
    jobs: snapshot.jobs.map((job) => ({
      id: job.id,
      status: job.status,
      priority: job.priority,
      pageCount: job.pageCount,
      copies: job.copies,
      colorMode: job.colorMode,
      duplex: job.duplex,
      paperSize: job.paperSize,
      queuePosition: job.queuePosition,
      estimatedDurationMinutes: job.estimatedDurationMinutes,
      estimatedWaitMinutes: job.estimatedWaitMinutes,
      estimatedCost: job.estimatedCost,
      estimatedPickupAt: job.estimatedPickupAt,
      pickupWindowEnd: job.pickupWindowEnd,
    })),
  };
}

export function encodeContext(snapshot: Snapshot): string {
  return encode(projectContext(snapshot));
}
