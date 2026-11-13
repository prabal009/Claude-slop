import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  createCloudWorkspace,
  createDemoWorkspace,
  type WorkspaceHandle,
} from '../../shared/workspace';

export type UserRole = 'student' | 'shopkeeper';
export type RuntimeMode = 'cloud' | 'demo';

export interface RuntimeInfo {
  mode: RuntimeMode;
  shopId: string;
}

export interface AuthSession {
  user: {
    id: string;
    name: string;
    email: string;
  };
  role: UserRole;
  expiresAt: string;
}

export interface AuthActionResult {
  ok: boolean;
  error?: string;
  retryAfterSeconds?: number;
}

export interface AuthContextValue {
  status: 'loading' | 'ready' | 'error';
  runtime: RuntimeInfo | null;
  runtimeError: string | null;
  session: AuthSession | null;
  demoRole: UserRole | null;
  role: UserRole | null;
  isAuthenticated: boolean;
  workspace: WorkspaceHandle | null;
  cooldownSeconds: number;
  retryRuntime: () => void;
  signIn: (email: string, password: string) => Promise<AuthActionResult>;
  signUp: (name: string, email: string, password: string) => Promise<AuthActionResult>;
  signOut: () => Promise<void>;
  acceptInvite: (code: string) => Promise<AuthActionResult>;
  setDemoRole: (role: UserRole | null) => void;
}

const DEMO_ROLE_STORAGE_KEY = 'printq.demo.role';
const AUTH_BROADCAST_CHANNEL = 'printq.auth.v1';
const POINTER_KEYS = [
  'printq.student.draftId',
  'printq.student.guide',
  'printq.student.guide.v1',
  DEMO_ROLE_STORAGE_KEY,
] as const;

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;

export function safeNextPath(raw: string | null, role: UserRole): string {
  const fallback = role === 'shopkeeper' ? '/shopkeeper' : '/student';
  if (!raw || typeof raw !== 'string') return fallback;
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) {
    return fallback;
  }

  let parsed: URL;
  try {
    parsed = new URL(raw, 'http://localhost');
  } catch {
    return fallback;
  }

  if (parsed.origin !== 'http://localhost') return fallback;
  const pathname = parsed.pathname;
  if (!pathname.startsWith('/') || pathname.startsWith('//')) return fallback;

  if (
    pathname === '/login' ||
    pathname.startsWith('/login/') ||
    pathname === '/signup' ||
    pathname.startsWith('/signup/')
  ) {
    return fallback;
  }

  const candidate = `${pathname}${parsed.search}${parsed.hash}`;
  if (role === 'student') {
    if (
      pathname === '/student' ||
      pathname.startsWith('/student/') ||
      pathname === '/shopkeeper/access'
    ) {
      return candidate;
    }
    return fallback;
  }

  if (
    pathname === '/shopkeeper' ||
    pathname.startsWith('/shopkeeper/') ||
    pathname === '/student' ||
    pathname.startsWith('/student/')
  ) {
    return candidate;
  }
  return fallback;
}

export function validatePasswordRule(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return `Password must be at most ${MAX_PASSWORD_LENGTH} characters.`;
  }
  return null;
}

function clearAuthAndDraftPointers(): void {
  for (const key of POINTER_KEYS) {
    try {
      sessionStorage.removeItem(key);
    } catch {
      /* Ignore inaccessible sessionStorage */
    }
    try {
      localStorage.removeItem(key);
    } catch {
      /* Ignore inaccessible localStorage */
    }
  }
}

function readStoredDemoRole(): UserRole | null {
  try {
    const raw = sessionStorage.getItem(DEMO_ROLE_STORAGE_KEY);
    return raw === 'student' || raw === 'shopkeeper' ? raw : null;
  } catch {
    return null;
  }
}

function writeStoredDemoRole(role: UserRole | null): void {
  try {
    if (role) {
      sessionStorage.setItem(DEMO_ROLE_STORAGE_KEY, role);
    } else {
      sessionStorage.removeItem(DEMO_ROLE_STORAGE_KEY);
    }
  } catch {
    /* Ignore inaccessible sessionStorage */
  }
}

function parseRetryAfter(headers: Headers): number {
  const raw = headers.get('x-retry-after') ?? headers.get('Retry-After');
  if (!raw) return 60;
  const trimmed = raw.trim();
  const numeric = Number(trimmed);
  if (Number.isFinite(numeric) && numeric > 0) {
    return Math.ceil(numeric);
  }
  const parsedDate = Date.parse(trimmed);
  if (Number.isFinite(parsedDate)) {
    const diffSeconds = Math.ceil((parsedDate - Date.now()) / 1000);
    return diffSeconds > 0 ? diffSeconds : 1;
  }
  return 60;
}

async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const data: unknown = await response.json();
    if (typeof data === 'object' && data !== null && 'error' in data) {
      const value = data.error;
      if (typeof value === 'string' && value.trim().length > 0) {
        return value;
      }
    }
    if (typeof data === 'object' && data !== null && 'message' in data) {
      const value = data.message;
      if (typeof value === 'string' && value.trim().length > 0) {
        return value;
      }
    }
  } catch {
    /* Non-JSON error body */
  }
  return fallback;
}

function isRuntimeInfo(value: unknown): value is RuntimeInfo {
  if (typeof value !== 'object' || value === null) return false;
  if (!('mode' in value) || !('shopId' in value)) return false;
  return (
    (value.mode === 'cloud' || value.mode === 'demo') &&
    typeof value.shopId === 'string'
  );
}

function isAuthSession(value: unknown): value is AuthSession {
  if (typeof value !== 'object' || value === null) return false;
  if (!('user' in value) || !('role' in value) || !('expiresAt' in value)) {
    return false;
  }
  const user = value.user;
  if (typeof user !== 'object' || user === null) return false;
  if (!('id' in user) || !('name' in user) || !('email' in user)) return false;
  return (
    typeof user.id === 'string' &&
    typeof user.name === 'string' &&
    typeof user.email === 'string' &&
    (value.role === 'student' || value.role === 'shopkeeper') &&
    typeof value.expiresAt === 'string'
  );
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('AuthProvider is required');
  }
  return value;
}

export function useOptionalAuth(): AuthContextValue | null {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [runtime, setRuntime] = useState<RuntimeInfo | null>(null);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [demoRole, setDemoRoleState] = useState<UserRole | null>(() => readStoredDemoRole());
  const [workspace, setWorkspace] = useState<WorkspaceHandle | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState<number>(0);
  const [cooldownSeconds, setCooldownSeconds] = useState<number>(0);
  const [bootAttempt, setBootAttempt] = useState<number>(0);

  const workspaceRef = useRef<WorkspaceHandle | null>(null);
  const workspaceKeyRef = useRef<string | null>(null);
  const pendingReadsRef = useRef<AbortController | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);

  const disposeWorkspace = useCallback(() => {
    if (pendingReadsRef.current) {
      pendingReadsRef.current.abort();
      pendingReadsRef.current = null;
    }
    if (workspaceRef.current) {
      workspaceRef.current.dispose();
      workspaceRef.current = null;
      workspaceKeyRef.current = null;
      setWorkspace(null);
    }
  }, []);

  useEffect(() => {
    if (cooldownUntil <= Date.now()) {
      setCooldownSeconds(0);
      return;
    }
    const update = () => {
      const remaining = Math.ceil((cooldownUntil - Date.now()) / 1000);
      if (remaining <= 0) {
        setCooldownSeconds(0);
        setCooldownUntil(0);
      } else {
        setCooldownSeconds(remaining);
      }
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [cooldownUntil]);

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel(AUTH_BROADCAST_CHANNEL);
    channelRef.current = channel;
    channel.onmessage = (event: MessageEvent<unknown>) => {
      const payload = event.data;
      if (
        typeof payload === 'object' &&
        payload !== null &&
        'type' in payload &&
        payload.type === 'session-invalidated'
      ) {
        setSession(null);
        setDemoRoleState(null);
        clearAuthAndDraftPointers();
        disposeWorkspace();
      }
    };
    return () => {
      channel.close();
      channelRef.current = null;
    };
  }, [disposeWorkspace]);

  const fetchSession = useCallback(async (signal?: AbortSignal): Promise<AuthSession | null> => {
    const response = await fetch('/api/session', {
      method: 'GET',
      credentials: 'include',
      signal,
    });
    if (response.status === 401) {
      return null;
    }
    if (!response.ok) {
      throw new Error('Could not verify your session.');
    }
    const data: unknown = await response.json();
    if (!isAuthSession(data)) {
      throw new Error('Invalid session response.');
    }
    return data;
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    pendingReadsRef.current?.abort();
    pendingReadsRef.current = controller;

    let alive = true;
    setStatus('loading');
    setRuntimeError(null);

    const bootstrap = async () => {
      try {
        const runtimeRes = await fetch('/api/runtime', {
          method: 'GET',
          credentials: 'include',
          signal: controller.signal,
        });
        if (!runtimeRes.ok) {
          throw new Error('Unable to load PrintQ runtime configuration.');
        }
        const runtimeJson: unknown = await runtimeRes.json();
        if (!isRuntimeInfo(runtimeJson)) {
          throw new Error('Invalid runtime configuration received.');
        }
        if (!alive) return;
        setRuntime(runtimeJson);

        if (runtimeJson.mode === 'cloud') {
          const currentSession = await fetchSession(controller.signal);
          if (!alive) return;
          setSession(currentSession);
          setDemoRoleState(null);
        } else {
          setSession(null);
          setDemoRoleState(readStoredDemoRole());
        }
        setStatus('ready');
      } catch (err) {
        if (!alive || controller.signal.aborted) return;
        setRuntimeError(
          err instanceof Error ? err.message : 'Unable to connect to PrintQ.',
        );
        setStatus('error');
      }
    };

    void bootstrap();
    return () => {
      alive = false;
      controller.abort();
    };
  }, [bootAttempt, fetchSession]);

  useEffect(() => {
    if (status !== 'ready' || !runtime) {
      return;
    }

    if (runtime.mode === 'cloud') {
      if (!session) {
        disposeWorkspace();
        return;
      }
      const nextKey = `cloud:${session.user.id}`;
      if (workspaceRef.current && workspaceKeyRef.current === nextKey) {
        return;
      }
      disposeWorkspace();
      const handle = createCloudWorkspace();
      workspaceRef.current = handle;
      workspaceKeyRef.current = nextKey;
      setWorkspace(handle);
      return;
    }

    if (!demoRole) {
      disposeWorkspace();
      return;
    }
    const nextKey = 'demo:shared';
    if (workspaceRef.current && workspaceKeyRef.current === nextKey) {
      return;
    }
    disposeWorkspace();
    const handle = createDemoWorkspace();
    workspaceRef.current = handle;
    workspaceKeyRef.current = nextKey;
    setWorkspace(handle);
  }, [status, runtime, session, demoRole, disposeWorkspace]);

  useEffect(() => () => disposeWorkspace(), [disposeWorkspace]);

  const applyCooldown = useCallback((headers: Headers): number => {
    const seconds = parseRetryAfter(headers);
    setCooldownUntil(Date.now() + seconds * 1000);
    setCooldownSeconds(seconds);
    return seconds;
  }, []);

  const signIn = useCallback(
    async (email: string, password: string): Promise<AuthActionResult> => {
      if (cooldownUntil > Date.now()) {
        const remaining = Math.max(1, Math.ceil((cooldownUntil - Date.now()) / 1000));
        return {
          ok: false,
          error: `Too many attempts. Wait ${remaining}s before trying again.`,
          retryAfterSeconds: remaining,
        };
      }
      const trimmedEmail = email.trim();
      if (!trimmedEmail) {
        return { ok: false, error: 'Enter your email address.' };
      }
      const passwordError = validatePasswordRule(password);
      if (passwordError) {
        return { ok: false, error: passwordError };
      }

      const controller = new AbortController();
      pendingReadsRef.current = controller;
      try {
        const response = await fetch('/api/auth/sign-in/email', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: trimmedEmail, password }),
          signal: controller.signal,
        });

        if (response.status === 429) {
          const seconds = applyCooldown(response.headers);
          return {
            ok: false,
            error: `Too many sign-in attempts. Wait ${seconds}s before trying again.`,
            retryAfterSeconds: seconds,
          };
        }

        if (!response.ok) {
          const message = await readErrorMessage(
            response,
            'Invalid email or password.',
          );
          return { ok: false, error: message };
        }

        const nextSession = await fetchSession(controller.signal);
        if (!nextSession) {
          return { ok: false, error: 'Session could not be established.' };
        }
        setSession(nextSession);
        return { ok: true };
      } catch (err) {
        if (controller.signal.aborted) {
          return { ok: false, error: 'Sign-in was cancelled.' };
        }
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Unable to sign in.',
        };
      }
    },
    [applyCooldown, cooldownUntil, fetchSession],
  );

  const signUp = useCallback(
    async (
      name: string,
      email: string,
      password: string,
    ): Promise<AuthActionResult> => {
      if (cooldownUntil > Date.now()) {
        const remaining = Math.max(1, Math.ceil((cooldownUntil - Date.now()) / 1000));
        return {
          ok: false,
          error: `Too many attempts. Wait ${remaining}s before trying again.`,
          retryAfterSeconds: remaining,
        };
      }
      const trimmedName = name.trim();
      const trimmedEmail = email.trim();
      if (!trimmedName) {
        return { ok: false, error: 'Enter your name.' };
      }
      if (!trimmedEmail) {
        return { ok: false, error: 'Enter your email address.' };
      }
      const passwordError = validatePasswordRule(password);
      if (passwordError) {
        return { ok: false, error: passwordError };
      }

      const controller = new AbortController();
      pendingReadsRef.current = controller;
      try {
        const response = await fetch('/api/auth/sign-up/email', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: trimmedName,
            email: trimmedEmail,
            password,
          }),
          signal: controller.signal,
        });

        if (response.status === 429) {
          const seconds = applyCooldown(response.headers);
          return {
            ok: false,
            error: `Too many sign-up attempts. Wait ${seconds}s before trying again.`,
            retryAfterSeconds: seconds,
          };
        }

        if (!response.ok) {
          const message = await readErrorMessage(
            response,
            'Could not create account.',
          );
          return { ok: false, error: message };
        }

        const nextSession = await fetchSession(controller.signal);
        if (!nextSession) {
          return { ok: false, error: 'Account created, but session could not be loaded.' };
        }
        setSession(nextSession);
        return { ok: true };
      } catch (err) {
        if (controller.signal.aborted) {
          return { ok: false, error: 'Sign-up was cancelled.' };
        }
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Unable to create account.',
        };
      }
    },
    [applyCooldown, cooldownUntil, fetchSession],
  );

  const acceptInvite = useCallback(
    async (code: string): Promise<AuthActionResult> => {
      if (cooldownUntil > Date.now()) {
        const remaining = Math.max(1, Math.ceil((cooldownUntil - Date.now()) / 1000));
        return {
          ok: false,
          error: `Too many attempts. Wait ${remaining}s before trying again.`,
          retryAfterSeconds: remaining,
        };
      }
      const trimmedCode = code.trim();
      if (!trimmedCode) {
        return { ok: false, error: 'Enter your shopkeeper access code.' };
      }

      const controller = new AbortController();
      pendingReadsRef.current = controller;
      try {
        const response = await fetch('/api/auth/accept-invite', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: trimmedCode }),
          signal: controller.signal,
        });

        if (response.status === 429) {
          const seconds = applyCooldown(response.headers);
          return {
            ok: false,
            error: `Too many attempts. Wait ${seconds}s before trying again.`,
            retryAfterSeconds: seconds,
          };
        }

        if (!response.ok) {
          const message = await readErrorMessage(
            response,
            'Invalid or expired access code.',
          );
          return { ok: false, error: message };
        }

        const nextSession = await fetchSession(controller.signal);
        if (!nextSession) {
          return { ok: false, error: 'Could not refresh your updated session.' };
        }
        setSession(nextSession);
        return { ok: true };
      } catch (err) {
        if (controller.signal.aborted) {
          return { ok: false, error: 'Request was cancelled.' };
        }
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Unable to verify access code.',
        };
      }
    },
    [applyCooldown, cooldownUntil, fetchSession],
  );

  const signOut = useCallback(async () => {
    disposeWorkspace();
    if (runtime?.mode === 'cloud') {
      try {
        await fetch('/api/auth/sign-out', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
      } catch {
        /* Proceed with local session cleanup even if network fails */
      }
      channelRef.current?.postMessage({ type: 'session-invalidated' });
    }
    setSession(null);
    setDemoRoleState(null);
    clearAuthAndDraftPointers();
  }, [disposeWorkspace, runtime?.mode]);

  const setDemoRole = useCallback(
    (nextRole: UserRole | null) => {
      if (nextRole === null) {
        disposeWorkspace();
        setDemoRoleState(null);
        clearAuthAndDraftPointers();
        return;
      }
      writeStoredDemoRole(nextRole);
      setDemoRoleState(nextRole);
    },
    [disposeWorkspace],
  );

  const retryRuntime = useCallback(() => {
    setBootAttempt((value) => value + 1);
  }, []);

  const role: UserRole | null =
    runtime?.mode === 'demo' ? demoRole : (session?.role ?? null);
  const isAuthenticated = role !== null;

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      runtime,
      runtimeError,
      session,
      demoRole,
      role,
      isAuthenticated,
      workspace,
      cooldownSeconds,
      retryRuntime,
      signIn,
      signUp,
      signOut,
      acceptInvite,
      setDemoRole,
    }),
    [
      status,
      runtime,
      runtimeError,
      session,
      demoRole,
      role,
      isAuthenticated,
      workspace,
      cooldownSeconds,
      retryRuntime,
      signIn,
      signUp,
      signOut,
      acceptInvite,
      setDemoRole,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
