const { v4: uuidv4 } = require('uuid');

function getAllSignupForms(db) {
  return db._all('SELECT * FROM signup_forms ORDER BY createdAt DESC');
}

function getSignupForm(db, id) {
  return db._get('SELECT * FROM signup_forms WHERE id = ?', [id]);
}

function addSignupForm(db, form) {
  const id = form.id || uuidv4();
  db._run(
    `INSERT INTO signup_forms (id, name, listId, fields, style, successMessage, redirectUrl, isActive, doubleOptin, confirmationSubject, confirmationTemplate)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      form.name,
      form.listId,
      JSON.stringify(form.fields || []),
      JSON.stringify(form.style || {}),
      form.successMessage || 'Thank you for subscribing!',
      form.redirectUrl || '',
      form.isActive !== false ? 1 : 0,
      form.doubleOptin ? 1 : 0,
      form.confirmationSubject || 'Please confirm your subscription',
      form.confirmationTemplate || 'Click the link below to confirm your subscription: {{confirmLink}}'
    ]
  );
  return id;
}

function updateSignupForm(db, form) {
  db._run(
    `UPDATE signup_forms SET name=?, listId=?, fields=?, style=?, successMessage=?, redirectUrl=?, isActive=?, doubleOptin=?, confirmationSubject=?, confirmationTemplate=?, updatedAt=datetime('now') WHERE id=?`,
    [
      form.name,
      form.listId,
      JSON.stringify(form.fields || []),
      JSON.stringify(form.style || {}),
      form.successMessage || 'Thank you for subscribing!',
      form.redirectUrl || '',
      form.isActive !== false ? 1 : 0,
      form.doubleOptin ? 1 : 0,
      form.confirmationSubject || 'Please confirm your subscription',
      form.confirmationTemplate || 'Click the link below to confirm your subscription: {{confirmLink}}',
      form.id
    ]
  );
}

function deleteSignupForm(db, id) {
  db._run('DELETE FROM signup_forms WHERE id = ?', [id]);
  db._run('DELETE FROM form_submissions WHERE formId = ?', [id]);
}

function getFormSubmissions(db, formId) {
  return db._all('SELECT * FROM form_submissions WHERE formId = ? ORDER BY createdAt DESC', [formId]);
}

function addFormSubmission(db, submission) {
  const id = submission.id || uuidv4();
  db._run(
    `INSERT INTO form_submissions (id, formId, contactId, email, data, status, confirmedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      submission.formId,
      submission.contactId || '',
      submission.email,
      JSON.stringify(submission.data || {}),
      submission.status || 'pending',
      submission.confirmedAt || ''
    ]
  );
  return id;
}

function confirmFormSubmission(db, id) {
  db._run("UPDATE form_submissions SET status = 'confirmed', confirmedAt = datetime('now') WHERE id = ?", [id]);
}

function getAllABTests(db) {
  return db._all('SELECT * FROM ab_tests ORDER BY createdAt DESC');
}

function getABTest(db, id) {
  return db._get('SELECT * FROM ab_tests WHERE id = ?', [id]);
}

function addABTest(db, test) {
  const id = test.id || uuidv4();
  db._run(
    `INSERT INTO ab_tests (id, name, campaignId, variants, status, winner, confidence)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      test.name,
      test.campaignId,
      JSON.stringify(test.variants || []),
      test.status || 'draft',
      test.winner || '',
      test.confidence || 0
    ]
  );
  return id;
}

function updateABTest(db, test) {
  db._run(
    `UPDATE ab_tests SET name=?, campaignId=?, variants=?, status=?, winner=?, confidence=?, updatedAt=datetime('now') WHERE id=?`,
    [
      test.name,
      test.campaignId,
      JSON.stringify(test.variants || []),
      test.status || 'draft',
      test.winner || '',
      test.confidence || 0,
      test.id
    ]
  );
}

function deleteABTest(db, id) {
  db._run('DELETE FROM ab_tests WHERE id = ?', [id]);
}

function calculateABSignificance(db, campaignId) {
  const logs = db.getCampaignLogs(campaignId);
  const variantA = logs.filter((log) => log.variant === 'A');
  const variantB = logs.filter((log) => log.variant === 'B');

  const sentA = variantA.filter((log) => log.status === 'sent').length;
  const openedA = variantA.filter((log) => log.openedAt).length;
  const sentB = variantB.filter((log) => log.status === 'sent').length;
  const openedB = variantB.filter((log) => log.openedAt).length;

  if (sentA === 0 || sentB === 0) {
    return { winner: '', confidence: 0, sampleSizeA: sentA, sampleSizeB: sentB };
  }

  const rateA = openedA / sentA;
  const rateB = openedB / sentB;
  const pooledRate = (openedA + openedB) / (sentA + sentB);
  const se = Math.sqrt(pooledRate * (1 - pooledRate) * (1 / sentA + 1 / sentB));
  const zScore = se > 0 ? Math.abs(rateA - rateB) / se : 0;
  const confidence = Math.min(99.9, (1 - Math.exp(-0.5 * zScore * zScore)) * 100);

  return {
    winner: rateA > rateB ? 'A' : (rateB > rateA ? 'B' : ''),
    confidence: Math.round(confidence * 10) / 10,
    rateA: Math.round(rateA * 10000) / 100,
    rateB: Math.round(rateB * 10000) / 100,
    sampleSizeA: sentA,
    sampleSizeB: sentB
  };
}

function getAllSeedAccounts(db) {
  return db._all('SELECT * FROM seed_accounts ORDER BY createdAt DESC');
}

function getSeedAccount(db, id) {
  return db._get('SELECT * FROM seed_accounts WHERE id = ?', [id]);
}

function addSeedAccount(db, account) {
  const id = account.id || uuidv4();
  db._run(
    `INSERT INTO seed_accounts (id, provider, email, imapHost, imapPort, imapUser, imapPassword, folder, isActive)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      account.provider,
      account.email,
      account.imapHost,
      account.imapPort || 993,
      account.imapUser,
      account.imapPassword,
      account.folder || 'INBOX',
      account.isActive !== false ? 1 : 0
    ]
  );
  return id;
}

function updateSeedAccount(db, account) {
  db._run(
    `UPDATE seed_accounts SET provider=?, email=?, imapHost=?, imapPort=?, imapUser=?,
     imapPassword=?, folder=?, isActive=?, updatedAt=datetime('now') WHERE id=?`,
    [
      account.provider,
      account.email,
      account.imapHost,
      account.imapPort || 993,
      account.imapUser,
      account.imapPassword,
      account.folder || 'INBOX',
      account.isActive !== false ? 1 : 0,
      account.id
    ]
  );
}

function deleteSeedAccount(db, id) {
  db._run('DELETE FROM seed_accounts WHERE id = ?', [id]);
}

function getActiveSeedAccounts(db) {
  return db._all('SELECT * FROM seed_accounts WHERE isActive = 1 ORDER BY createdAt DESC');
}

module.exports = {
  getAllSignupForms,
  getSignupForm,
  addSignupForm,
  updateSignupForm,
  deleteSignupForm,
  getFormSubmissions,
  addFormSubmission,
  confirmFormSubmission,
  getAllABTests,
  getABTest,
  addABTest,
  updateABTest,
  deleteABTest,
  calculateABSignificance,
  getAllSeedAccounts,
  getSeedAccount,
  addSeedAccount,
  updateSeedAccount,
  deleteSeedAccount,
  getActiveSeedAccounts
};
