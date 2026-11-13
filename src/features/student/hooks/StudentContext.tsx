import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { PrintJob } from "../contracts/jobs";
import type { QueueSnapshot } from "../contracts/scheduling";
import type {
  Diagnostic,
  ServiceEvent,
  StudentDemoController,
  StudentService,
} from "../contracts/service";
import type { PickupQrCodec } from "../qr/codec";
import type { PrintQRepository } from "../storage/printq-db";
export interface StudentContextValue {
  service: StudentService;
  demoController?: StudentDemoController;
  repository?: PrintQRepository;
  qrCodec?: PickupQrCodec;
  basePath: string;
  jobs: PrintJob[];
  queue: QueueSnapshot | null;
  connection: Extract<ServiceEvent, { type: "connection-changed" }>;
  diagnostics: Diagnostic[];
  refresh: () => void;
}
const StudentContext = createContext<StudentContextValue | null>(null);
export function StudentProvider({
  service,
  serviceMode,
  demoController,
  repository,
  qrCodec,
  basePath,
  children,
}: {
  service: StudentService;
  serviceMode?: "shared" | "local-demo";
  demoController?: StudentDemoController;
  repository?: PrintQRepository;
  qrCodec?: PickupQrCodec;
  basePath: string;
  children: ReactNode;
}) {
  const [jobs, setJobs] = useState<PrintJob[]>([]);
  const [queue, setQueue] = useState<QueueSnapshot | null>(null);
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const initialMode = serviceMode ?? (repository ? "local-demo" : "shared");
  const [connection, setConnection] = useState<
    StudentContextValue["connection"]
  >({
    type: "connection-changed",
    mode: initialMode,
    state: initialMode === "local-demo" ? "local-ready" : "unavailable",
    lastSyncedAt: null,
  });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setQueue(null);
    const unsubscribe = service.subscribeToJobUpdates((event) => {
      if (!active) return;
      if (event.type === "snapshot-changed") {
        setJobs(event.jobs);
        setQueue(event.queue);
      } else if (event.type === "connection-changed") setConnection(event);
      else setDiagnostics(event.diagnostics);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [service, retry]);
  return (
    <StudentContext.Provider
      value={{
        service,
        demoController,
        repository,
        qrCodec,
        basePath,
        jobs,
        queue,
        connection,
        diagnostics,
        refresh: () => setRetry((value) => value + 1),
      }}
    >
      {children}
    </StudentContext.Provider>
  );
}
export function useStudent() {
  const value = useContext(StudentContext);
  if (!value) throw new Error("StudentProvider is required");
  return value;
}
/** Calculations never outlive the coherent snapshot or its connection freshness. */
export function useRevisionRead<T extends { revision: string }>(
  read: () => Promise<T | null>,
  dependencies: unknown[],
) {
  const { queue, connection, refresh } = useStudent();
  const [value, setValue] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(true);
  const generation = useRef(0);
  const lastMismatch = useRef<string | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const request = ++generation.current;
    setPending(true);
    setError(null);
    setValue(null);
    if (!queue || queue.stale) {
      const unavailable =
        queue?.stale ||
        connection.state === "unavailable" ||
        connection.state === "disconnected";
      setPending(!unavailable);
      if (unavailable)
        setError(
          new Error(
            connection.mode === "shared"
              ? "errors.sharedDataUnavailable"
              : "errors.storageUnavailable",
          ),
        );
      return () => {
        generation.current++;
      };
    }
    read()
      .then((result) => {
        if (request !== generation.current) return;
        if (result && result.revision !== queue.revision) {
          setError(new Error("errors.snapshotChanged"));
          const mismatch = `${queue.revision}:${result.revision}`;
          if (lastMismatch.current !== mismatch) {
            lastMismatch.current = mismatch;
            refresh();
          }
          return;
        }
        lastMismatch.current = null;
        setValue(result);
      })
      .catch((reason) => {
        if (request === generation.current) setError(reason);
      })
      .finally(() => {
        if (request === generation.current) setPending(false);
      });
    return () => {
      generation.current++;
    };
  }, [queue?.revision, queue?.stale, connection.state, ...dependencies, retry]);
  return {
    value,
    error,
    pending,
    retry: () => {
      lastMismatch.current = null;
      setRetry((value) => value + 1);
    },
  };
}
