import React, { useMemo, useState } from 'react';
import { Minus, Square, X, Mail } from 'lucide-react';
import NotificationCenter from './NotificationCenter';
import { useNavigation } from './NavigationContext';

const pageTitles = {
  '/': 'Dashboard',
  '/contacts': 'Contacts',
  '/campaigns': 'Campaigns',
  '/composer': 'Composer',
  '/templates': 'Templates',
  '/verify': 'Verify Emails',
  '/spam-checker': 'Spam Checker',
  '/blacklist': 'Blacklist',
  '/settings': 'Settings'
};

function TitleBar() {
  const [logoError, setLogoError] = useState(false);
  const { activePage } = useNavigation();

  const pageLabel = useMemo(() => {
    if (String(activePage || '').startsWith('/analytics/')) return 'Analytics';
    return pageTitles[activePage] || 'Workspace';
  }, [activePage]);

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
        <span className="title-bar-pill" title="Bulky stays active in the Windows tray when you close the window.">
          Live sync | tray ready
        </span>
        <span className="title-bar-context">
          {pageLabel}
        </span>
      </div>
      <div className="title-bar-controls">
        <NotificationCenter />
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
