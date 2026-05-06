import React, { createContext, useContext, useState, useCallback, useRef } from 'react';

const ToastContext = createContext();

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const lastToastRef = useRef({});

  // Enhanced toast with different durations based on type
  const addToast = useCallback((message, type = 'info', duration = null) => {
    // Auto-adjust duration based on message type
    const defaultDurations = {
      success: 3000,
      error: 6000,
      warning: 4000,
      info: 3000
    };
    const finalDuration = duration || defaultDurations[type] || 3000;
    
    // Deduplicate: skip if same message+type already shown in last 3 seconds
    const key = `${type}:${message}`;
    if (lastToastRef.current[key] && Date.now() - lastToastRef.current[key] < 3000) {
      return;
    }
    lastToastRef.current[key] = Date.now();
    
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setToasts(prev => [...prev, { id, message, type }]);
    
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, finalDuration);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // Helper methods for specific toast types
  const showSuccess = useCallback((message, duration) => addToast(message, 'success', duration), [addToast]);
  const showError = useCallback((message, duration) => addToast(message, 'error', duration), [addToast]);
  const showWarning = useCallback((message, duration) => addToast(message, 'warning', duration), [addToast]);
  const showInfo = useCallback((message, duration) => addToast(message, 'info', duration), [addToast]);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast, showSuccess, showError, showWarning, showInfo }}>
      {children}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
}
