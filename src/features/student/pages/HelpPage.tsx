import { Link } from "react-router-dom";
import { Card, Page } from "../components/ui";
import { SourceStatus } from "../components/PortalShell";
import { useStudent } from "../hooks/StudentContext";
import { useTranslation } from "../i18n/TranslationProvider";
import { money, number, date } from "../utils/format";
import {
  MAX_FILE_BYTES,
  MAX_COPIES,
  MAX_PAGES,
  MAX_NAME_CODE_POINTS,
  MAX_INSTRUCTIONS_CODE_POINTS,
  PRICE_PER_SIDE,
  SETUP_SECONDS,
  SECONDS_PER_SIDE,
  PICKUP_BUFFER_MINUTES,
} from "../services/config";

export function HelpPage() {
  const { basePath, queue, connection, demoController } = useStudent();
  const { t, intlLocale } = useTranslation();
  const local = (queue?.source ?? connection.mode) === "local-demo";
  return (
    <Page
      title={t("presentation.helpPageTitle")}
      description={t("presentation.helpPageDescription")}
      actions={
        <Link className="pq-button pq-secondary" to={`${basePath}/settings`}>
          {t("presentation.settings")}
        </Link>
      }
    >
      <Card>
        <h2>{t("presentation.connection")}</h2>
        <p>
          <SourceStatus />
        </p>
        <p className="pq-note">
          {connection.lastSyncedAt
            ? t("presentation.lastSynced", {
                time: date(connection.lastSyncedAt, intlLocale),
              })
            : t("presentation.neverSynced")}
        </p>
        <p>{t("presentation.sharedHelp")}</p>
      </Card>
      <div className="pq-grid pq-grid-2">
        <Card>
          <h2>{t("presentation.pricingTitle")}</h2>
          <p>
            {t("presentation.pricingText", {
              bw: money(PRICE_PER_SIDE.bw, intlLocale),
              colour: money(PRICE_PER_SIDE.colour, intlLocale),
              setup: number(SETUP_SECONDS, intlLocale),
              bwSeconds: number(SECONDS_PER_SIDE.bw, intlLocale),
              colourSeconds: number(SECONDS_PER_SIDE.colour, intlLocale),
            })}
          </p>
          <p>{t("presentation.queueHelp")}</p>
          <p>
            {t("presentation.pickupHelp", {
              minutes: number(PICKUP_BUFFER_MINUTES, intlLocale),
            })}
          </p>
          <Link to={`${basePath}/estimate`}>{t("presentation.estimate")}</Link>
        </Card>
        <Card>
          <h2>{t("presentation.limitsTitle")}</h2>
          <p>
            {t("presentation.limitsText", {
              pages: number(MAX_PAGES, intlLocale),
              copies: number(MAX_COPIES, intlLocale),
              name: number(MAX_NAME_CODE_POINTS, intlLocale),
              instructions: number(MAX_INSTRUCTIONS_CODE_POINTS, intlLocale),
              size: number(MAX_FILE_BYTES / (1024 * 1024), intlLocale),
            })}
          </p>
          <h3>{t("presentation.qualityTitle")}</h3>
          <p>{t("presentation.qualityText")}</p>
        </Card>
      </div>
      <Card>
        <h2>{t("presentation.storageTitle")}</h2>
        <p>{t("presentation.storageText")}</p>
        <p>{t("presentation.offlineText")}</p>
      </Card>
      <Card>
        <h2>{t("presentation.qrTitle")}</h2>
        <p>{t("presentation.qrText")}</p>
      </Card>
      <Card>
        <h2>{t("presentation.demoTitle")}</h2>
        <p>{t("presentation.demoHelp")}</p>
        {local && demoController ? (
          <Link className="pq-button pq-secondary" to={`${basePath}/demo`}>
            {t("presentation.demo")}
          </Link>
        ) : (
          <p className="pq-note">{t("presentation.noDemo")}</p>
        )}
      </Card>
      <Card>
        <h2>{t("presentation.recordingTitle")}</h2>
        <p>{t("presentation.recordingText")}</p>
      </Card>
      <Card>
        <h2>{t("presentation.about")}</h2>
        <p>{t("presentation.aboutText")}</p>
      </Card>
    </Page>
  );
}
