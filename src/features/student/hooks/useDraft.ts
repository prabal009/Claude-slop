import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useStudent } from "./StudentContext";
import { createUuid } from "../qr/codec";
import {
  DatasetReplacedError,
  parseIntegerText,
  type RawPrintFields,
} from "../utils/validation";
import type { Draft } from "../storage/drafts";
import type { StudentService } from "../contracts/service";
import { MAX_COPIES, MAX_PAGES } from "../services/config";
const pointer = "printq.student.draftId";
const defaults: RawPrintFields = {
  documentName: "",
  copies: "1",
  pageCount: "1",
  pageCountSource: "assumed",
  colorMode: "bw",
  duplex: false,
  paperSize: "A4",
  instructions: "",
};
// In-memory only: connected storage remains entirely transport-owned.
const sharedDrafts = new WeakMap<StudentService, Map<string, Draft>>();
const memoryPointers = new WeakMap<StudentService, string>();
export function useDraft() {
  const { repository, queue, service } = useStudent();
  const [params, setParams] = useSearchParams();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const [persistenceWarning, setPersistenceWarning] = useState(false);
  const live = useRef<Draft | null>(null);
  const initialize = useRef<Promise<Draft> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const edits = useRef(0);
  const savedEdit = useRef(0);
  const alive = useRef(true);
  const epoch = useRef(0);
  const memory = sharedDrafts.get(service) ?? new Map<string, Draft>();
  if (!sharedDrafts.has(service)) sharedDrafts.set(service, memory);
  function remember(value: Draft) {
    live.current = value;
    setDraft(value);
    if (!repository) memory.set(value.id, value);
    memoryPointers.set(service, value.id);
    setParams({ draft: value.id }, { replace: true });
    try {
      sessionStorage.setItem(pointer, value.id);
    } catch {
      setPersistenceWarning(true);
    }
  }
  async function create(initial: Partial<RawPrintFields> = {}): Promise<Draft> {
    if (repository) return repository.createDraft(initial);
    let generation = 1;
    try {
      generation = (await service.getQueueSnapshot()).localGeneration ?? 1;
    } catch {
      generation = 1;
    }
    return {
      ...defaults,
      ...initial,
      id: createUuid(),
      clientRequestId: createUuid(),
      generation,
      revision: 0,
      state: "editing",
      committedJobId: null,
      updatedAt: new Date().toISOString(),
      file: null,
      fileVersion: null,
      originalFileName: null,
      mimeType: null,
      fileSize: null,
      fileMissing: false,
    };
  }
  useEffect(() => {
    alive.current = true;
    if (!initialize.current) {
      initialize.current = (async () => {
        let id = params.get("draft");
        if (!id) {
          try {
            id = sessionStorage.getItem(pointer);
          } catch {
            setPersistenceWarning(true);
          }
          id ??= memoryPointers.get(service) ?? null;
        }
        if (id && !/^[0-9a-f-]{36}$/i.test(id))
          throw new Error("errors.invalidDraft");
        if (id) {
          const old = repository
            ? await repository.getDraft(id)
            : memory.get(id);
          if (old) {
            if (old.state !== "committed" || params.has("draft")) return old;
          } else if (params.has("draft")) throw new DatasetReplacedError();
        }
        const initial: Partial<RawPrintFields> = {};
        if (!repository && params.get("from") === "estimate") {
          const copies = params.get("copies") ?? "";
          const pages = params.get("pages") ?? "";
          const mode = params.get("mode");
          const duplex = params.get("duplex");
          if (
            !parseIntegerText(copies, MAX_COPIES) ||
            !parseIntegerText(pages, MAX_PAGES) ||
            (mode !== "bw" && mode !== "colour") ||
            (duplex !== "0" && duplex !== "1")
          )
            throw new Error("errors.invalidInput");
          Object.assign(initial, {
            copies,
            pageCount: pages,
            pageCountSource: "manual",
            colorMode: mode,
            duplex: duplex === "1",
          });
        }
        return create(initial);
      })();
    }
    initialize.current
      .then((value) => {
        if (alive.current) remember(value);
      })
      .catch((reason) => {
        if (alive.current) setError(reason);
      });
    return () => {
      alive.current = false;
      if (timer.current) clearTimeout(timer.current);
      void saveNow().catch(() => {});
    };
  }, [repository, service]);
  useEffect(() => {
    if (
      live.current &&
      queue?.localGeneration !== null &&
      queue?.localGeneration !== undefined &&
      live.current.generation !== queue.localGeneration
    ) {
      epoch.current++;
      if (timer.current) clearTimeout(timer.current);
      if (memoryPointers.get(service) === live.current.id)
        memoryPointers.delete(service);
      try {
        if (sessionStorage.getItem(pointer) === live.current.id)
          sessionStorage.removeItem(pointer);
      } catch {
        /* The URL still supports an explicit recovery. */
      }
      setError(new DatasetReplacedError());
    }
  }, [queue?.localGeneration]);
  function saveNow(): Promise<Draft> {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const captured = live.current;
    if (!captured) return Promise.reject(new Error("errors.invalidDraft"));
    const sequence = edits.current;
    const operationEpoch = epoch.current;
    let result = captured;
    const work = chain.current
      .catch(() => {})
      .then(async () => {
        if (operationEpoch !== epoch.current) throw new DatasetReplacedError();
        if (!repository) {
          memory.set(captured.id, captured);
          result = captured;
          return;
        }
        if (sequence <= savedEdit.current || captured.state === "committed") {
          result = live.current ?? captured;
          return;
        }
        if (alive.current) setSaving(true);
        result = await repository.saveDraft({
          ...captured,
          revision: live.current?.revision ?? captured.revision,
        });
        savedEdit.current = sequence;
        if (operationEpoch !== epoch.current) throw new DatasetReplacedError();
        if (live.current?.id === result.id) {
          const sameFile = live.current.file === captured.file;
          live.current = {
            ...live.current,
            revision: result.revision,
            ...(sameFile ? { fileVersion: result.fileVersion } : {}),
            updatedAt: result.updatedAt,
          };
          if (alive.current) setDraft(live.current);
        }
      });
    chain.current = work;
    return work
      .then(() => result)
      .catch((reason) => {
        if (alive.current) setError(reason);
        throw reason;
      })
      .finally(() => {
        if (alive.current) setSaving(false);
      });
  }
  function update(fields: Partial<Draft>) {
    if (!live.current || live.current.state === "committed") return;
    live.current = { ...live.current, ...fields };
    edits.current++;
    setDraft(live.current);
    setError(null);
    if (!repository) memory.set(live.current.id, live.current);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void saveNow().catch(() => {}), 300);
  }
  async function fresh(initial: Partial<RawPrintFields> = {}) {
    epoch.current++;
    if (timer.current) clearTimeout(timer.current);
    await chain.current.catch(() => {});
    const value = await create(initial);
    edits.current = 0;
    savedEdit.current = 0;
    setError(null);
    remember(value);
  }
  function markCommitted(jobId: string) {
    if (!live.current) return;
    live.current = {
      ...live.current,
      state: "committed",
      committedJobId: jobId,
    };
    if (!repository) memory.set(live.current.id, live.current);
    setDraft(live.current);
  }
  return {
    draft,
    update,
    flush: saveNow,
    fresh,
    markCommitted,
    error,
    setError,
    saving,
    persistenceWarning,
  };
}
