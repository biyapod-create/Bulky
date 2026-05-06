const { v4: uuidv4 } = require('uuid');

// Validation helpers
const validateId = (id, fieldName = 'id') => {
  if (!id || typeof id !== 'string') {
    return { error: `${fieldName} is required` };
  }
  return { value: id };
};

const validateAutomation = (automation) => {
  if (!automation) {
    return { error: 'Automation data is required' };
  }
  if (!automation.name || typeof automation.name !== 'string') {
    return { error: 'Name is required' };
  }
  if (!automation.triggerType) {
    return { error: 'Trigger type is required' };
  }
  return { value: automation };
};

const validateDripSequence = (sequence) => {
  if (!sequence) {
    return { error: 'Sequence data is required' };
  }
  if (!sequence.name || typeof sequence.name !== 'string') {
    return { error: 'Name is required' };
  }
  if (!sequence.campaignId) {
    return { error: 'Campaign ID is required' };
  }
  return { value: sequence };
};

const validateSignupForm = (form) => {
  if (!form) {
    return { error: 'Form data is required' };
  }
  if (!form.name || typeof form.name !== 'string') {
    return { error: 'Name is required' };
  }
  if (!form.listId) {
    return { error: 'List ID is required' };
  }
  if (!Array.isArray(form.fields) || form.fields.length === 0) {
    return { error: 'At least one form field is required' };
  }
  const emailField = form.fields.find((field) => String(field?.name || '').trim().toLowerCase() === 'email');
  if (!emailField) {
    return { error: 'Signup forms must include an email field' };
  }
  return { value: form };
};

const validateABTest = (test) => {
  if (!test) {
    return { error: 'Test data is required' };
  }
  if (!test.name || typeof test.name !== 'string') {
    return { error: 'Name is required' };
  }
  if (!test.campaignId) {
    return { error: 'Campaign ID is required' };
  }
  return { value: test };
};

module.exports = function registerAutomationHandlers({ safeHandler, db, emailService, trackingService, automationEngine, dripEngine }) {
  // Alias ipcMain.handle to safeHandler for consistency with other handlers
  // =================== AUTOMATIONS ===================
  
  safeHandler('automation:getAll', () => {
    return db.getAllAutomations();
  });

  safeHandler('automation:get', (e, id) => {
    const validated = validateId(id, 'id');
    if (validated.error) return { error: validated.error };
    return db.getAutomation(validated.value);
  });

  safeHandler('automation:create', (e, automation) => {
    const validated = validateAutomation(automation);
    if (validated.error) return { error: validated.error };
    const id = db.addAutomation(validated.value);
    return { id, success: true };
  });

  safeHandler('automation:update', (e, automation) => {
    const validated = validateAutomation(automation);
    if (validated.error) return { error: validated.error };
    if (!validated.value.id) {
      return { error: 'Automation ID is required for update' };
    }
    db.updateAutomation(validated.value);
    return { success: true };
  });

  safeHandler('automation:delete', (e, id) => {
    const validated = validateId(id, 'id');
    if (validated.error) return { error: validated.error };
    db.deleteAutomation(validated.value);
    return { success: true };
  });

  safeHandler('automation:toggle', (e, id) => {
    const validated = validateId(id, 'id');
    if (validated.error) return { error: validated.error };
    
    const automation = db.getAutomation(validated.value);
    if (!automation) {
      return { error: 'Automation not found' };
    }
    
    db.updateAutomation({
      ...automation,
      isActive: !automation.isActive,
      status: !automation.isActive ? 'active' : 'draft'
    });
    return { success: true, isActive: !automation.isActive };
  });

  safeHandler('automation:getLogs', (e, automationId) => {
    const validated = validateId(automationId, 'automationId');
    if (validated.error) return { error: validated.error };
    return db.getAutomationLogs(validated.value);
  });

  // =================== DRIP SEQUENCES ===================

  safeHandler('drip:getAll', () => {
    return db.getAllDripSequences();
  });

  safeHandler('drip:get', (e, id) => {
    const validated = validateId(id, 'id');
    if (validated.error) return { error: validated.error };
    return db.getDripSequence(validated.value);
  });

  safeHandler('drip:create', (e, sequence) => {
    const validated = validateDripSequence(sequence);
    if (validated.error) return { error: validated.error };
    const id = db.addDripSequence(validated.value);
    return { id, success: true };
  });

  safeHandler('drip:update', (e, sequence) => {
    const validated = validateDripSequence(sequence);
    if (validated.error) return { error: validated.error };
    if (!validated.value.id) {
      return { error: 'Sequence ID is required for update' };
    }
    db.updateDripSequence(validated.value);
    return { success: true };
  });

  safeHandler('drip:delete', (e, id) => {
    const validated = validateId(id, 'id');
    if (validated.error) return { error: validated.error };
    db.deleteDripSequence(validated.value);
    return { success: true };
  });

  safeHandler('drip:toggle', async (e, id) => {
    const validated = validateId(id, 'id');
    if (validated.error) return { error: validated.error };

    const sequence = db.getDripSequence(validated.value);
    if (!sequence) return { error: 'Sequence not found' };

    const newActive = !sequence.isActive;
    db.updateDripSequence({
      ...sequence,
      isActive: newActive,
      status: newActive ? 'active' : 'draft'
    });

    if (newActive && dripEngine) {
      try { await dripEngine.enqueueSequenceContacts(validated.value); } catch {}
    }

    return { success: true, isActive: newActive };
  });

  // =================== SIGNUP FORMS ===================

  safeHandler('form:getAll', () => {
    return db.getAllSignupForms();
  });

  safeHandler('form:get', (e, id) => {
    const validated = validateId(id, 'id');
    if (validated.error) return { error: validated.error };
    return db.getSignupForm(validated.value);
  });

  safeHandler('form:create', (e, form) => {
    const validated = validateSignupForm(form);
    if (validated.error) return { error: validated.error };
    const id = db.addSignupForm(validated.value);
    return { id, success: true };
  });

  safeHandler('form:update', (e, form) => {
    const validated = validateSignupForm(form);
    if (validated.error) return { error: validated.error };
    if (!validated.value.id) {
      return { error: 'Form ID is required for update' };
    }
    db.updateSignupForm(validated.value);
    return { success: true };
  });

  safeHandler('form:delete', (e, id) => {
    const validated = validateId(id, 'id');
    if (validated.error) return { error: validated.error };
    db.deleteSignupForm(validated.value);
    return { success: true };
  });

  safeHandler('form:getSubmissions', (e, formId) => {
    const validated = validateId(formId, 'formId');
    if (validated.error) return { error: validated.error };
    return db.getFormSubmissions(validated.value);
  });

  // Generate embeddable form code
  safeHandler('form:getEmbedCode', (e, formId) => {
    const validated = validateId(formId, 'formId');
    if (validated.error) return { error: validated.error };

    const form = db.getSignupForm(validated.value);
    if (!form) {
      return { error: 'Form not found' };
    }

    // Use the actual tracking base URL so forms work out of the box locally.
    // Users with a public tracking domain configured in Settings → Deliverability
    // will get branded URLs automatically.
    const baseUrl = trackingService?.getTrackingBaseUrl?.() || 'http://127.0.0.1:3847';
    const fields = JSON.parse(form.fields || '[]');
    let fieldHtml = fields.map(f => {
      return `<div class="form-group">
        <label for="bulky_${f.name}">${f.label || f.name}</label>
        <input type="${f.type || 'text'}" id="bulky_${f.name}" name="${f.name}" ${f.required ? 'required' : ''}>
      </div>`;
    }).join('\n');

    const embedCode = `<form id="bulky_signup_form" action="#" method="POST">
${fieldHtml}
<button type="submit">Subscribe</button>
</form>
<script>
document.getElementById('bulky_signup_form').addEventListener('submit', function(e) {
  e.preventDefault();
  var data = {};
  new FormData(this).forEach(function(value, key) { data[key] = value; });
  fetch('${baseUrl}/api/form/submit/${formId}', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify(data)
  }).then(function(response) {
    return response.json().catch(function() {
      return { success: response.ok };
    });
  }).then(function(result) {
    if (result && result.redirectUrl) {
      window.location.href = result.redirectUrl;
      return;
    }
    if (!result || result.error) {
      throw new Error((result && result.error) || 'Form submission failed');
    }
    document.getElementById('bulky_signup_form').innerHTML = '<p>' + (result.message || '${(form.successMessage || 'Thank you for subscribing!').replace(/'/g, "\\'")}') + '</p>';
  }).catch(function(err) { console.error('Form submission failed', err); });
});
</script>`;

    return { embedCode };
  });

  // =================== A/B TESTS ===================

  safeHandler('abtest:getAll', () => {
    return db.getAllABTests();
  });

  safeHandler('abtest:get', (e, id) => {
    const validated = validateId(id, 'id');
    if (validated.error) return { error: validated.error };
    return db.getABTest(validated.value);
  });

  safeHandler('abtest:create', (e, test) => {
    const validated = validateABTest(test);
    if (validated.error) return { error: validated.error };
    const id = db.addABTest(validated.value);
    return { id, success: true };
  });

  safeHandler('abtest:update', (e, test) => {
    const validated = validateABTest(test);
    if (validated.error) return { error: validated.error };
    if (!validated.value.id) {
      return { error: 'Test ID is required for update' };
    }
    db.updateABTest(validated.value);
    return { success: true };
  });

  safeHandler('abtest:delete', (e, id) => {
    const validated = validateId(id, 'id');
    if (validated.error) return { error: validated.error };
    db.deleteABTest(validated.value);
    return { success: true };
  });

  safeHandler('abtest:calculate', (e, campaignId) => {
    const validated = validateId(campaignId, 'campaignId');
    if (validated.error) return { error: validated.error };
    return db.calculateABSignificance(validated.value);
  });

  // =================== SEED ACCOUNTS (Inbox Placement Testing - Phase 1) ===================

  safeHandler('seed:getAll', () => {
    return db.getAllSeedAccounts();
  });

  safeHandler('seed:get', (e, id) => {
    const validated = validateId(id, 'id');
    if (validated.error) return { error: validated.error };
    return db.getSeedAccount(validated.value);
  });

  safeHandler('seed:create', (e, account) => {
    if (!account || !account.provider || !account.email) {
      return { error: 'Provider and email are required' };
    }
    const payload = {
      ...account,
      imapHost: account.imapHost || '',
      imapPort: account.imapPort || 993,
      imapUser: account.imapUser || '',
      imapPassword: account.imapPassword || '',
      folder: account.folder || 'INBOX'
    };
    const id = db.addSeedAccount(payload);
    return { id, success: true };
  });

  safeHandler('seed:update', (e, account) => {
    if (!account || !account.id) {
      return { error: 'Account ID is required for update' };
    }
    db.updateSeedAccount(account);
    return { success: true };
  });

  safeHandler('seed:delete', (e, id) => {
    const validated = validateId(id, 'id');
    if (validated.error) return { error: validated.error };
    db.deleteSeedAccount(validated.value);
    return { success: true };
  });

  safeHandler('seed:getActive', () => {
    return db.getActiveSeedAccounts();
  });

  // =================== BEHAVIOUR TRIGGERS ===================
  
  // Process tracking events and trigger automations via AutomationEngine
  safeHandler('automation:processTrigger', async (e, event) => {
    if (!event || !event.type) return { error: 'Invalid event data' };

    const context = {
      contactId: event.contactId || '',
      email: event.email || '',
      campaignId: event.campaignId || '',
      tagId: event.tagId || '',
      listId: event.listId || ''
    };

    if (automationEngine) {
      await automationEngine.fire(event.type, context);
    }

    return { success: true };
  });
};
