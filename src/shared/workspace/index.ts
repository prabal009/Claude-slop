import type { PickupQrCodec } from '../../features/student/qr/codec';
import type {
  StudentDemoController,
  StudentService,
} from '../../features/student/contracts/service';
import type { ShopkeeperService } from '../../features/shopkeeper/types';

export interface WorkspaceConnection {
  state: 'connecting' | 'connected' | 'disconnected' | 'unavailable';
  mode: 'shared' | 'local-demo';
}

export interface WorkspaceHandle {
  mode: 'cloud' | 'demo';
  studentService: StudentService;
  shopkeeperService: ShopkeeperService;
  qrCodec: PickupQrCodec;
  demoController?: StudentDemoController;
  getConnection(): WorkspaceConnection;
  subscribeConnection(callback: () => void): () => void;
  dispose(): void;
}

export { createCloudWorkspace } from './CloudWorkspace';
export { createDemoWorkspace } from './DemoWorkspace';
