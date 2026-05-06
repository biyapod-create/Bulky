import React from 'react';
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
  const [logoError, setLogoError] = React.useState(false);
  const BrandFallbackIcon = sidebarBrandFallbackIcon;
  const visibleNavGroups = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.capability || hasCapability(item.capability))
    }))
    .filter((group) => group.items.length > 0);
  const settingsNavItem = navItems.find((item) => item.path === SETTINGS_PATH);
  const SettingsIcon = settingsNavItem?.icon;
  const settingsLabel = pageLabelMap[SETTINGS_PATH] || 'Settings';

  return (
    <aside className="sidebar">
      {/* Logo mark only — no text */}
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
            <BrandFallbackIcon size={24} style={{ color: 'var(--accent)' }} />
          )}
        </div>
      </div>

      {/* Icon-only navigation */}
      <nav className="sidebar-nav">
        {visibleNavGroups.map((group) => (
          <div key={group.label} className="sidebar-group">
            {group.items.map(({ path, icon: Icon, label }) => (
              <div
                key={path}
                className={`nav-item ${activePage === path ? 'active' : ''}`}
                onClick={() => navigateTo(path)}
                title={label}
              >
                <Icon size={18} />
              </div>
            ))}
          </div>
        ))}
        <div className="sidebar-settings-group">
          <div
            className={`nav-item ${activePage === SETTINGS_PATH ? 'active' : ''}`}
            onClick={() => navigateTo(SETTINGS_PATH)}
            title={settingsLabel}
          >
            {SettingsIcon ? <SettingsIcon size={18} /> : null}
          </div>
        </div>
      </nav>

      {/* AI Assistant widget — compact */}
      {hasCapability('aiAssistant') && (
        <div className="sidebar-footer compact">
          <SidebarAssistant />
        </div>
      )}
    </aside>
  );
}

export default Sidebar;
