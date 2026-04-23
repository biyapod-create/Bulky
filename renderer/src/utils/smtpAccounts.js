export function normalizeSmtpAccounts(accounts) {
  return Array.isArray(accounts) ? accounts : [];
}

export function getPrimarySmtpAccount(accounts, { activeOnly = false } = {}) {
  const normalizedAccounts = normalizeSmtpAccounts(accounts);
  const candidates = activeOnly
    ? normalizedAccounts.filter((account) => account?.isActive)
    : normalizedAccounts;

  return candidates.find((account) => account?.isDefault) || candidates[0] || null;
}

export function hasConfiguredSmtpAccounts(accounts) {
  return normalizeSmtpAccounts(accounts).length > 0;
}

export function getSenderEmail(account) {
  return String(account?.fromEmail || account?.username || '').trim();
}

export function getSenderDomain(account) {
  return getSenderEmail(account).split('@')[1]?.trim().toLowerCase() || '';
}
