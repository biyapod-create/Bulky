import React, { useCallback, useEffect, useRef, useState } from 'react';
import TitleBar from './components/TitleBar';
import Sidebar from './components/Sidebar';
import ErrorBoundary from './components/ErrorBoundary';
import ToastContainer from './components/ToastContainer';
import { ToastProvider } from './components/ToastContext';
import { ThemeProvider } from './components/ThemeContext';
import { EntitlementProvider, useEntitlement } from './components/EntitlementContext';
import { NavigationProvider, useNavigation } from './components/NavigationContext';
import GlobalSearch from './components/GlobalSearch';
import KeyboardShortcuts from './components/KeyboardShortcuts';
import { useToast } from './components/ToastContext';
import SetupWizard from './components/SetupWizard';
import DesktopAuthShell from './components/DesktopAuthShell';
import { hasConfiguredSmtpAccounts } from './utils/smtpAccounts';
import {
  analyticsPage,
  getAnalyticsCampaignId,
  isAnalyticsRoute,
  pageRegistry
} from './config/navigation';

const DEFAULT_ACCOUNT_STATUS = Object.freeze({
  configured: false,
  authenticated: false,
  status: 'needs_configuration',
  account: {
    email: '',
    fullName: '',
    workspaceName: ''
  },
  plan: {
    id: 'legacy',
    name: 'Local Build',
    description: ''
  }
});

const DEFAULT_STARTUP_STATE = Object.freeze({
  loading: true,
  stage: 'loading',
  accountStatus: DEFAULT_ACCOUNT_STATUS
});

function LoadingShell() {
  return (
    <div className="startup-loading-screen">
      <div className="startup-loading-card">
        <img src="./logo.png" alt="Bulky" className="startup-loading-logo" />
        <div className="startup-loading-copy">
          <h2>Preparing Bulky</h2>
          <p>Restoring the desktop session, local settings, and workspace state.</p>
        </div>
      </div>
    </div>
  );
}

function PageHost() {
  const { activePage, notifyActivation, navigateTo } = useNavigation();
  const { entitlementState, hasCapability } = useEntitlement();
  const AnalyticsPageComponent = analyticsPage.Component;

  const LockedFeaturePanel = ({ title, description }) => (
    <div className="card">
      <h3 className="card-title mb-3">{title}</h3>
      <p className="text-muted text-sm mb-3">{description}</p>
      <div className="text-sm text-muted">
        Current plan: <strong>{entitlementState.plan?.name || 'Unknown'}</strong> | Mode: <strong>{entitlementState.mode === 'hybrid' ? 'Hybrid' : 'Local'}</strong>
      </div>
    </div>
  );

  useEffect(() => {
    notifyActivation(activePage);
  }, [activePage, notifyActivation]);

  // Listen for tray -> navigate events (e.g. "Settings" from tray context menu)
  useEffect(() => {
    if (!window.electron?.onNavigatePage) return;
    const unsub = window.electron.onNavigatePage((page) => {
      if (page) navigateTo(page);
    });
    return unsub;
  }, [navigateTo]);

  // Analytics is special -- it needs a campaignId param
  const isAnalytics = isAnalyticsRoute(activePage);
  const analyticsCampaignId = getAnalyticsCampaignId(activePage);
  const isValidCampaignId = !!(analyticsCampaignId && analyticsCampaignId.length > 0);

  return (
    <>
      {pageRegistry.map(({ path, Component, name, capability }) => {
        const isActive = activePage === path;
        const isAllowed = !capability || hasCapability(capability);
        return (
          <div
            key={path}
            className={`page-shell ${isActive ? 'active' : ''}`}
            style={{ display: isActive ? 'block' : 'none', height: '100%' }}
          >
            <ErrorBoundary name={name}>
              {isAllowed ? (
                <Component isActive={isActive} />
              ) : (
                <LockedFeaturePanel
                  title={`${name} is locked on the current plan`}
                  description="This page is connected to a capability that is not available on the current access tier."
                />
              )}
            </ErrorBoundary>
          </div>
        );
      })}
      {/* Analytics page -- rendered when active, unmounts when leaving (needs campaignId) */}
      <div
        className={`page-shell ${isAnalytics ? 'active' : ''}`}
        style={{ display: isAnalytics ? 'block' : 'none', height: '100%' }}
      >
        {isAnalytics && !hasCapability(analyticsPage.capability) && (
          <LockedFeaturePanel
            title="Analytics is locked on the current plan"
            description="Advanced statistics become available when the current access tier includes analytics."
          />
        )}
        {isAnalytics && hasCapability(analyticsPage.capability) && !isValidCampaignId && (
          <div className="error-message">Invalid campaign ID</div>
        )}
        {isAnalytics && hasCapability(analyticsPage.capability) && isValidCampaignId && (
          <ErrorBoundary name={analyticsPage.name}>
            <AnalyticsPageComponent campaignId={analyticsCampaignId} isActive={isAnalytics} />
          </ErrorBoundary>
        )}
      </div>
    </>
  );
}

function UpdateNotifier() {
  const { addToast } = useToast();
  const notifiedRef = useRef(false);

  useEffect(() => {
    if (!window.electron?.onUpdaterStatus) return;
    const unsub = window.electron.onUpdaterStatus((data) => {
      if (data?.status === 'downloaded' && !notifiedRef.current) {
        notifiedRef.current = true;
        addToast(
          `Update v${data.version} ready — will install on next quit`,
          'success',
          0
        );
      }
    });
    return () => { if (typeof unsub === 'function') unsub(); };
  }, [addToast]);

  return null;
}

function App() {
  const [startupState, setStartupState] = useState(DEFAULT_STARTUP_STATE);

  const checkSetupRequired = useCallback(async () => {
    try {
      if (localStorage.getItem('bulky_setup_complete')) {
        return false;
      }

      if (window.electron?.smtpAccounts?.getAll) {
        const accounts = await window.electron.smtpAccounts.getAll();
        return !hasConfiguredSmtpAccounts(accounts);
      }

      if (window.electron?.smtp?.get) {
        const account = await window.electron.smtp.get();
        return !account?.host;
      }
    } catch {
      return false;
    }

    return false;
  }, []);

  const resolveStartupStage = useCallback(async (accountStatusOverride = null) => {
    let accountStatus = accountStatusOverride;

    try {
      if (!accountStatus && window.electron?.account?.getStatus) {
        const result = await window.electron.account.getStatus();
        if (result && !result.error) {
          accountStatus = result;
        }
      }
    } catch {
      // ignored
    }

    const normalizedStatus = accountStatus || DEFAULT_ACCOUNT_STATUS;
    const needsSetup = await checkSetupRequired();

    setStartupState({
      loading: false,
      stage: normalizedStatus.authenticated
        ? (needsSetup ? 'wizard' : 'app')
        : 'auth',
      accountStatus: normalizedStatus
    });
  }, [checkSetupRequired]);

  useEffect(() => {
    resolveStartupStage();
  }, [resolveStartupStage]);

  useEffect(() => {
    const handleAccountStatusChanged = async (event) => {
      await resolveStartupStage(event.detail || null);
    };

    window.addEventListener('bulky:account-status-changed', handleAccountStatusChanged);
    return () => window.removeEventListener('bulky:account-status-changed', handleAccountStatusChanged);
  }, [resolveStartupStage]);

  const handleWizardComplete = () => {
    localStorage.setItem('bulky_setup_complete', '1');
    setStartupState((prev) => ({
      ...prev,
      stage: 'app'
    }));
  };

  const handleWizardDismiss = () => {
    localStorage.setItem('bulky_setup_complete', '1');
    setStartupState((prev) => ({
      ...prev,
      stage: 'app'
    }));
  };

  const handleAuthResolved = (status) => {
    resolveStartupStage(status);
  };

  const handleContinueLocal = async () => {
    const needsSetup = await checkSetupRequired();
    setStartupState((prev) => ({
      ...prev,
      loading: false,
      stage: needsSetup ? 'wizard' : 'app'
    }));
  };

  return (
    <ThemeProvider>
      <ToastProvider>
        <EntitlementProvider>
          <NavigationProvider>
            {startupState.loading ? (
              <LoadingShell />
            ) : startupState.stage === 'auth' ? (
              <DesktopAuthShell
                accountStatus={startupState.accountStatus}
                onAuthenticated={handleAuthResolved}
                onContinueLocal={handleContinueLocal}
              />
            ) : (
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
                <UpdateNotifier />
                <GlobalSearch />
                <KeyboardShortcuts />
                {startupState.stage === 'wizard' && (
                  <SetupWizard
                    onComplete={handleWizardComplete}
                    onDismiss={handleWizardDismiss}
                  />
                )}
              </div>
            )}
          </NavigationProvider>
        </EntitlementProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}

export default App;
