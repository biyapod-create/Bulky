import React from 'react';
import { X } from 'lucide-react';

function Modal({ isOpen, onClose, title, children, footer, size = 'md' }) {
  if (!isOpen) return null;

  // Support both shorthand (lg) and full names (large)
  const sizeMap = {
    sm: '400px',
    small: '400px',
    md: '500px',
    medium: '500px',
    lg: '700px',
    large: '700px',
    xl: '900px',
    xlarge: '900px',
  };

  const width = sizeMap[size] || sizeMap.md;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div 
        className="modal" 
        style={{ maxWidth: width }}
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
