import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  safeNextPath,
  useAuth,
  validatePasswordRule,
  type UserRole,
} from './AuthContext';
import './auth.css';

function AuthShell({
  title,
  lead,
  children,
}: {
  title: string;
  lead: string;
  children: ReactNode;
}) {
  return (
    <div className="pq-auth-root">
      <header className="pq-auth-header">
        <a href="/" className="pq-auth-brand">
          <span className="pq-auth-mark" aria-hidden="true">
            Q
          </span>
          <span>PrintQ</span>
        </a>
        <a href="/" className="pq-auth-home-link">
          PrintQ home
        </a>
      </header>
      <main className="pq-auth-card">
        <h1>{title}</h1>
        <p className="pq-auth-lead">{lead}</p>
        {children}
      </main>
    </div>
  );
}

function AuthStatusGate({
  status,
  runtimeError,
  onRetry,
}: {
  status: 'loading' | 'ready' | 'error';
  runtimeError: string | null;
  onRetry: () => void;
}) {
  if (status === 'loading') {
    return (
      <AuthShell title="Opening PrintQ" lead="Checking your workspace session.">
        <p role="status">Loading…</p>
      </AuthShell>
    );
  }
  return (
    <AuthShell
      title="Connection unavailable"
      lead="PrintQ could not reach the workspace service."
    >
      <div className="pq-auth-alert" role="alert">
        {runtimeError ?? 'Unable to load runtime configuration.'}
      </div>
      <div className="pq-auth-actions" style={{ marginTop: 16 }}>
        <button
          type="button"
          className="pq-auth-btn pq-auth-btn-primary"
          onClick={onRetry}
        >
          Retry
        </button>
      </div>
    </AuthShell>
  );
}

function DemoRoleChooser({
  nextParam,
  heading,
  lead,
}: {
  nextParam: string | null;
  heading: string;
  lead: string;
}) {
  const { setDemoRole } = useAuth();
  const navigate = useNavigate();

  const choose = (role: UserRole) => {
    setDemoRole(role);
    navigate(safeNextPath(nextParam, role), { replace: true });
  };

  return (
    <AuthShell title={heading} lead={lead}>
      <div className="pq-auth-actions">
        <button
          type="button"
          className="pq-auth-demo-option"
          onClick={() => choose('student')}
        >
          <strong>Continue as Student</strong>
          <span>Submit documents, track queue position, and view pickup QR codes.</span>
        </button>
        <button
          type="button"
          className="pq-auth-demo-option"
          onClick={() => choose('shopkeeper')}
        >
          <strong>Continue as Shopkeeper</strong>
          <span>Manage the print counter, approve urgent jobs, and verify pickups.</span>
        </button>
      </div>
      <div className="pq-auth-links">
        <a href="/">Return to PrintQ home</a>
      </div>
    </AuthShell>
  );
}

export function LoginPage() {
  const {
    status,
    runtime,
    runtimeError,
    isAuthenticated,
    role,
    cooldownSeconds,
    retryRuntime,
    signIn,
  } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const nextParam = searchParams.get('next');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    document.title = 'PrintQ · Sign in';
  }, []);

  if (status !== 'ready') {
    return (
      <AuthStatusGate
        status={status}
        runtimeError={runtimeError}
        onRetry={retryRuntime}
      />
    );
  }

  if (isAuthenticated && role) {
    return <Navigate to={safeNextPath(nextParam, role)} replace />;
  }

  if (runtime?.mode === 'demo') {
    return (
      <DemoRoleChooser
        nextParam={nextParam}
        heading="Choose a demo role"
        lead="This workspace is running in local demo mode. Select a portal to open without an account."
      />
    );
  }

  const signupHref = nextParam
    ? `/signup?next=${encodeURIComponent(nextParam)}`
    : '/signup';

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting || cooldownSeconds > 0) return;

    const passwordError = validatePasswordRule(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    setError(null);
    setSubmitting(true);
    const result = await signIn(email, password);
    setSubmitting(false);

    if (!result.ok) {
      setError(result.error ?? 'Unable to sign in.');
      return;
    }

    // Navigation is also handled by the isAuthenticated guard, but we navigate explicitly for immediate feedback.
    navigate(safeNextPath(nextParam, 'student'), { replace: true });
  };

  return (
    <AuthShell
      title="Sign in to PrintQ"
      lead="Use your campus account to open the Student or Shopkeeper workspace."
    >
      <form className="pq-auth-form" onSubmit={handleSubmit} noValidate>
        {error && (
          <div className="pq-auth-alert" role="alert">
            {error}
          </div>
        )}
        {cooldownSeconds > 0 && !error && (
          <div className="pq-auth-alert" role="alert">
            Too many attempts. Try again in {cooldownSeconds}s.
          </div>
        )}
        <div className="pq-auth-field">
          <label htmlFor="login-email">Email</label>
          <input
            id="login-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        <div className="pq-auth-field">
          <label htmlFor="login-password">Password</label>
          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            maxLength={MAX_PASSWORD_LENGTH}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <p className="pq-auth-hint">Minimum {MIN_PASSWORD_LENGTH} characters.</p>
        </div>
        <div className="pq-auth-actions">
          <button
            type="submit"
            className="pq-auth-btn pq-auth-btn-primary"
            disabled={submitting || cooldownSeconds > 0}
          >
            {cooldownSeconds > 0
              ? `Wait ${cooldownSeconds}s`
              : submitting
                ? 'Signing in…'
                : 'Sign in'}
          </button>
        </div>
      </form>
      <div className="pq-auth-links">
        <Link to={signupHref}>Create a student account</Link>
        <Link to="/shopkeeper/access">Have a shopkeeper access code?</Link>
      </div>
    </AuthShell>
  );
}

export function SignupPage() {
  const {
    status,
    runtime,
    runtimeError,
    isAuthenticated,
    role,
    cooldownSeconds,
    retryRuntime,
    signUp,
  } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const nextParam = searchParams.get('next');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    document.title = 'PrintQ · Create account';
  }, []);

  if (status !== 'ready') {
    return (
      <AuthStatusGate
        status={status}
        runtimeError={runtimeError}
        onRetry={retryRuntime}
      />
    );
  }

  if (isAuthenticated && role) {
    return <Navigate to={safeNextPath(nextParam, role)} replace />;
  }

  if (runtime?.mode === 'demo') {
    return (
      <DemoRoleChooser
        nextParam={nextParam}
        heading="Demo mode active"
        lead="Account registration is disabled in local demo mode. Choose a demo role to continue."
      />
    );
  }

  const loginHref = nextParam
    ? `/login?next=${encodeURIComponent(nextParam)}`
    : '/login';

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting || cooldownSeconds > 0) return;

    if (!name.trim()) {
      setError('Enter your full name.');
      return;
    }
    const passwordError = validatePasswordRule(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    setError(null);
    setSubmitting(true);
    const result = await signUp(name, email, password);
    setSubmitting(false);

    if (!result.ok) {
      setError(result.error ?? 'Unable to create account.');
      return;
    }

    navigate(safeNextPath(nextParam, 'student'), { replace: true });
  };

  return (
    <AuthShell
      title="Create a student account"
      lead="Submit print orders, track live queue estimates, and collect with a pickup QR."
    >
      <form className="pq-auth-form" onSubmit={handleSubmit} noValidate>
        {error && (
          <div className="pq-auth-alert" role="alert">
            {error}
          </div>
        )}
        {cooldownSeconds > 0 && !error && (
          <div className="pq-auth-alert" role="alert">
            Too many attempts. Try again in {cooldownSeconds}s.
          </div>
        )}
        <div className="pq-auth-field">
          <label htmlFor="signup-name">Full name</label>
          <input
            id="signup-name"
            type="text"
            autoComplete="name"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="pq-auth-field">
          <label htmlFor="signup-email">Email</label>
          <input
            id="signup-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        <div className="pq-auth-field">
          <label htmlFor="signup-password">Password</label>
          <input
            id="signup-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            maxLength={MAX_PASSWORD_LENGTH}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <p className="pq-auth-hint">
            Use {MIN_PASSWORD_LENGTH} to {MAX_PASSWORD_LENGTH} characters.
          </p>
        </div>
        <div className="pq-auth-actions">
          <button
            type="submit"
            className="pq-auth-btn pq-auth-btn-primary"
            disabled={submitting || cooldownSeconds > 0}
          >
            {cooldownSeconds > 0
              ? `Wait ${cooldownSeconds}s`
              : submitting
                ? 'Creating account…'
                : 'Create account'}
          </button>
        </div>
      </form>
      <div className="pq-auth-links">
        <Link to={loginHref}>Already have an account? Sign in</Link>
        <Link to="/shopkeeper/access">Have a shopkeeper access code?</Link>
      </div>
    </AuthShell>
  );
}

export function ShopkeeperAccessPage() {
  const {
    status,
    runtime,
    runtimeError,
    session,
    role,
    cooldownSeconds,
    retryRuntime,
    acceptInvite,
    setDemoRole,
  } = useAuth();
  const navigate = useNavigate();

  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    document.title = 'PrintQ · Shopkeeper access';
  }, []);

  if (status !== 'ready') {
    return (
      <AuthStatusGate
        status={status}
        runtimeError={runtimeError}
        onRetry={retryRuntime}
      />
    );
  }

  if (runtime?.mode === 'demo') {
    return (
      <AuthShell
        title="Shopkeeper demo access"
        lead="In local demo mode, switch directly to the Shopkeeper role without an invite code."
      >
        <div className="pq-auth-actions">
          <button
            type="button"
            className="pq-auth-btn pq-auth-btn-primary"
            onClick={() => {
              setDemoRole('shopkeeper');
              navigate('/shopkeeper', { replace: true });
            }}
          >
            Open Shopkeeper Demo
          </button>
          <Link to="/student" className="pq-auth-btn pq-auth-btn-secondary">
            Go to Student Portal
          </Link>
        </div>
      </AuthShell>
    );
  }

  if (!session) {
    return (
      <AuthShell
        title="Shopkeeper access"
        lead="Sign in or create a PrintQ account first, then enter your shopkeeper access code."
      >
        <div className="pq-auth-actions">
          <Link
            to="/login?next=%2Fshopkeeper%2Faccess"
            className="pq-auth-btn pq-auth-btn-primary"
          >
            Sign in to continue
          </Link>
          <Link
            to="/signup?next=%2Fshopkeeper%2Faccess"
            className="pq-auth-btn pq-auth-btn-secondary"
          >
            Create an account
          </Link>
        </div>
      </AuthShell>
    );
  }

  if (role === 'shopkeeper') {
    return (
      <AuthShell
        title="Shopkeeper access active"
        lead={`Signed in as ${session.user.name} (${session.user.email}).`}
      >
        <div className="pq-auth-status" role="status">
          Your account already has Shopkeeper permissions.
        </div>
        <div className="pq-auth-actions" style={{ marginTop: 16 }}>
          <Link to="/shopkeeper" className="pq-auth-btn pq-auth-btn-primary">
            Open Shopkeeper Portal
          </Link>
          <Link to="/student" className="pq-auth-btn pq-auth-btn-secondary">
            Open Student Portal
          </Link>
        </div>
      </AuthShell>
    );
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting || cooldownSeconds > 0) return;

    if (!code.trim()) {
      setError('Enter your shopkeeper access code.');
      return;
    }

    setError(null);
    setSubmitting(true);
    const result = await acceptInvite(code);
    setSubmitting(false);

    if (!result.ok) {
      setError(result.error ?? 'Could not verify access code.');
      return;
    }

    navigate('/shopkeeper', { replace: true });
  };

  return (
    <AuthShell
      title="Enter shopkeeper access code"
      lead={`Signed in as ${session.user.email}. Enter the print-room invite code to unlock counter operations.`}
    >
      <form className="pq-auth-form" onSubmit={handleSubmit} noValidate>
        {error && (
          <div className="pq-auth-alert" role="alert">
            {error}
          </div>
        )}
        <div className="pq-auth-field">
          <label htmlFor="invite-code">Access code</label>
          <input
            id="invite-code"
            type="text"
            autoComplete="one-time-code"
            required
            value={code}
            onChange={(event) => setCode(event.target.value)}
          />
        </div>
        <div className="pq-auth-actions">
          <button
            type="submit"
            className="pq-auth-btn pq-auth-btn-primary"
            disabled={submitting || cooldownSeconds > 0}
          >
            {cooldownSeconds > 0
              ? `Wait ${cooldownSeconds}s`
              : submitting
                ? 'Verifying…'
                : 'Activate shopkeeper access'}
          </button>
        </div>
      </form>
      <div className="pq-auth-links">
        <Link to="/student">Back to Student Portal</Link>
      </div>
    </AuthShell>
  );
}

export function StudentRoute({ children }: { children: ReactNode }) {
  const { status, runtimeError, isAuthenticated, retryRuntime } = useAuth();
  const location = useLocation();

  if (status !== 'ready') {
    return (
      <AuthStatusGate
        status={status}
        runtimeError={runtimeError}
        onRetry={retryRuntime}
      />
    );
  }

  if (!isAuthenticated) {
    const next = encodeURIComponent(`${location.pathname}${location.search}`);
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  return <>{children}</>;
}

export function ShopkeeperRoute({ children }: { children: ReactNode }) {
  const {
    status,
    runtime,
    runtimeError,
    isAuthenticated,
    role,
    retryRuntime,
    setDemoRole,
  } = useAuth();
  const location = useLocation();

  if (status !== 'ready') {
    return (
      <AuthStatusGate
        status={status}
        runtimeError={runtimeError}
        onRetry={retryRuntime}
      />
    );
  }

  if (!isAuthenticated) {
    const next = encodeURIComponent(`${location.pathname}${location.search}`);
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  if (role !== 'shopkeeper') {
    return (
      <AuthShell
        title="403 · Shopkeeper access required"
        lead="Your current session has Student access only. Shopkeeper counter tools require shopkeeper authorization."
      >
        <div className="pq-auth-actions">
          {runtime?.mode === 'demo' ? (
            <button
              type="button"
              className="pq-auth-btn pq-auth-btn-primary"
              onClick={() => setDemoRole('shopkeeper')}
            >
              Switch to Shopkeeper Demo
            </button>
          ) : (
            <Link to="/shopkeeper/access" className="pq-auth-btn pq-auth-btn-primary">
              Enter shopkeeper access code
            </Link>
          )}
          <Link to="/student" className="pq-auth-btn pq-auth-btn-secondary">
            Return to Student Portal
          </Link>
        </div>
      </AuthShell>
    );
  }

  return <>{children}</>;
}

export function NotFoundPage() {
  const { isAuthenticated, role } = useAuth();

  useEffect(() => {
    document.title = 'PrintQ · Page not found';
  }, []);

  return (
    <AuthShell
      title="Page not found"
      lead="The PrintQ address you opened does not exist."
    >
      <div className="pq-auth-actions">
        {isAuthenticated && role === 'shopkeeper' && (
          <Link to="/shopkeeper" className="pq-auth-btn pq-auth-btn-primary">
            Open Shopkeeper Portal
          </Link>
        )}
        {isAuthenticated && (
          <Link to="/student" className="pq-auth-btn pq-auth-btn-secondary">
            Open Student Portal
          </Link>
        )}
        {!isAuthenticated && (
          <Link to="/login" className="pq-auth-btn pq-auth-btn-primary">
            Sign in to PrintQ
          </Link>
        )}
        <a href="/" className="pq-auth-btn pq-auth-btn-secondary">
          Return to PrintQ home
        </a>
      </div>
    </AuthShell>
  );
}
