import React, { useState, useEffect } from 'react';
import { useNavigation } from './NavigationContext';
import {
  LayoutDashboard,
  Users,
  Send,
  FileEdit,
  FileText,
  CheckCircle,
  ShieldAlert,
  Ban,
  Settings,
  Mail
} from 'lucide-react';

const navItems = [
  { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/campaigns', icon: Send, label: 'Campaigns' },
  { path: '/composer', icon: FileEdit, label: 'Composer' },
  { path: '/contacts', icon: Users, label: 'Contacts' },
  { path: '/verify', icon: CheckCircle, label: 'Verify Contact' },
  { path: '/templates', icon: FileText, label: 'Templates' },
  { path: '/spam-checker', icon: ShieldAlert, label: 'Spam Checker' },
  { path: '/blacklist', icon: Ban, label: 'Blacklist' },
  { path: '/settings', icon: Settings, label: 'Settings' },
];

const pageTitles = Object.fromEntries(navItems.map((item) => [item.path, item.label]));

function Sidebar() {
  const { activePage, navigateTo } = useNavigation();
  const [logoError, setLogoError] = useState(false);
  const [smtpStatus, setSmtpStatus] = useState({ count: 0, active: 0, status: 'unknown' });
  const currentPageLabel = String(activePage || '').startsWith('/analytics/')
    ? 'Analytics'
    : pageTitles[activePage] || 'Workspace';

  useEffect(() => {
    const checkSmtp = async () => {
      try {
        // Use smtpAccounts.getAll (multi-account API); fall back to legacy smtp.get
        if (window.electron?.smtpAccounts?.getAll) {
          const accounts = await window.electron.smtpAccounts.getAll();
          const list = Array.isArray(accounts) ? accounts : [];
          const activeCount = list.filter(a => a.isActive).length;
          setSmtpStatus({
            count: list.length,
            active: activeCount,
            status: list.length === 0 ? 'none' : activeCount > 0 ? 'connected' : 'inactive'
          });
        } else if (window.electron?.smtp?.get) {
          const account = await window.electron.smtp.get();
          setSmtpStatus({
            count: account?.host ? 1 : 0,
            active: account?.host ? 1 : 0,
            status: account?.host ? 'connected' : 'none'
          });
        }
      } catch (e) {
        setSmtpStatus(prev => ({ ...prev, status: 'error' }));
      }
    };
    checkSmtp();
    const interval = setInterval(checkSmtp, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!window.electron?.onDataChanged) return;

    const unsub = window.electron.onDataChanged((data) => {
      if (data.type === 'settings') {
        (async () => {
          try {
            if (window.electron?.smtpAccounts?.getAll) {
              const accounts = await window.electron.smtpAccounts.getAll();
              const list = Array.isArray(accounts) ? accounts : [];
              const activeCount = list.filter(a => a.isActive).length;
              setSmtpStatus({
                count: list.length,
                active: activeCount,
                status: list.length === 0 ? 'none' : activeCount > 0 ? 'connected' : 'inactive'
              });
            }
          } catch (e) {
            setSmtpStatus(prev => ({ ...prev, status: 'error' }));
          }
        })();
      }
    });

    return unsub;
  }, []);

  return (
    <aside className="sidebar">
      <div className="sidebar-logo" style={{ justifyContent: 'flex-start', paddingLeft: '20px' }}>
        {!logoError ? (
          <img
            src="./logo.png"
            alt="Bulky"
            style={{ height: '40px', width: 'auto', objectFit: 'contain' }}
            onError={() => setLogoError(true)}
          />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Mail size={28} style={{ color: 'var(--accent)' }} />
            <span style={{ fontSize: '18px', fontWeight: 'bold', color: 'var(--accent)' }}>Bulky</span>
          </div>
        )}
      </div>
      <div className="sidebar-section-label">Workspace</div>
      <nav className="sidebar-nav">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activePage === item.path;

          return (
            <div
              key={item.path}
              className={`nav-item ${isActive ? 'active' : ''}`}
              onClick={() => navigateTo(item.path)}
            >
              <Icon size={20} />
              <span>{item.label}</span>
            </div>
          );
        })}
      </nav>
      <div className="sidebar-footer">
        <div className="sidebar-status-card">
          <div className="sidebar-status-label">Current View</div>
          <div className="sidebar-status-value">{currentPageLabel}</div>
          <div className="sidebar-status-meta">
            Realtime updates and tray-safe background behavior stay active while you move through the app.
          </div>
        </div>
        <button
          type="button"
          className="sidebar-tray-btn"
          onClick={() => window.electron?.hide?.()}
        >
          Hide To Tray
        </button>
        <div className="sidebar-health-row" onClick={() => navigateTo('/settings')}>
          <div style={{
            width: '8px', height: '8px', borderRadius: '50%',
            background: smtpStatus.status === 'connected' ? 'var(--success)' : smtpStatus.status === 'inactive' ? 'var(--warning)' : smtpStatus.status === 'none' ? 'var(--text-muted)' : 'var(--error)',
            boxShadow: smtpStatus.status === 'connected' ? '0 0 6px var(--success)' : 'none'
          }} />
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            {smtpStatus.status === 'connected' ? `${smtpStatus.active} SMTP active` : smtpStatus.status === 'inactive' ? 'SMTP inactive' : smtpStatus.status === 'none' ? 'No SMTP configured' : 'SMTP error'}
          </span>
        </div>
        <p style={{ marginBottom: '6px' }}>Close keeps Bulky running in the tray</p>
        <p>Bulky Email Sender</p>
        <p>by AllenRetro</p>
      </div>
    </aside>
  );
}

export default Sidebar;
