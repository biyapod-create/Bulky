import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';
import { useToast } from './ToastContext';

const ICONS  = { success: CheckCircle, error: XCircle, warning: AlertTriangle, info: Info };
const LABELS = { success: 'Success', error: 'Error', warning: 'Warning', info: 'Info' };
const DURATION = { success: 4000, info: 4500, warning: 6000, error: 0 }; /* 0 = no auto-dismiss */
const MAX_VISIBLE = 5;

function Toast({ toast, onRemove }) {
  const [exiting, setExiting] = useState(false);
  const [progress, setProgress] = useState(100);
  const timerRef = useRef(null);
  const startRef = useRef(null);
  const duration = DURATION[toast.type] ?? 4000;
  const Icon = ICONS[toast.type] ?? Info;

  const dismiss = () => {
    setExiting(true);
    setTimeout(() => onRemove(toast.id), 240);
  };

  useEffect(() => {
    if (!duration) return;
    startRef.current = Date.now();
    const tick = () => {
      const elapsed = Date.now() - startRef.current;
      const pct = Math.max(0, 100 - (elapsed / duration) * 100);
      setProgress(pct);
      if (pct <= 0) { dismiss(); return; }
      timerRef.current = requestAnimationFrame(tick);
    };
    timerRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(timerRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duration, toast.id]);

  return (
    <div className={`toast toast--${toast.type} ${exiting ? 'toast--exit' : 'toast--enter'}`}
      role={toast.type === 'error' ? 'alert' : 'status'}
      aria-live={toast.type === 'error' ? 'assertive' : 'polite'}
    >
      <div className="toast__icon"><Icon size={17} /></div>
      <div className="toast__copy">
        <div className="toast__label">{LABELS[toast.type]}</div>
        <div className="toast__message">{toast.message}</div>
      </div>
      <button className="toast__close" onClick={dismiss} aria-label="Dismiss"><X size={14} /></button>
      {!!duration && (
        <div className="toast__progress">
          <div className="toast__progress-fill" style={{ width: `${progress}%` }} />
        </div>
      )}
    </div>
  );
}

function ToastContainer() {
  const { toasts, removeToast } = useToast();
  const visible = toasts.slice(0, MAX_VISIBLE);

  return (
    <div className="toast-container" aria-label="Notifications">
      {visible.map(t => (
        <Toast key={t.id} toast={t} onRemove={removeToast} />
      ))}
    </div>
  );
}

export default ToastContainer;
