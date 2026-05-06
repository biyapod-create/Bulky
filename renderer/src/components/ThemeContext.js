import React, { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext();
const normalizeTheme = (value) => (value === 'light' ? 'light' : 'dark');

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    try {
      return normalizeTheme(localStorage.getItem('bulky_theme'));
    } catch {
      return 'dark';
    }
  });

  useEffect(() => {
    // Load saved theme
    const loadTheme = async () => {
      try {
        if (window.electron) {
          const settings = await window.electron.settings.get();
          if (settings?.theme) {
            setTheme(normalizeTheme(settings.theme));
          }
        }
      } catch (error) {}
    };
    loadTheme();
  }, []);

  useEffect(() => {
    // Apply theme to document
    const normalized = normalizeTheme(theme);
    document.documentElement.setAttribute('data-theme', normalized);
    document.documentElement.style.colorScheme = normalized;
    document.body.classList.remove('theme-dark', 'theme-light');
    document.body.classList.add(`theme-${normalized}`);
    try {
      localStorage.setItem('bulky_theme', normalized);
    } catch {}
  }, [theme]);

  const toggleTheme = async (newTheme) => {
    const normalized = normalizeTheme(newTheme);
    setTheme(normalized);
    try {
      if (window.electron) {
        const settings = await window.electron.settings.get() || {};
        await window.electron.settings.save({ ...settings, theme: normalized });
      }
    } catch (error) {}
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
