import { Blob as NodeBlob, File as NodeFile } from 'node:buffer';
import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';
if (typeof window !== 'undefined') {
  // Vitest aliases window to globalThis; preserve real jsdom storage instead of Node 26 getter errors.
  const environment: unknown = Reflect.get(globalThis, 'jsdom');
  const browserWindow =
    environment && typeof environment === 'object' && 'window' in environment
      ? environment.window
      : undefined;

  if (
    browserWindow &&
    typeof browserWindow === 'object' &&
    'localStorage' in browserWindow &&
    'sessionStorage' in browserWindow
  ) {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      writable: true,
      value: browserWindow.localStorage,
    });
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      writable: true,
      value: browserWindow.sessionStorage,
    });
  } else {
    const storage: Storage = window.localStorage ?? {
      get length() {
        return values.size;
      },
      clear() {
        values.clear();
      },
      getItem(key) {
        return values.get(String(key)) ?? null;
      },
      key(index) {
        return [...values.keys()][index] ?? null;
      },
      removeItem(key) {
        values.delete(String(key));
      },
      setItem(key, value) {
        values.set(String(key), String(value));
      },
    };
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      writable: true,
      value: storage,
    });
  }

  // fake-indexeddb uses Node structuredClone, which persists native Blob/File but not jsdom wrappers.
  Object.defineProperty(globalThis, 'Blob', {
    configurable: true,
    writable: true,
    value: NodeBlob,
  });
  Object.defineProperty(globalThis, 'File', {
    configurable: true,
    writable: true,
    value: NodeFile,
  });

  if (
    typeof HTMLDialogElement !== 'undefined' &&
    typeof HTMLDialogElement.prototype.showModal !== 'function'
  ) {
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      writable: true,
      value: function (this: HTMLDialogElement) {
        this.setAttribute('open', '');
      },
    });
  }
  if (
    typeof HTMLDialogElement !== 'undefined' &&
    typeof HTMLDialogElement.prototype.close !== 'function'
  ) {
    Object.defineProperty(HTMLDialogElement.prototype, 'close', {
      configurable: true,
      writable: true,
      value: function (this: HTMLDialogElement) {
        this.removeAttribute('open');
      },
    });
  }

  if (!window.matchMedia) {
    Object.defineProperty(window, 'matchMedia', {
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener() {},
        removeListener() {},
        addEventListener() {},
        removeEventListener() {},
        dispatchEvent() {
          return false;
        },
      }),
    });
  }
}

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

afterEach(cleanup);
