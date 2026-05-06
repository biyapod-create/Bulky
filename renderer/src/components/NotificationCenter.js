import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Bell, X, Send, CheckCircle, AlertTriangle, UserPlus, XCircle, Mail } from 'lucide-react'; // eslint-disable-line no-unused-vars

function NotificationCenter() {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const panelRef = useRef(null);

  // Load notifications from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('bulky_notifications');
      if (saved) {
        const parsed = JSON.parse(saved);
        setNotifications(Array.isArray(parsed) ? parsed.slice(0, 50) : []);
        setUnreadCount(parsed.filter(n => !n.read).length);
      }
    } catch (e) { console.warn('Notifications error:', e?.message); }
  }, []);

  // Listen for app events via global notify function
  // Other components call window.__bulkyNotify({ type, title, message }) to push notifications

  // Close on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  const addNotification = useCallback((notification) => {
    const newNotif = {
      id: Date.now() + Math.random(),
      ...notification,
      timestamp: new Date().toISOString(),
      read: false
    };
    setNotifications(prev => {
      const updated = [newNotif, ...prev].slice(0, 50);
      localStorage.setItem('bulky_notifications', JSON.stringify(updated));
      return updated;
    });
    setUnreadCount(prev => prev + 1);
  }, []);

  // Expose addNotification globally so other components can push notifications
  useEffect(() => {
    window.__bulkyNotify = addNotification;
    return () => { delete window.__bulkyNotify; };
  }, [addNotification]);

  const markAllRead = () => {
    setNotifications(prev => {
      const updated = prev.map(n => ({ ...n, read: true }));
      localStorage.setItem('bulky_notifications', JSON.stringify(updated));
      return updated;
    });
    setUnreadCount(0);
  };

  const clearAll = () => {
    setNotifications([]);
    setUnreadCount(0);
    localStorage.removeItem('bulky_notifications');
  };

  const removeNotification = (id) => {
    setNotifications(prev => {
      const updated = prev.filter(n => n.id !== id);
      localStorage.setItem('bulky_notifications', JSON.stringify(updated));
      return updated;
    });
  };

  const getIcon = (type) => {
    switch (type) {
      case 'campaign_complete': return <Send size={14} style={{ color: 'var(--success)' }} />;
      case 'verification_complete': return <CheckCircle size={14} style={{ color: 'var(--info)' }} />;
      case 'import_complete': return <UserPlus size={14} style={{ color: 'var(--accent)' }} />;
      case 'error': return <XCircle size={14} style={{ color: 'var(--error)' }} />;
      case 'warning': return <AlertTriangle size={14} style={{ color: 'var(--warning)' }} />;
      default: return <Mail size={14} style={{ color: 'var(--text-muted)' }} />;
    }
  };

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return date.toLocaleDateString();
  };

  return (
    <div ref={panelRef} className="notification-center">
      <button
        onClick={() => { setIsOpen(!isOpen); if (!isOpen) markAllRead(); }}
        className="notification-center-trigger"
        title="Notifications"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="notification-center-badge">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="notification-center-panel notification-center-panel--fixed">
          <div className="notification-center-header">
            <span className="notification-center-title">Notifications</span>
            <div style={{ display: 'flex', gap: '8px' }}>
              {notifications.length > 0 && (
                <button onClick={clearAll} className="notification-center-clear">
                  Clear all
                </button>
              )}
            </div>
          </div>

          <div className="notification-center-list">
            {notifications.length === 0 ? (
              <div className="notification-center-empty">
                <Bell size={32} style={{ opacity: 0.3, marginBottom: '8px' }} />
                <p style={{ fontSize: '13px' }}>No notifications yet</p>
              </div>
            ) : (
              notifications.map(n => (
                <div key={n.id} className={`notification-center-item ${n.read ? '' : 'unread'}`}>
                  <div className="notification-center-item-icon">{getIcon(n.type)}</div>
                  <div className="notification-center-item-copy">
                    <div className="notification-center-item-title">{n.title}</div>
                    <div className="notification-center-item-message">{n.message}</div>
                    <div className="notification-center-item-time">{formatTime(n.timestamp)}</div>
                  </div>
                  <button onClick={() => removeNotification(n.id)} className="notification-center-dismiss">
                    <X size={12} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default NotificationCenter;
