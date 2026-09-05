import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { THEMES, DEFAULT_THEME_ID, applyTheme, getTheme, type Theme } from './themes';

interface ThemeContextValue {
  theme: Theme;
  themes: Theme[];
  setThemeId: (id: string) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);
const STORAGE_KEY = 'rithi.theme';
// A THEME SOMEBODY CHOSE, AS OPPOSED TO ONE THAT WAS MERELY SAVED.
//
// The applied theme is written to storage on every load, so after one visit
// EVERY device carries an id — which meant changing the default changed nothing
// for anybody, and "make it the default for everyone" would have been a no-op.
//
// This flag is only set when a person actually picks a theme in Settings. So a
// new default reaches everyone who never chose one, and never overrides someone
// who did. (The Apps Script URL has the same problem and solves it with a
// version number; this is the same idea, kept simpler because a theme has no
// versions to compare.)
const PICKED_KEY = 'rithi.theme.picked';

const read = (k: string): string | null => {
  try { return localStorage.getItem(k); } catch { return null; }
};
const write = (k: string, v: string): void => {
  try { localStorage.setItem(k, v); } catch { /* private window: the theme just does not persist */ }
};

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeId, setThemeIdState] = useState<string>(
    () => (read(PICKED_KEY) === '1' ? (read(STORAGE_KEY) || DEFAULT_THEME_ID) : DEFAULT_THEME_ID),
  );

  const theme = getTheme(themeId);

  useEffect(() => {
    applyTheme(theme);
    write(STORAGE_KEY, theme.id);
  }, [theme]);

  // Picking one is what makes it stick through a future change of default.
  const setThemeId = (id: string) => {
    write(PICKED_KEY, '1');
    setThemeIdState(id);
  };

  return (
    <ThemeContext.Provider value={{ theme, themes: THEMES, setThemeId }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
