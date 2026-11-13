import { useEffect, useRef, useState, type ReactNode } from "react";
import { NavLink, Link, useLocation } from "react-router-dom";
import {
  ChevronRight,
  FilePlus2,
  History,
  Home,
  Leaf,
  Menu,
  Printer,
  ShieldCheck,
  X,
  CircleHelp,
  Route,
  Settings,
  LogOut,
  ArrowUpRight,
} from "lucide-react";
import { useStudent } from "../hooks/StudentContext";
import { useOptionalAuth } from "../../auth/AuthContext";
import { Notice, Loading } from "./ui";
import { date, number } from "../utils/format";
import { useTranslation } from "../i18n/TranslationProvider";

const destinations = [
  ["", "home", Home],
  ["new", "new", FilePlus2],
  ["jobs", "jobs", History],
  ["queue", "queue", Route],
  ["ecoprint", "eco", Leaf],
  ["help", "help", CircleHelp],
] as const;

export function SourceStatus() {
  const { connection, queue } = useStudent();
  const { t } = useTranslation();
  const local = (queue?.source ?? connection.mode) === "local-demo";
  const key = local
    ? connection.state === "unavailable"
      ? "localUnavailable"
      : "local"
    : connection.state === "connected"
      ? "shared"
      : connection.state === "disconnected"
        ? "disconnected"
        : "unavailable";
  return <>{t(`presentation.${key}`)}</>;
}

export function PreferenceControls({ compact = false }: { compact?: boolean }) {
  const { t, locale, setLocale, theme, setTheme } = useTranslation();
  const suffix = compact ? "header" : "settings";
  return (
    <div
      className={`pq-preferences ${compact ? "pq-preferences-compact" : ""}`}
    >
      <div className="pq-field">
        <label htmlFor={`pq-language-${suffix}`}>
          {t("presentation.language")}
        </label>
        <select
          id={`pq-language-${suffix}`}
          value={locale}
          onChange={(event) =>
            setLocale(event.target.value as "en" | "hi" | "kn")
          }
        >
          <option value="en">{t("presentation.english")}</option>
          <option value="hi">{t("presentation.hindi")}</option>
          <option value="kn">{t("presentation.kannada")}</option>
        </select>
      </div>
      <div className="pq-field">
        <label htmlFor={`pq-theme-${suffix}`}>{t("presentation.theme")}</label>
        <select
          id={`pq-theme-${suffix}`}
          value={theme}
          onChange={(event) =>
            setTheme(event.target.value as "light" | "dark" | "system")
          }
        >
          {(["light", "dark", "system"] as const).map((value) => (
            <option key={value} value={value}>
              {t(`presentation.${value}`)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

export function PortalShell({ children }: { children: ReactNode }) {
  const {
    basePath,
    queue,
    jobs,
    connection,
    diagnostics,
    refresh,
  } = useStudent();
  const { t, intlLocale } = useTranslation();
  const auth = useOptionalAuth();
  const [menu, setMenu] = useState(false);
  const [mobile, setMobile] = useState(
    () => typeof window !== "undefined" && window.innerWidth <= 820,
  );
  const sidebar = useRef<HTMLElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const location = useLocation();
  const local = (queue?.source ?? connection.mode) === "local-demo";
  useEffect(() => setMenu(false), [location.pathname]);
  useEffect(() => {
    const resize = () => {
      const next = window.innerWidth <= 820;
      setMobile(next);
      if (!next) setMenu(false);
    };
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  useEffect(() => {
    if (!menu) return;
    const element = sidebar.current;
    const items = Array.from(
      element?.querySelectorAll<HTMLElement>(
        "a[href], button:not([disabled]), select",
      ) ?? [],
    ).filter(
      (node) => !node.hidden && node.getAttribute("aria-hidden") !== "true",
    );
    items[0]?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMenu(false);
      }
      if (event.key === "Tab") {
        const first = items[0];
        const last = items[items.length - 1];
        if (
          event.shiftKey &&
          (document.activeElement === first ||
            !element?.contains(document.activeElement))
        ) {
          event.preventDefault();
          last?.focus();
        } else if (
          !event.shiftKey &&
          (document.activeElement === last ||
            !element?.contains(document.activeElement))
        ) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    window.addEventListener("keydown", keydown);
    return () => {
      window.removeEventListener("keydown", keydown);
      toggle.current?.focus();
    };
  }, [menu]);
  const current =
    destinations.find(
      ([path]) => path && location.pathname.startsWith(`${basePath}/${path}`),
    )?.[1] ??
    (location.pathname === basePath || location.pathname === `${basePath}/`
      ? "home"
      : ((["settings", "demo", "estimate", "simulate"] as const).find(
          (path) => location.pathname === `${basePath}/${path}`,
        ) ?? "unknown"));
  return (
    <>
      <a className="pq-skip" href="#pq-main">
        {t("presentation.skip")}
      </a>
      {menu && (
        <button
          type="button"
          className="pq-menu-backdrop"
          tabIndex={-1}
          aria-label={t("presentation.closeNav")}
          onClick={() => setMenu(false)}
        />
      )}
      <aside
        className="pq-sidebar"
        id="pq-sidebar"
        data-open={menu}
        ref={sidebar}
        aria-label={t("presentation.workspace")}
        inert={mobile && !menu ? true : undefined}
        aria-hidden={mobile && !menu ? true : undefined}
      >
        <button
          type="button"
          className="pq-icon-button pq-mobile-close"
          onClick={() => setMenu(false)}
          aria-label={t("presentation.closeNav")}
        >
          <X size={19} aria-hidden="true" />
        </button>
        <Link className="pq-brand" to={basePath}>
          <span className="pq-brand-mark">
            <Printer size={23} aria-hidden="true" />
          </span>
          <span>
            <strong>PrintQ.</strong>
            <small>{t("presentation.portal")}</small>
          </span>
        </Link>
        <div className="pq-nav-caption">{t("presentation.workspace")}</div>
        <nav className="pq-nav" aria-label={t("presentation.nav")}>
          {destinations.map(([path, key, Icon]) => (
            <NavLink end={!path} key={path} to={`${basePath}/${path}`}>
              <Icon size={18} aria-hidden="true" />
              <span>{t(`presentation.${key}`)}</span>
            </NavLink>
          ))}
          <NavLink to={`${basePath}/settings`}>
            <Settings size={18} aria-hidden="true" />
            <span>{t("presentation.settings")}</span>
          </NavLink>
        </nav>
        <div className="pq-sidebar-footer">
          {auth ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <ShieldCheck size={16} aria-hidden="true" />
                <strong style={{ color: "var(--pq-text)", fontSize: 12 }}>
                  {auth.runtime?.mode === "demo"
                    ? `Demo · ${auth.role === "shopkeeper" ? "Shopkeeper" : "Student"}`
                    : auth.session?.user.name ?? "Signed in"}
                </strong>
              </div>
              {auth.session?.user.email && (
                <span style={{ wordBreak: "break-word" }}>{auth.session.user.email}</span>
              )}
              {auth.role === "shopkeeper" && (
                <a
                  href="/shopkeeper"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    minHeight: 44,
                    color: "var(--pq-accent)",
                    fontWeight: 600,
                    textDecoration: "none",
                  }}
                >
                  <span>Switch to Shopkeeper</span>
                  <ArrowUpRight size={14} aria-hidden="true" />
                </a>
              )}
              <a
                href="/"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  minHeight: 44,
                  color: "var(--pq-muted)",
                  textDecoration: "none",
                }}
              >
                <Home size={14} aria-hidden="true" />
                <span>PrintQ home</span>
              </a>
              <button
                type="button"
                onClick={() => void auth.signOut()}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  minHeight: 44,
                  padding: "6px 10px",
                  border: "1px solid var(--pq-line)",
                  borderRadius: 7,
                  background: "var(--pq-card)",
                  color: "var(--pq-text)",
                  fontWeight: 600,
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <LogOut size={14} aria-hidden="true" />
                <span>Sign out</span>
              </button>
            </div>
          ) : (
            <>
              <ShieldCheck size={17} aria-hidden="true" />
              <p>{t("presentation.noLogin")}</p>
              <a
                href="/"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  minHeight: 44,
                  color: "var(--pq-muted)",
                  textDecoration: "none",
                }}
              >
                <Home size={14} aria-hidden="true" />
                <span>PrintQ home</span>
              </a>
            </>
          )}
          <span>PrintQ · {t("presentation.portal")} · 1.0</span>
        </div>
      </aside>
      <div className="pq-main-shell" inert={menu ? true : undefined}>
        <header className="pq-topbar">
          <button
            ref={toggle}
            type="button"
            className="pq-icon-button pq-mobile-toggle"
            aria-label={t(
              menu ? "presentation.closeNav" : "presentation.openNav",
            )}
            aria-expanded={menu}
            aria-controls="pq-sidebar"
            onClick={() => setMenu((value) => !value)}
          >
            <Menu size={19} aria-hidden="true" />
          </button>
          <div className="pq-breadcrumb">
            {t("presentation.workspace")}{" "}
            <ChevronRight size={13} aria-hidden="true" />
            <strong>{t(`presentation.${current}`)}</strong>
          </div>
          <div className="pq-top-actions">
            <PreferenceControls compact />
          </div>
        </header>
        <main className="pq-content" id="pq-main" tabIndex={-1}>
          <div className="pq-source-bar">
            <span>
              <span className="pq-dot" />
              <SourceStatus />
            </span>
            <span>
              {queue?.observedAt
                ? t("presentation.asOf", {
                    time: date(queue.observedAt, intlLocale),
                  })
                : t("presentation.waiting")}
            </span>
          </div>
          <span
            className="pq-sr-only"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            <span key={queue?.revision}>
              {queue
                ? t("presentation.updated", {
                    count: number(jobs.length, intlLocale),
                  })
                : t("presentation.waiting")}
            </span>{" "}
            <SourceStatus />
          </span>
          {queue?.stale && (
            <Notice kind="warning">{t("presentation.stale")}</Notice>
          )}
          {diagnostics.map((item, index) => (
            <Notice key={`${item.code}-${index}`} kind="warning">
              {t(item.messageKey)}{" "}
              <button type="button" onClick={refresh}>
                {t("presentation.retry")}
              </button>
            </Notice>
          ))}
          {!queue &&
          diagnostics.length === 0 &&
          connection.state !== "unavailable" ? (
            <Loading label={t("presentation.loading")} />
          ) : (
            children
          )}
        </main>
        <footer className="pq-footer">
          <span>{t("presentation.footer")}</span>
          <span>
            {t("presentation.estimates")}{" "}
            <Link to={`${basePath}/help`}>
              {t("presentation.how")}{" "}
              <ChevronRight size={10} aria-hidden="true" />
            </Link>
          </span>
        </footer>
      </div>
    </>
  );
}
