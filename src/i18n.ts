export type Locale = "en" | "es";

export type Messages = {
  appTitle: string;
  close: string;
  hideToTray: string;
  detecting: string;
  noProviders: string;
  updated: string;
  reset: string;
  unavailable: string;
  unableToRefresh: string;
  limit5h: string;
  weekly: string;
};

const messages: Record<Locale, Messages> = {
  en: {
    appTitle: "AI Usage",
    close: "Close",
    hideToTray: "Hide to tray",
    detecting: "Detecting CLIs",
    noProviders: "No providers detected",
    updated: "Updated",
    reset: "Reset",
    unavailable: "Usage unavailable",
    unableToRefresh: "Unable to refresh usage",
    limit5h: "5h",
    weekly: "Weekly"
  },
  es: {
    appTitle: "Uso AI",
    close: "Cerrar",
    hideToTray: "Ocultar a bandeja",
    detecting: "Detectando CLIs",
    noProviders: "No se detectaron proveedores",
    updated: "Actualizado",
    reset: "Reinicio",
    unavailable: "Uso no disponible",
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
