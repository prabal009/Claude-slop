import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useLocation } from "react-router-dom";
import { useStudent } from "../hooks/StudentContext";
interface GuideState {
  active: boolean;
  generation: number | null;
  completed: number[];
  copiesChosen: boolean;
  modeChosen: boolean;
  jobId: string | null;
}
const initial: GuideState = {
  active: false,
  generation: null,
  completed: [],
  copiesChosen: false,
  modeChosen: false,
  jobId: null,
};
interface GuideValue extends GuideState {
  start: () => void;
  record: (step: number | "copies" | "mode", jobId?: string) => void;
}
const GuideContext = createContext<GuideValue | null>(null);
const storageKey = "printq.student.guide";
export function GuideProvider({ children }: { children: ReactNode }) {
  const { basePath, queue, connection } = useStudent();
  const location = useLocation();
  const [state, setState] = useState<GuideState>(() => {
    try {
      const value: unknown = JSON.parse(
        sessionStorage.getItem(storageKey) ?? "null",
      );
      if (
        value &&
        typeof value === "object" &&
        "active" in value &&
        value.active === true &&
        "completed" in value &&
        Array.isArray(value.completed) &&
        value.completed.every(
          (step) => Number.isInteger(step) && step >= 1 && step <= 12,
        ) &&
        "generation" in value &&
        (value.generation === null || Number.isSafeInteger(value.generation)) &&
        "copiesChosen" in value &&
        typeof value.copiesChosen === "boolean" &&
        "modeChosen" in value &&
        typeof value.modeChosen === "boolean" &&
        "jobId" in value &&
        (value.jobId === null || typeof value.jobId === "string")
      )
        return value as GuideState;
    } catch {
      /* Session guide progress is optional. */
    }
    return initial;
  });
  const record = useCallback(
    (step: number | "copies" | "mode", jobId?: string) => {
      setState((current) => {
        if (!current.active) return current;
        const next = {
          ...current,
          completed: [...current.completed],
          ...(jobId ? { jobId } : {}),
        };
        if (step === "copies") next.copiesChosen = true;
        else if (step === "mode") next.modeChosen = true;
        else if (step >= 1 && step <= 12 && !next.completed.includes(step))
          next.completed.push(step);
        if (next.copiesChosen && next.modeChosen && !next.completed.includes(4))
          next.completed.push(4);
        return next;
      });
    },
    [],
  );
  useEffect(() => {
    if (connection.mode !== "local-demo" && state.active) {
      setState(initial);
      return;
    }
    if (
      state.active &&
      queue?.localGeneration !== null &&
      queue?.localGeneration !== undefined &&
      state.generation !== queue.localGeneration
    )
      setState(initial);
  }, [queue?.localGeneration, connection.mode, state.active, state.generation]);
  useEffect(() => {
    if (!state.active) return;
    const relative = location.pathname
      .slice(basePath.length)
      .replace(/^\//, "");
    if (!relative) record(1);
    if (relative === "new") record(2);
    if (relative === "queue") record(9);
    if (relative === `jobs/${state.jobId}` && state.completed.includes(11))
      record(12);
  }, [
    location.pathname,
    state.active,
    state.jobId,
    state.completed.includes(11),
    basePath,
    record,
  ]);
  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
      /* No persistence claim is made for optional guide progress. */
    }
  }, [state]);
  const value = useMemo<GuideValue>(
    () => ({
      ...state,
      start: () =>
        setState({
          ...initial,
          active: true,
          generation: queue?.localGeneration ?? null,
        }),
      record,
    }),
    [state, queue?.localGeneration, record],
  );
  return (
    <GuideContext.Provider value={value}>{children}</GuideContext.Provider>
  );
}
export function useGuide() {
  const value = useContext(GuideContext);
  if (!value) throw new Error("GuideProvider is required");
  return value;
}
