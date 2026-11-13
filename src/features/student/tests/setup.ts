import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { File as NativeFile, Blob as NativeBlob } from "node:buffer";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach } from "vitest";
// Vitest aliases window to globalThis; Node 26's native storage must not shadow jsdom's origin storage.
const environment: unknown = Reflect.get(globalThis, "jsdom");
if (environment && typeof environment === "object" && "window" in environment) {
  const browserWindow = environment.window;
  if (
    browserWindow &&
    typeof browserWindow === "object" &&
    "localStorage" in browserWindow &&
    "sessionStorage" in browserWindow
  ) {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      writable: true,
      value: browserWindow.localStorage,
    });
    Object.defineProperty(globalThis, "sessionStorage", {
      configurable: true,
      writable: true,
      value: browserWindow.sessionStorage,
    });
  }
}
// fake-indexeddb uses native structuredClone, which cannot clone jsdom's File/Blob wrappers.
Object.defineProperty(globalThis, "File", {
  configurable: true,
  writable: true,
  value: NativeFile,
});
Object.defineProperty(globalThis, "Blob", {
  configurable: true,
  writable: true,
  value: NativeBlob,
});
// jsdom has no dialog top layer. Real focus/Escape/printing are additionally exercised in Chromium.
if (typeof HTMLDialogElement.prototype.showModal !== "function")
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    writable: true,
    value: function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    },
  });
if (typeof HTMLDialogElement.prototype.close !== "function")
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    writable: true,
    value: function (this: HTMLDialogElement) {
      this.removeAttribute("open");
    },
  });
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});
afterEach(cleanup);
