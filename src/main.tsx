import { Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import './base.css';
import { AuthProvider, useAuth } from './features/auth/AuthContext';
import {
  LoginPage,
  NotFoundPage,
  ShopkeeperAccessPage,
  ShopkeeperRoute,
  SignupPage,
  StudentRoute,
} from './features/auth/AuthPages';

const StudentPortal = lazy(() =>
  import('./features/student/StudentPortal').then((module) => ({
    default: module.StudentPortal,
  })),
);
const ShopkeeperPortal = lazy(() =>
  import('./features/shopkeeper/ShopkeeperPortal').then((module) => ({
    default: module.ShopkeeperPortal,
  })),
);

function LoadingFallback() {
  return (
    <main
      aria-busy="true"
      style={{ padding: '3rem', fontFamily: 'sans-serif' }}
    >
      <p role="status">Opening PrintQ…</p>
    </main>
  );
}

function StudentPortalMount() {
  const { workspace } = useAuth();
  if (!workspace) return <LoadingFallback />;
  return (
    <StudentPortal
      basePath="/student"
      service={workspace.studentService}
      qrCodec={workspace.qrCodec}
      demoController={workspace.demoController}
    />
  );
}

function ShopkeeperPortalMount() {
  const { workspace } = useAuth();
  if (!workspace) return <LoadingFallback />;
  return <ShopkeeperPortal service={workspace.shopkeeperService} />;
}

export function AppRoutes() {
  return (
    <AuthProvider>
      <Suspense fallback={<LoadingFallback />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/shopkeeper/access" element={<ShopkeeperAccessPage />} />
          <Route
            path="/student/*"
            element={
              <StudentRoute>
                <StudentPortalMount />
              </StudentRoute>
            }
          />
          <Route
            path="/shopkeeper/*"
            element={
              <ShopkeeperRoute>
                <ShopkeeperPortalMount />
              </ShopkeeperRoute>
            }
          />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </AuthProvider>
  );
}

const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>,
  );
}
