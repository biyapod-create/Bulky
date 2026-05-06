import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const DEFAULT_ENTITLEMENT_STATE = Object.freeze({
  plan: {
    id: 'legacy',
    name: 'Local Build',
    description: 'Current local Bulky build with the existing desktop feature set before account-based unlocks are connected.'
  },
  mode: 'local',
  status: 'active',
  source: 'local-legacy',
  limits: {
    maxSmtpAccounts: null,
    maxEmailsPerCycle: null
  },
  capabilities: {
    analytics: true,
    aiAssistant: true,
    desktopLogin: true,
    hostedTracking: false,
    hostedForms: false,
    realtimeSync: false,
    automaticUpdates: false,
    cloudAiUsage: false
  },
  usage: {
    emailsSentLifetime: 0,
    emailsSentInCycle: null,
    emailsRemainingInCycle: null,
    smtpAccountsConfigured: 0,
    activeSmtpAccounts: 0,
    contacts: 0
  },
  cycle: {
    startsAt: null,
    endsAt: null
  }
});

const WATCHED_DATA_TYPES = new Set(['settings', 'campaigns', 'contacts']);
const EntitlementContext = createContext(null);

export function EntitlementProvider({ children }) {
  const [entitlementState, setEntitlementState] = useState(DEFAULT_ENTITLEMENT_STATE);

  const reloadEntitlement = useCallback(async () => {
    try {
      if (!window.electron?.entitlement?.getState) {
        setEntitlementState(DEFAULT_ENTITLEMENT_STATE);
        return;
      }

      const nextState = await window.electron.entitlement.getState();
      if (nextState && !nextState.error) {
        setEntitlementState(nextState);
      }
    } catch {
      setEntitlementState(DEFAULT_ENTITLEMENT_STATE);
    }
  }, []);

  useEffect(() => {
    reloadEntitlement();
  }, [reloadEntitlement]);

  useEffect(() => {
    if (!window.electron?.onDataChanged) {
      return undefined;
    }

    const unsub = window.electron.onDataChanged((data) => {
      if (WATCHED_DATA_TYPES.has(data?.type)) {
        reloadEntitlement();
      }
    });
    return unsub;
  }, [reloadEntitlement]);

  const value = useMemo(() => ({
    entitlementState,
    reloadEntitlement,
    hasCapability: (capability) => !!entitlementState.capabilities?.[capability],
    getLimit: (limitKey) => {
      const value = entitlementState.limits?.[limitKey];
      return Number.isFinite(value) ? value : null;
    }
  }), [entitlementState, reloadEntitlement]);

  return (
    <EntitlementContext.Provider value={value}>
      {children}
    </EntitlementContext.Provider>
  );
}

export function useEntitlement() {
  const context = useContext(EntitlementContext);
  if (!context) {
    throw new Error('useEntitlement must be used within an EntitlementProvider');
  }
  return context;
}
