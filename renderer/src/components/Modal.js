import React from 'react';
import { X } from 'lucide-react';

function Modal({ isOpen, onClose, title, children, footer, size = 'md' }) {
  if (!isOpen) return null;

  const sizeClasses = {
    sm: '400px',
    md: '500px',
    lg: '700px',
    xl: '900px',
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div 
        className="modal" 
        style={{ maxWidth: sizeClasses[size] }}
        onClick={e => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3 className="modal-title">{title}</h3>
          <button className="modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <div className="modal-body">
          {children}
        </div>
        {footer && (
          <div className="modal-footer">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export default Modal;
