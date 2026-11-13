import { Component, useEffect, useRef, type ReactNode } from "react";
import { AlertCircle, ArrowRight, LoaderCircle } from "lucide-react";
import { useTranslation } from "../i18n/TranslationProvider";
export function Page({
  eyebrow: _eyebrow,
  title,
  description,
  actions,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <div className="pq-page-heading">
        <div>
          <h1>{title}</h1>
          {description && <p>{description}</p>}
        </div>
        {actions && <div className="pq-actions">{actions}</div>}
      </div>
      {children}
    </>
  );
}
export function Card({
  children,
  className = "",
  ...props
}: React.HTMLAttributes<HTMLElement>) {
  return (
    <section className={`pq-card ${className}`} {...props}>
      {children}
    </section>
  );
}
export function Notice({
  children,
  kind = "info",
}: {
  children: ReactNode;
  kind?: "info" | "warning" | "error" | "success";
}) {
  return (
    <div
      className={`pq-notice pq-notice-${kind}`}
      role={kind === "error" ? "alert" : "status"}
    >
      <AlertCircle size={19} />
      <div>{children}</div>
    </div>
  );
}
export function Loading({ label }: { label?: string }) {
  const { t } = useTranslation();
  return (
    <div className="pq-loading" role="status">
      <LoaderCircle size={24} />
      {label ?? t("common.loading")}
    </div>
  );
}
export function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="pq-empty">
      <h2 className="pq-inline-heading">
        <ArrowRight size={18} aria-hidden="true" />
        {title}
      </h2>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
  closeLabel,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  closeLabel?: string;
}) {
  const { t } = useTranslation();
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const element = dialog.current;
    element?.showModal();
    cancel.current?.focus();
    return () => {
      element?.close();
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="pq-dialog"
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
          return;
        }
        if (event.key !== "Tab") return;
        const targets = Array.from(
          dialog.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]',
          ) ?? [],
        );
        const first = targets[0],
          last = targets.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
    >
      <h2>{title}</h2>
      {children}
      <button
        ref={cancel}
        className="pq-button pq-secondary"
        type="button"
        onClick={onClose}
      >
        {closeLabel ?? t("common.cancel")}
      </button>
    </dialog>
  );
}
function BoundaryFallback({ retry }: { retry: () => void }) {
  const { t } = useTranslation();
  return (
    <Notice kind="error">
      {t("errors.viewFailed")}{" "}
      <button className="pq-button pq-secondary" onClick={retry}>
        {t("common.retry")}
      </button>
    </Notice>
  );
}
export class PortalBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed
      ? (this.props.fallback ?? (
          <BoundaryFallback retry={() => this.setState({ failed: false })} />
        ))
      : this.props.children;
  }
}
