import React from 'react';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';
import { useToast } from './ToastContext';

const icons = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

function ToastContainer() {
  const { toasts, removeToast } = useToast();

  return (
    <div className="toast-container">
      {toasts.map(toast => {
        const Icon = icons[toast.type] || Info;
        return (
          <div key={toast.id} className={`toast ${toast.type}`}>
            <Icon size={20} />
            <span>{toast.message}</span>
            <button 
              className="modal-close" 
              onClick={() => removeToast(toast.id)}
              style={{ marginLeft: 'auto' }}
            >
              <X size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

export default ToastContainer;
