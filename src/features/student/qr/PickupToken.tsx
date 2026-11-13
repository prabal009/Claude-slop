import { Component, useEffect, useRef, useState, type ReactNode } from "react";
import { QRCodeSVG } from "qrcode.react";
import type { PrintJob } from "../contracts/jobs";
import { useStudent } from "../hooks/StudentContext";
import { useTranslation } from "../i18n/TranslationProvider";
import { Card, Notice } from "../components/ui";
import { printSheet } from "../receipts/PrintSheet";

class QrBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
function QrGraphic({
  payload,
  label,
  onRendered,
}: {
  payload: string;
  label: string;
  onRendered?: () => void;
}) {
  useEffect(() => {
    onRendered?.();
  }, [payload, onRendered]);
  return (
    <QRCodeSVG
      value={payload}
      size={216}
      level="M"
      marginSize={4}
      title={label}
    />
  );
}
export function PickupToken({
  job,
  compact = false,
  onQrRendered,
}: {
  job: PrintJob;
  compact?: boolean;
  onQrRendered?: () => void;
}) {
  const { qrCodec } = useStudent();
  const { t, locale } = useTranslation();
  const qr = useRef<HTMLDivElement>(null);
  const token = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [printing, setPrinting] = useState(false);
  let payload: string | null = null;
  try {
    const encoded = qrCodec?.encode(job.token);
    if (
      typeof encoded === "string" &&
      encoded.length > 0 &&
      encoded.length <= 2048
    )
      payload = encoded;
  } catch {
    /* Readable token remains available. */
  }
  const fallback = <Notice kind="warning">{t("documents.qrFailed")}</Notice>;
  async function copy() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error();
      await navigator.clipboard.writeText(job.token);
      setNotice("documents.copied");
    } catch {
      token.current?.focus();
      token.current?.select();
      setNotice("documents.manualCopy");
    }
  }
  function download() {
    let url: string | null = null;
    try {
      const svg = qr.current?.querySelector("svg");
      if (!svg) throw new Error();
      const serialized = new XMLSerializer().serializeToString(svg);
      url = URL.createObjectURL(
        new Blob([serialized], { type: "image/svg+xml;charset=utf-8" }),
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "printq-pickup-qr.svg";
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      const exported = url;
      setTimeout(() => URL.revokeObjectURL(exported), 1000);
      url = null;
    } catch {
      if (url) URL.revokeObjectURL(url);
      setNotice("documents.qrFailed");
    }
  }
  async function print() {
    setPrinting(true);
    setNotice(null);
    try {
      await printSheet(
        <>
          <h1>{t("documents.qrTitle")}</h1>
          <h2>{job.documentName}</h2>
          <p className="pq-print-token">{job.token}</p>
          <p>{t(`documents.${job.status}`)}</p>
          {payload && (
            <QrBoundary fallback={<p>{t("documents.qrFailed")}</p>}>
              <QrGraphic
                payload={payload}
                label={t("documents.qrLabel", { token: job.token })}
              />
            </QrBoundary>
          )}
          <p>{t("documents.pickupInstructions")}</p>
        </>,
        { title: t("documents.printToken"), lang: locale },
      );
    } catch {
      setNotice("documents.printError");
    } finally {
      setPrinting(false);
    }
  }
  return (
    <Card className="pq-pickup-token">
      <h2>{t("documents.qrTitle")}</h2>
      {!compact && (
        <p>
          {job.documentName} · {t(`documents.${job.status}`)}
        </p>
      )}
      <label className="pq-label" htmlFor={`pq-token-${job.id}`}>
        {t("documents.tokenLabel")}
      </label>
      <input
        id={`pq-token-${job.id}`}
        ref={token}
        readOnly
        value={job.token}
        className="pq-token-input"
        onFocus={(event) => event.currentTarget.select()}
      />
      {payload ? (
        <div ref={qr} className="pq-qr">
          <QrBoundary key={`${job.id}-${retry}-${payload}`} fallback={fallback}>
            <QrGraphic
              payload={payload}
              label={t("documents.qrLabel", { token: job.token })}
              onRendered={onQrRendered}
            />
          </QrBoundary>
        </div>
      ) : (
        <Notice kind="warning">{t("documents.qrUnavailable")}</Notice>
      )}
      <p className="pq-muted">{t("documents.pickupInstructions")}</p>
      <div className="pq-actions">
        <button
          type="button"
          className="pq-button pq-secondary"
          onClick={() => void copy()}
        >
          {t("documents.copy")}
        </button>
        {payload && (
          <button
            type="button"
            className="pq-button pq-secondary"
            onClick={download}
          >
            {t("documents.downloadQr")}
          </button>
        )}
        <button
          type="button"
          className="pq-button pq-secondary"
          disabled={printing}
          onClick={() => void print()}
        >
          {t("documents.printToken")}
        </button>
        <button
          type="button"
          className="pq-button pq-secondary"
          onClick={() => {
            setRetry((value) => value + 1);
            setNotice(null);
          }}
        >
          {t("documents.retry")}
        </button>
      </div>
      {notice && (
        <Notice kind={notice === "documents.copied" ? "success" : "warning"}>
          {t(notice)}
        </Notice>
      )}
    </Card>
  );
}
