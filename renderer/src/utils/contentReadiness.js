const { buildInboxReadinessGuardrails } = require('./deliverability');

const SUPPORTED_SIMPLE_FIELDS = new Set([
  'email',
  'firstname',
  'lastname',
  'fullname',
  'company',
  'phone',
  'customfield1',
  'customfield2',
  'custom1',
  'custom2',
  'emaildomain',
  'date',
  'time',
  'year',
  'month',
  'day',
  'dayofweek',
  'randomnumber',
  'uniquecode',
  'unsubscribelink',
  'unsubscribeurl'
]);

const PREVIEW_CONTACT = {
  email: 'john@example.com',
  firstName: 'John',
  lastName: 'Doe',
  fullName: 'John Doe',
  company: 'Acme Inc',
  phone: '+1234567890',
  customField1: 'Premium',
  customField2: 'North America',
  custom1: 'Premium',
  custom2: 'North America',
  unsubscribeLink: '#unsubscribe',
  unsubscribeUrl: '#unsubscribe'
};

function unique(items = []) {
  return Array.from(new Set(items.filter(Boolean)));
}

function getAllMergeTags(...values) {
  return unique(
    values.flatMap((value) =>
      Array.from(String(value || '').match(/\{\{[\s\S]+?\}\}/g) || [])
    )
  );
}

function normalizeMergeTag(tag = '') {
  return String(tag || '').trim().replace(/^\{\{|\}\}$/g, '').trim();
}

function getFieldName(candidate = '') {
  return String(candidate || '').trim().toLowerCase();
}

function isSupportedFieldName(candidate = '') {
  return SUPPORTED_SIMPLE_FIELDS.has(getFieldName(candidate));
}

function isSupportedMergeTag(tag) {
  const token = normalizeMergeTag(tag);
  if (!token) return false;

  if (token === 'else' || token === '/if' || token === '/unless') {
    return true;
  }

  const conditionalMatch = token.match(/^#(if|unless)\s+([a-z0-9_]+)$/i);
  if (conditionalMatch) {
    return isSupportedFieldName(conditionalMatch[2]);
  }

  const fallbackMatch = token.match(/^([a-z0-9_]+)\s*\|\s*.+$/i);
  if (fallbackMatch) {
    return isSupportedFieldName(fallbackMatch[1]);
  }

  const modifierMatch = token.match(/^([a-z0-9_]+):(upper|lower|capitalize)$/i);
  if (modifierMatch) {
    return isSupportedFieldName(modifierMatch[1]);
  }

  return isSupportedFieldName(token);
}

function analyzeMergeTags({ subject = '', content = '' } = {}) {
  const tags = getAllMergeTags(subject, content);
  const unsupported = tags.filter((tag) => !isSupportedMergeTag(tag));
  return {
    tags,
    unsupported,
    supported: tags.filter((tag) => !unsupported.includes(tag))
  };
}

function hasVisibleUnsubscribeLanguage(content = '') {
  return /unsubscribe|opt[\s-]?out/i.test(String(content || ''));
}

function hasMeaningfulHtmlContent(content = '') {
  const plainText = String(content || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return plainText.length > 0;
}

function evaluateContentReadiness({
  subject = '',
  content = '',
  spamScore = null,
  recipientBreakdown = {},
  deliverabilityInfo = {},
  smtpAccounts = [],
  smtpSettings = {},
  smtpHealth = []
} = {}) {
  const blockers = [];
  const warnings = [];
  const mergeTagAnalysis = analyzeMergeTags({ subject, content });
  const validRecipients = Number(recipientBreakdown.valid ?? recipientBreakdown.total ?? 0);
  const totalRecipients = Number(recipientBreakdown.total ?? validRecipients);
  const bulkMode = String(deliverabilityInfo?.sendingMode || 'bulk') !== 'personal';

  if (!String(subject || '').trim()) {
    blockers.push('Add a subject line before saving or sending.');
  }

  if (!hasMeaningfulHtmlContent(content)) {
    blockers.push('Add email content before saving or sending.');
  }

  if (mergeTagAnalysis.unsupported.length > 0) {
    blockers.push(`Unsupported merge tags: ${mergeTagAnalysis.unsupported.join(', ')}`);
  }

  if (validRecipients <= 0) {
    blockers.push(
      totalRecipients > 0
        ? 'All selected recipients are currently blacklisted, unsubscribed, or otherwise unavailable.'
        : 'Select at least one valid recipient before continuing.'
    );
  }

  const score = Number(spamScore?.score ?? 0);
  if (score >= 80) {
    blockers.push(`Spam score is ${score}. Bring it down before sending live traffic.`);
  } else if (score >= 55) {
    warnings.push(`Spam score is ${score}. Review subject and copy before sending.`);
  }

  if (bulkMode && !hasVisibleUnsubscribeLanguage(content)) {
    warnings.push('Bulk email copy should mention how recipients can unsubscribe.');
  }

  const guardrails = buildInboxReadinessGuardrails({
    deliverabilityInfo,
    smtpAccounts,
    smtpSettings,
    smtpHealth
  });

  for (const guardrail of guardrails) {
    if (guardrail.status === 'fail') {
      blockers.push(`${guardrail.title}: ${guardrail.detail}`);
    } else if (guardrail.status === 'warn') {
      warnings.push(`${guardrail.title}: ${guardrail.detail}`);
    }
  }

  return {
    blockers: unique(blockers),
    warnings: unique(warnings),
    mergeTagAnalysis,
    guardrails,
    isReady: blockers.length === 0
  };
}

function applyPreviewPersonalization(value = '') {
  const now = new Date();
  let rendered = String(value || '');

  rendered = rendered.replace(/(?<!\{)\{([^{}]+)\}(?!\})/g, (match, options) => {
    const firstChoice = String(options || '').split('|')[0];
    return firstChoice ? firstChoice.trim() : match;
  });

  rendered = rendered.replace(/\{\{#if\s+([a-z0-9_]+)\}\}([\s\S]*?)\{\{else\}\}([\s\S]*?)\{\{\/if\}\}/gi, (match, field, ifContent, elseContent) => {
    const sample = PREVIEW_CONTACT[field] || PREVIEW_CONTACT[field?.toLowerCase()] || '';
    return sample ? ifContent : elseContent;
  });

  rendered = rendered.replace(/\{\{#if\s+([a-z0-9_]+)\}\}([\s\S]*?)\{\{\/if\}\}/gi, (match, field, ifContent) => {
    const sample = PREVIEW_CONTACT[field] || PREVIEW_CONTACT[field?.toLowerCase()] || '';
    return sample ? ifContent : '';
  });

  rendered = rendered.replace(/\{\{#unless\s+([a-z0-9_]+)\}\}([\s\S]*?)\{\{\/unless\}\}/gi, (match, field, ifContent) => {
    const sample = PREVIEW_CONTACT[field] || PREVIEW_CONTACT[field?.toLowerCase()] || '';
    return sample ? '' : ifContent;
  });

  rendered = rendered.replace(/\{\{([a-z0-9_]+)\s*\|\s*"?([^}"]+)"?\}\}/gi, (match, field, fallback) => {
    const sample = PREVIEW_CONTACT[field] || PREVIEW_CONTACT[field?.toLowerCase()] || '';
    return sample || String(fallback || '').trim();
  });

  rendered = rendered.replace(/\{\{([a-z0-9_]+):(upper|lower|capitalize)\}\}/gi, (match, field, modifier) => {
    const sample = PREVIEW_CONTACT[field] || PREVIEW_CONTACT[field?.toLowerCase()] || '';
    if (!sample) return '';
    if (modifier === 'upper') return String(sample).toUpperCase();
    if (modifier === 'lower') return String(sample).toLowerCase();
    return String(sample).charAt(0).toUpperCase() + String(sample).slice(1).toLowerCase();
  });

  const replacements = {
    email: PREVIEW_CONTACT.email,
    firstName: PREVIEW_CONTACT.firstName,
    lastName: PREVIEW_CONTACT.lastName,
    fullName: PREVIEW_CONTACT.fullName,
    company: PREVIEW_CONTACT.company,
    phone: PREVIEW_CONTACT.phone,
    customField1: PREVIEW_CONTACT.customField1,
    customField2: PREVIEW_CONTACT.customField2,
    custom1: PREVIEW_CONTACT.custom1,
    custom2: PREVIEW_CONTACT.custom2,
    emailDomain: PREVIEW_CONTACT.email.split('@')[1],
    date: now.toLocaleDateString(),
    time: now.toLocaleTimeString(),
    year: String(now.getFullYear()),
    month: now.toLocaleString('default', { month: 'long' }),
    day: String(now.getDate()),
    dayOfWeek: now.toLocaleString('default', { weekday: 'long' }),
    randomNumber: '4821',
    uniqueCode: 'AB12CD34',
    unsubscribeLink: PREVIEW_CONTACT.unsubscribeLink,
    unsubscribeUrl: PREVIEW_CONTACT.unsubscribeUrl
  };

  for (const [token, replacement] of Object.entries(replacements)) {
    rendered = rendered.replace(new RegExp(`\\{\\{${token}\\}\\}`, 'gi'), replacement);
  }

  return rendered;
}

module.exports = {
  PREVIEW_CONTACT,
  SUPPORTED_SIMPLE_FIELDS,
  analyzeMergeTags,
  applyPreviewPersonalization,
  evaluateContentReadiness,
  getAllMergeTags,
  hasMeaningfulHtmlContent,
  hasVisibleUnsubscribeLanguage,
  isSupportedMergeTag
};
