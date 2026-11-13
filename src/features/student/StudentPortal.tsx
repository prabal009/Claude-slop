import { Route, Routes, useLocation } from "react-router-dom";
import type {
  StudentService,
  StudentDemoController,
} from "./contracts/service";
import type { PickupQrCodec } from "./qr/codec";
import { localPickupQrCodec } from "./qr/codec";
import { createLocalDemo, LocalDemoAdapter } from "./services/LocalDemoAdapter";
import { SharedServiceAdapter } from "./services/SharedServiceAdapter";
import { safeBasePath } from "./utils/format";
import { StudentProvider } from "./hooks/StudentContext";
import {
  TranslationProvider,
  useTranslation,
} from "./i18n/TranslationProvider";
import { GuideProvider } from "./demo/GuideContext";
import { PortalShell } from "./components/PortalShell";
import { PortalBoundary, Empty, Page } from "./components/ui";
import { HomePage } from "./pages/HomePage";
import { NewPrintPage } from "./pages/NewPrintPage";
import { JobsPage } from "./pages/JobsPage";
import { JobDetailsPage } from "./pages/JobDetailsPage";
import { QueuePage } from "./pages/QueuePage";
import { SimulatorPage } from "./pages/SimulatorPage";
import { EstimatePage } from "./pages/EstimatePage";
import { EcoPrintPage } from "./pages/EcoPrintPage";
import { HelpPage } from "./pages/HelpPage";
import { SettingsPage } from "./pages/SettingsPage";
import { DemoPage } from "./pages/DemoPage";
import { PickupPage } from "./pages/PickupPage";
import { ReceiptPage } from "./receipts/ReceiptPage";
import "./styles.css";
export interface StudentPortalProps {
  service?: StudentService;
  basePath?: string;
  qrCodec?: PickupQrCodec;
  demoController?: StudentDemoController;
}
let localPair: ReturnType<typeof createLocalDemo> | undefined;
const injectedBoundaries = new WeakMap<StudentService, SharedServiceAdapter>();
function StudentFrame({
  service: injected,
  basePath = "/student",
  qrCodec,
  demoController,
}: StudentPortalProps) {
  const { locale, resolvedTheme, t } = useTranslation();
  const location = useLocation();
  const pair = injected ? null : (localPair ??= createLocalDemo());
  let service = injected ?? pair!.service;
  if (
    injected &&
    !(injected instanceof LocalDemoAdapter) &&
    !(injected instanceof SharedServiceAdapter)
  ) {
    let boundary = injectedBoundaries.get(injected);
    if (!boundary) {
      boundary = new SharedServiceAdapter(injected);
      injectedBoundaries.set(injected, boundary);
    }
    service = boundary;
  }
  const repository =
    service instanceof LocalDemoAdapter ? service.repo : undefined;
  return (
    <div className="pq-root" lang={locale} data-theme={resolvedTheme}>
      <PortalBoundary>
        <StudentProvider
          service={service}
          repository={repository}
          demoController={injected ? demoController : pair!.demoController}
          qrCodec={qrCodec ?? (repository ? localPickupQrCodec : undefined)}
          basePath={safeBasePath(basePath)}
        >
          <GuideProvider>
            <PortalShell>
              <PortalBoundary key={location.pathname}>
                <Routes>
                  <Route index element={<HomePage />} />
                  <Route path="new" element={<NewPrintPage />} />
                  <Route path="estimate" element={<EstimatePage />} />
                  <Route path="jobs" element={<JobsPage />} />
                  <Route path="jobs/:jobId" element={<JobDetailsPage />} />
                  <Route
                    path="jobs/:jobId/success"
                    element={<JobDetailsPage success />}
                  />
                  <Route path="jobs/:jobId/pickup" element={<PickupPage />} />
                  <Route path="jobs/:jobId/receipt" element={<ReceiptPage />} />
                  <Route path="queue" element={<QueuePage />} />
                  <Route path="simulate" element={<SimulatorPage />} />
                  <Route path="ecoprint" element={<EcoPrintPage />} />
                  <Route path="help" element={<HelpPage />} />
                  <Route path="settings" element={<SettingsPage />} />
                  <Route path="demo" element={<DemoPage />} />
                  <Route
                    path="*"
                    element={
                      <Page title={t("common.pageNotFound")}>
                        <Empty title={t("common.pageNotFound")}>
                          {t("common.pageNotFoundDescription")}
                        </Empty>
                      </Page>
                    }
                  />
                </Routes>
              </PortalBoundary>
            </PortalShell>
          </GuideProvider>
        </StudentProvider>
      </PortalBoundary>
    </div>
  );
}
/** Mount beneath a host Router. Only the standalone src/main.tsx owns BrowserRouter. */
export function StudentPortal(props: StudentPortalProps) {
  return (
    <TranslationProvider>
      <StudentFrame {...props} />
    </TranslationProvider>
  );
}
