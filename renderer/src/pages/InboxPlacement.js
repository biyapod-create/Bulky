import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Inbox,
  Play,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Settings,
  Eye
} from 'lucide-react';
import { useToast } from '../components/ToastContext';
import { useNavigation } from '../components/NavigationContext';

const PROVIDER_NAMES = {
  gmail: 'Gmail',
  outlook: 'Outlook',
  yahoo: 'Yahoo',
  apple: 'Apple Mail'
};

function formatStatus(seedResult) {
  if (!seedResult.wasSent) return 'Not sent to seed';
  if (seedResult.bounced) return 'Bounced';
  if (seedResult.clickedAt) return 'Clicked';
  if (seedResult.openedAt) return 'Opened';
  return 'Sent';
}

function statusTone(seedResult) {
  if (!seedResult.wasSent) return 'warning';
  if (seedResult.bounced) return 'error';
  if (seedResult.clickedAt || seedResult.openedAt) return 'success';
  return 'info';
}

export default function InboxPlacement() {
  const { addToast } = useToast();
  const { navigateTo } = useNavigation();
  const [campaigns, setCampaigns] = useState([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState('');
  const [seedAccounts, setSeedAccounts] = useState([]);
  const [testing, setTesting] = useState(false);
  const [results, setResults] = useState(null);

  const selectedCampaign = useMemo(
    () => campaigns.find((campaign) => campaign.id === selectedCampaignId) || null,
    [campaigns, selectedCampaignId]
  );

  const activeSeeds = useMemo(
    () => seedAccounts.filter((account) => account.isActive),
    [seedAccounts]
  );

  const load = useCallback(async () => {
    try {
      const [campData, seedData] = await Promise.all([
        window.electron.campaigns?.getAll?.(),
        window.electron.seed?.getAll?.()
      ]);
      setCampaigns(Array.isArray(campData) ? campData : []);
      setSeedAccounts(Array.isArray(seedData) ? seedData : []);
    } catch (error) {
      console.error('Failed to load inbox placement data:', error);
      addToast('Failed to load inbox placement data', 'error');
    }
  }, [addToast]);

  useEffect(() => {
    load();
  }, [load]);

  const runTest = async () => {
    if (!selectedCampaignId) {
      addToast('Please select a campaign to audit', 'warning');
      return;
    }
    if (activeSeeds.length === 0) {
      addToast('No active seed accounts found. Add seed accounts in Settings.', 'warning');
      return;
    }

    setTesting(true);
    setResults(null);

    try {
      const [logs, trackingEvents] = await Promise.all([
        window.electron.campaigns?.getLogs?.(selectedCampaignId),
        window.electron.tracking?.getEvents?.(selectedCampaignId)
      ]);

      const logMap = new Map();
      for (const log of Array.isArray(logs) ? logs : []) {
        const email = String(log.email || '').toLowerCase();
        if (!email || logMap.has(email)) continue;
        logMap.set(email, log);
      }

      const trackingByEmail = new Map();
      for (const event of Array.isArray(trackingEvents) ? trackingEvents : []) {
        const email = String(event.email || '').toLowerCase();
        if (!email) continue;
        const current = trackingByEmail.get(email) || { openedAt: null, clickedAt: null };
        if (event.type === 'open' && !current.openedAt) current.openedAt = event.createdAt;
        if (event.type === 'click' && !current.clickedAt) current.clickedAt = event.createdAt;
        trackingByEmail.set(email, current);
      }

      const audit = activeSeeds.map((seed) => {
        const email = String(seed.email || '').toLowerCase();
        const log = logMap.get(email);
        const tracking = trackingByEmail.get(email) || {};
        return {
          id: seed.id,
          email: seed.email,
          provider: PROVIDER_NAMES[seed.provider] || seed.provider || 'Seed account',
          expectedFolder: seed.folder || 'Inbox',
          wasSent: !!log,
          bounced: log?.status === 'bounced',
          sendStatus: log?.status || 'missing',
          sentAt: log?.createdAt || null,
          openedAt: tracking.openedAt || log?.openedAt || null,
          clickedAt: tracking.clickedAt || log?.clickedAt || null
        };
      });

      const summary = {
        total: audit.length,
        sent: audit.filter((item) => item.wasSent).length,
        engaged: audit.filter((item) => item.openedAt || item.clickedAt).length,
        bounced: audit.filter((item) => item.bounced).length
      };

      setResults({ audit, summary });
      addToast(
        `Seed audit complete: ${summary.sent}/${summary.total} received a send record`,
        summary.sent === summary.total ? 'success' : 'warning'
      );
    } catch (error) {
      console.error('Inbox placement audit failed:', error);
      addToast('Inbox placement audit failed', 'error');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1>
            <Inbox size={22} style={{ color: 'var(--accent)' }} />
            Inbox Placement Audit
          </h1>
          <p className="subtitle">
            Audit seed-account delivery with real campaign logs and tracking activity. Bulky does not guess provider folders when mailbox access is not configured.
          </p>
        </div>
        <button className="btn btn-secondary" onClick={load} disabled={testing}>
          <RefreshCw size={15} /> Refresh
        </button>
      </div>

      <div className="card" style={{ marginBottom: '20px' }}>
        <div className="form-group">
          <label className="form-label">Campaign to Audit</label>
          <select
            className="form-select"
            value={selectedCampaignId}
            onChange={(e) => setSelectedCampaignId(e.target.value)}
            disabled={testing}
          >
            <option value="">Choose a campaign...</option>
            {campaigns.map((campaign) => (
              <option key={campaign.id} value={campaign.id}>
                {campaign.name}
              </option>
            ))}
          </select>
        </div>

        <div className="panel-grid" style={{ marginBottom: '16px' }}>
          <div className="insight-card">
            <div className="insight-value">{activeSeeds.length}</div>
            <div className="insight-label">Active Seed Accounts</div>
            <div className="insight-meta">Use one active seed account per provider you want to monitor.</div>
          </div>
          <div className="insight-card">
            <div className="insight-value">{selectedCampaign ? selectedCampaign.name : 'No campaign'}</div>
            <div className="insight-label">Current Audit Target</div>
            <div className="insight-meta">Bulky compares send logs and tracking events against the selected campaign only.</div>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 0 0',
            borderTop: '1px solid var(--border)',
            gap: '16px',
            flexWrap: 'wrap'
          }}
        >
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Bulky can verify that seed addresses were sent to and whether they opened or clicked. To confirm exact folder placement, pair seed accounts with a mailbox-access workflow in a future release.
          </div>
          <button className="btn btn-primary" onClick={runTest} disabled={testing || !selectedCampaignId || activeSeeds.length === 0}>
            {testing ? <><RefreshCw size={15} style={{ animation: 'spin 1s linear infinite' }} /> Auditing...</> : <><Play size={15} /> Run Seed Audit</>}
          </button>
        </div>

        {seedAccounts.length === 0 && (
          <div
            style={{
              marginTop: '16px',
              padding: '12px 14px',
              borderRadius: '12px',
              background: 'rgba(245, 158, 11, 0.08)',
              border: '1px solid rgba(245, 158, 11, 0.18)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              flexWrap: 'wrap'
            }}
          >
            <span style={{ fontSize: '13px', color: 'var(--warning)' }}>
              No seed accounts are configured yet.
            </span>
            <button className="btn btn-outline btn-sm" onClick={() => navigateTo('/settings', { tab: 'seed' })}>
              <Settings size={14} /> Open Seed Settings
            </button>
          </div>
        )}
      </div>

      {results && (
        <div className="section-stack">
          <div className="panel-grid">
            <div className="insight-card">
              <div className="insight-value">{results.summary.sent}</div>
              <div className="insight-label">Seed Sends Found</div>
              <div className="insight-meta">{results.summary.total} active seeds audited for this campaign.</div>
            </div>
            <div className="insight-card">
              <div className="insight-value">{results.summary.engaged}</div>
              <div className="insight-label">Opened or Clicked</div>
              <div className="insight-meta">Real engagement came from tracking data tied to the campaign.</div>
            </div>
            <div className="insight-card">
              <div className="insight-value">{results.summary.bounced}</div>
              <div className="insight-label">Bounced Seeds</div>
              <div className="insight-meta">Bounce records are taken from campaign logs, not simulated outcomes.</div>
            </div>
          </div>

          <div className="card">
            <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '16px' }}>Seed Audit Results</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {results.audit.map((result) => {
                const tone = statusTone(result);
                const icon = tone === 'success'
                  ? <CheckCircle size={18} style={{ color: 'var(--success)' }} />
                  : tone === 'error'
                    ? <XCircle size={18} style={{ color: 'var(--error)' }} />
                    : tone === 'warning'
                      ? <AlertTriangle size={18} style={{ color: 'var(--warning)' }} />
                      : <Eye size={18} style={{ color: 'var(--accent)' }} />;

                return (
                  <div
                    key={result.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '16px',
                      padding: '14px 16px',
                      borderRadius: '12px',
                      background: 'var(--bg-tertiary)',
                      border: '1px solid var(--border)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                      {icon}
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: '14px' }}>{result.provider}</div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {result.email}
                        </div>
                      </div>
                    </div>

                    <div style={{ textAlign: 'right', minWidth: '220px' }}>
                      <div className={`badge badge-${tone}`} style={{ justifyContent: 'center' }}>
                        {formatStatus(result)}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px' }}>
                        Expected review folder: {result.expectedFolder}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                        {result.clickedAt
                          ? `Clicked at ${new Date(result.clickedAt).toLocaleString()}`
                          : result.openedAt
                            ? `Opened at ${new Date(result.openedAt).toLocaleString()}`
                            : result.sentAt
                              ? `Sent at ${new Date(result.sentAt).toLocaleString()}`
                              : 'No send log recorded for this seed'}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
