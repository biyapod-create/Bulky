import React, { useEffect, useState } from 'react';
import TitleBar from './components/TitleBar';
import Sidebar from './components/Sidebar';
import ErrorBoundary from './components/ErrorBoundary';
import ToastContainer from './components/ToastContainer';
import { ToastProvider } from './components/ToastContext';
import { ThemeProvider } from './components/ThemeContext';
import { NavigationProvider, useNavigation } from './components/NavigationContext';
import GlobalSearch from './components/GlobalSearch';
import KeyboardShortcuts from './components/KeyboardShortcuts';
import SetupWizard from './components/SetupWizard';
import { hasConfiguredSmtpAccounts } from './utils/smtpAccounts';

import Dashboard from './pages/Dashboard';
import Contacts from './pages/Contacts';
import Campaigns from './pages/Campaigns';
import Composer from './pages/Composer';
import Templates from './pages/Templates';
import Verify from './pages/Verify';
import SpamChecker from './pages/SpamChecker';
import Blacklist from './pages/Blacklist';
import Settings from './pages/Settings';
import Analytics from './pages/Analytics';

const pages = [
  { path: '/', Component: Dashboard, name: 'Dashboard' },
  { path: '/campaigns', Component: Campaigns, name: 'Campaigns' },
  { path: '/composer', Component: Composer, name: 'Composer' },
  { path: '/contacts', Component: Contacts, name: 'Contacts' },
  { path: '/verify', Component: Verify, name: 'Verify Contact' },
  { path: '/templates', Component: Templates, name: 'Templates' },
  { path: '/spam-checker', Component: SpamChecker, name: 'Spam Checker' },
  { path: '/blacklist', Component: Blacklist, name: 'Blacklist' },
  { path: '/settings', Component: Settings, name: 'Settings' },
];

function PageHost() {
  const { activePage, notifyActivation, navigateTo } = useNavigation();

  useEffect(() => {
    notifyActivation(activePage);
  }, [activePage, notifyActivation]);

  // Listen for tray → navigate events (e.g. "Settings" from tray context menu)
  useEffect(() => {
    if (!window.electron?.onNavigatePage) return;
    const unsub = window.electron.onNavigatePage((page) => {
      if (page) navigateTo(page);
    });
    return unsub;
  }, [navigateTo]);

  // Analytics is special — it needs a campaignId param
  const isAnalytics = activePage.startsWith('/analytics/');
  const analyticsCampaignId = isAnalytics ? activePage.split('/analytics/')[1] : null;
  const isValidCampaignId = !!(analyticsCampaignId && analyticsCampaignId.length > 0);

  return (
    <>
      {pages.map(({ path, Component, name }) => {
        const isActive = activePage === path;
        return (
          <div
            key={path}
            className={`page-shell ${isActive ? 'active' : ''}`}
            style={{ display: isActive ? 'block' : 'none', height: '100%' }}
          >
            <ErrorBoundary name={name}>
              <Component isActive={isActive} />
            </ErrorBoundary>
          </div>
        );
      })}
      {/* Analytics page — rendered when active, unmounts when leaving (needs campaignId) */}
      <div
        className={`page-shell ${isAnalytics ? 'active' : ''}`}
        style={{ display: isAnalytics ? 'block' : 'none', height: '100%' }}
      >
        {isAnalytics && !isValidCampaignId && (
          <div className="error-message">Invalid campaign ID</div>
        )}
        {isAnalytics && isValidCampaignId && (
          <ErrorBoundary name="Analytics">
            <Analytics campaignId={analyticsCampaignId} isActive={isAnalytics} />
          </ErrorBoundary>
        )}
      </div>
    </>
  );
}

function App() {
  const [showWizard, setShowWizard] = useState(false);

  useEffect(() => {
    // Show setup wizard on first run (no SMTP accounts configured)
    const checkFirstRun = async () => {
      try {
        if (localStorage.getItem('bulky_setup_complete')) return;
        if (window.electron?.smtpAccounts?.getAll) {
          const accounts = await window.electron.smtpAccounts.getAll();
          if (!hasConfiguredSmtpAccounts(accounts)) setShowWizard(true);
        } else if (window.electron?.smtp?.get) {
          const account = await window.electron.smtp.get();
          if (!account?.host) setShowWizard(true);
        }
      } catch {}
    };
    checkFirstRun();
  }, []);

  const handleWizardComplete = () => {
    localStorage.setItem('bulky_setup_complete', '1');
    setShowWizard(false);
  };

  return (
    <ThemeProvider>
      <ToastProvider>
        <NavigationProvider>
          <div className="app-container">
            <TitleBar />
            <div className="main-layout">
              <Sidebar />
              <main className="main-content">
                <div className="main-content-inner">
                  <PageHost />
                </div>
              </main>
            </div>
            <ToastContainer />
            <GlobalSearch />
            <KeyboardShortcuts />
            {showWizard && (
              <SetupWizard
                onComplete={handleWizardComplete}
                onDismiss={() => {
                  localStorage.setItem('bulky_setup_complete', '1');
                  setShowWizard(false);
                }}
              />
            )}
          </div>
        </NavigationProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}

export default App;
