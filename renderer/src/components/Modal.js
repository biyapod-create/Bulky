import React, { useEffect, useRef, useCallback } from 'react';
import { X } from 'lucide-react';

/**
 * Modal — animated, focus-trapped, accessible
 * Sizes: sm(400) | md(520) | lg(720) | xl(940) | full(98vw)
 */
function Modal({ isOpen, onClose, title, children, footer, size = 'md', danger = false }) {
  const overlayRef = useRef(null);

  const sizeMap = { sm: '400px', md: '520px', lg: '720px', xl: '940px', full: 'min(98vw, 1200px)' };
  const maxWidth = sizeMap[size] ?? sizeMap.md;

  /* Focus trap */
  const trapFocus = useCallback((e) => {
    if (e.key !== 'Tab') return;
    const modal = overlayRef.current?.querySelector('.modal');
    if (!modal) return;
    const focusable = modal.querySelectorAll(
      'button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
    );
    const first = focusable[0];
    const last  = focusable[focusable.length - 1];
    if (e.shiftKey) { if (document.activeElement === first) { e.preventDefault(); last?.focus(); } }
    else             { if (document.activeElement === last)  { e.preventDefault(); first?.focus(); } }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const prevFocus = document.activeElement;
    const handler = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', handler);
    document.addEventListener('keydown', trapFocus);
    /* Focus first focusable element */
    setTimeout(() => {
      const modal = overlayRef.current?.querySelector('.modal');
      const first = modal?.querySelector('button,input,select,textarea,[tabindex]');
      first?.focus();
    }, 80);
    return () => {
      document.removeEventListener('keydown', handler);
      document.removeEventListener('keydown', trapFocus);
      prevFocus?.focus?.();
    };
  }, [isOpen, onClose, trapFocus]);

  if (!isOpen) return null;

  return (
    <div
      ref={overlayRef}
      className={`modal-overlay ${isOpen ? 'modal-overlay--open' : ''}`}
      role="presentation"
      onClick={(e) => { if (e.target === overlayRef.current) onClose?.(); }}
    >
      <div
        className={`modal modal--animated ${danger ? 'modal--danger' : ''}`}
        style={{ maxWidth }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <div className="modal-header">
          <h3 className="modal-title" id="modal-title">{title}</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

export default Modal;
