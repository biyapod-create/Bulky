import React, { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext();

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState('light');

  useEffect(() => {
    // Load saved theme
    const loadTheme = async () => {
      try {
        if (window.electron) {
          const settings = await window.electron.settings.get();
          if (settings?.theme) {
            setTheme(settings.theme);
          }
        }
      } catch (error) {
        console.error('Failed to load theme:', error);
      }
    };
    loadTheme();
  }, []);

  useEffect(() => {
    // Apply theme to document
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = async (newTheme) => {
    setTheme(newTheme);
    try {
      if (window.electron) {
        const settings = await window.electron.settings.get() || {};
        await window.electron.settings.save({ ...settings, theme: newTheme });
      }
    } catch (error) {
      console.error('Failed to save theme:', error);
    }
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
