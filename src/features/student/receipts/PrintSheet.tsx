import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import printStyles from "./print.css?url";

/** Resolves when the print dialog is invoked, never as confirmation of printing/payment. */
export async function printSheet(
  content: ReactNode,
  options: { title: string; lang: string },
): Promise<void> {
  const frame = document.createElement("iframe");
  frame.title = options.title;
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  frame.style.position = "fixed";
  frame.style.left = "-10000px";
  frame.style.width = "800px";
  frame.style.height = "1000px";
  document.body.append(frame);
  let root: Root | null = null;
  let cleanupTimer: ReturnType<typeof setTimeout> | undefined;
  const cleanup = () => {
    clearTimeout(cleanupTimer);
    root?.unmount();
    root = null;
    frame.remove();
  };
  try {
    const page = frame.contentDocument,
      target = frame.contentWindow;
    if (!page || !target) throw new Error("documents.printError");
    page.documentElement.lang = options.lang;
    page.title = options.title;
    const style = page.createElement("link");
    style.rel = "stylesheet";
    style.href = printStyles;
    const loaded = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("documents.printError")),
        10000,
      );
      style.onload = () => {
        clearTimeout(timer);
        resolve();
      };
      style.onerror = () => {
        clearTimeout(timer);
        reject(new Error("documents.printError"));
      };
    });
    page.head.append(style);
    const mount = page.createElement("main");
    page.body.append(mount);
    root = createRoot(mount);
    flushSync(() =>
      root?.render(<div className="pq-print-sheet">{content}</div>),
    );
    await loaded;
    await page.fonts.ready;
    if (!frame.isConnected) throw new Error("documents.printError");
    target.addEventListener(
      "afterprint",
      () => {
        setTimeout(cleanup, 0);
      },
      { once: true },
    );
    cleanupTimer = setTimeout(cleanup, 300000);
    target.focus();
    target.print();
  } catch (error) {
    cleanup();
    throw error;
  }
}

export function PrintSheet({ children }: { children: ReactNode }) {
  return <article className="pq-print-sheet">{children}</article>;
}
