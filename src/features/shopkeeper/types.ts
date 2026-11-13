export type JobStatus = 'queued' | 'printing' | 'ready' | 'collected';
export type ColorMode = 'bw' | 'colour';
export type PrinterState = 'operational' | 'paused' | 'maintenance';
export type Language = 'en' | 'hi' | 'kn';
export interface Job {
  id: string; token: string; documentName: string; documentId: string | null;
  originalFileName: string | null; mimeType: string | null; fileSize: number | null;
  pageCount: number; copies: number; colorMode: ColorMode; duplex: boolean; paperSize: 'A4' | 'A3'; instructions: string;
  status: JobStatus; priority: 'normal' | 'urgent'; urgentRequestStatus: 'none' | 'pending' | 'approved' | 'rejected';
  urgentRequestedAt: string | null; queuePosition: number | null; estimatedCost: number;
  estimatedDurationMinutes: number; estimatedWaitMinutes: number | null; estimatedPickupAt: string | null;
  pickupWindowEnd: string | null; createdAt: string; updatedAt: string;
  printingStartedAt: string | null; readyAt: string | null; collectedAt: string | null;
  remainingMinutes: number | null; hypothetical?: boolean;
}
export interface Printer { state: PrinterState; downtimeMinutes: number | null; changedAt: string; recordedDowntimeMinutes: number; }
export interface ShopSettings { shopName: string; bwPrice: number; colourPrice: number; pickupBufferMinutes: number; opensAt: string; closesAt: string; }
export interface Activity { id: string; at: string; message: string; jobId: string | null; }
export interface Snapshot { revision: number; jobs: Job[]; printer: Printer; settings: ShopSettings; activity: Activity[]; mode: 'demo' | 'integrated'; }
export interface StoredDocument { id: string; name: string; mimeType: string; blob: Blob; }
export interface ImpactRow { id: string; token: string; beforePosition: number | null; afterPosition: number | null; beforeWait: number | null; afterWait: number | null; delayMinutes: number | null; beforePickupAt: string | null; afterPickupAt: string | null; }
export interface QueuePreview { revision: number; before: Snapshot; after: Snapshot; rows: ImpactRow[]; beforeAverageWait: number | null; afterAverageWait: number | null; savedMinutes: number | null; delayedJobs: number; improvedJobs: number; applicable: boolean; explanation: string; }
export type SimulationScenario =
 | { kind: 'move'; jobId: string; position: number }
 | { kind: 'urgent'; jobId: string }
 | { kind: 'quantity'; jobId: string; copies: number }
 | { kind: 'colour'; jobId: string; colorMode: ColorMode }
 | { kind: 'downtime'; minutes: number | null }
 | { kind: 'resume' }
 | { kind: 'optimize' }
 | { kind: 'add'; pageCount: number; copies: number; colorMode: ColorMode; duplex: boolean };
export interface Analytics { submitted: number; completed: number; averageDuration: number; averageWait: number | null; estimatedValue: number; sheetsUsed: number; sheetsSaved: number; duplexJobs: number; urgentReceived: number; urgentApproved: number; downtimeMinutes: number; byDay: {date:string;jobs:number;saved:number}[]; byHour: {hour:string;jobs:number}[]; byMode: {name:string;value:number}[]; }
export interface ShopkeeperService {
 initialize(): Promise<Snapshot>;
 getJobs(): Promise<Job[]>;
 getJobById(id:string): Promise<Job>;
 getQueueSnapshot(): Promise<Snapshot>;
 getPrinterStatus(): Promise<Printer>;
 getDocument(id:string): Promise<StoredDocument>;
 updateJobStatus(id:string,status:JobStatus,revision:number): Promise<Snapshot>;
 reorderQueue(ids:string[],revision:number): Promise<Snapshot>;
 getUrgentRequests(): Promise<Job[]>;
 getUrgentImpactPreview(id:string): Promise<QueuePreview>;
 approveUrgentRequest(id:string,revision:number): Promise<Snapshot>;
 rejectUrgentRequest(id:string,revision:number): Promise<Snapshot>;
 markJobUrgent(id:string,revision:number): Promise<Snapshot>;
 getOptimizationPreview(): Promise<QueuePreview>;
 applyOptimizedQueue(revision:number): Promise<Snapshot>;
 getSimulationResult(scenario:SimulationScenario): Promise<QueuePreview>;
 applySimulation(scenario:SimulationScenario,revision:number): Promise<Snapshot>;
 updatePrinterStatus(state:PrinterState,downtime:number|null,revision:number): Promise<Snapshot>;
 verifyPickupToken(token:string): Promise<Job>;
 markCollected(id:string,revision:number): Promise<Snapshot>;
 getAnalytics(): Promise<Analytics>;
 updateSettings(settings:ShopSettings,revision:number): Promise<Snapshot>;
 addDemoJob(input:{documentName:string;pageCount:number;copies:number;colorMode:ColorMode;duplex:boolean;file?:File}): Promise<Snapshot>;
 requestDemoUrgency(id:string,revision:number): Promise<Snapshot>;
 resetDemo(revision:number): Promise<Snapshot>;
 subscribeToJobUpdates(callback:()=>void): ()=>void;
 dispose(): void;
}
