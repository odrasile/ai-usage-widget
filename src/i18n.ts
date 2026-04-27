export type Locale = "en" | "es";

export type Messages = {
  locale: Locale;
  appTitle: string;
  close: string;
  hideToTray: string;
  refresh: string;
  about: string;
  author: string;
  version: string;
  build: string;
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
  config: string;
  refreshInterval: string;
  minutes: string;
  displayMode: string;
  language: string;
  modeConsumed: string;
  modeFree: string;
  appTitleConsumed: string;
  appTitleFree: string;
  save: string;
  usage5h: string;
  free5h: string;
  usageWeekly: string;
  freeWeekly: string;
};

const messages: Record<Locale, Messages> = {
  en: {
    locale: "en",
    appTitle: "AI Usage",
    close: "Close",
    hideToTray: "Hide to tray",
    refresh: "Refresh now",
    about: "About",
    author: "Author",
    version: "Version",
    build: "Build",
    resize: "Resize widget",
    developedBy: "Developed by Elisardo González Agulla",
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
    weekly: "Weekly",
    config: "Settings",
    refreshInterval: "Refresh Interval",
    minutes: "min",
    displayMode: "Display Mode",
    language: "Language",
    modeConsumed: "Consumed Usage",
    modeFree: "Free Resources",
    appTitleConsumed: "AI Usage (Consumed)",
    appTitleFree: "AI Usage (Free)",
    save: "Save",
    usage5h: "5h Usage",
    free5h: "5h Free",
    usageWeekly: "Weekly Usage",
    freeWeekly: "Weekly Free"
  },
  es: {
    locale: "es",
    appTitle: "Uso AI",
    close: "Cerrar",
    hideToTray: "Ocultar a bandeja",
    refresh: "Actualizar ahora",
    about: "Informacion",
    author: "Autor",
    version: "Version",
    build: "Compilacion",
    resize: "Redimensionar widget",
    developedBy: "Desarrollado por Elisardo González Agulla",
    detecting: "Detectando CLIs",
    refreshing: "Actualizando...",
    refreshingProviders: "Consultando CLIs locales...",
    noProviders: "No se detectaron proveedores",
    updated: "Actualizado",
    reset: "Reinicio",
    unavailable: "Uso no disponible",
    usingCachedData: "Mostrando ultimo uso conocido",
    unableToRefresh: "No se pudo actualizar el uso",
    limit5h: "5h",
    weekly: "Semanal",
    config: "Ajustes",
    refreshInterval: "Intervalo de Refresco",
    minutes: "min",
    displayMode: "Modo de Visualización",
    language: "Idioma",
    modeConsumed: "Uso Consumido",
    modeFree: "Recursos Libres",
    appTitleConsumed: "Uso AI (Consumo)",
    appTitleFree: "Uso AI (Libre)",
    save: "Guardar",
    usage5h: "Uso 5h",
    free5h: "Libre 5h",
    usageWeekly: "Uso Semanal",
    freeWeekly: "Libre Semanal"
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
