const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const VALID_CAMPAIGN_STATUSES = new Set([
  'draft',
  'scheduled',
  'running',
  'paused',
  'completed',
  'stopped',
  'failed'
]);

const VALID_VERIFICATION_FILTERS = new Set([
  '',
  'valid',
  'invalid',
  'risky',
  'unverified',
  'verified_only',
  'exclude_invalid'
]);

const VALID_THEMES = new Set(['light', 'dark']);
const VALID_CONTACT_STATUSES = new Set(['active', 'inactive', 'bounced', 'unsubscribed']);
const VALID_CONTACT_VERIFICATION_STATUSES = new Set(['valid', 'invalid', 'risky', 'unverified']);
const VALID_CONTACT_SORT_COLUMNS = new Set([
  'email',
  'firstName',
  'lastName',
  'company',
  'createdAt',
  'updatedAt',
  'verificationStatus',
  'verificationScore'
]);

function ok(value) {
  return { value };
}

function fail(error) {
  return { error };
}

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function readString(value, field, { required = false, trim = true, maxLength = 4096, allowEmpty = true } = {}) {
  if (value === undefined || value === null) {
    return required ? fail(`Missing required field: ${field}`) : ok('');
  }

  if (typeof value !== 'string') {
    return fail(`Invalid ${field}: expected a string`);
  }

  const normalized = trim ? value.trim() : value;
  if (!allowEmpty && !normalized) {
    return fail(`Invalid ${field}: value is required`);
  }
  if (normalized.length > maxLength) {
    return fail(`Invalid ${field}: too long`);
  }

  return ok(normalized);
}

function readBoolean(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') return defaultValue;
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1') return true;
  if (value === 0 || value === '0') return false;
  return Boolean(value);
}

function readInteger(value, field, { required = false, min = undefined, max = undefined, defaultValue = undefined } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) return fail(`Missing required field: ${field}`);
    return ok(defaultValue);
  }

  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(parsed)) {
    return fail(`Invalid ${field}: expected a whole number`);
  }
  if (min !== undefined && parsed < min) {
    return fail(`Invalid ${field}: must be at least ${min}`);
  }
  if (max !== undefined && parsed > max) {
    return fail(`Invalid ${field}: must be at most ${max}`);
  }

  return ok(parsed);
}

function readOptionalEmail(value, field) {
  const text = readString(value, field, { maxLength: 320 });
  if (text.error) return text;
  if (!text.value) return ok('');
  if (!EMAIL_REGEX.test(text.value)) {
    return fail(`Invalid ${field}`);
  }
  return ok(text.value);
}

function readRequiredEmail(value, field) {
  const text = readString(value, field, { required: true, maxLength: 320, allowEmpty: false });
  if (text.error) return text;
  if (!EMAIL_REGEX.test(text.value)) {
    return fail(`Invalid ${field}`);
  }
  return ok(text.value);
}

function readId(value, field = 'id', { required = true } = {}) {
  return readString(value, field, { required, maxLength: 255, allowEmpty: !required });
}

function readDateString(value, field, { required = false } = {}) {
  const text = readString(value, field, { required, maxLength: 128, allowEmpty: !required });
  if (text.error) return text;
  if (!text.value) return ok('');

  const timestamp = Date.parse(text.value);
  if (Number.isNaN(timestamp)) {
    return fail(`Invalid ${field}: expected a valid date/time`);
  }

  return ok(new Date(timestamp).toISOString());
}

function readDateFilterString(value, field) {
  const text = readString(value, field, { required: false, maxLength: 128 });
  if (text.error) return text;
  if (!text.value) return ok('');

  const timestamp = Date.parse(text.value);
  if (Number.isNaN(timestamp)) {
    return fail(`Invalid ${field}: expected a valid date`);
  }

  return ok(text.value);
}

function readHostLike(value, field, { required = false } = {}) {
  const text = readString(value, field, { required, maxLength: 2048, allowEmpty: !required });
  if (text.error) return text;
  if (!text.value) return ok('');
  if (/\s/.test(text.value)) {
    return fail(`Invalid ${field}`);
  }

  if (text.value.includes('://')) {
    try {
      const url = new URL(text.value);
      if (!url.hostname) return fail(`Invalid ${field}`);
    } catch {
      return fail(`Invalid ${field}`);
    }
  }

  return ok(text.value);
}

function readDomainString(value, field, { required = false } = {}) {
  const text = readString(value, field, { required, maxLength: 255, allowEmpty: !required });
  if (text.error) return text;
  if (!text.value) return ok('');

  const normalized = text.value.toLowerCase().replace(/^\.+|\.+$/g, '');
  if (
    normalized.includes('://') ||
    normalized.includes('/') ||
    normalized.includes('@') ||
    /\s/.test(normalized) ||
    !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(normalized)
  ) {
    return fail(`Invalid ${field}`);
  }

  return ok(normalized);
}

function readColor(value, field, { defaultValue = '#6366f1' } = {}) {
  if (value === undefined || value === null || value === '') return ok(defaultValue);

  const text = readString(value, field, { required: false, maxLength: 16, allowEmpty: false });
  if (text.error) return text;
  if (!/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(text.value)) {
    return fail(`Invalid ${field}`);
  }

  return ok(text.value);
}

function readCoercibleString(value, field, { required = false, trim = true, maxLength = 4096, allowEmpty = true } = {}) {
  if (value === undefined || value === null) {
    return required ? fail(`Missing required field: ${field}`) : ok('');
  }

  let normalizedValue = value;
  if (typeof normalizedValue === 'number' || typeof normalizedValue === 'boolean') {
    normalizedValue = String(normalizedValue);
  }

  if (typeof normalizedValue !== 'string') {
    return fail(`Invalid ${field}: expected a string`);
  }

  return readString(normalizedValue, field, { required, trim, maxLength, allowEmpty });
}

function readJsonArray(value, field, { required = false, defaultValue = [] } = {}) {
  if (value === undefined || value === null || value === '') {
    return required ? fail(`Missing required field: ${field}`) : ok(defaultValue);
  }

  if (Array.isArray(value)) {
    return ok(value);
  }

  if (typeof value !== 'string') {
    return fail(`Invalid ${field}: expected an array or JSON array string`);
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return required ? fail(`Missing required field: ${field}`) : ok(defaultValue);
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return ok(parsed);
    }
  } catch {}

  return fail(`Invalid ${field}: expected a JSON array`);
}

function readStringArray(
  value,
  field,
  {
    required = false,
    defaultValue = [],
    maxItems = 100000,
    maxLength = 255,
    allowCommaSeparated = true,
    unique = true
  } = {}
) {
  if (value === undefined || value === null || value === '') {
    return required ? fail(`Missing required field: ${field}`) : ok(defaultValue);
  }

  let items = value;
  if (typeof items === 'string') {
    const trimmed = items.trim();
    if (!trimmed) {
      return required ? fail(`Missing required field: ${field}`) : ok(defaultValue);
    }

    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        items = parsed;
      } else if (allowCommaSeparated) {
        items = trimmed.split(',');
      } else {
        return fail(`Invalid ${field}: expected an array`);
      }
    } catch {
      if (!allowCommaSeparated) return fail(`Invalid ${field}: expected an array`);
      items = trimmed.split(',');
    }
  }

  if (!Array.isArray(items)) {
    return fail(`Invalid ${field}: expected an array`);
  }
  if (items.length > maxItems) {
    return fail(`Invalid ${field}: too many items`);
  }

  const normalized = [];
  for (const item of items) {
    if (typeof item !== 'string') {
      return fail(`Invalid ${field}: expected string values`);
    }
    const trimmed = item.trim();
    if (!trimmed) continue;
    if (trimmed.length > maxLength) {
      return fail(`Invalid ${field}: item too long`);
    }
    normalized.push(trimmed);
  }

  return ok(unique ? [...new Set(normalized)] : normalized);
}

function readJsonObjectOrArray(value, field, { required = false, defaultValue = {} } = {}) {
  if (value === undefined || value === null || value === '') {
    return required ? fail(`Missing required field: ${field}`) : ok(defaultValue);
  }

  if (Array.isArray(value) || isPlainObject(value)) {
    return ok(value);
  }

  if (typeof value !== 'string') {
    return fail(`Invalid ${field}: expected an object, array, or JSON string`);
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return required ? fail(`Missing required field: ${field}`) : ok(defaultValue);
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed) || isPlainObject(parsed)) {
      return ok(parsed);
    }
  } catch {}

  return fail(`Invalid ${field}: expected valid JSON data`);
}

function readTagFilter(value) {
  if (value === undefined || value === null || value === '') return ok('');

  if (Array.isArray(value)) {
    const tags = value
      .filter((item) => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean);
    return ok(tags.length > 0 ? JSON.stringify(tags) : '');
  }

  if (typeof value !== 'string') {
    return fail('Invalid tagFilter: expected a string or array');
  }

  const trimmed = value.trim();
  if (!trimmed) return ok('');
  if (trimmed.length > 10000) return fail('Invalid tagFilter: too long');

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      const tags = parsed
        .filter((item) => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean);
      return ok(tags.length > 0 ? JSON.stringify(tags) : '');
    }
  } catch {}

  return ok(trimmed);
}

function normalizeContactFilter(filter) {
  if (filter === undefined || filter === null) return ok({});
  if (!isPlainObject(filter)) return fail('Invalid filter: expected an object');

  const listId = readId(filter.listId, 'listId', { required: false });
  if (listId.error) return listId;

  let tags = undefined;
  if (filter.tags !== undefined) {
    if (!Array.isArray(filter.tags)) return fail('Invalid filter.tags: expected an array');
    tags = filter.tags
      .filter((item) => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  let tag = undefined;
  if (filter.tag !== undefined) {
    const normalizedTag = readTagFilter(filter.tag);
    if (normalizedTag.error) return normalizedTag;
    tag = normalizedTag.value;
  }

  let emails = undefined;
  if (filter.emails !== undefined) {
    const normalizedEmails = readStringArray(filter.emails, 'filter.emails', {
      required: false,
      defaultValue: [],
      maxItems: 100000,
      maxLength: 320
    });
    if (normalizedEmails.error) return normalizedEmails;

    for (const email of normalizedEmails.value) {
      if (!EMAIL_REGEX.test(email)) {
        return fail(`Invalid filter.emails entry: ${email}`);
      }
    }

    emails = normalizedEmails.value.map((email) => email.toLowerCase());
  }

  const verificationStatus = readString(filter.verificationStatus, 'verificationStatus', {
    required: false,
    maxLength: 64
  });
  if (verificationStatus.error) return verificationStatus;
  if (verificationStatus.value && !VALID_VERIFICATION_FILTERS.has(verificationStatus.value)) {
    return fail('Invalid verificationStatus');
  }

  const status = readString(filter.status, 'status', {
    required: false,
    maxLength: 32
  });
  if (status.error) return status;
  if (status.value && !VALID_CONTACT_STATUSES.has(status.value)) {
    return fail('Invalid status');
  }

  const search = readString(filter.search, 'search', {
    required: false,
    maxLength: 200
  });
  if (search.error) return search;

  return ok({
    ...(listId.value ? { listId: listId.value } : {}),
    ...(tags !== undefined ? { tags } : {}),
    ...(tag !== undefined ? { tag } : {}),
    ...(emails !== undefined ? { emails } : {}),
    ...(verificationStatus.value ? { verificationStatus: verificationStatus.value } : {}),
    ...(status.value ? { status: status.value } : {}),
    ...(search.value ? { search: search.value } : {})
  });
}

function validateContactInput(input, { requireId = false } = {}) {
  if (!isPlainObject(input)) return fail('Invalid contact: expected an object');

  const id = readId(input.id, 'id', { required: requireId });
  if (id.error) return id;

  const email = readRequiredEmail(input.email, 'email');
  if (email.error) return email;

  const firstName = readString(input.firstName, 'firstName', { required: false, maxLength: 100 });
  if (firstName.error) return firstName;

  const lastName = readString(input.lastName, 'lastName', { required: false, maxLength: 100 });
  if (lastName.error) return lastName;

  const company = readString(input.company, 'company', { required: false, maxLength: 100 });
  if (company.error) return company;

  const phone = readString(input.phone, 'phone', { required: false, maxLength: 50 });
  if (phone.error) return phone;

  const customField1 = readString(input.customField1, 'customField1', { required: false, maxLength: 500 });
  if (customField1.error) return customField1;

  const customField2 = readString(input.customField2, 'customField2', { required: false, maxLength: 500 });
  if (customField2.error) return customField2;

  const listId = readId(input.listId, 'listId', { required: false });
  if (listId.error) return listId;

  const tags = readStringArray(input.tags, 'tags', { required: false, defaultValue: [], maxItems: 500, maxLength: 255 });
  if (tags.error) return tags;

  const status = readString(input.status, 'status', { required: false, maxLength: 32 });
  if (status.error) return status;
  if (status.value && !VALID_CONTACT_STATUSES.has(status.value)) {
    return fail('Invalid status');
  }

  const verificationStatus = readString(input.verificationStatus, 'verificationStatus', { required: false, maxLength: 64 });
  if (verificationStatus.error) return verificationStatus;
  if (verificationStatus.value && !VALID_CONTACT_VERIFICATION_STATUSES.has(verificationStatus.value)) {
    return fail('Invalid verificationStatus');
  }

  const verificationScore = readInteger(input.verificationScore, 'verificationScore', {
    min: 0,
    max: 100,
    defaultValue: 0
  });
  if (verificationScore.error) return verificationScore;

  const verificationDetails = readJsonObjectOrArray(input.verificationDetails, 'verificationDetails', {
    required: false,
    defaultValue: {}
  });
  if (verificationDetails.error) return verificationDetails;
  if (Array.isArray(verificationDetails.value)) {
    return fail('Invalid verificationDetails: expected an object');
  }

  return ok({
    ...input,
    ...(id.value ? { id: id.value } : {}),
    email: email.value.toLowerCase(),
    firstName: firstName.value,
    lastName: lastName.value,
    company: company.value,
    phone: phone.value,
    customField1: customField1.value,
    customField2: customField2.value,
    listId: listId.value,
    tags: tags.value,
    status: status.value || 'active',
    verificationStatus: verificationStatus.value || '',
    verificationScore: verificationScore.value,
    verificationDetails: verificationDetails.value
  });
}

function validateBulkContactsInput(contacts) {
  if (!Array.isArray(contacts)) return fail('Invalid contacts: expected an array');
  if (contacts.length === 0) return fail('Invalid contacts: expected at least one contact');
  if (contacts.length > 100000) return fail('Invalid contacts: too many contacts');

  const normalized = [];
  for (const contact of contacts) {
    if (!isPlainObject(contact)) return fail('Invalid contact in bulk request');

    const email = readCoercibleString(contact.email, 'contact.email', { required: false, maxLength: 320 });
    if (email.error) return email;

    const firstName = readCoercibleString(contact.firstName, 'contact.firstName', { required: false, maxLength: 100 });
    if (firstName.error) return firstName;

    const lastName = readCoercibleString(contact.lastName, 'contact.lastName', { required: false, maxLength: 100 });
    if (lastName.error) return lastName;

    const company = readCoercibleString(contact.company, 'contact.company', { required: false, maxLength: 100 });
    if (company.error) return company;

    const phone = readCoercibleString(contact.phone, 'contact.phone', { required: false, maxLength: 50 });
    if (phone.error) return phone;

    const customField1 = readCoercibleString(contact.customField1, 'contact.customField1', { required: false, maxLength: 500 });
    if (customField1.error) return customField1;

    const customField2 = readCoercibleString(contact.customField2, 'contact.customField2', { required: false, maxLength: 500 });
    if (customField2.error) return customField2;

    const listId = readId(contact.listId, 'contact.listId', { required: false });
    if (listId.error) return listId;

    const tags = readStringArray(contact.tags, 'contact.tags', {
      required: false,
      defaultValue: [],
      maxItems: 500,
      maxLength: 255
    });
    if (tags.error) return tags;

    const status = readString(contact.status, 'contact.status', { required: false, maxLength: 32 });
    if (status.error) return status;
    if (status.value && !VALID_CONTACT_STATUSES.has(status.value)) {
      return fail('Invalid contact.status');
    }

    normalized.push({
      ...contact,
      email: email.value.toLowerCase(),
      firstName: firstName.value,
      lastName: lastName.value,
      company: company.value,
      phone: phone.value,
      customField1: customField1.value,
      customField2: customField2.value,
      listId: listId.value,
      tags: tags.value,
      ...(status.value ? { status: status.value } : {})
    });
  }

  return ok(normalized);
}

function validateContactIdList(ids, { field = 'ids', maxItems = 100000 } = {}) {
  return readStringArray(ids, field, { required: true, maxItems, maxLength: 255 });
}

function validateContactQueryParams(params) {
  if (params === undefined || params === null) return ok({});
  if (!isPlainObject(params)) return fail('Invalid params: expected an object');

  const filter = normalizeContactFilter(params);
  if (filter.error) return filter;

  const page = readInteger(params.page, 'page', { min: 1, max: 1000000, defaultValue: 1 });
  if (page.error) return page;

  const perPage = readInteger(params.perPage ?? params.limit, 'perPage', {
    min: 1,
    max: 1000,
    defaultValue: params.limit !== undefined ? undefined : 50
  });
  if (perPage.error) return perPage;

  const sortBy = readString(params.sortBy, 'sortBy', { required: false, maxLength: 64 });
  if (sortBy.error) return sortBy;
  if (sortBy.value && !VALID_CONTACT_SORT_COLUMNS.has(sortBy.value)) {
    return fail('Invalid sortBy');
  }

  const sortOrder = readString(params.sortOrder, 'sortOrder', { required: false, maxLength: 8 });
  if (sortOrder.error) return sortOrder;
  const normalizedSortOrder = sortOrder.value ? sortOrder.value.toUpperCase() : '';
  if (normalizedSortOrder && !['ASC', 'DESC'].includes(normalizedSortOrder)) {
    return fail('Invalid sortOrder');
  }

  return ok({
    ...filter.value,
    ...(page.value ? { page: page.value } : {}),
    ...(perPage.value ? { perPage: perPage.value, limit: perPage.value } : {}),
    ...(sortBy.value ? { sortBy: sortBy.value } : {}),
    ...(normalizedSortOrder ? { sortOrder: normalizedSortOrder } : {})
  });
}

function validateContactVerificationStatus(status) {
  const normalized = readString(status, 'status', { required: true, maxLength: 64, allowEmpty: false });
  if (normalized.error) return normalized;
  if (!VALID_CONTACT_VERIFICATION_STATUSES.has(normalized.value)) {
    return fail('Invalid verification status');
  }
  return ok(normalized.value);
}

function validateTagInput(input) {
  if (!isPlainObject(input)) return fail('Invalid tag: expected an object');

  const id = readId(input.id, 'id', { required: false });
  if (id.error) return id;

  const name = readString(input.name, 'name', { required: true, maxLength: 100, allowEmpty: false });
  if (name.error) return name;

  const color = readColor(input.color, 'color');
  if (color.error) return color;

  return ok({
    ...(id.value ? { id: id.value } : {}),
    name: name.value,
    color: color.value
  });
}

function validateListInput(input, { requireId = false } = {}) {
  if (!isPlainObject(input)) return fail('Invalid list: expected an object');

  const id = readId(input.id, 'id', { required: requireId });
  if (id.error) return id;

  const name = readString(input.name, 'name', { required: true, maxLength: 200, allowEmpty: false });
  if (name.error) return name;

  const description = readString(input.description, 'description', { required: false, maxLength: 1000 });
  if (description.error) return description;

  const color = readColor(input.color, 'color');
  if (color.error) return color;

  return ok({
    ...(id.value ? { id: id.value } : {}),
    name: name.value,
    description: description.value,
    color: color.value
  });
}

function validateBlacklistEntry(input) {
  if (!isPlainObject(input)) return fail('Invalid blacklist entry: expected an object');

  const id = readId(input.id, 'id', { required: false });
  if (id.error) return id;

  const hasEmail = input.email !== undefined && input.email !== null && String(input.email).trim() !== '';
  const hasDomain = input.domain !== undefined && input.domain !== null && String(input.domain).trim() !== '';
  if (!hasEmail && !hasDomain) {
    return fail('Please provide an email or domain');
  }

  const email = hasEmail ? readRequiredEmail(input.email, 'email') : ok('');
  if (email.error) return email;

  const domain = hasDomain ? readDomainString(input.domain, 'domain', { required: true }) : ok('');
  if (domain.error) return domain;

  const reason = readString(input.reason, 'reason', { required: false, maxLength: 500 });
  if (reason.error) return reason;

  const source = readString(input.source, 'source', { required: false, maxLength: 100 });
  if (source.error) return source;

  return ok({
    ...(id.value ? { id: id.value } : {}),
    email: email.value,
    domain: domain.value,
    reason: reason.value,
    source: source.value || 'manual'
  });
}

function validateBlacklistEntries(entries) {
  if (!Array.isArray(entries)) return fail('Invalid blacklist entries: expected an array');
  if (entries.length === 0) return fail('Invalid blacklist entries: expected at least one entry');
  if (entries.length > 100000) return fail('Invalid blacklist entries: too many entries');

  const normalized = [];
  for (const entry of entries) {
    const candidate = typeof entry === 'string'
      ? { email: entry, reason: 'Verification: invalid', source: 'verification' }
      : entry;
    const validated = validateBlacklistEntry(candidate);
    if (validated.error) return validated;
    if (validated.value.domain) {
      return fail('Bulk blacklist entries must use email addresses');
    }
    normalized.push(validated.value);
  }

  return ok(normalized);
}

function validateUnsubscribeInput(input) {
  if (!isPlainObject(input)) return fail('Invalid unsubscribe payload');

  const email = readRequiredEmail(input.email, 'email');
  if (email.error) return email;

  const campaignId = readId(input.campaignId, 'campaignId', { required: false });
  if (campaignId.error) return campaignId;

  const reason = readString(input.reason, 'reason', { required: false, maxLength: 500 });
  if (reason.error) return reason;

  return ok({
    email: email.value.toLowerCase(),
    campaignId: campaignId.value,
    reason: reason.value
  });
}

function validateTemplateCategory(category) {
  return readString(category, 'category', { required: false, maxLength: 100 });
}

function validateTemplateInput(input, { requireId = false } = {}) {
  if (!isPlainObject(input)) return fail('Invalid template: expected an object');

  const id = readId(input.id, 'id', { required: requireId });
  if (id.error) return id;

  const name = readString(input.name, 'name', { required: true, maxLength: 200, allowEmpty: false });
  if (name.error) return name;

  const subject = readString(input.subject, 'subject', { required: false, maxLength: 998 });
  if (subject.error) return subject;

  const content = readString(input.content, 'content', { required: false, trim: false, maxLength: 2000000 });
  if (content.error) return content;

  const category = validateTemplateCategory(input.category);
  if (category.error) return category;

  const blocks = readJsonArray(input.blocks, 'blocks', { required: false, defaultValue: [] });
  if (blocks.error) return blocks;

  return ok({
    ...(id.value ? { id: id.value } : {}),
    name: name.value,
    subject: subject.value,
    content: content.value,
    category: category.value || 'general',
    blocks: blocks.value
  });
}

function validateTemplateBlocksPayload(input) {
  if (!isPlainObject(input)) return fail('Invalid template blocks payload');

  const templateId = readId(input.templateId, 'templateId');
  if (templateId.error) return templateId;

  const blocks = readJsonArray(input.blocks, 'blocks', { required: true });
  if (blocks.error) return blocks;

  return ok({
    templateId: templateId.value,
    blocks: blocks.value
  });
}

function validateTemplateExportPayload(input) {
  if (!isPlainObject(input)) return fail('Invalid template export payload');
  if (!isPlainObject(input.template)) return fail('Invalid template export payload');

  const content = readString(input.template.content, 'template.content', {
    required: false,
    trim: false,
    maxLength: 2000000
  });
  if (content.error) return content;

  const filename = readString(input.filename, 'filename', { required: false, maxLength: 255 });
  if (filename.error) return filename;

  return ok({
    template: {
      ...input.template,
      content: content.value
    },
    filename: filename.value
  });
}

function validateExportContactsInput(input) {
  if (input === undefined || input === null) return ok(null);
  if (!Array.isArray(input)) return fail('Invalid contacts export payload: expected an array');
  if (input.length > 100000) return fail('Invalid contacts export payload: too many contacts');
  if (input.some((item) => !isPlainObject(item))) return fail('Invalid contacts export payload: expected contact objects');
  return ok(input);
}

function validateExportLogsInput(input) {
  if (input === undefined || input === null) return ok([]);
  if (!Array.isArray(input)) return fail('Invalid logs export payload: expected an array');
  if (input.length > 100000) return fail('Invalid logs export payload: too many log entries');
  if (input.some((item) => !isPlainObject(item))) return fail('Invalid logs export payload: expected log objects');
  return ok(input);
}

function validateVerificationResultsExportInput(input) {
  if (input === undefined || input === null) return ok([]);
  if (!Array.isArray(input)) return fail('Invalid verification export payload: expected an array');
  if (input.length > 100000) return fail('Invalid verification export payload: too many results');
  if (input.some((item) => !isPlainObject(item))) return fail('Invalid verification export payload: expected result objects');
  return ok(input);
}

function validateTemplateFileExportPayload(input) {
  if (!isPlainObject(input)) return fail('Invalid template file export payload');

  const data = readString(input.data, 'data', { required: false, trim: false, maxLength: 2000000 });
  if (data.error) return data;

  const filename = readString(input.filename, 'filename', { required: false, maxLength: 255 });
  if (filename.error) return filename;

  return ok({
    data: data.value,
    filename: filename.value
  });
}

function validateImportFilePath(filePath) {
  const validated = readString(filePath, 'filePath', { required: true, maxLength: 4096, allowEmpty: false });
  if (validated.error) return validated;
  if (validated.value.includes('\0')) {
    return fail('Invalid filePath');
  }
  return ok(validated.value);
}

function validateSmtpSettings(input, { requireId = false, requireCredentials = true } = {}) {
  if (!isPlainObject(input)) return fail('Invalid SMTP settings: expected an object');

  const id = readId(input.id, 'id', { required: requireId });
  if (id.error) return id;

  const host = readString(input.host, 'host', { required: true, maxLength: 255, allowEmpty: false });
  if (host.error) return host;

  const port = readInteger(input.port, 'port', { min: 1, max: 65535, defaultValue: 587 });
  if (port.error) return port;

  const username = readString(input.username, 'username', {
    required: requireCredentials,
    maxLength: 320,
    allowEmpty: !requireCredentials
  });
  if (username.error) return username;

  const password = readString(input.password, 'password', {
    required: requireCredentials,
    trim: false,
    maxLength: 4096,
    allowEmpty: !requireCredentials
  });
  if (password.error) return password;

  const name = readString(input.name, 'name', { required: false, maxLength: 200 });
  if (name.error) return name;

  const fromName = readString(input.fromName, 'fromName', { required: false, maxLength: 200 });
  if (fromName.error) return fromName;

  const fromEmail = readOptionalEmail(input.fromEmail, 'fromEmail');
  if (fromEmail.error) return fromEmail;

  const replyTo = readOptionalEmail(input.replyTo, 'replyTo');
  if (replyTo.error) return replyTo;

  const unsubscribeEmail = readOptionalEmail(input.unsubscribeEmail, 'unsubscribeEmail');
  if (unsubscribeEmail.error) return unsubscribeEmail;

  const unsubscribeUrl = readHostLike(input.unsubscribeUrl, 'unsubscribeUrl', { required: false });
  if (unsubscribeUrl.error) return unsubscribeUrl;

  const dailyLimit = readInteger(input.dailyLimit, 'dailyLimit', { min: 1, max: 1000000, defaultValue: 500 });
  if (dailyLimit.error) return dailyLimit;

  const dkimDomain = readHostLike(input.dkimDomain, 'dkimDomain', { required: false });
  if (dkimDomain.error) return dkimDomain;

  const dkimSelector = readString(input.dkimSelector, 'dkimSelector', { required: false, maxLength: 255 });
  if (dkimSelector.error) return dkimSelector;

  const dkimPrivateKey = readString(input.dkimPrivateKey, 'dkimPrivateKey', { required: false, trim: false, maxLength: 20000 });
  if (dkimPrivateKey.error) return dkimPrivateKey;

  const warmUpStartDate = readDateString(input.warmUpStartDate, 'warmUpStartDate', { required: false });
  if (warmUpStartDate.error) return warmUpStartDate;

  return ok({
    ...input,
    ...(id.value ? { id: id.value } : {}),
    name: name.value,
    host: host.value,
    port: port.value,
    secure: readBoolean(input.secure, port.value === 465),
    username: username.value,
    password: password.value,
    fromName: fromName.value,
    fromEmail: fromEmail.value,
    replyTo: replyTo.value,
    unsubscribeEmail: unsubscribeEmail.value,
    unsubscribeUrl: unsubscribeUrl.value,
    dailyLimit: dailyLimit.value,
    isDefault: readBoolean(input.isDefault, false),
    isActive: readBoolean(input.isActive, true),
    warmUpEnabled: readBoolean(input.warmUpEnabled, false),
    warmUpStartDate: warmUpStartDate.value,
    warmUpSchedule: isPlainObject(input.warmUpSchedule) || Array.isArray(input.warmUpSchedule) ? input.warmUpSchedule : {},
    rejectUnauthorized: readBoolean(input.rejectUnauthorized, true),
    dkimDomain: dkimDomain.value,
    dkimSelector: dkimSelector.value,
    dkimPrivateKey: dkimPrivateKey.value
  });
}

function validateCampaign(input, { requireId = false } = {}) {
  if (!isPlainObject(input)) return fail('Invalid campaign: expected an object');

  const id = readId(input.id, 'id', { required: requireId });
  if (id.error) return id;

  const name = readString(input.name, 'name', { required: true, maxLength: 200, allowEmpty: false });
  if (name.error) return name;

  const subject = readString(input.subject, 'subject', { required: true, maxLength: 998, allowEmpty: false });
  if (subject.error) return subject;

  const content = readString(input.content, 'content', { required: false, trim: false, maxLength: 2000000 });
  if (content.error) return content;

  const subjectB = readString(input.subjectB, 'subjectB', { required: false, maxLength: 998 });
  if (subjectB.error) return subjectB;

  const contentB = readString(input.contentB, 'contentB', { required: false, trim: false, maxLength: 2000000 });
  if (contentB.error) return contentB;

  const listId = readId(input.listId, 'listId', { required: false });
  if (listId.error) return listId;

  const smtpAccountId = readId(input.smtpAccountId, 'smtpAccountId', { required: false });
  if (smtpAccountId.error) return smtpAccountId;

  const tagFilter = readTagFilter(input.tagFilter);
  if (tagFilter.error) return tagFilter;

  const verificationFilter = readString(input.verificationFilter, 'verificationFilter', { required: false, maxLength: 64 });
  if (verificationFilter.error) return verificationFilter;
  if (verificationFilter.value && !VALID_VERIFICATION_FILTERS.has(verificationFilter.value)) {
    return fail('Invalid verificationFilter');
  }

  const batchSize = readInteger(input.batchSize, 'batchSize', { min: 1, max: 100000, defaultValue: 50 });
  if (batchSize.error) return batchSize;

  const delayMinutes = readInteger(input.delayMinutes, 'delayMinutes', { min: 0, max: 10080, defaultValue: 10 });
  if (delayMinutes.error) return delayMinutes;

  const delayBetweenEmails = readInteger(input.delayBetweenEmails, 'delayBetweenEmails', {
    min: 0,
    max: 86400000,
    defaultValue: 2000
  });
  if (delayBetweenEmails.error) return delayBetweenEmails;

  const maxRetries = readInteger(input.maxRetries, 'maxRetries', { min: 0, max: 25, defaultValue: 3 });
  if (maxRetries.error) return maxRetries;

  const abTestPercent = readInteger(input.abTestPercent, 'abTestPercent', { min: 1, max: 99, defaultValue: 10 });
  if (abTestPercent.error) return abTestPercent;

  const totalEmails = readInteger(input.totalEmails, 'totalEmails', { min: 0, max: 10000000, defaultValue: 0 });
  if (totalEmails.error) return totalEmails;

  const sentEmails = readInteger(input.sentEmails, 'sentEmails', { min: 0, max: 10000000, defaultValue: 0 });
  if (sentEmails.error) return sentEmails;

  const failedEmails = readInteger(input.failedEmails, 'failedEmails', { min: 0, max: 10000000, defaultValue: 0 });
  if (failedEmails.error) return failedEmails;

  const bouncedEmails = readInteger(input.bouncedEmails, 'bouncedEmails', { min: 0, max: 10000000, defaultValue: 0 });
  if (bouncedEmails.error) return bouncedEmails;

  const scheduledAt = readDateString(input.scheduledAt, 'scheduledAt', { required: false });
  if (scheduledAt.error) return scheduledAt;

  const startedAt = readDateString(input.startedAt, 'startedAt', { required: false });
  if (startedAt.error) return startedAt;

  const completedAt = readDateString(input.completedAt, 'completedAt', { required: false });
  if (completedAt.error) return completedAt;

  const status = readString(input.status, 'status', { required: false, maxLength: 32 });
  if (status.error) return status;
  if (status.value && !VALID_CAMPAIGN_STATUSES.has(status.value)) {
    return fail('Invalid status');
  }

  const isABTest = readBoolean(input.isABTest, false);
  if (isABTest && !subjectB.value) {
    return fail('Variant B subject is required for A/B tests');
  }

  let manualEmails = '';
  if (input.manualEmails !== undefined && input.manualEmails !== null && input.manualEmails !== '') {
    const rawManualEmails = readString(input.manualEmails, 'manualEmails', { trim: false, maxLength: 500000 });
    if (rawManualEmails.error) return rawManualEmails;

    const emails = rawManualEmails.value
      .split(/[\n,;]/)
      .map((item) => item.trim())
      .filter(Boolean);

    if (emails.length === 0) {
      return fail('Invalid manualEmails: no email addresses found');
    }
    if (emails.length > 100000) {
      return fail('Invalid manualEmails: too many email addresses');
    }
    for (const email of emails) {
      if (!EMAIL_REGEX.test(email)) {
        return fail(`Invalid manualEmails entry: ${email}`);
      }
    }

    manualEmails = emails.join(',');
  }

  return ok({
    ...input,
    ...(id.value ? { id: id.value } : {}),
    name: name.value,
    subject: subject.value,
    content: content.value,
    subjectB: subjectB.value,
    contentB: contentB.value,
    isABTest,
    abTestPercent: abTestPercent.value,
    status: status.value || 'draft',
    listId: listId.value,
    tagFilter: tagFilter.value,
    verificationFilter: verificationFilter.value,
    smtpAccountId: smtpAccountId.value,
    batchSize: batchSize.value,
    delayMinutes: delayMinutes.value,
    delayBetweenEmails: delayBetweenEmails.value,
    maxRetries: maxRetries.value,
    totalEmails: totalEmails.value,
    sentEmails: sentEmails.value,
    failedEmails: failedEmails.value,
    bouncedEmails: bouncedEmails.value,
    scheduledAt: scheduledAt.value,
    startedAt: startedAt.value,
    completedAt: completedAt.value,
    ...(manualEmails ? { manualEmails } : {})
  });
}

function validateCampaignSchedule(input) {
  if (!isPlainObject(input)) return fail('Invalid schedule request');

  const campaignId = readId(input.campaignId, 'campaignId');
  if (campaignId.error) return campaignId;

  const scheduledAt = readDateString(input.scheduledAt, 'scheduledAt', { required: true });
  if (scheduledAt.error) return scheduledAt;

  return ok({ campaignId: campaignId.value, scheduledAt: scheduledAt.value });
}

function validateContactList(contacts) {
  if (!Array.isArray(contacts)) return fail('Invalid contacts: expected an array');
  if (contacts.length === 0) return fail('No contacts to send to');
  if (contacts.length > 100000) return fail('Too many contacts to send in a single request');

  for (const contact of contacts) {
    if (!isPlainObject(contact)) return fail('Invalid contact in send request');
    const email = readString(contact.email, 'contact.email', { required: true, maxLength: 320, allowEmpty: false });
    if (email.error) return email;
    if (!email.value.includes('@')) return fail(`Invalid contact email: ${email.value}`);
  }

  return ok(contacts);
}

function validateEmailSendPayload(input) {
  if (!isPlainObject(input)) return fail('Invalid email send request');

  const hasLegacyFields = input.campaign !== undefined || input.contacts !== undefined || input.settings !== undefined;
  if (hasLegacyFields) {
    if (!input.campaign || !input.contacts || !input.settings) {
      return fail('Invalid email send request: expected campaign, contacts, and settings');
    }

    const campaign = validateCampaign(input.campaign, { requireId: true });
    if (campaign.error) return campaign;

    const contacts = validateContactList(input.contacts);
    if (contacts.error) return contacts;

    const settings = validateSmtpSettings(input.settings, { requireId: false, requireCredentials: false });
    if (settings.error) return settings;

    return ok({
      ...input,
      campaign: campaign.value,
      contacts: contacts.value,
      settings: settings.value
    });
  }

  const campaignId = readId(input.campaignId, 'campaignId');
  if (campaignId.error) return campaignId;

  const filter = normalizeContactFilter(input.filter);
  if (filter.error) return filter;

  const smtpAccountId = readId(input.smtpAccountId, 'smtpAccountId', { required: false });
  if (smtpAccountId.error) return smtpAccountId;

  return ok({
    campaignId: campaignId.value,
    filter: filter.value,
    ...(smtpAccountId.value ? { smtpAccountId: smtpAccountId.value } : {})
  });
}

function validateEmailTestPayload(input) {
  if (!isPlainObject(input)) return fail('Invalid email test payload');

  const settings = validateSmtpSettings(input.settings, { requireId: false, requireCredentials: true });
  if (settings.error) return settings;

  const toEmail = readRequiredEmail(input.toEmail, 'toEmail');
  if (toEmail.error) return toEmail;

  const subject = readString(input.subject, 'subject', { required: false, maxLength: 998 });
  if (subject.error) return subject;

  const content = readString(input.content, 'content', { required: false, trim: false, maxLength: 2000000 });
  if (content.error) return content;

  return ok({
    settings: settings.value,
    toEmail: toEmail.value,
    subject: subject.value,
    content: content.value
  });
}

function validateVerifyEmailInput(email) {
  return readRequiredEmail(email, 'email');
}

function validateVerifyBulkInput(emails) {
  if (!Array.isArray(emails)) return fail('Please provide at least one email address');
  if (emails.length === 0) return fail('Please provide at least one email address');
  if (emails.length > 100000) return fail('Too many email addresses to verify in a single request');

  const normalized = [];
  for (const email of emails) {
    if (typeof email !== 'string') return fail('Invalid verification request: emails must be strings');
    const trimmed = email.trim();
    if (trimmed) normalized.push(trimmed);
  }

  if (normalized.length === 0) return fail('Please provide at least one email address');
  return ok(normalized);
}

function validateAppSettings(input) {
  if (!isPlainObject(input)) return fail('Invalid settings payload');

  const nextSettings = {};

  if (input.theme !== undefined) {
    const theme = readString(input.theme, 'theme', { required: true, maxLength: 20, allowEmpty: false });
    if (theme.error) return theme;
    if (!VALID_THEMES.has(theme.value)) return fail('Invalid theme');
    nextSettings.theme = theme.value;
  }

  if (input.defaultBatchSize !== undefined) {
    const value = readInteger(input.defaultBatchSize, 'defaultBatchSize', { min: 1, max: 100000 });
    if (value.error) return value;
    nextSettings.defaultBatchSize = value.value;
  }

  if (input.defaultDelayMinutes !== undefined) {
    const value = readInteger(input.defaultDelayMinutes, 'defaultDelayMinutes', { min: 0, max: 10080 });
    if (value.error) return value;
    nextSettings.defaultDelayMinutes = value.value;
  }

  if (input.maxRetriesPerEmail !== undefined) {
    const value = readInteger(input.maxRetriesPerEmail, 'maxRetriesPerEmail', { min: 0, max: 25 });
    if (value.error) return value;
    nextSettings.maxRetriesPerEmail = value.value;
  }

  if (Object.keys(nextSettings).length === 0) {
    return fail('No supported application settings provided');
  }

  return ok(nextSettings);
}

function validateWarmupSettings(input) {
  if (!isPlainObject(input)) return fail('Invalid warmup settings');

  const startVolume = readInteger(input.startVolume, 'startVolume', { min: 1, max: 100000, defaultValue: 20 });
  if (startVolume.error) return startVolume;

  const dailyIncrease = readInteger(input.dailyIncrease, 'dailyIncrease', { min: 0, max: 100000, defaultValue: 10 });
  if (dailyIncrease.error) return dailyIncrease;

  const maxVolume = readInteger(input.maxVolume, 'maxVolume', { min: 1, max: 1000000, defaultValue: 500 });
  if (maxVolume.error) return maxVolume;

  const warmupDays = readInteger(input.warmupDays, 'warmupDays', { min: 1, max: 365, defaultValue: 14 });
  if (warmupDays.error) return warmupDays;

  return ok({
    enabled: readBoolean(input.enabled, false),
    startVolume: startVolume.value,
    dailyIncrease: dailyIncrease.value,
    maxVolume: maxVolume.value,
    warmupDays: warmupDays.value
  });
}

function validateDeliverabilitySettings(input) {
  if (!isPlainObject(input)) return fail('Invalid deliverability settings');

  const trackingDomain = readHostLike(input.trackingDomain, 'trackingDomain', { required: false });
  if (trackingDomain.error) return trackingDomain;

  const sendingMode = readString(input.sendingMode, 'sendingMode', { required: false, maxLength: 32 });
  if (sendingMode.error) return sendingMode;

  const companyAddress = readString(input.companyAddress, 'companyAddress', { required: false, maxLength: 500 });
  if (companyAddress.error) return companyAddress;

  return ok({
    trackingDomain: trackingDomain.value,
    dkimConfigured: readBoolean(input.dkimConfigured, false),
    spfConfigured: readBoolean(input.spfConfigured, false),
    dmarcConfigured: readBoolean(input.dmarcConfigured, false),
    sendingMode: sendingMode.value || 'bulk',
    companyAddress: companyAddress.value || ''
  });
}

function validateDomainInput(domain) {
  const normalized = readHostLike(domain, 'domain', { required: true });
  if (normalized.error) return normalized;
  return ok(normalized.value);
}

function validateAiSettings(input) {
  if (!isPlainObject(input)) return fail('Invalid AI settings');

  const nextSettings = {};

  if (input.apiKey !== undefined) {
    const apiKey = readString(input.apiKey, 'apiKey', { required: false, maxLength: 4096 });
    if (apiKey.error) return apiKey;
    nextSettings.apiKey = apiKey.value;
  }

  if (input.model !== undefined) {
    const model = readString(input.model, 'model', { required: true, maxLength: 200, allowEmpty: false });
    if (model.error) return model;
    nextSettings.model = model.value;
  }

  if (Object.keys(nextSettings).length === 0) {
    return fail('No supported AI settings provided');
  }

  return ok(nextSettings);
}

function validateAiImproveSubjectPayload(input) {
  if (!isPlainObject(input)) return fail('Invalid AI request');

  const subject = readString(input.subject, 'subject', { required: true, maxLength: 998, allowEmpty: false });
  if (subject.error) return subject;

  const context = readString(input.context, 'context', { required: false, maxLength: 4000 });
  if (context.error) return context;

  return ok({ subject: subject.value, context: context.value });
}

function validateSubjectContentPayload(input, { requireOne = false } = {}) {
  if (!isPlainObject(input)) return fail('Invalid content payload');

  const subject = readString(input.subject, 'subject', { required: false, maxLength: 998 });
  if (subject.error) return subject;

  const content = readString(input.content, 'content', { required: false, trim: false, maxLength: 2000000 });
  if (content.error) return content;

  if (requireOne && !subject.value && !content.value) {
    return fail('Please provide a subject or content');
  }

  return ok({ subject: subject.value, content: content.value });
}

function validateAiGeneratePayload(input) {
  if (!isPlainObject(input)) return fail('Invalid AI generation request');

  const prompt = readString(input.prompt, 'prompt', { required: true, maxLength: 20000, allowEmpty: false });
  if (prompt.error) return prompt;

  const tone = readString(input.tone, 'tone', { required: false, maxLength: 50 });
  if (tone.error) return tone;

  const objective = readString(input.objective, 'objective', { required: false, maxLength: 400 });
  if (objective.error) return objective;

  const audience = readString(input.audience, 'audience', { required: false, maxLength: 400 });
  if (audience.error) return audience;

  const cta = readString(input.cta, 'cta', { required: false, maxLength: 300 });
  if (cta.error) return cta;

  const offer = readString(input.offer, 'offer', { required: false, maxLength: 400 });
  if (offer.error) return offer;

  const brandVoice = readString(input.brandVoice, 'brandVoice', { required: false, maxLength: 200 });
  if (brandVoice.error) return brandVoice;

  const format = readString(input.format, 'format', { required: false, maxLength: 100 });
  if (format.error) return format;

  const keywords = readStringArray(input.keywords, 'keywords', { required: false, defaultValue: [], maxItems: 12, maxLength: 60 });
  if (keywords.error) return keywords;

  return ok({
    prompt: prompt.value,
    tone: tone.value || 'professional',
    objective: objective.value,
    audience: audience.value,
    cta: cta.value,
    offer: offer.value,
    brandVoice: brandVoice.value,
    format: format.value || 'campaign',
    keywords: keywords.value,
    includePersonalization: readBoolean(input.includePersonalization, true)
  });
}

function validateSpamAnalysisPayload(input) {
  return validateSubjectContentPayload(input);
}

function validateSpamAutoFixPayload(input) {
  const normalized = validateSubjectContentPayload(input);
  if (normalized.error) return normalized;

  if (input.issues !== undefined && !Array.isArray(input.issues)) {
    return fail('Invalid issues: expected an array');
  }

  return ok({
    ...normalized.value,
    issues: Array.isArray(input.issues) ? input.issues : []
  });
}

function validateSuggestionWord(word) {
  return readString(word, 'word', { required: true, maxLength: 200, allowEmpty: false });
}

function validateSpamReplacementItem(input, { requireId = false } = {}) {
  if (!isPlainObject(input)) return fail('Invalid spam replacement');

  const id = readId(input.id, 'id', { required: requireId });
  if (id.error) return id;

  const spamWord = readString(input.spamWord, 'spamWord', { required: true, maxLength: 200, allowEmpty: false });
  if (spamWord.error) return spamWord;

  const replacement = readString(input.replacement, 'replacement', { required: false, maxLength: 200 });
  if (replacement.error) return replacement;

  const category = readString(input.category, 'category', { required: false, maxLength: 100 });
  if (category.error) return category;

  return ok({
    ...(id.value ? { id: id.value } : {}),
    spamWord: spamWord.value,
    replacement: replacement.value,
    category: category.value || 'general'
  });
}

function validateTrackingEvent(input) {
  if (!isPlainObject(input)) return fail('Invalid tracking event');

  const id = readId(input.id, 'id', { required: false });
  if (id.error) return id;

  const campaignId = readId(input.campaignId, 'campaignId');
  if (campaignId.error) return campaignId;

  const contactId = readId(input.contactId, 'contactId', { required: false });
  if (contactId.error) return contactId;

  const email = readOptionalEmail(input.email, 'email');
  if (email.error) return email;

  const type = readString(input.type, 'type', { required: true, maxLength: 32, allowEmpty: false });
  if (type.error) return type;

  const link = readString(input.link, 'link', { required: false, maxLength: 2048 });
  if (link.error) return link;

  const userAgent = readString(input.userAgent, 'userAgent', { required: false, maxLength: 1024 });
  if (userAgent.error) return userAgent;

  const ipAddress = readString(input.ipAddress, 'ipAddress', { required: false, maxLength: 128 });
  if (ipAddress.error) return ipAddress;

  const client = readString(input.client, 'client', { required: false, maxLength: 200 });
  if (client.error) return client;

  const device = readString(input.device, 'device', { required: false, maxLength: 200 });
  if (device.error) return device;

  const os = readString(input.os, 'os', { required: false, maxLength: 200 });
  if (os.error) return os;

  const country = readString(input.country, 'country', { required: false, maxLength: 200 });
  if (country.error) return country;

  const region = readString(input.region, 'region', { required: false, maxLength: 200 });
  if (region.error) return region;

  return ok({
    ...(id.value ? { id: id.value } : {}),
    campaignId: campaignId.value,
    contactId: contactId.value,
    email: email.value,
    type: type.value,
    link: link.value,
    userAgent: userAgent.value,
    ipAddress: ipAddress.value,
    client: client.value,
    device: device.value,
    os: os.value,
    isBot: readBoolean(input.isBot, false),
    country: country.value,
    region: region.value
  });
}

function validateAutoBackupConfig(input) {
  if (!isPlainObject(input)) return fail('Invalid auto-backup configuration');

  const intervalHours = readInteger(input.intervalHours, 'intervalHours', { min: 1, max: 8760, defaultValue: 24 });
  if (intervalHours.error) return intervalHours;

  return ok({
    enabled: readBoolean(input.enabled, false),
    intervalHours: intervalHours.value
  });
}

function validateWarmupSchedule(input, { requireId = false, requireSmtpAccountId = false } = {}) {
  if (!isPlainObject(input)) return fail('Invalid warmup schedule');

  const id = readId(input.id, 'id', { required: requireId });
  if (id.error) return id;

  const smtpAccountId = readId(input.smtpAccountId, 'smtpAccountId', { required: requireSmtpAccountId });
  if (smtpAccountId.error) return smtpAccountId;

  const schedule = readJsonObjectOrArray(input.schedule, 'schedule', { defaultValue: {} });
  if (schedule.error) return schedule;

  const normalizedSchedule = schedule.value;
  if (Array.isArray(normalizedSchedule) && normalizedSchedule.length > 366) {
    return fail('Invalid schedule: too many warmup entries');
  }

  return ok({
    ...(id.value ? { id: id.value } : {}),
    ...(smtpAccountId.value ? { smtpAccountId: smtpAccountId.value } : {}),
    schedule: normalizedSchedule,
    isActive: readBoolean(input.isActive, true)
  });
}

function validateWarmupAutoGenerate(input) {
  if (!isPlainObject(input)) return fail('Invalid warmup generation request');

  const smtpAccountId = readId(input.smtpAccountId, 'smtpAccountId');
  if (smtpAccountId.error) return smtpAccountId;

  const startVolume = readInteger(input.startVolume, 'startVolume', { min: 1, max: 100000, defaultValue: 10 });
  if (startVolume.error) return startVolume;

  const targetVolume = readInteger(input.targetVolume, 'targetVolume', { min: 1, max: 1000000, defaultValue: 500 });
  if (targetVolume.error) return targetVolume;

  const daysToTarget = readInteger(input.daysToTarget, 'daysToTarget', { min: 1, max: 365, defaultValue: 14 });
  if (daysToTarget.error) return daysToTarget;

  if (targetVolume.value < startVolume.value) {
    return fail('Invalid targetVolume: must be at least startVolume');
  }

  return ok({
    smtpAccountId: smtpAccountId.value,
    startVolume: startVolume.value,
    targetVolume: targetVolume.value,
    daysToTarget: daysToTarget.value
  });
}

function validateSegmentFilters(filters) {
  if (filters === undefined || filters === null || filters === '') return ok({});

  let parsed = filters;
  if (typeof filters === 'string') {
    try {
      parsed = JSON.parse(filters);
    } catch {
      return fail('Invalid segment filters: expected valid JSON');
    }
  }

  if (!isPlainObject(parsed)) {
    return fail('Invalid segment filters: expected an object');
  }

  const normalized = { ...parsed };

  if (parsed.listId !== undefined) {
    const listId = readId(parsed.listId, 'listId', { required: false });
    if (listId.error) return listId;
    normalized.listId = listId.value;
  }

  if (parsed.verificationStatus !== undefined) {
    const verificationStatus = readString(parsed.verificationStatus, 'verificationStatus', { required: false, maxLength: 64 });
    if (verificationStatus.error) return verificationStatus;
    if (verificationStatus.value && !VALID_VERIFICATION_FILTERS.has(verificationStatus.value)) {
      return fail('Invalid verificationStatus');
    }
    normalized.verificationStatus = verificationStatus.value;
  }

  if (parsed.tag !== undefined) {
    const tag = readString(parsed.tag, 'tag', { required: false, maxLength: 255 });
    if (tag.error) return tag;
    normalized.tag = tag.value;
  }

  if (parsed.hasCompany !== undefined) {
    normalized.hasCompany = readBoolean(parsed.hasCompany, false);
  }

  if (parsed.minBounce !== undefined) {
    const minBounce = readInteger(parsed.minBounce, 'minBounce', { min: 0, max: 1000000 });
    if (minBounce.error) return minBounce;
    normalized.minBounce = minBounce.value;
  }

  if (parsed.maxBounce !== undefined) {
    const maxBounce = readInteger(parsed.maxBounce, 'maxBounce', { min: 0, max: 1000000 });
    if (maxBounce.error) return maxBounce;
    normalized.maxBounce = maxBounce.value;
  }

  if (normalized.minBounce !== undefined && normalized.maxBounce !== undefined && normalized.maxBounce < normalized.minBounce) {
    return fail('Invalid maxBounce: must be greater than or equal to minBounce');
  }

  if (parsed.addedAfter !== undefined) {
    const addedAfter = readDateFilterString(parsed.addedAfter, 'addedAfter');
    if (addedAfter.error) return addedAfter;
    normalized.addedAfter = addedAfter.value;
  }

  if (parsed.addedBefore !== undefined) {
    const addedBefore = readDateFilterString(parsed.addedBefore, 'addedBefore');
    if (addedBefore.error) return addedBefore;
    normalized.addedBefore = addedBefore.value;
  }

  return ok(normalized);
}

function validateSegment(input, { requireId = false } = {}) {
  if (!isPlainObject(input)) return fail('Invalid segment');

  const id = readId(input.id, 'id', { required: requireId });
  if (id.error) return id;

  const name = readString(input.name, 'name', { required: true, maxLength: 200, allowEmpty: false });
  if (name.error) return name;

  const filters = validateSegmentFilters(input.filters);
  if (filters.error) return filters;

  const contactCount = readInteger(input.contactCount, 'contactCount', { min: 0, max: 10000000, defaultValue: 0 });
  if (contactCount.error) return contactCount;

  return ok({
    ...(id.value ? { id: id.value } : {}),
    name: name.value,
    filters: filters.value,
    contactCount: contactCount.value
  });
}

function validateRetryClearInput(campaignId) {
  return readId(campaignId, 'campaignId', { required: false });
}

function validateSearchQuery(query) {
  const normalized = readString(query, 'query', { required: false, maxLength: 200 });
  if (normalized.error) return normalized;
  return ok(normalized.value);
}

module.exports = {
  validateAiGeneratePayload,
  validateAiImproveSubjectPayload,
  validateAiSettings,
  validateAppSettings,
  validateAutoBackupConfig,
  validateBlacklistEntries,
  validateBlacklistEntry,
  validateCampaign,
  validateCampaignSchedule,
  validateBulkContactsInput,
  validateContactIdList,
  validateContactInput,
  validateContactQueryParams,
  validateContactVerificationStatus,
  validateDomainInput,
  validateDeliverabilitySettings,
  validateEmailSendPayload,
  validateEmailTestPayload,
  validateExportContactsInput,
  validateExportLogsInput,
  validateId: readId,
  validateImportFilePath,
  validateListInput,
  validateRetryClearInput,
  validateSearchQuery,
  validateSegment,
  validateSegmentFilters,
  validateSpamAnalysisPayload,
  validateSpamAutoFixPayload,
  validateSpamReplacementItem,
  validateSmtpSettings,
  validateSubjectContentPayload,
  validateSuggestionWord,
  validateTagInput,
  validateTemplateBlocksPayload,
  validateTemplateCategory,
  validateTemplateExportPayload,
  validateTemplateFileExportPayload,
  validateTemplateInput,
  validateTrackingEvent,
  validateUnsubscribeInput,
  validateVerifyBulkInput,
  validateVerifyEmailInput,
  validateVerificationResultsExportInput,
  validateWarmupAutoGenerate,
  validateWarmupSchedule,
  validateWarmupSettings
};
