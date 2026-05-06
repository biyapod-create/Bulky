// Drip Engine — manages per-contact drip sequence step scheduling and execution
// Queue table: drip_queue (see db.js migrations)
// Poller runs every 60s in main.js alongside the retry processor.

class DripEngine {
  constructor({ db, emailService, decryptSmtpAccount, logger }) {
    this.db = db;
    this.emailService = emailService;
    this.decryptSmtpAccount = decryptSmtpAccount;
    this.logger = logger;
    this._inFlight = new Set(); // guard against double-execution on slow SMTP
  }

  // Enqueue a contact into all active drip sequences that match an optional listId filter.
  // Called when a contact is added (contact_added trigger) or when a sequence is activated.
  enqueueContact(contactId, email, { listId } = {}) {
    try {
      const sequences = this.db.getAllDripSequences().filter((s) => {
        if (!s.isActive) return false;
        // If no listId filter on the sequence, enqueue for every active sequence.
        // If sequence has a listId in its campaignId field we can't easily match here —
        // the UI currently stores campaignId not listId on sequences, so we enqueue all.
        return true;
      });

      for (const seq of sequences) {
        // Avoid re-enqueueing if contact is already mid-sequence
        const existing = this.db._get(
          "SELECT id FROM drip_queue WHERE sequenceId = ? AND contactId = ? AND status IN ('pending','running')",
          [seq.id, contactId]
        );
        if (existing) continue;

        let steps = [];
        try {
          steps = typeof seq.steps === 'string' ? JSON.parse(seq.steps || '[]') : (seq.steps || []);
        } catch { steps = []; }
        if (steps.length === 0) continue;

        // Schedule step 0 immediately (delay = 0 from now)
        this._scheduleStep(seq.id, contactId, email, steps, 0, new Date().toISOString());
      }
    } catch (err) {
      this.logger?.warn('DripEngine.enqueueContact error', { contactId, error: err.message });
    }
  }

  // Called when a drip sequence is toggled active — enqueue all existing contacts in
  // its linked list/campaign so the sequence is not just for new contacts.
  enqueueSequenceContacts(sequenceId) {
    try {
      const seq = this.db.getDripSequence(sequenceId);
      if (!seq || !seq.isActive) return;

      let steps = [];
      try {
        steps = typeof seq.steps === 'string' ? JSON.parse(seq.steps || '[]') : (seq.steps || []);
      } catch { steps = []; }
      if (steps.length === 0) return;

      // Pull contacts for the linked campaign's list
      const campaign = seq.campaignId
        ? this.db._get('SELECT * FROM campaigns WHERE id = ?', [seq.campaignId])
        : null;
      if (!campaign) return;

      const contacts = this.db.getContactsForCampaign({ listId: campaign.listId || '' });
      for (const contact of contacts) {
        const existing = this.db._get(
          "SELECT id FROM drip_queue WHERE sequenceId = ? AND contactId = ? AND status IN ('pending','running')",
          [seq.id, contact.id]
        );
        if (existing) continue;
        this._scheduleStep(seq.id, contact.id, contact.email, steps, 0, new Date().toISOString());
      }
    } catch (err) {
      this.logger?.warn('DripEngine.enqueueSequenceContacts error', { sequenceId, error: err.message });
    }
  }

  _delayToMs(delay, unit) {
    const n = (delay !== undefined && delay !== null && delay !== '') ? Number(delay) : 1;
    switch (String(unit || 'days').toLowerCase()) {
      case 'minutes': return n * 60 * 1000;
      case 'hours':   return n * 60 * 60 * 1000;
      case 'weeks':   return n * 7 * 24 * 60 * 60 * 1000;
      default:        return n * 24 * 60 * 60 * 1000; // days
    }
  }

  _scheduleStep(sequenceId, contactId, email, steps, stepIndex, baseTime) {
    const step = steps[stepIndex];
    if (!step) return;

    const baseMs = new Date(baseTime).getTime();
    const delayMs = stepIndex === 0 ? 0 : this._delayToMs(step.delay, step.unit);
    const runAt = new Date(baseMs + delayMs).toISOString();

    this.db.addDripQueueItem({
      sequenceId,
      contactId,
      email,
      stepIndex,
      subject: step.subject || '',
      runAt,
      status: 'pending'
    });
  }

  // Main execution loop — called every 60s from main.js
  async tick() {
    try {
      const due = this.db.getDueDripItems();
      if (due.length === 0) return;

      for (const item of due) {
        if (this._inFlight.has(item.id)) continue;
        this._inFlight.add(item.id);
        this._processItem(item)
          .catch((err) => this.logger?.warn('DripEngine unhandled _processItem rejection', { id: item.id, error: err.message }))
          .finally(() => this._inFlight.delete(item.id));
      }
    } catch (err) {
      this.logger?.warn('DripEngine.tick error', { error: err.message });
    }
  }

  async _processItem(item) {
    try {
      // Mark running so concurrent tick doesn't double-process
      this.db.updateDripQueueItem(item.id, { status: 'running' });

      const seq = this.db.getDripSequence(item.sequenceId);
      if (!seq || !seq.isActive) {
        this.db.updateDripQueueItem(item.id, { status: 'skipped', error: 'Sequence inactive or deleted' });
        return;
      }

      let steps = [];
      try {
        steps = typeof seq.steps === 'string' ? JSON.parse(seq.steps || '[]') : (seq.steps || []);
      } catch { steps = []; }

      const step = steps[item.stepIndex];
      if (!step) {
        this.db.updateDripQueueItem(item.id, { status: 'skipped', error: 'Step not found' });
        return;
      }

      // Check contact still exists and not blacklisted/unsubscribed
      if (this.db.isBlacklisted(item.email) || this.db.isUnsubscribed(item.email)) {
        this.db.updateDripQueueItem(item.id, { status: 'skipped', error: 'Blacklisted or unsubscribed' });
        return;
      }

      // Send the email for this step
      const subject = item.subject || step.subject || '';
      const content = step.content || seq.content || '';

      if (subject && content) {
        await this._sendStepEmail(seq, item, subject, content);
      } else {
        this.logger?.warn('DripEngine: step skipped — missing subject or content', { itemId: item.id, stepIndex: item.stepIndex });
      }

      this.db.updateDripQueueItem(item.id, { status: 'completed' });

      // Schedule next step if one exists — use item.runAt as base so delays are
      // anchored to when this step was DUE, not when it actually executed.
      const nextStepIndex = item.stepIndex + 1;
      if (nextStepIndex < steps.length) {
        this._scheduleStep(
          item.sequenceId,
          item.contactId,
          item.email,
          steps,
          nextStepIndex,
          item.runAt
        );
      }
    } catch (err) {
      this.logger?.warn('DripEngine._processItem error', { itemId: item.id, error: err.message });
      this.db.updateDripQueueItem(item.id, { status: 'failed', error: err.message });
    }
  }

  async _sendStepEmail(seq, item, subject, content) {
    const accounts = this.db.getActiveSmtpAccounts();
    if (!accounts || accounts.length === 0) throw new Error('No active SMTP accounts');

    const account = this.decryptSmtpAccount(accounts[0]);
    const contact = item.contactId
      ? (this.db._get('SELECT * FROM contacts WHERE id = ?', [item.contactId]) || { email: item.email })
      : { email: item.email };

    const transporter = this.emailService.createTransporter(account);
    try {
      const personalizedSubject = this.emailService.personalizeContent(subject, contact);
      const personalizedContent = this.emailService.personalizeContent(content, contact);
      const plainText = this.emailService.htmlToPlainText(personalizedContent);

      await transporter.sendMail({
        from: `"${account.fromName}" <${account.fromEmail}>`,
        to: item.email,
        replyTo: account.replyTo || account.fromEmail,
        subject: personalizedSubject,
        text: plainText,
        html: personalizedContent
      });
    } finally {
      try { transporter.close(); } catch {}
    }
  }

  dispose() {
    this._inFlight.clear();
  }
}

module.exports = DripEngine;
