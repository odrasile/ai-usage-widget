export type Locale = "en" | "es";

export type Messages = {
  locale: Locale;
  appTitle: string;
  close: string;
  hideToTray: string;
  refresh: string;
  about: string;
  resize: string;
  developedBy: string;
  detecting: string;
  refreshing: string;
  refreshingProviders: string;
  noProviders: string;
  updated: string;
  reset: string;
  unavailable: string;
  usingCachedData: string;
  unableToRefresh: string;
  limit5h: string;
  weekly: string;
};

const messages: Record<Locale, Messages> = {
  en: {
    locale: "en",
    appTitle: "AI Usage",
    close: "Close",
    hideToTray: "Hide to tray",
    refresh: "Refresh now",
    about: "About",
    resize: "Resize widget",
    developedBy: "Developed by @odrasile",
    detecting: "Detecting CLIs",
    refreshing: "Refreshing...",
    refreshingProviders: "Querying local CLIs...",
    noProviders: "No providers detected",
    updated: "Updated",
    reset: "Reset",
    unavailable: "Usage unavailable",
    usingCachedData: "Showing last known usage",
    unableToRefresh: "Unable to refresh usage",
    limit5h: "5h",
    weekly: "Weekly"
  },
  es: {
    locale: "es",
    appTitle: "Uso AI",
    close: "Cerrar",
    hideToTray: "Ocultar a bandeja",
    refresh: "Actualizar ahora",
    about: "Informacion",
    resize: "Redimensionar widget",
    developedBy: "Developed by @odrasile",
    detecting: "Detectando CLIs",
    refreshing: "Actualizando...",
    refreshingProviders: "Consultando CLIs locales...",
    noProviders: "No se detectaron proveedores",
    updated: "Actualizado",
    reset: "Reinicio",
    unavailable: "Uso no disponible",
    usingCachedData: "Mostrando ultimo uso conocido",
    unableToRefresh: "No se pudo actualizar el uso",
    limit5h: "5 h",
    weekly: "Semanal"
  }
};

export function detectLocale(): Locale {
  const languages = navigator.languages?.length ? navigator.languages : [navigator.language];
  const language = languages.find(Boolean)?.toLowerCase() ?? "en";
  return language.startsWith("es") ? "es" : "en";
}

export function getMessages(locale: Locale): Messages {
  return messages[locale];
}
