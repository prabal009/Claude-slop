import { useTranslation } from "../i18n/TranslationProvider";
export function useErrorText() {
  const { t } = useTranslation();
  return (error: unknown): string => {
    let key = "errors.operationFailed";
    let params: Record<string, string | number> = {};
    if (typeof error === "object" && error !== null) {
      if ("messageKey" in error && typeof error.messageKey === "string")
        key = error.messageKey;
      else if (
        error instanceof Error &&
        /^(errors|documents|queue|storage)\.[A-Za-z0-9_.-]+$/.test(
          error.message,
        )
      )
        key = error.message;
      if (
        "params" in error &&
        typeof error.params === "object" &&
        error.params !== null
      )
        params = error.params as Record<string, string | number>;
    }
    return t(key, params);
  };
}
