import React from 'react';

function formatLimit(value, emptyLabel = 'Unlimited') {
  return Number.isFinite(value) ? value.toLocaleString() : emptyLabel;
}

function formatDate(value) {
  if (!value) {
    return 'Not set';
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not set' : date.toLocaleString();
}

export default function EntitlementOverviewCard({ entitlementState }) {
  if (!entitlementState) {
    return null;
  }

  const aiAvailable = entitlementState.capabilities?.aiAssistant;
  const analyticsAvailable = entitlementState.capabilities?.analytics;
  const hostedTracking = entitlementState.capabilities?.hostedTracking;

  return (
    <div className="card">
      <h4 style={{ marginBottom: '16px' }}>Access & Plan</h4>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px', marginBottom: '16px' }}>
        {[
          {
            label: 'Current Plan',
            value: entitlementState.plan?.name || 'Unknown',
            detail: entitlementState.plan?.description || 'Plan details unavailable'
          },
          {
            label: 'Access Mode',
            value: entitlementState.mode === 'hybrid' ? 'Hybrid' : 'Local',
            detail: entitlementState.source === 'local-legacy'
              ? 'Legacy local access until account login is connected.'
              : `State source: ${entitlementState.source || 'unknown'}`
          },
          {
            label: 'SMTP Limit',
            value: formatLimit(entitlementState.limits?.maxSmtpAccounts),
            detail: `${entitlementState.usage?.smtpAccountsConfigured || 0} configured, ${entitlementState.usage?.activeSmtpAccounts || 0} active`
          },
          {
            label: 'Email Limit',
            value: formatLimit(entitlementState.limits?.maxEmailsPerCycle),
            detail: Number.isFinite(entitlementState.usage?.emailsRemainingInCycle)
              ? `${entitlementState.usage.emailsRemainingInCycle.toLocaleString()} remaining this cycle`
              : `${(entitlementState.usage?.emailsSentLifetime || 0).toLocaleString()} sent lifetime`
          }
        ].map((item) => (
          <div key={item.label} style={{ padding: '14px', borderRadius: '12px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '6px' }}>{item.label}</div>
            <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '4px' }}>{item.value}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{item.detail}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
        {[
          { label: 'AI Assistant', enabled: aiAvailable, detail: aiAvailable ? 'Available in this build.' : 'Locked on the current plan.' },
          { label: 'Advanced Analytics', enabled: analyticsAvailable, detail: analyticsAvailable ? 'Campaign and engagement analytics are enabled.' : 'Detailed statistics are locked.' },
          { label: 'Hosted Tracking', enabled: hostedTracking, detail: hostedTracking ? 'Cloud tracking can be enabled once configured.' : 'Local-only tracking mode.' }
        ].map((item) => (
          <div key={item.label} style={{ padding: '14px', borderRadius: '12px', background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>{item.label}</div>
            <div style={{ fontSize: '12px', color: item.enabled ? 'var(--success)' : 'var(--text-muted)', marginBottom: '6px' }}>
              {item.enabled ? 'Enabled' : 'Locked'}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{item.detail}</div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: '12px', fontSize: '12px', color: 'var(--text-muted)' }}>
        Account: {entitlementState.account?.email || 'No desktop login connected yet'} | Last validated: {formatDate(entitlementState.lastValidatedAt)}
      </div>
    </div>
  );
}
