import React from 'react';
import { RefreshCw } from 'lucide-react';
import { TAB_GROUPS } from './settingsConfig';

export default function SettingsSidebar({ activeTab, onTabChange, onRefresh, hasCapability }) {
  const visibleGroups = TAB_GROUPS
    .map((group) => ({
      ...group,
      tabs: group.tabs.filter((tab) => !tab.capability || hasCapability(tab.capability))
    }))
    .filter((group) => group.tabs.length > 0);

  return (
    <aside className="settings-sidebar">
      <div className="settings-sidebar__top">
        <h2 className="settings-sidebar__title">Settings</h2>
        <button className="btn btn-outline btn-sm" onClick={onRefresh} style={{ padding: '5px 10px' }}>
          <RefreshCw size={13} />
        </button>
      </div>
      {visibleGroups.map((group) => (
        <div key={group.label} className="settings-group">
          <div className="settings-group__label">{group.label}</div>
          {group.tabs.map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              className={`settings-tab-btn ${activeTab === id ? 'active' : ''}`}
              onClick={() => onTabChange(id)}
            >
              <Icon size={16} />
              <span>{label}</span>
            </button>
          ))}
        </div>
      ))}
    </aside>
  );
}
