export { StudentPortal } from "./StudentPortal";
export type { StudentPortalProps } from "./StudentPortal";
export type * from "./contracts/jobs";
export type * from "./contracts/service";
export type * from "./contracts/scheduling";
export { createLocalDemo, LocalDemoAdapter } from "./services/LocalDemoAdapter";
export {
  SharedServiceAdapter,
  SharedServiceUnavailableError,
} from "./services/SharedServiceAdapter";
export type { SharedStudentTransport } from "./services/SharedServiceAdapter";
export { localPickupQrCodec, createPickupToken, createUuid } from "./qr/codec";
export type { PickupQrCodec } from "./qr/codec";
export { LOCAL_DATABASE_NAME, LOCAL_SCHEMA_VERSION } from "./services/config";
