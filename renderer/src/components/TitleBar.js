import React, { useState } from 'react';
import { Minus, Square, X, Mail } from 'lucide-react';

function TitleBar() {
  const [logoError, setLogoError] = useState(false);
  
  const handleMinimize = () => window.electron?.minimize();
  const handleMaximize = () => window.electron?.maximize();
  const handleClose = () => window.electron?.close();

  return (
    <div className="title-bar">
      <div className="title-bar-brand">
        {!logoError ? (
          <img 
            src="./logo.png" 
            alt="Bulky" 
            style={{ height: '22px' }}
            onError={() => setLogoError(true)}
          />
        ) : (
          <>
            <Mail size={20} style={{ color: '#5bb4d4' }} />
            <span>Bulky</span>
          </>
        )}
      </div>
      <div className="title-bar-controls">
        <button className="title-bar-btn" onClick={handleMinimize}>
          <Minus size={16} />
        </button>
        <button className="title-bar-btn" onClick={handleMaximize}>
          <Square size={14} />
        </button>
        <button className="title-bar-btn close" onClick={handleClose}>
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

export default TitleBar;
