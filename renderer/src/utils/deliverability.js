function normalizeHost(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/:\d+$/, '');
}

function normalizeSmtpAccounts(accounts) {
  return Array.isArray(accounts) ? accounts : [];
}

function getPrimarySmtpAccount(accounts) {
  const normalizedAccounts = normalizeSmtpAccounts(accounts);
  return normalizedAccounts.find((account) => account?.isDefault) || normalizedAccounts[0] || null;
}

function getSenderEmail(account) {
  return String(account?.fromEmail || account?.username || '').trim();
}

function getSenderDomain(account) {
  return getSenderEmail(account).split('@')[1]?.trim().toLowerCase() || '';
}

function getApexDomain(value = '') {
  const host = normalizeHost(value);
  if (!host || /^[\d.:]+$/.test(host)) return host;

  const parts = host.split('.').filter(Boolean);
  if (parts.length <= 2) return host;

  const commonSecondLevelTlds = new Set(['co', 'com', 'org', 'net', 'gov', 'edu']);
  const tld = parts[parts.length - 1];
  const secondLevel = parts[parts.length - 2];

  if (tld.length === 2 && commonSecondLevelTlds.has(secondLevel) && parts.length >= 3) {
    return parts.slice(-3).join('.');
  }

  return parts.slice(-2).join('.');
}

function isPrivateTrackingSurface(value = '') {
  const host = normalizeHost(value);
  if (!host) return true;
  if (host === 'localhost' || host === '::1' || host.endsWith('.local')) return true;
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) return true;

  const private172Match = host.match(/^172\.(\d{1,3})\./);
  if (private172Match) {
    const secondOctet = Number(private172Match[1]);
    if (secondOctet >= 16 && secondOctet <= 31) return true;
  }

  return false;
}

function buildInboxReadinessGuardrails({
  deliverabilityInfo = {},
  smtpAccounts = [],
  smtpSettings = {},
  smtpHealth = []
} = {}) {
  const primaryAccount = getPrimarySmtpAccount(smtpAccounts);
  const effectiveFromEmail = String(smtpSettings.fromEmail || getSenderEmail(primaryAccount)).trim();
  const effectiveSendingDomain = getSenderDomain({ fromEmail: effectiveFromEmail });
  const effectiveReplyTo = String(primaryAccount?.replyTo || smtpSettings.replyTo || '').trim();
  const effectiveUnsubscribeEmail = String(primaryAccount?.unsubscribeEmail || smtpSettings.unsubscribeEmail || '').trim();
  const trackingDomain = String(deliverabilityInfo.trackingDomain || '').trim();
  const usingPublicTracking = !!trackingDomain && !isPrivateTrackingSurface(trackingDomain);
  const senderApex = getApexDomain(effectiveSendingDomain);
  const dkimApex = getApexDomain(primaryAccount?.dkimDomain || effectiveSendingDomain);
  const bulkMode = String(deliverabilityInfo.sendingMode || 'bulk') !== 'personal';
  const authSignals = [
    !!deliverabilityInfo.spfConfigured,
    !!deliverabilityInfo.dkimConfigured,
    !!deliverabilityInfo.dmarcConfigured
  ].filter(Boolean).length;
  const smtpHealthById = new Map((Array.isArray(smtpHealth) ? smtpHealth : []).map((entry) => [entry.id, entry]));
  const rotationReady = (Array.isArray(smtpAccounts) ? smtpAccounts : []).filter((account) => {
    const healthSnapshot = smtpHealthById.get(account.id);
    const sentToday = Number(healthSnapshot?.sentToday ?? account.sentToday ?? 0);
    const dailyLimit = Number(healthSnapshot?.dailyLimit ?? account.dailyLimit ?? 0);
    const underLimit = dailyLimit <= 0 || sentToday < dailyLimit;
    return !!account?.isActive && !!getSenderEmail(account) && underLimit;
  }).length;

  return [
    {
      id: 'auth-stack',
      title: 'Authentication Stack',
      status: authSignals === 3 ? 'pass' : authSignals >= 2 ? 'warn' : 'fail',
      detail: authSignals === 3
        ? 'SPF, DKIM, and DMARC are all detected for the active sender domain.'
        : authSignals >= 2
          ? 'Most authentication checks are configured, but one is still missing.'
          : 'Inbox placement will stay fragile until SPF, DKIM, and DMARC are all set.',
      nextStep: authSignals === 3 ? 'Keep DNS aligned as you add new sending domains.' : 'Run Domain Health and finish the missing DNS records.'
    },
    {
      id: 'tracking-surface',
      title: 'Tracking Surface',
      status: usingPublicTracking ? 'pass' : trackingDomain ? 'fail' : 'warn',
      detail: usingPublicTracking
        ? `Tracking is using ${trackingDomain}, which recipients can reach for opens and clicks.`
        : trackingDomain
          ? `${trackingDomain} looks private or local, so recipient-side tracking and unsubscribe links can break.`
          : 'Tracking is still on a local-only surface, so live opens and clicks will only work on this machine.',
      nextStep: usingPublicTracking ? 'Keep the DNS target healthy and SSL-ready.' : 'Point a public tracking subdomain to Bulky before sending live campaigns.'
    },
    {
      id: 'unsubscribe-path',
      title: 'Bulk Unsubscribe Path',
      status: bulkMode ? ((usingPublicTracking || effectiveUnsubscribeEmail) ? 'pass' : 'fail') : 'warn',
      detail: bulkMode
        ? ((usingPublicTracking || effectiveUnsubscribeEmail)
          ? 'Bulk mode has a valid unsubscribe route through tracking or a mailbox fallback.'
          : 'Bulk mode needs a reachable unsubscribe link or mailbox to stay compliant.')
        : 'Personal mode skips bulk unsubscribe headers and should only be used for transactional or 1:1 email.',
      nextStep: bulkMode
        ? ((usingPublicTracking || effectiveUnsubscribeEmail)
          ? 'Keep monitoring complaint and unsubscribe rates.'
          : 'Add a public tracking domain or unsubscribe mailbox before pushing volume.')
        : 'Switch back to Bulk for newsletters, promos, or list sends.'
    },
    {
      id: 'reply-path',
      title: 'Reply Path',
      status: effectiveReplyTo ? 'pass' : 'warn',
      detail: effectiveReplyTo
        ? `Replies route to ${effectiveReplyTo}, which helps providers see real two-way traffic.`
        : 'No reply-to address is configured, so mailbox interactions look less trustworthy.',
      nextStep: effectiveReplyTo ? 'Make sure the inbox is monitored and answered.' : 'Set a monitored reply-to address on the default SMTP account.'
    },
    {
      id: 'sender-alignment',
      title: 'Sender Alignment',
      status: senderApex && dkimApex && senderApex === dkimApex ? 'pass' : effectiveSendingDomain ? 'warn' : 'fail',
      detail: senderApex && dkimApex && senderApex === dkimApex
        ? `Visible From and DKIM both align on ${senderApex}.`
        : effectiveSendingDomain
          ? 'The visible sender domain and DKIM domain do not clearly align yet.'
          : 'No effective sender address is configured for the active pool.',
      nextStep: senderApex && dkimApex && senderApex === dkimApex
        ? 'Keep new SMTP accounts on the same authenticated sender domain when possible.'
        : 'Match the From domain, DKIM domain, and default sender account before scaling.'
    },
    {
      id: 'compliance-footer',
      title: 'Compliance Footer',
      status: String(deliverabilityInfo.companyAddress || '').trim() ? 'pass' : 'warn',
      detail: String(deliverabilityInfo.companyAddress || '').trim()
        ? 'A physical company address is ready to be appended to campaign footers.'
        : 'Bulk mail still needs a physical address in the footer for compliance and trust.',
      nextStep: String(deliverabilityInfo.companyAddress || '').trim()
        ? 'Keep the footer address current if the business location changes.'
        : 'Add your business or mailing address in Deliverability Settings.'
    },
    {
      id: 'rotation-health',
      title: 'Rotation Health',
      status: rotationReady >= 2 ? 'pass' : rotationReady === 1 ? 'warn' : 'fail',
      detail: rotationReady >= 2
        ? `${rotationReady} SMTP accounts are currently rotation-ready with headroom.`
        : rotationReady === 1
          ? 'Only one SMTP account is ready, so campaigns have less room to absorb throttling.'
          : 'No SMTP account is currently ready to rotate safely.',
      nextStep: rotationReady >= 2 ? 'Keep daily limits and health checks in view as you scale.' : 'Activate at least two healthy SMTP accounts with headroom before larger sends.'
    }
  ];
}

module.exports = {
  getApexDomain,
  isPrivateTrackingSurface,
  buildInboxReadinessGuardrails
};
