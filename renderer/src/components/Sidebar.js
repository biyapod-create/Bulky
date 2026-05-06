import React, { useState, useEffect } from 'react';
import { useNavigation } from './NavigationContext';
import { useEntitlement } from './EntitlementContext';
import SidebarAssistant from './SidebarAssistant';
import {
  navGroups,
  navItems,
  SETTINGS_PATH,
  pageLabelMap,
  sidebarBrandFallbackIcon
} from '../config/navigation';

function Sidebar() {
  const { activePage, navigateTo } = useNavigation();
  const { hasCapability } = useEntitlement();
  const [logoError,   setLogoError]   = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(
    () => window.matchMedia('(max-width: 900px)').matches
  );
  const BrandFallbackIcon = sidebarBrandFallbackIcon;
  const visibleNavItems = navItems.filter((item) => !item.capability || hasCapability(item.capability));
  const visibleNavGroups = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.capability || hasCapability(item.capability))
    }))
    .filter((group) => group.items.length > 0);
  const settingsNavItem = visibleNavItems.find((item) => item.path === SETTINGS_PATH);
  const SettingsIcon = settingsNavItem?.icon;
  const settingsLabel = pageLabelMap[SETTINGS_PATH] || 'Settings';

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 900px)');
    const handler = (e) => setIsCollapsed(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return (
    <aside className="sidebar">
      {/* ── Logo — no version number ── */}
      <div className="sidebar-brand">
        <div className="sidebar-logo-wrap">
          {!logoError ? (
            <img
              src="./logo.png"
              alt="Bulky"
              className="sidebar-logo-img"
              onError={() => setLogoError(true)}
            />
          ) : (
            <div className="sidebar-logo-fallback">
              <BrandFallbackIcon size={isCollapsed ? 22 : 28} style={{ color: 'var(--accent)', flexShrink: 0 }} />
              {!isCollapsed && <span className="sidebar-logo-text">Bulky</span>}
            </div>
          )}
        </div>
      </div>

      {/* ── Navigation ── */}
      <nav className="sidebar-nav">
        {isCollapsed ? (
          visibleNavItems.map(({ path, icon: Icon, label }) => (
            <div
              key={path}
              className={`nav-item ${activePage === path ? 'active' : ''}`}
              onClick={() => navigateTo(path)}
              title={label}
            >
              <Icon size={20} />
            </div>
          ))
        ) : (
          <>
            {visibleNavGroups.map((group) => (
              <div key={group.label} className="sidebar-group">
                <div className="sidebar-section-label">{group.label}</div>
                {group.items.map(({ path, icon: Icon, label }) => (
                  <div
                    key={path}
                    className={`nav-item ${activePage === path ? 'active' : ''}`}
                    onClick={() => navigateTo(path)}
                  >
                    <Icon size={17} />
                    <span>{label}</span>
                  </div>
                ))}
              </div>
            ))}
            <div className="sidebar-settings-group">
              <div
                className={`nav-item ${activePage === SETTINGS_PATH ? 'active' : ''}`}
                onClick={() => navigateTo(SETTINGS_PATH)}
              >
                {SettingsIcon ? <SettingsIcon size={17} /> : null}
                <span>{settingsLabel}</span>
              </div>
            </div>
          </>
        )}
      </nav>

      {/* ── AI Assistant ── */}
      {!isCollapsed && hasCapability('aiAssistant') && (
        <div className="sidebar-footer compact">
          <SidebarAssistant />
        </div>
      )}
    </aside>
  );
}

export default Sidebar;
