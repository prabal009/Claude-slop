import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { en, type MessageKey } from "./en";
import { hi } from "./hi";
import { kn } from "./kn";
export type Locale = "en" | "hi" | "kn";
export type Theme = "light" | "dark" | "system";
export type Translate = (
  key: string,
  params?: Record<string, string | number>,
) => string;
const dictionaries: Record<Locale, Record<MessageKey, string>> = { en, hi, kn };
export function translate(
  locale: Locale,
  key: string,
  params: Record<string, string | number> = {},
): string {
  const message =
    dictionaries[locale]?.[key as MessageKey] ??
    en[key as MessageKey] ??
    en["common.unavailable"];
  return message.replace(/\{([A-Za-z0-9_]+)\}/g, (_match, name: string) =>
    params[name] === undefined ? "—" : String(params[name]),
  );
}
interface TranslationContextValue {
  t: Translate;
  locale: Locale;
  intlLocale: string;
  setLocale: (locale: Locale) => void;
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolvedTheme: "light" | "dark";
}
const TranslationContext = createContext<TranslationContextValue | null>(null);
function readPreference(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
export function TranslationProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleValue] = useState<Locale>(() => {
    const stored = readPreference("printq.student.locale");
    return stored === "hi" || stored === "kn" ? stored : "en";
  });
  const [theme, setThemeValue] = useState<Theme>(() => {
    const stored = readPreference("printq.student.theme");
    return stored === "light" || stored === "dark" ? stored : "system";
  });
  const [systemDark, setSystemDark] = useState(
    () =>
      typeof matchMedia === "function" &&
      matchMedia("(prefers-color-scheme: dark)").matches,
  );
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const media = matchMedia("(prefers-color-scheme: dark)");
    const change = () => setSystemDark(media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  const setLocale = useCallback((value: Locale) => {
    if (!["en", "hi", "kn"].includes(value)) return;
    setLocaleValue(value);
    try {
      localStorage.setItem("printq.student.locale", value);
    } catch {
      /* Preferences remain usable for this mount. */
    }
  }, []);
  const setTheme = useCallback((value: Theme) => {
    if (!["light", "dark", "system"].includes(value)) return;
    setThemeValue(value);
    try {
      localStorage.setItem("printq.student.theme", value);
    } catch {
      /* Preferences remain usable for this mount. */
    }
  }, []);
  const t = useCallback<Translate>(
    (key, params) => translate(locale, key, params),
    [locale],
  );
  const value = useMemo<TranslationContextValue>(
    () => ({
      t,
      locale,
      intlLocale:
        locale === "hi" ? "hi-IN" : locale === "kn" ? "kn-IN" : "en-IN",
      setLocale,
      theme,
      setTheme,
      resolvedTheme:
        theme === "system" ? (systemDark ? "dark" : "light") : theme,
    }),
    [t, locale, setLocale, theme, setTheme, systemDark],
  );
  return (
    <TranslationContext.Provider value={value}>
      {children}
    </TranslationContext.Provider>
  );
}
export function useTranslation() {
  const context = useContext(TranslationContext);
  if (!context) throw new Error("TranslationProvider is required");
  return context;
}
