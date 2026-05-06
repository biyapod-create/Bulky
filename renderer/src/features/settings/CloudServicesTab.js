import React from 'react';
import {
  Cloud,
  CreditCard,
  LogIn,
  LogOut,
  RefreshCw,
  Save,
  ShieldCheck,
  UserCircle2,
  UserPlus,
  Zap
} from 'lucide-react';
import { accountPlanOptions } from '../../config/accountPlans';

function StatusBadge({ active, label }) {
  return (
    <span className={`badge ${active ? 'badge-success' : 'badge-default'}`} style={{ fontSize: '10px' }}>
      {label}
    </span>
  );
}

function HealthBadge({ result, okLabel = 'Healthy', badLabel = 'Attention Needed' }) {
  return <StatusBadge active={!!result?.ok} label={result?.ok ? okLabel : badLabel} />;
}

function getSyncCopy(syncStatus = {}) {
  if (syncStatus.connected) {
    return 'Realtime sync is connected for this account.';
  }

  switch (syncStatus.reason) {
    case 'plan_locked':
      return 'Realtime sync is available on plans with connected features enabled.';
    case 'signed_out':
      return 'Sign in to connect account-linked sync.';
    case 'cloud_not_configured':
      return 'Connected account services are not configured in this build yet.';
    case 'session_unavailable':
      return 'Account session is missing, so sync cannot start yet.';
    case 'timeout':
      return 'The sync channel timed out during startup.';
    default:
      return syncStatus.lastError || 'Realtime sync is idle.';
  }
}

export default function CloudServicesTab({
  cloudConfig,
  setCloudConfig,
  cloudStatus,
  accountStatus,
  desktopAccountForm,
  setDesktopAccountForm,
  desktopSignUpForm,
  setDesktopSignUpForm,
  savingCloudConfig,
  loadingCloudConfig,
  loadingAccountStatus,
  submittingAccount,
  syncStatus,
  loadingSyncStatus,
  cloudDiagnostics,
  testingCloudConnections,
  handleSaveCloudConfig,
  handleRefreshCloudConfig,
  handleAccountSignUp,
  handleAccountSignIn,
  handleAccountSignOut,
  handleAccountRefresh,
  handleRunCloudDiagnostics,
  handleSyncNow,
  handleOpenCheckout
}) {
  const updateField = (key, value) => setCloudConfig((prev) => ({ ...prev, [key]: value }));
  const authenticated = !!accountStatus?.authenticated;
  const pendingConfirmation = accountStatus?.status === 'pending_confirmation';
  const currentPlanId = accountStatus?.plan?.id || '';
  const showInfrastructureConfig = process.env.NODE_ENV !== 'production';
  const accountConfigured = !!accountStatus?.configured;
  const canOpenProCheckout = currentPlanId !== 'pro';
  const canOpenOneOffCheckout = currentPlanId !== 'one_off';

  return (
    <div className="section-stack">
      <div className="panel-grid">
        <div className="insight-card">
          <div className="insight-value">{cloudStatus?.hybridReady ? 'Ready' : 'Partial'}</div>
          <div className="insight-label">Connected Features</div>
          <div className="insight-meta">
            {cloudStatus?.hybridReady
              ? 'Tracking, updates, account access, billing, and sync surfaces are configured.'
              : 'One or more connected feature surfaces still need setup before hybrid features can go live.'}
          </div>
        </div>
        <div className="insight-card">
          <div className="insight-value">{cloudStatus?.cloudflare?.trackingConfigured ? 'Ready' : 'Pending'}</div>
          <div className="insight-label">Live Tracking</div>
          <div className="insight-meta">
            {cloudStatus?.trackingBaseUrl
              ? 'Public tracking and unsubscribe links can be routed through the connected edge layer.'
              : 'Public tracking is not configured yet, so Bulky remains local-only for tracking.'}
          </div>
        </div>
        <div className="insight-card">
          <div className="insight-value">{cloudStatus?.paystack?.configured ? 'Ready' : 'Pending'}</div>
          <div className="insight-label">Billing</div>
          <div className="insight-meta">
            {cloudStatus?.paystack?.checkoutBaseUrl
              ? 'Hosted checkout can be launched from the app for plan upgrades or purchases.'
              : 'Hosted checkout has not been configured yet.'}
          </div>
        </div>
        <div className="insight-card">
          <div className="insight-value">
            {authenticated ? 'Connected' : pendingConfirmation ? 'Confirm Email' : accountConfigured ? 'Ready to Sign In' : 'Pending'}
          </div>
          <div className="insight-label">Desktop Account</div>
          <div className="insight-meta">
            {authenticated
              ? (accountStatus?.account?.email || 'Desktop profile connected')
              : pendingConfirmation
                ? `Confirmation is still pending for ${accountStatus?.account?.email || 'this account'}.`
                : accountConfigured
                  ? 'Email/password login is ready for this Bulky install.'
                  : 'Connected account access is not configured in this build yet.'}
          </div>
        </div>
        <div className="insight-card">
          <div className="insight-value">{syncStatus?.connected ? 'Connected' : syncStatus?.enabled ? 'Waiting' : 'Local Only'}</div>
          <div className="insight-label">Realtime Sync</div>
          <div className="insight-meta">{getSyncCopy(syncStatus)}</div>
        </div>
      </div>

      <div className="card">
        <div className="flex justify-between items-start gap-3 mb-4">
          <div>
            <h3 className="card-title mb-2"><UserCircle2 size={18} style={{ marginRight: '8px' }} /> Account & Access</h3>
            <p className="text-muted text-sm">
              Users only manage their Bulky account, plan, session, and connected feature access here. The backend services stay behind the scenes.
            </p>
          </div>
          <div className="flex gap-2">
            <button className="btn btn-outline btn-sm" onClick={handleAccountRefresh} disabled={loadingAccountStatus || submittingAccount}>
              <RefreshCw size={14} /> Refresh Session
            </button>
            <button className="btn btn-outline btn-sm" onClick={handleSyncNow} disabled={loadingSyncStatus || !authenticated}>
              <Zap size={14} /> Sync Now
            </button>
          </div>
        </div>

        {authenticated ? (
          <div className="section-stack">
            <div className="panel-grid">
              <div className="insight-card">
                <div className="insight-value">{accountStatus?.plan?.name || 'Unknown'}</div>
                <div className="insight-label">Active Plan</div>
                <div className="insight-meta">
                  {accountStatus?.plan?.description || 'Plan details are not available yet.'}
                </div>
              </div>
              <div className="insight-card">
                <div className="insight-value">{accountStatus?.mode === 'hybrid' ? 'Hybrid' : 'Local'}</div>
                <div className="insight-label">Operating Mode</div>
                <div className="insight-meta">
                  {accountStatus?.entitlementStatus === 'active'
                    ? 'Entitlements are active for this Bulky profile.'
                    : `Entitlement state: ${accountStatus?.entitlementStatus || 'unknown'}`}
                </div>
              </div>
              <div className="insight-card">
                <div className="insight-value">{accountStatus?.subscription?.status || 'Not Linked'}</div>
                <div className="insight-label">Billing Status</div>
                <div className="insight-meta">
                  {accountStatus?.subscription?.currentPeriodEnd
                    ? `Current service window ends ${accountStatus.subscription.currentPeriodEnd}.`
                    : 'No billing renewal window has been synced into this install yet.'}
                </div>
              </div>
              <div className="insight-card">
                <div className="insight-value">{accountStatus?.devices?.total || 0}</div>
                <div className="insight-label">Linked Devices</div>
                <div className="insight-meta">
                  {syncStatus?.connected
                    ? 'Account-linked sync is active on this desktop.'
                    : 'This install is currently running without a connected sync session.'}
                </div>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Email</label>
                <input type="text" className="form-input" value={accountStatus?.account?.email || ''} readOnly />
              </div>
              <div className="form-group">
                <label className="form-label">Full Name</label>
                <input type="text" className="form-input" value={accountStatus?.account?.fullName || ''} readOnly />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Workspace</label>
                <input type="text" className="form-input" value={accountStatus?.account?.workspaceName || ''} readOnly />
              </div>
              <div className="form-group">
                <label className="form-label">Access Providers</label>
                <input
                  type="text"
                  className="form-input"
                  value={(accountStatus?.account?.providers || []).join(', ') || 'email'}
                  readOnly
                />
              </div>
            </div>

            <div className="text-sm text-muted">
              Last validated: {accountStatus?.lastValidatedAt || 'Not yet'} | Access token expires: {accountStatus?.accessTokenExpiresAt || 'Unknown'}
            </div>

            <div className="flex gap-3 mt-2" style={{ flexWrap: 'wrap' }}>
              {canOpenProCheckout ? (
                <button className="btn btn-primary" onClick={() => handleOpenCheckout('pro')}>
                  <CreditCard size={16} /> Start Pro
                </button>
              ) : null}
              {canOpenOneOffCheckout ? (
                <button className="btn btn-outline" onClick={() => handleOpenCheckout('one_off')}>
                  <ShieldCheck size={16} /> Buy One-off
                </button>
              ) : null}
              <button className="btn btn-danger" onClick={handleAccountSignOut} disabled={submittingAccount}>
                <LogOut size={16} /> {submittingAccount ? 'Signing Out...' : 'Sign Out'}
              </button>
            </div>
          </div>
        ) : (
          <div className="section-stack">
            <div className="panel-grid">
              <div className="insight-card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <div className="insight-label" style={{ marginBottom: '8px' }}><UserPlus size={14} style={{ marginRight: '6px' }} /> Create Desktop Account</div>
                  <div className="insight-meta">
                    Start with email/password now. Social sign-in can be enabled later without changing the Bulky desktop workflow.
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Full Name</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Your full name"
                    value={desktopSignUpForm.fullName}
                    onChange={(e) => setDesktopSignUpForm((prev) => ({ ...prev, fullName: e.target.value }))}
                    disabled={!accountConfigured || submittingAccount}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Workspace Name</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Bulky Workspace"
                    value={desktopSignUpForm.workspaceName}
                    onChange={(e) => setDesktopSignUpForm((prev) => ({ ...prev, workspaceName: e.target.value }))}
                    disabled={!accountConfigured || submittingAccount}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Email Address</label>
                  <input
                    type="email"
                    className="form-input"
                    placeholder="you@example.com"
                    value={desktopSignUpForm.email}
                    onChange={(e) => setDesktopSignUpForm((prev) => ({ ...prev, email: e.target.value }))}
                    disabled={!accountConfigured || submittingAccount}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Password</label>
                  <input
                    type="password"
                    className="form-input"
                    placeholder="Create a password"
                    value={desktopSignUpForm.password}
                    onChange={(e) => setDesktopSignUpForm((prev) => ({ ...prev, password: e.target.value }))}
                    disabled={!accountConfigured || submittingAccount}
                  />
                </div>

                <button
                  className="btn btn-primary"
                  onClick={handleAccountSignUp}
                  disabled={!accountConfigured || submittingAccount}
                >
                  <UserPlus size={16} /> {submittingAccount ? 'Creating Account...' : 'Create Account'}
                </button>
              </div>

              <div className="insight-card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <div className="insight-label" style={{ marginBottom: '8px' }}><LogIn size={14} style={{ marginRight: '6px' }} /> Sign In</div>
                  <div className="insight-meta">
                    Use an existing Bulky desktop account to load your plan, profile, and connected feature access into this install.
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Email Address</label>
                  <input
                    type="email"
                    className="form-input"
                    placeholder="you@example.com"
                    value={desktopAccountForm.email}
                    onChange={(e) => setDesktopAccountForm((prev) => ({ ...prev, email: e.target.value }))}
                    disabled={!accountConfigured || submittingAccount}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Password</label>
                  <input
                    type="password"
                    className="form-input"
                    placeholder="Enter your password"
                    value={desktopAccountForm.password}
                    onChange={(e) => setDesktopAccountForm((prev) => ({ ...prev, password: e.target.value }))}
                    disabled={!accountConfigured || submittingAccount}
                  />
                </div>

                <div className="flex gap-3 mt-2">
                  <button
                    className="btn btn-primary"
                    onClick={handleAccountSignIn}
                    disabled={!accountConfigured || submittingAccount}
                  >
                    <LogIn size={16} /> {submittingAccount ? 'Signing In...' : 'Sign In'}
                  </button>
                  <button className="btn btn-outline" onClick={handleAccountRefresh} disabled={loadingAccountStatus || submittingAccount}>
                    <RefreshCw size={16} /> Check Session
                  </button>
                </div>
              </div>
            </div>

            <div className="text-sm text-muted">
              {accountConfigured
                ? pendingConfirmation
                  ? 'Your account has been created. Confirm the email address you used, then return here and sign in from Bulky.'
                  : 'Desktop login is ready now. Additional sign-in providers can be enabled later without changing Bulky.'
                : 'Connected account access is not configured in this build yet. Bulky remains fully local until it is enabled.'}
            </div>

            {accountStatus?.lastError ? (
              <div className="badge badge-error" style={{ width: 'fit-content' }}>
                {accountStatus.lastError}
              </div>
            ) : null}
          </div>
        )}
      </div>

      <div className="card">
        <div className="flex justify-between items-start gap-3 mb-4">
          <div>
            <h3 className="card-title mb-2">Plan Options</h3>
            <p className="text-muted text-sm">
              Bulky stays one desktop app. The active account plan only decides which local and connected capabilities are unlocked.
            </p>
          </div>
          <div className="flex gap-2">
            {canOpenProCheckout ? (
              <button className="btn btn-primary btn-sm" onClick={() => handleOpenCheckout('pro')}>
                <CreditCard size={14} /> Start Pro
              </button>
            ) : null}
            {canOpenOneOffCheckout ? (
              <button className="btn btn-outline btn-sm" onClick={() => handleOpenCheckout('one_off')}>
                <ShieldCheck size={14} /> Buy One-off
              </button>
            ) : null}
          </div>
        </div>

        <div className="panel-grid">
          {accountPlanOptions.map((plan) => (
            <div
              key={plan.id}
              className="insight-card"
              style={currentPlanId === plan.id ? { borderColor: 'var(--accent-primary)' } : undefined}
            >
              <div className="flex justify-between items-center gap-3 mb-2">
                <div className="insight-value">{plan.name}</div>
                <StatusBadge active={currentPlanId === plan.id} label={currentPlanId === plan.id ? 'Current' : 'Available'} />
              </div>
              <div className="insight-meta">{plan.summary}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="flex justify-between items-start gap-3 mb-4">
          <div>
            <h3 className="card-title mb-2"><Cloud size={18} style={{ marginRight: '8px' }} /> Connected Feature Health</h3>
            <p className="text-muted text-sm">
              Check whether account access, live tracking, updates, billing, and sync are actually reachable from this install.
            </p>
          </div>
          <div className="flex gap-2">
            <button className="btn btn-outline btn-sm" onClick={handleRunCloudDiagnostics} disabled={testingCloudConnections}>
              <RefreshCw size={14} /> {testingCloudConnections ? 'Checking...' : 'Run Health Check'}
            </button>
            <button className="btn btn-outline btn-sm" onClick={handleRefreshCloudConfig} disabled={loadingCloudConfig}>
              <RefreshCw size={14} /> Reload
            </button>
          </div>
        </div>

        <div className="panel-grid">
          <div className="insight-card">
            <div className="flex justify-between items-center gap-2 mb-2">
              <div className="insight-label">Account Access</div>
              <HealthBadge result={cloudDiagnostics?.supabase} />
            </div>
            <div className="insight-meta">
              {cloudDiagnostics?.supabase?.configured
                ? (cloudDiagnostics?.supabase?.auth?.error || 'Connected account service responded successfully.')
                : 'Account backend is not configured in this build yet.'}
            </div>
          </div>
          <div className="insight-card">
            <div className="flex justify-between items-center gap-2 mb-2">
              <div className="insight-label">Live Tracking</div>
              <HealthBadge result={cloudDiagnostics?.cloudflare?.tracking} />
            </div>
            <div className="insight-meta">
              {cloudDiagnostics?.cloudflare?.tracking?.error
                || (cloudDiagnostics?.cloudflare?.tracking?.ok ? 'Public tracking endpoint is reachable.' : '')
                || 'Live tracking has not been checked yet.'}
            </div>
          </div>
          <div className="insight-card">
            <div className="flex justify-between items-center gap-2 mb-2">
              <div className="insight-label">Updates</div>
              <HealthBadge result={cloudDiagnostics?.cloudflare?.updates} />
            </div>
            <div className="insight-meta">
              {cloudDiagnostics?.cloudflare?.updates?.error
                || (cloudDiagnostics?.cloudflare?.updates?.ok ? 'Update delivery endpoint is reachable.' : '')
                || 'Automatic update delivery has not been checked yet.'}
            </div>
          </div>
          <div className="insight-card">
            <div className="flex justify-between items-center gap-2 mb-2">
              <div className="insight-label">Billing</div>
              <HealthBadge result={cloudDiagnostics?.paystack} />
            </div>
            <div className="insight-meta">
              {cloudDiagnostics?.paystack?.checkout?.error
                || (cloudDiagnostics?.paystack?.checkout?.ok ? 'Hosted billing checkout is reachable.' : '')
                || (cloudStatus?.paystack?.configured ? 'Billing is configured.' : 'Billing has not been configured yet.')}
            </div>
          </div>
          <div className="insight-card">
            <div className="flex justify-between items-center gap-2 mb-2">
              <div className="insight-label">Realtime Sync</div>
              <StatusBadge active={!!syncStatus?.connected} label={syncStatus?.connected ? 'Connected' : 'Idle'} />
            </div>
            <div className="insight-meta">
              {getSyncCopy(syncStatus)}
              {syncStatus?.lastEventTable ? ` Last event: ${syncStatus.lastEventTable}.` : ''}
            </div>
          </div>
        </div>
      </div>

      {showInfrastructureConfig ? (
        <div className="card">
          <div className="flex justify-between items-start gap-3 mb-4">
            <div>
              <h3 className="card-title mb-2"><Save size={18} style={{ marginRight: '8px' }} /> Developer Infrastructure Configuration</h3>
              <p className="text-muted text-sm">
                This section is for configuring Bulky’s connected backend surfaces during development. End users should not need to see or edit these values.
              </p>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Bulky API Base URL</label>
              <input
                type="text"
                className="form-input"
                placeholder="https://api.bulkyapp.com"
                value={cloudConfig.apiBaseUrl}
                onChange={(e) => updateField('apiBaseUrl', e.target.value)}
              />
              <small className="text-muted">Primary API surface for account, entitlement, and sync actions.</small>
            </div>
            <div className="form-group">
              <label className="form-label">Public Tracking Base URL</label>
              <input
                type="text"
                className="form-input"
                placeholder="https://track.bulkyapp.com"
                value={cloudConfig.trackingBaseUrl}
                onChange={(e) => updateField('trackingBaseUrl', e.target.value)}
              />
              <small className="text-muted">Public recipient-facing base used for opens, clicks, unsubscribes, and form confirmation.</small>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Updates Base URL</label>
              <input
                type="text"
                className="form-input"
                placeholder="https://updates.bulkyapp.com"
                value={cloudConfig.updatesBaseUrl}
                onChange={(e) => updateField('updatesBaseUrl', e.target.value)}
              />
              <small className="text-muted">Installer metadata and release artifacts for automatic updates.</small>
            </div>
            <div className="form-group">
              <label className="form-label">Account Backend URL</label>
              <input
                type="text"
                className="form-input"
                placeholder="https://your-project.supabase.co"
                value={cloudConfig.supabaseUrl}
                onChange={(e) => updateField('supabaseUrl', e.target.value)}
              />
              <small className="text-muted">Client-side auth and realtime entrypoint for Bulky desktop login.</small>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Account Backend Public Key</label>
              <input
                type="password"
                className="form-input"
                placeholder={cloudConfig.hasSupabaseAnonKey ? 'Leave blank to keep the saved public key' : 'Paste the public client key'}
                value={cloudConfig.supabaseAnonKey}
                onChange={(e) => updateField('supabaseAnonKey', e.target.value)}
              />
              {cloudConfig.hasSupabaseAnonKey ? (
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={cloudConfig.clearSupabaseAnonKey}
                    onChange={(e) => updateField('clearSupabaseAnonKey', e.target.checked)}
                  />
                  Clear the saved public key on next save
                </label>
              ) : null}
              <small className="text-muted">Stored locally and never returned to the renderer after save.</small>
            </div>
            <div className="form-group">
              <label className="form-label">Billing Public Key</label>
              <input
                type="password"
                className="form-input"
                placeholder={cloudConfig.hasPaystackPublicKey ? 'Leave blank to keep the saved public key' : 'Paste the billing public key'}
                value={cloudConfig.paystackPublicKey}
                onChange={(e) => updateField('paystackPublicKey', e.target.value)}
              />
              {cloudConfig.hasPaystackPublicKey ? (
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={cloudConfig.clearPaystackPublicKey}
                    onChange={(e) => updateField('clearPaystackPublicKey', e.target.checked)}
                  />
                  Clear the saved public key on next save
                </label>
              ) : null}
              <small className="text-muted">Stored locally so Bulky can launch hosted checkout without embedding raw values in code.</small>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Billing Checkout Base URL</label>
            <input
              type="text"
              className="form-input"
              placeholder="https://checkout.bulkyapp.com"
              value={cloudConfig.paystackCheckoutBaseUrl}
              onChange={(e) => updateField('paystackCheckoutBaseUrl', e.target.value)}
            />
            <small className="text-muted">Optional hosted checkout surface if plan upgrades open in the browser.</small>
          </div>

          <div className="flex gap-3 mt-4">
            <button className="btn btn-primary" onClick={handleSaveCloudConfig} disabled={savingCloudConfig}>
              <Save size={16} /> {savingCloudConfig ? 'Saving...' : 'Save Connected Service Settings'}
            </button>
            <button className="btn btn-outline" onClick={handleRefreshCloudConfig} disabled={loadingCloudConfig}>
              <RefreshCw size={16} /> Reload Saved State
            </button>
          </div>

          <div style={{ marginTop: '16px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <StatusBadge active={!!cloudStatus?.cloudflare?.apiConfigured} label="API" />
            <StatusBadge active={!!cloudStatus?.cloudflare?.trackingConfigured} label="Tracking" />
            <StatusBadge active={!!cloudStatus?.cloudflare?.updatesConfigured} label="Updates" />
            <StatusBadge active={!!cloudStatus?.supabase?.configured} label="Account Backend" />
            <StatusBadge active={!!cloudStatus?.paystack?.configured} label="Billing" />
          </div>
        </div>
      ) : null}
    </div>
  );
}
