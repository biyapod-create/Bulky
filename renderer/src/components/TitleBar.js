import React, { useEffect, useState } from 'react';
import { Minus, Square, X, EyeOff, Search, Command, CalendarDays } from 'lucide-react';
import NotificationCenter from './NotificationCenter';

function TitleBar() {
  const [smtpStatus, setSmtpStatus] = useState({ count: 0, active: 0, status: 'unknown' });
  const [today, setToday] = useState(() => new Date());
  const handleOpenSearch = () => window.dispatchEvent(new Event('bulky:open-search'));
  const handleMinimize = () => window.electron?.minimize();
  const handleMaximize = () => window.electron?.maximize();
  const handleClose = () => window.electron?.close();
  const handleHideToTray = () => window.electron?.hide?.();

  useEffect(() => {
    const checkSmtp = async () => {
      try {
        if (window.electron?.smtpAccounts?.getAll) {
          const accounts = await window.electron.smtpAccounts.getAll();
          const list = Array.isArray(accounts) ? accounts : [];
          const activeCount = list.filter((account) => account.isActive).length;
          setSmtpStatus({
            count: list.length,
            active: activeCount,
            status: list.length === 0 ? 'none' : activeCount > 0 ? 'connected' : 'inactive'
          });
        }
      } catch {
        setSmtpStatus((prev) => ({ ...prev, status: 'error' }));
      }
    };

    checkSmtp();
    const interval = setInterval(checkSmtp, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setToday(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  const smtpDotColor = smtpStatus.status === 'connected'
    ? 'var(--success)'
    : smtpStatus.status === 'inactive'
      ? 'var(--warning)'
      : smtpStatus.status === 'none'
        ? 'var(--text-muted)'
        : 'var(--error)';

  const smtpLabel = smtpStatus.status === 'connected'
    ? `${smtpStatus.active} SMTP active`
    : smtpStatus.status === 'inactive'
      ? 'SMTP inactive'
      : smtpStatus.status === 'none'
        ? 'No SMTP configured'
        : 'SMTP error';

  return (
    <div className="title-bar">
      <div className="title-bar-left">
        <div className="title-bar-status-pill">
          <span className="title-bar-status-dot" style={{ background: smtpDotColor }} />
          <span>{smtpLabel}</span>
        </div>

        <button type="button" className="title-bar-search" onClick={handleOpenSearch}>
          <Search size={15} />
          <span className="title-bar-search-copy">Search campaigns, contacts, templates...</span>
          <span className="title-bar-search-shortcut">
            <Command size={11} />
            K
          </span>
        </button>
      </div>

      <div className="title-bar-controls">
        <div className="title-bar-date-pill">
          <CalendarDays size={14} />
          <span>
            {today.toLocaleDateString(undefined, {
              weekday: 'short',
              day: '2-digit',
              month: 'short',
              year: 'numeric'
            })}
          </span>
        </div>

        <NotificationCenter />

        <button
          className="title-bar-btn title-bar-tray-btn"
          onClick={handleHideToTray}
          title="Hide to system tray"
        >
          <EyeOff size={13} />
          <span>Hide to Tray</span>
        </button>

        <button className="title-bar-btn" onClick={handleMinimize} title="Minimize"><Minus size={16} /></button>
        <button className="title-bar-btn" onClick={handleMaximize} title="Maximize"><Square size={14} /></button>
        <button className="title-bar-btn close" onClick={handleClose} title="Close"><X size={16} /></button>
      </div>
    </div>
  );
}

export default TitleBar;
