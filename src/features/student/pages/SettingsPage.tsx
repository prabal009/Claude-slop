import { Link } from "react-router-dom";
import { Card, Page } from "../components/ui";
import { PreferenceControls, SourceStatus } from "../components/PortalShell";
import { useStudent } from "../hooks/StudentContext";
import { useTranslation } from "../i18n/TranslationProvider";
import { date } from "../utils/format";

export function SettingsPage() {
  const { basePath, queue, connection, demoController } = useStudent();
  const { t, intlLocale } = useTranslation();
  const local = (queue?.source ?? connection.mode) === "local-demo";
  return (
    <Page
      title={t("presentation.settingsTitle")}
      description={t("presentation.settingsDescription")}
    >
      <Card>
        <h2>{t("presentation.preferences")}</h2>
        <PreferenceControls />
        <p className="pq-note">{t("presentation.preferencesNote")}</p>
      </Card>
      <Card>
        <h2>{t("presentation.connection")}</h2>
        <p>
          <SourceStatus />
        </p>
        <p>
          {connection.lastSyncedAt
            ? t("presentation.lastSynced", {
                time: date(connection.lastSyncedAt, intlLocale),
              })
            : t("presentation.neverSynced")}
        </p>
        <Link to={`${basePath}/help`}>{t("presentation.how")}</Link>
      </Card>
      <Card>
        <h2>{t("presentation.demoTitle")}</h2>
        {local && demoController ? (
          <>
            <p>{t("presentation.storageRecovery")}</p>
            <Link className="pq-button pq-secondary" to={`${basePath}/demo`}>
              {t("presentation.demo")}
            </Link>
          </>
        ) : (
          <p>{t("presentation.noDemo")}</p>
        )}
      </Card>
      <Card>
        <h2>{t("presentation.about")}</h2>
        <p>{t("presentation.aboutText")}</p>
      </Card>
    </Page>
  );
}
