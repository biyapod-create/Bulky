// Automation Engine — executes active automations when trigger events fire
// Supported actions per node: send_email, add_tag, remove_tag, add_to_list,
//                              wait (delay handled by drip engine), webhook

const crypto = require('crypto');

class AutomationEngine {
  constructor({ db, emailService, decryptSmtpAccount, logger }) {
    this.db = db;
    this.emailService = emailService;
    this.decryptSmtpAccount = decryptSmtpAccount;
    this.logger = logger;
  }

  // Called from main.js event hooks. triggerType matches automations.triggerType.
  // context: { contactId, email, campaignId, tagId, listId, ... }
  async fire(triggerType, context = {}) {
    try {
      const automations = this.db.getAllAutomations().filter(
        (a) => a.isActive && a.triggerType === triggerType
      );
      if (automations.length === 0) return;

      for (const automation of automations) {
        await this._runAutomation(automation, context);
      }
    } catch (err) {
      this.logger?.warn('AutomationEngine.fire error', { triggerType, error: err.message });
    }
  }

  async _runAutomation(automation, context) {
    let nodes = [];
    try {
      nodes = typeof automation.nodes === 'string'
        ? JSON.parse(automation.nodes || '[]')
        : (automation.nodes || []);
    } catch {
      nodes = [];
    }

    let triggerConfig = {};
    try {
      triggerConfig = typeof automation.triggerConfig === 'string'
        ? JSON.parse(automation.triggerConfig || '{}')
        : (automation.triggerConfig || {});
    } catch {
      triggerConfig = {};
    }

    // Respect campaign/tag/list scoping if configured
    if (triggerConfig.campaignId && context.campaignId &&
        triggerConfig.campaignId !== context.campaignId) return;
    if (triggerConfig.tagId && context.tagId &&
        triggerConfig.tagId !== context.tagId) return;
    if (triggerConfig.listId && context.listId &&
        triggerConfig.listId !== context.listId) return;

    this.db.addAutomationLog({
      automationId: automation.id,
      contactId: context.contactId || '',
      email: context.email || '',
      nodeId: 'trigger',
      action: `triggered_by_${automation.triggerType}`,
      status: 'success'
    });

    // Execute each action node in order (skip 'trigger' type nodes)
    for (const node of nodes) {
      if (!node || node.type === 'trigger') continue;
      await this._executeNode(automation, node, context);
    }
  }

  async _executeNode(automation, node, context) {
    const nodeId = node.id || node.type;
    const config = node.config || node.data || {};

    try {
      switch (node.type) {
        case 'send_email':
          await this._actionSendEmail(config, context);
          break;
        case 'add_tag':
          this._actionAddTag(config, context);
          break;
        case 'remove_tag':
          this._actionRemoveTag(config, context);
          break;
        case 'add_to_list':
          this._actionAddToList(config, context);
          break;
        case 'webhook':
          await this._actionWebhook(config, context);
          break;
        case 'wait':
          // Wait nodes are handled by the drip engine, not inline
          break;
        default:
          this.logger?.warn('AutomationEngine: unknown node type', { type: node.type });
          return;
      }

      this.db.addAutomationLog({
        automationId: automation.id,
        contactId: context.contactId || '',
        email: context.email || '',
        nodeId,
        action: node.type,
        status: 'success'
      });
    } catch (err) {
      this.logger?.warn('AutomationEngine node error', { nodeId, type: node.type, error: err.message });
      this.db.addAutomationLog({
        automationId: automation.id,
        contactId: context.contactId || '',
        email: context.email || '',
        nodeId,
        action: node.type,
        status: 'error',
        error: err.message
      });
    }
  }

  async _actionSendEmail(config, context) {
    const { subject, content, smtpAccountId } = config;
    if (!subject || !content || !context.email) return;

    const accounts = this.db.getActiveSmtpAccounts();
    if (!accounts || accounts.length === 0) throw new Error('No active SMTP accounts');

    const account = smtpAccountId
      ? accounts.find((a) => a.id === smtpAccountId) || accounts[0]
      : accounts[0];

    const settings = this.decryptSmtpAccount(account);
    const contact = context.contactId
      ? (this.db._get('SELECT * FROM contacts WHERE id = ?', [context.contactId]) || { email: context.email })
      : { email: context.email };

    const transporter = this.emailService.createTransporter(settings);
    try {
      const personalizedSubject = this.emailService.personalizeContent(subject, contact);
      const personalizedContent = this.emailService.personalizeContent(content, contact);
      const plainText = this.emailService.htmlToPlainText(personalizedContent);

      await transporter.sendMail({
        from: `"${settings.fromName}" <${settings.fromEmail}>`,
        to: context.email,
        replyTo: settings.replyTo || settings.fromEmail,
        subject: personalizedSubject,
        text: plainText,
        html: personalizedContent
      });
    } finally {
      try { transporter.close(); } catch {}
    }
  }

  _actionAddTag(config, context) {
    const { tagId } = config;
    if (!tagId || !context.contactId) return;
    try { this.db.addTagToContact(context.contactId, tagId); } catch {}
  }

  _actionRemoveTag(config, context) {
    const { tagId } = config;
    if (!tagId || !context.contactId) return;
    try { this.db.removeTagFromContact(context.contactId, tagId); } catch {}
  }

  _actionAddToList(config, context) {
    const { listId } = config;
    if (!listId || !context.contactId) return;
    try { this.db.addContactToList(context.contactId, listId); } catch {}
  }

  async _actionWebhook(config, context) {
    const { url, method = 'POST' } = config;
    if (!url) return;

    let parsed;
    try { parsed = new URL(url); } catch { throw new Error(`Invalid webhook URL: ${url}`); }
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Webhook URL must be http or https');

    const payload = JSON.stringify({
      triggerType: context.triggerType || '',
      contactId: context.contactId || '',
      email: context.email || '',
      campaignId: context.campaignId || '',
      timestamp: new Date().toISOString()
    });

    const https = require('https');
    const http = require('http');
    const transport = parsed.protocol === 'https:' ? https : http;

    await new Promise((resolve, reject) => {
      const req = transport.request(
        { hostname: parsed.hostname, port: parsed.port, path: parsed.pathname + parsed.search, method,
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } },
        (res) => {
          res.resume();
          res.on('end', resolve);
        }
      );
      req.setTimeout(10000, () => { req.destroy(); reject(new Error('Webhook timed out')); });
      req.on('error', reject);
      req.write(payload);
      req.end();
    });
  }
}

module.exports = AutomationEngine;
