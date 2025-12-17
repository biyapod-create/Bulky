import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Users, 
  Send, 
  FileEdit, 
  FileText, 
  CheckCircle, 
  ShieldAlert, 
  Settings,
  Mail
} from 'lucide-react';

// Menu order: Dashboard, Campaign, Composer, Contact, Template, Verify Emails, Spam Checker, Settings
const navItems = [
  { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/campaigns', icon: Send, label: 'Campaigns' },
  { path: '/composer', icon: FileEdit, label: 'Composer' },
  { path: '/contacts', icon: Users, label: 'Contacts' },
  { path: '/templates', icon: FileText, label: 'Templates' },
  { path: '/verify', icon: CheckCircle, label: 'Verify Emails' },
  { path: '/spam-checker', icon: ShieldAlert, label: 'Spam Checker' },
  { path: '/settings', icon: Settings, label: 'Settings' },
];

function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [logoError, setLogoError] = useState(false);

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
      <nav className="sidebar-nav">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;
          
          return (
            <div
              key={item.path}
              className={`nav-item ${isActive ? 'active' : ''}`}
              onClick={() => navigate(item.path)}
            >
              <Icon size={20} />
              <span>{item.label}</span>
            </div>
          );
        })}
      </nav>
      <div className="sidebar-footer">
        <p>Bulky Email Sender</p>
        <p>by AllenRetro</p>
      </div>
    </aside>
  );
}

export default Sidebar;
