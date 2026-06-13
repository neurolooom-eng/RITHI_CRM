// ---------------------------------------------------------------------------
// Color Theme System
// Multiple selectable themes. Each theme is a flat map of CSS custom properties
// applied to :root. Components only ever read var(--token), never hard-coded
// colors, so a theme switch re-skins the entire application instantly.
// ---------------------------------------------------------------------------

export interface ThemeColors {
  // surfaces
  bg: string;
  surface: string;
  surfaceAlt: string;
  surfaceRaised: string;
  border: string;
  borderStrong: string;
  // text
  text: string;
  textMuted: string;
  textInverse: string;
  // brand / accents
  primary: string;
  primaryHover: string;
  primarySoft: string;
  accent: string;
  // status
  success: string;
  warning: string;
  danger: string;
  info: string;
  successSoft: string;
  warningSoft: string;
  dangerSoft: string;
  infoSoft: string;
  // sidebar
  sidebarBg: string;
  sidebarText: string;
  sidebarActive: string;
}

export interface Theme {
  id: string;
  name: string;
  scheme: 'light' | 'dark';
  colors: ThemeColors;
}

export const THEMES: Theme[] = [
  {
    id: 'medical-teal',
    name: 'Medical Teal',
    scheme: 'light',
    colors: {
      bg: '#eef3f5',
      surface: '#ffffff',
      surfaceAlt: '#f5f8fa',
      surfaceRaised: '#ffffff',
      border: '#dce5e9',
      borderStrong: '#b9c8ce',
      text: '#13343b',
      textMuted: '#5e7077',
      textInverse: '#ffffff',
      primary: '#0d9488',
      primaryHover: '#0b7d73',
      primarySoft: '#d6f0ec',
      accent: '#2563eb',
      success: '#16a34a',
      warning: '#d97706',
      danger: '#dc2626',
      info: '#0284c7',
      successSoft: '#dcfce7',
      warningSoft: '#fef3c7',
      dangerSoft: '#fee2e2',
      infoSoft: '#e0f2fe',
      sidebarBg: '#0f3d3a',
      sidebarText: '#bfe3df',
      sidebarActive: '#14b8a6',
    },
  },
  {
    id: 'clinical-blue',
    name: 'Clinical Blue',
    scheme: 'light',
    colors: {
      bg: '#eef2f9',
      surface: '#ffffff',
      surfaceAlt: '#f4f7fc',
      surfaceRaised: '#ffffff',
      border: '#dbe3ef',
      borderStrong: '#b6c4db',
      text: '#172b4d',
      textMuted: '#5b6b85',
      textInverse: '#ffffff',
      primary: '#2563eb',
      primaryHover: '#1d4ed8',
      primarySoft: '#dbeafe',
      accent: '#0891b2',
      success: '#16a34a',
      warning: '#d97706',
      danger: '#dc2626',
      info: '#0284c7',
      successSoft: '#dcfce7',
      warningSoft: '#fef3c7',
      dangerSoft: '#fee2e2',
      infoSoft: '#e0f2fe',
      sidebarBg: '#13294b',
      sidebarText: '#b9c9e6',
      sidebarActive: '#3b82f6',
    },
  },
  {
    id: 'emerald-care',
    name: 'Emerald Care',
    scheme: 'light',
    colors: {
      bg: '#eef5f0',
      surface: '#ffffff',
      surfaceAlt: '#f3f9f5',
      surfaceRaised: '#ffffff',
      border: '#d8e7de',
      borderStrong: '#b3cdbd',
      text: '#143625',
      textMuted: '#577065',
      textInverse: '#ffffff',
      primary: '#059669',
      primaryHover: '#047857',
      primarySoft: '#d1fae5',
      accent: '#7c3aed',
      success: '#16a34a',
      warning: '#d97706',
      danger: '#dc2626',
      info: '#0284c7',
      successSoft: '#dcfce7',
      warningSoft: '#fef3c7',
      dangerSoft: '#fee2e2',
      infoSoft: '#e0f2fe',
      sidebarBg: '#0f3322',
      sidebarText: '#bfe3cf',
      sidebarActive: '#10b981',
    },
  },
  {
    id: 'royal-violet',
    name: 'Royal Violet',
    scheme: 'light',
    colors: {
      bg: '#f1eef8',
      surface: '#ffffff',
      surfaceAlt: '#f7f4fc',
      surfaceRaised: '#ffffff',
      border: '#e3dcf0',
      borderStrong: '#c6b6e0',
      text: '#2a1b45',
      textMuted: '#6b5b85',
      textInverse: '#ffffff',
      primary: '#7c3aed',
      primaryHover: '#6d28d9',
      primarySoft: '#ede9fe',
      accent: '#db2777',
      success: '#16a34a',
      warning: '#d97706',
      danger: '#dc2626',
      info: '#0284c7',
      successSoft: '#dcfce7',
      warningSoft: '#fef3c7',
      dangerSoft: '#fee2e2',
      infoSoft: '#e0f2fe',
      sidebarBg: '#2b1b4d',
      sidebarText: '#cfc1e6',
      sidebarActive: '#8b5cf6',
    },
  },
  {
    id: 'sunset-amber',
    name: 'Sunset Amber',
    scheme: 'light',
    colors: {
      bg: '#f8f3ed',
      surface: '#ffffff',
      surfaceAlt: '#fcf7f1',
      surfaceRaised: '#ffffff',
      border: '#efe3d6',
      borderStrong: '#e0c6a8',
      text: '#43301b',
      textMuted: '#85715b',
      textInverse: '#ffffff',
      primary: '#ea580c',
      primaryHover: '#c2410c',
      primarySoft: '#ffedd5',
      accent: '#0d9488',
      success: '#16a34a',
      warning: '#d97706',
      danger: '#dc2626',
      info: '#0284c7',
      successSoft: '#dcfce7',
      warningSoft: '#fef3c7',
      dangerSoft: '#fee2e2',
      infoSoft: '#e0f2fe',
      sidebarBg: '#46260f',
      sidebarText: '#e6cfb9',
      sidebarActive: '#f97316',
    },
  },
  {
    id: 'midnight-dark',
    name: 'Midnight Dark',
    scheme: 'dark',
    colors: {
      bg: '#0f1722',
      surface: '#172230',
      surfaceAlt: '#1d2a3a',
      surfaceRaised: '#202f41',
      border: '#2c3c50',
      borderStrong: '#3d5066',
      text: '#e6edf5',
      textMuted: '#94a6bc',
      textInverse: '#0f1722',
      primary: '#14b8a6',
      primaryHover: '#2dd4bf',
      primarySoft: '#0c3b38',
      accent: '#60a5fa',
      success: '#22c55e',
      warning: '#fbbf24',
      danger: '#f87171',
      info: '#38bdf8',
      successSoft: '#14361f',
      warningSoft: '#3b2f10',
      dangerSoft: '#3b1818',
      infoSoft: '#102a3b',
      sidebarBg: '#0b121c',
      sidebarText: '#8aa0b8',
      sidebarActive: '#14b8a6',
    },
  },
  {
    id: 'slate-dark',
    name: 'Slate Dark',
    scheme: 'dark',
    colors: {
      bg: '#101214',
      surface: '#1a1d21',
      surfaceAlt: '#20242a',
      surfaceRaised: '#23272e',
      border: '#2e343c',
      borderStrong: '#434b55',
      text: '#e8eaed',
      textMuted: '#9aa3ad',
      textInverse: '#101214',
      primary: '#6366f1',
      primaryHover: '#818cf8',
      primarySoft: '#1e2150',
      accent: '#f472b6',
      success: '#22c55e',
      warning: '#fbbf24',
      danger: '#f87171',
      info: '#38bdf8',
      successSoft: '#14361f',
      warningSoft: '#3b2f10',
      dangerSoft: '#3b1818',
      infoSoft: '#102a3b',
      sidebarBg: '#0a0c0e',
      sidebarText: '#959ba5',
      sidebarActive: '#6366f1',
    },
  },
];

export const DEFAULT_THEME_ID = 'medical-teal';

const camelToKebab = (s: string) => s.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  Object.entries(theme.colors).forEach(([key, value]) => {
    root.style.setProperty(`--${camelToKebab(key)}`, value);
  });
  root.setAttribute('data-scheme', theme.scheme);
  root.style.colorScheme = theme.scheme;
}

export function getTheme(id: string): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}
