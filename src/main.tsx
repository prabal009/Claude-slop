import { Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import './base.css';

const ShopkeeperPortal = lazy(() => import('./features/shopkeeper/ShopkeeperPortal').then(module => ({ default: module.ShopkeeperPortal })));

createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <Suspense fallback={<main aria-busy="true" style={{ padding: '3rem', fontFamily: 'sans-serif' }}><p role="status">Opening PrintQ…</p></main>}>
      <Routes>
        <Route path="/shopkeeper/*" element={<ShopkeeperPortal />} />
        <Route path="*" element={<Navigate to="/shopkeeper" replace />} />
      </Routes>
    </Suspense>
  </BrowserRouter>,
);
