import React, { createContext, useContext, useState, useCallback, useRef } from 'react';

const NavigationContext = createContext();
const ACTIVE_PAGE_STORAGE_KEY = 'bulky_active_page';

function readStoredActivePage() {
  try {
    return localStorage.getItem(ACTIVE_PAGE_STORAGE_KEY) || '/';
  } catch {
    return '/';
  }
}

export function NavigationProvider({ children }) {
  const [activePage, setActivePage] = useState(readStoredActivePage);
  const [pageParams, setPageParams] = useState({});
  const listenersRef = useRef(new Map());

  const navigateTo = useCallback((path, state = {}) => {
    setPageParams(prev => ({ ...prev, [path]: state }));
    setActivePage(path);
    try {
      localStorage.setItem(ACTIVE_PAGE_STORAGE_KEY, path);
    } catch {
      // ignored
    }
  }, []);

  // Pages can subscribe to "becoming active" events
  const onPageActivate = useCallback((path, callback) => {
    listenersRef.current.set(path, callback);
    return () => listenersRef.current.delete(path);
  }, []);

  // Called internally when activePage changes
  const notifyActivation = useCallback((path) => {
    const cb = listenersRef.current.get(path);
    if (cb) cb();
  }, []);

  return (
    <NavigationContext.Provider value={{ activePage, navigateTo, pageParams, onPageActivate, notifyActivation }}>
      {children}
    </NavigationContext.Provider>
  );
}

export function useNavigation() {
  const ctx = useContext(NavigationContext);
  if (!ctx) throw new Error('useNavigation must be used within NavigationProvider');
  return ctx;
}

export default NavigationContext;
