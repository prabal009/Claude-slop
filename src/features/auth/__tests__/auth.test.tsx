import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, safeNextPath, useAuth } from '../AuthContext';
import {
  LoginPage,
  ShopkeeperAccessPage,
  ShopkeeperRoute,
  SignupPage,
  StudentRoute,
} from '../AuthPages';

const disposeMock = vi.fn();
const createCloudWorkspaceMock = vi.fn();
const createDemoWorkspaceMock = vi.fn();

vi.mock('../../../shared/workspace', () => ({
  createCloudWorkspace: () => createCloudWorkspaceMock(),
  createDemoWorkspace: () => createDemoWorkspaceMock(),
}));

function makeWorkspaceHandle(mode: 'cloud' | 'demo') {
  return {
    mode,
    studentService: {},
    shopkeeperService: {},
    qrCodec: {},
    demoController: mode === 'demo' ? {} : undefined,
    getConnection: () => ({
      type: 'connection-changed',
      mode: mode === 'demo' ? 'local-demo' : 'shared',
      state: mode === 'demo' ? 'local-ready' : 'connected',
      lastSyncedAt: null,
    }),
    subscribeConnection: () => () => {},
    dispose: disposeMock,
  };
}

function LocationProbe() {
  const location = useLocation();
  return (
    <div data-testid="location-probe">
      {location.pathname}
      {location.search}
    </div>
  );
}

function StudentStub() {
  const { signOut, workspace } = useAuth();
  return (
    <div>
      <h1>Student Workspace Stub</h1>
      <span data-testid="workspace-mode">{workspace?.mode ?? 'none'}</span>
      <button type="button" onClick={() => void signOut()}>
        Sign out
      </button>
    </div>
  );
}

const shopkeeperMountedSpy = vi.fn();
function ShopkeeperStub() {
  shopkeeperMountedSpy();
  return <h1>Shopkeeper Workspace Stub</h1>;
}

function renderAuthApp(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <AuthProvider>
        <LocationProbe />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/shopkeeper/access" element={<ShopkeeperAccessPage />} />
          <Route
            path="/student/*"
            element={
              <StudentRoute>
                <StudentStub />
              </StudentRoute>
            }
          />
          <Route
            path="/shopkeeper/*"
            element={
              <ShopkeeperRoute>
                <ShopkeeperStub />
              </ShopkeeperRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

function jsonResponse(body: unknown, status = 200, headers?: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  });
}

describe('Auth routing, guards, cooldown, demo mode, and logout', () => {
  beforeEach(() => {
    disposeMock.mockReset();
    shopkeeperMountedSpy.mockReset();
    createCloudWorkspaceMock.mockReset().mockImplementation(() => makeWorkspaceHandle('cloud'));
    createDemoWorkspaceMock.mockReset().mockImplementation(() => makeWorkspaceHandle('demo'));
    sessionStorage.clear();
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('redirects unauthenticated /student to /login?next=%2Fstudent', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === '/api/runtime') {
        return jsonResponse({ mode: 'cloud', shopId: 'shop-1' });
      }
      if (url === '/api/session') {
        return jsonResponse({ error: 'Unauthorized' }, 401);
      }
      return jsonResponse({}, 404);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderAuthApp('/student');

    expect(
      await screen.findByRole('heading', { name: 'Sign in to PrintQ' }),
    ).toBeVisible();
    expect(screen.getByTestId('location-probe')).toHaveTextContent(
      '/login?next=%2Fstudent',
    );
  });

  it('shows 403 gate for Student on /shopkeeper without mounting ShopkeeperPortal and links to /shopkeeper/access', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === '/api/runtime') {
        return jsonResponse({ mode: 'cloud', shopId: 'shop-1' });
      }
      if (url === '/api/session') {
        return jsonResponse({
          user: { id: 'u1', name: 'Asha', email: 'asha@campus.edu' },
          role: 'student',
          expiresAt: '2026-12-01T00:00:00.000Z',
        });
      }
      return jsonResponse({}, 404);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderAuthApp('/shopkeeper');

    expect(
      await screen.findByRole('heading', {
        name: '403 · Shopkeeper access required',
      }),
    ).toBeVisible();
    expect(shopkeeperMountedSpy).not.toHaveBeenCalled();

    const accessLink = screen.getByRole('link', {
      name: 'Enter shopkeeper access code',
    });
    expect(accessLink).toHaveAttribute('href', '/shopkeeper/access');

    const studentLink = screen.getByRole('link', {
      name: 'Return to Student Portal',
    });
    expect(studentLink).toHaveAttribute('href', '/student');
  });

  it('disables submit cleanly on 429 cooldown without automatic retry', async () => {
    let signInCalls = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === '/api/runtime') {
        return jsonResponse({ mode: 'cloud', shopId: 'shop-1' });
      }
      if (url === '/api/session') {
        return jsonResponse({ error: 'Unauthorized' }, 401);
      }
      if (url === '/api/auth/sign-in/email') {
        signInCalls += 1;
        return jsonResponse(
          { error: 'Rate limit exceeded' },
          429,
          { 'x-retry-after': '12' },
        );
      }
      return jsonResponse({}, 404);
    });
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    renderAuthApp('/login');

    await screen.findByRole('heading', { name: 'Sign in to PrintQ' });
    await user.type(screen.getByLabelText('Email'), 'asha@campus.edu');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('12s');
    const submitButton = screen.getByRole('button', { name: /Wait \d+s/ });
    expect(submitButton).toBeDisabled();
    expect(signInCalls).toBe(1);
  });

  it('uses explicit role chooser in demo mode without password form and shares one DemoWorkspace', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === '/api/runtime') {
        return jsonResponse({ mode: 'demo', shopId: 'demo-shop' });
      }
      return jsonResponse({}, 404);
    });
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    renderAuthApp('/login');

    expect(
      await screen.findByRole('heading', { name: 'Choose a demo role' }),
    ).toBeVisible();
    expect(screen.queryByLabelText('Password')).toBeNull();

    await user.click(screen.getByRole('button', { name: /Continue as Student/i }));

    expect(
      await screen.findByRole('heading', { name: 'Student Workspace Stub' }),
    ).toBeVisible();
    expect(createDemoWorkspaceMock).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem('printq.demo.role')).toBe('student');
  });

  it('clears workspace, session, and draft/guide pointers on logout while preserving display preferences', async () => {
    localStorage.setItem('printq.student.locale', 'hi');
    localStorage.setItem('printq.theme', 'dark');
    sessionStorage.setItem('printq.student.draftId', 'draft-99');
    sessionStorage.setItem('printq.student.guide.v1', 'seen');

    let signedIn = true;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === '/api/runtime') {
        return jsonResponse({ mode: 'cloud', shopId: 'shop-1' });
      }
      if (url === '/api/session') {
        if (!signedIn) return jsonResponse({ error: 'Unauthorized' }, 401);
        return jsonResponse({
          user: { id: 'u1', name: 'Asha', email: 'asha@campus.edu' },
          role: 'student',
          expiresAt: '2026-12-01T00:00:00.000Z',
        });
      }
      if (url === '/api/auth/sign-out') {
        signedIn = false;
        return jsonResponse({ ok: true });
      }
      return jsonResponse({}, 404);
    });
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    renderAuthApp('/student');

    expect(
      await screen.findByRole('heading', { name: 'Student Workspace Stub' }),
    ).toBeVisible();
    expect(createCloudWorkspaceMock).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Sign out' }));

    await waitFor(() => {
      expect(disposeMock).toHaveBeenCalledTimes(1);
    });
    expect(
      await screen.findByRole('heading', { name: 'Sign in to PrintQ' }),
    ).toBeVisible();

    expect(sessionStorage.getItem('printq.student.draftId')).toBeNull();
    expect(sessionStorage.getItem('printq.student.guide.v1')).toBeNull();
    expect(localStorage.getItem('printq.student.locale')).toBe('hi');
    expect(localStorage.getItem('printq.theme')).toBe('dark');
  });

  it('validates safeNextPath against external URLs, auth pages, and role permissions', () => {
    expect(safeNextPath('/student/new?draft=1', 'student')).toBe(
      '/student/new?draft=1',
    );
    expect(safeNextPath('/shopkeeper/access', 'student')).toBe(
      '/shopkeeper/access',
    );
    expect(safeNextPath('/shopkeeper/queue', 'student')).toBe('/student');
    expect(safeNextPath('/shopkeeper/queue', 'shopkeeper')).toBe(
      '/shopkeeper/queue',
    );
    expect(safeNextPath('//evil.example/phish', 'shopkeeper')).toBe('/shopkeeper');
    expect(safeNextPath('https://evil.example/phish', 'student')).toBe('/student');
    expect(safeNextPath('/login', 'student')).toBe('/student');
    expect(safeNextPath('/signup?next=/student', 'shopkeeper')).toBe(
      '/shopkeeper',
    );
  });
});
