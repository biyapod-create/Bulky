// Dynamic Function Registry - Discovers and documents all available IPC handlers
// This service scans handler registrations and creates a searchable registry

const fs = require('fs');
const path = require('path');

class FunctionRegistry {
  constructor() {
    this.functions = new Map();
    this.categories = new Map();
    this.initialized = false;
  }

  // Initialize the registry with all available functions
  initialize() {
    if (this.initialized) return;

    // Define all known function categories and their handlers
    this._registerContactFunctions();
    this._registerCampaignFunctions();
    this._registerTemplateFunctions();
    this._registerVerificationFunctions();
    this._registerDeliverabilityFunctions();
    this._registerDataFunctions();
    this._registerSettingsFunctions();
    this._registerAutomationFunctions();

    this.initialized = true;
  }

  // Register contact management functions
  _registerContactFunctions() {
    const category = 'contacts';
    this.categories.set(category, {
      name: 'Contact Management',
      description: 'Manage contacts, lists, tags, and contact data',
      functions: []
    });

    const functions = [
      {
        name: 'contacts:getAll',
        description: 'Get all contacts in the database',
        parameters: [],
        returns: 'Array of contact objects',
        destructive: false
      },
      {
        name: 'contacts:getPage',
        description: 'Get paginated list of contacts with optional filters',
        parameters: [
          { name: 'page', type: 'number', description: 'Page number (1-based)', required: false },
          { name: 'perPage', type: 'number', description: 'Items per page', required: false },
          { name: 'search', type: 'string', description: 'Search term for email/name/company', required: false },
          { name: 'listId', type: 'string', description: 'Filter by list ID', required: false },
          { name: 'verificationStatus', type: 'string', description: 'Filter by verification status (valid/invalid/risky/unverified)', required: false },
          { name: 'tag', type: 'string', description: 'Filter by tag', required: false }
        ],
        returns: 'Paginated contact list with total count',
        destructive: false
      },
      {
        name: 'contacts:getStats',
        description: 'Get statistics about contacts (total, verified, unverified, etc.)',
        parameters: [],
        returns: 'Contact statistics object',
        destructive: false
      },
      {
        name: 'contacts:getDetail',
        description: 'Get full details of a specific contact',
        parameters: [
          { name: 'id', type: 'string', description: 'Contact ID', required: true }
        ],
        returns: 'Full contact object with all fields',
        destructive: false
      },
      {
        name: 'contacts:add',
        description: 'Add a new contact to the database',
        parameters: [
          { name: 'email', type: 'string', description: 'Contact email address', required: true },
          { name: 'firstName', type: 'string', description: 'First name', required: false },
          { name: 'lastName', type: 'string', description: 'Last name', required: false },
          { name: 'company', type: 'string', description: 'Company name', required: false },
          { name: 'phone', type: 'string', description: 'Phone number', required: false },
          { name: 'listId', type: 'string', description: 'List ID to assign to', required: false },
          { name: 'tags', type: 'array', description: 'Tags to assign', required: false }
        ],
        returns: 'New contact ID',
        destructive: false
      },
      {
        name: 'contacts:addBulk',
        description: 'Add multiple contacts at once',
        parameters: [
          { name: 'contacts', type: 'array', description: 'Array of contact objects', required: true }
        ],
        returns: 'Import results with counts',
        destructive: false
      },
      {
        name: 'contacts:update',
        description: 'Update an existing contact',
        parameters: [
          { name: 'id', type: 'string', description: 'Contact ID', required: true },
          { name: 'email', type: 'string', description: 'Email address', required: false },
          { name: 'firstName', type: 'string', description: 'First name', required: false },
          { name: 'lastName', type: 'string', description: 'Last name', required: false },
          { name: 'company', type: 'string', description: 'Company name', required: false },
          { name: 'phone', type: 'string', description: 'Phone number', required: false },
          { name: 'tags', type: 'array', description: 'Tags to assign', required: false }
        ],
        returns: 'Success status',
        destructive: false
      },
      {
        name: 'contacts:delete',
        description: 'Delete one or more contacts',
        parameters: [
          { name: 'ids', type: 'array', description: 'Array of contact IDs to delete', required: true }
        ],
        returns: 'Success status',
        destructive: true
      },
      {
        name: 'contacts:searchContacts',
        description: 'Search contacts by name, email, or company',
        parameters: [
          { name: 'query', type: 'string', description: 'Search query', required: true }
        ],
        returns: 'Matching contacts',
        destructive: false
      },
      {
        name: 'contacts:addToList',
        description: 'Add a contact to a specific list',
        parameters: [
          { name: 'contactId', type: 'string', description: 'Contact ID', required: true },
          { name: 'listId', type: 'string', description: 'List ID', required: true }
        ],
        returns: 'Success status',
        destructive: false
      },
      {
        name: 'contacts:addTag',
        description: 'Add a tag to a contact',
        parameters: [
          { name: 'contactId', type: 'string', description: 'Contact ID', required: true },
          { name: 'tagName', type: 'string', description: 'Tag name to add', required: true }
        ],
        returns: 'Success status',
        destructive: false
      },
      {
        name: 'contacts:import',
        description: 'Import contacts from a file (CSV, Excel, JSON)',
        parameters: [],
        returns: 'Parsed contacts ready for import',
        destructive: false
      }
    ];

    functions.forEach(fn => {
      this.functions.set(fn.name, { ...fn, category });
      this.categories.get(category).functions.push(fn.name);
    });
  }

  // Register campaign functions
  _registerCampaignFunctions() {
    const category = 'campaigns';
    this.categories.set(category, {
      name: 'Campaign Management',
      description: 'Create, manage, and send email campaigns',
      functions: []
    });

    const functions = [
      {
        name: 'campaigns:getAll',
        description: 'Get all campaigns',
        parameters: [],
        returns: 'Array of campaign objects',
        destructive: false
      },
      {
        name: 'campaigns:getDetail',
        description: 'Get full details of a specific campaign',
        parameters: [
          { name: 'id', type: 'string', description: 'Campaign ID', required: true }
        ],
        returns: 'Full campaign object',
        destructive: false
      },
      {
        name: 'campaigns:add',
        description: 'Create a new campaign',
        parameters: [
          { name: 'name', type: 'string', description: 'Campaign name', required: true },
          { name: 'subject', type: 'string', description: 'Email subject line', required: true },
          { name: 'content', type: 'string', description: 'Email HTML content', required: true },
          { name: 'listId', type: 'string', description: 'Target list ID', required: false },
          { name: 'tagFilter', type: 'string', description: 'Filter by tags', required: false }
        ],
        returns: 'New campaign ID',
        destructive: false
      },
      {
        name: 'campaigns:update',
        description: 'Update an existing campaign',
        parameters: [
          { name: 'id', type: 'string', description: 'Campaign ID', required: true },
          { name: 'name', type: 'string', description: 'Campaign name', required: false },
          { name: 'subject', type: 'string', description: 'Email subject', required: false },
          { name: 'content', type: 'string', description: 'Email content', required: false }
        ],
        returns: 'Success status',
        destructive: false
      },
      {
        name: 'campaigns:delete',
        description: 'Delete a campaign',
        parameters: [
          { name: 'id', type: 'string', description: 'Campaign ID', required: true }
        ],
        returns: 'Success status',
        destructive: true
      },
      {
        name: 'email:send',
        description: 'Send a campaign to selected contacts',
        parameters: [
          { name: 'campaignId', type: 'string', description: 'Campaign ID', required: true },
          { name: 'filter', type: 'object', description: 'Contact filter criteria', required: false },
          { name: 'smtpAccountId', type: 'string', description: 'SMTP account to use', required: false }
        ],
        returns: 'Send results with sent/failed counts',
        destructive: false
      },
      {
        name: 'email:pause',
        description: 'Pause an ongoing campaign',
        parameters: [],
        returns: 'Success status',
        destructive: false
      },
      {
        name: 'email:resume',
        description: 'Resume a paused campaign',
        parameters: [],
        returns: 'Success status',
        destructive: false
      },
      {
        name: 'email:stop',
        description: 'Stop a campaign permanently',
        parameters: [],
        returns: 'Success status',
        destructive: false
      }
    ];

    functions.forEach(fn => {
      this.functions.set(fn.name, { ...fn, category });
      this.categories.get(category).functions.push(fn.name);
    });
  }

  // Register template functions
  _registerTemplateFunctions() {
    const category = 'templates';
    this.categories.set(category, {
      name: 'Template Management',
      description: 'Create, manage, and generate email templates',
      functions: []
    });

    const functions = [
      {
        name: 'templates:getAll',
        description: 'Get all saved templates',
        parameters: [],
        returns: 'Array of template objects',
        destructive: false
      },
      {
        name: 'templates:getWithBlocks',
        description: 'Get template with its block structure',
        parameters: [
          { name: 'templateId', type: 'string', description: 'Template ID', required: true }
        ],
        returns: 'Template with blocks array',
        destructive: false
      },
      {
        name: 'templates:add',
        description: 'Save a new template',
        parameters: [
          { name: 'name', type: 'string', description: 'Template name', required: true },
          { name: 'subject', type: 'string', description: 'Default subject', required: false },
          { name: 'content', type: 'string', description: 'HTML content', required: false },
          { name: 'category', type: 'string', description: 'Template category', required: false },
          { name: 'blocks', type: 'array', description: 'Drag-and-drop blocks', required: false }
        ],
        returns: 'New template ID',
        destructive: false
      },
      {
        name: 'templates:update',
        description: 'Update an existing template',
        parameters: [
          { name: 'id', type: 'string', description: 'Template ID', required: true },
          { name: 'name', type: 'string', description: 'Template name', required: false },
          { name: 'content', type: 'string', description: 'HTML content', required: false },
          { name: 'blocks', type: 'array', description: 'Block structure', required: false }
        ],
        returns: 'Success status',
        destructive: false
      },
      {
        name: 'templates:delete',
        description: 'Delete a template',
        parameters: [
          { name: 'id', type: 'string', description: 'Template ID', required: true }
        ],
        returns: 'Success status',
        destructive: true
      },
      {
        name: 'templates:importFile',
        description: 'Import a template from an HTML or JSON file',
        parameters: [],
        returns: 'Imported template data',
        destructive: false
      }
    ];

    functions.forEach(fn => {
      this.functions.set(fn.name, { ...fn, category });
      this.categories.get(category).functions.push(fn.name);
    });
  }

  // Register verification functions
  _registerVerificationFunctions() {
    const category = 'verification';
    this.categories.set(category, {
      name: 'Email Verification',
      description: 'Verify email addresses and check deliverability',
      functions: []
    });

    const functions = [
      {
        name: 'verify:email',
        description: 'Verify a single email address',
        parameters: [
          { name: 'email', type: 'string', description: 'Email address to verify', required: true },
          { name: 'smtpCheck', type: 'boolean', description: 'Perform deep SMTP check (slower but more accurate)', required: false }
        ],
        returns: 'Verification result with status, score, and details',
        destructive: false
      },
      {
        name: 'verify:bulk',
        description: 'Verify multiple email addresses',
        parameters: [
          { name: 'emails', type: 'array', description: 'Array of email addresses', required: true },
          { name: 'smtpCheck', type: 'boolean', description: 'Perform SMTP checks', required: false }
        ],
        returns: 'Verification results for all emails',
        destructive: false
      },
      {
        name: 'verify:pause',
        description: 'Pause bulk verification',
        parameters: [],
        returns: 'Success status',
        destructive: false
      },
      {
        name: 'verify:resume',
        description: 'Resume bulk verification',
        parameters: [],
        returns: 'Success status',
        destructive: false
      },
      {
        name: 'verify:stop',
        description: 'Stop bulk verification',
        parameters: [],
        returns: 'Success status',
        destructive: false
      }
    ];

    functions.forEach(fn => {
      this.functions.set(fn.name, { ...fn, category });
      this.categories.get(category).functions.push(fn.name);
    });
  }

  // Register deliverability functions
  _registerDeliverabilityFunctions() {
    const category = 'deliverability';
    this.categories.set(category, {
      name: 'Deliverability & Domain Health',
      description: 'Check domain health, spam score, and deliverability',
      functions: []
    });

    const functions = [
      {
        name: 'domain:check',
        description: 'Check domain health (MX, SPF, DKIM, DMARC records)',
        parameters: [
          { name: 'domain', type: 'string', description: 'Domain to check', required: true }
        ],
        returns: 'Domain health report with recommendations',
        destructive: false
      },
      {
        name: 'spam:check',
        description: 'Check email content for spam triggers',
        parameters: [
          { name: 'subject', type: 'string', description: 'Email subject', required: true },
          { name: 'content', type: 'string', description: 'Email HTML content', required: true }
        ],
        returns: 'Spam score and improvement suggestions',
        destructive: false
      },
      {
        name: 'deliverability:score',
        description: 'Calculate overall deliverability score',
        parameters: [],
        returns: 'Deliverability score with breakdown',
        destructive: false
      }
    ];

    functions.forEach(fn => {
      this.functions.set(fn.name, { ...fn, category });
      this.categories.get(category).functions.push(fn.name);
    });
  }

  // Register data management functions
  _registerDataFunctions() {
    const category = 'data';
    this.categories.set(category, {
      name: 'Data Management',
      description: 'Manage lists, tags, blacklist, and unsubscribes',
      functions: []
    });

    const functions = [
      {
        name: 'lists:getAll',
        description: 'Get all contact lists',
        parameters: [],
        returns: 'Array of list objects',
        destructive: false
      },
      {
        name: 'lists:add',
        description: 'Create a new contact list',
        parameters: [
          { name: 'name', type: 'string', description: 'List name', required: true },
          { name: 'description', type: 'string', description: 'List description', required: false }
        ],
        returns: 'New list ID',
        destructive: false
      },
      {
        name: 'lists:delete',
        description: 'Delete a contact list',
        parameters: [
          { name: 'id', type: 'string', description: 'List ID', required: true }
        ],
        returns: 'Success status',
        destructive: true
      },
      {
        name: 'tags:getAll',
        description: 'Get all tags',
        parameters: [],
        returns: 'Array of tag objects',
        destructive: false
      },
      {
        name: 'tags:add',
        description: 'Create a new tag',
        parameters: [
          { name: 'name', type: 'string', description: 'Tag name', required: true },
          { name: 'color', type: 'string', description: 'Tag color', required: false }
        ],
        returns: 'New tag ID',
        destructive: false
      },
      {
        name: 'tags:delete',
        description: 'Delete a tag',
        parameters: [
          { name: 'id', type: 'string', description: 'Tag ID', required: true }
        ],
        returns: 'Success status',
        destructive: true
      },
      {
        name: 'blacklist:getAll',
        description: 'Get all blacklisted emails',
        parameters: [],
        returns: 'Array of blacklist entries',
        destructive: false
      },
      {
        name: 'blacklist:add',
        description: 'Add an email to the blacklist',
        parameters: [
          { name: 'email', type: 'string', description: 'Email to blacklist', required: true },
          { name: 'reason', type: 'string', description: 'Reason for blacklisting', required: false }
        ],
        returns: 'Success status',
        destructive: false
      },
      {
        name: 'blacklist:remove',
        description: 'Remove an email from the blacklist',
        parameters: [
          { name: 'id', type: 'string', description: 'Blacklist entry ID', required: true }
        ],
        returns: 'Success status',
        destructive: false
      },
      {
        name: 'unsubscribes:getAll',
        description: 'Get all unsubscribed emails',
        parameters: [],
        returns: 'Array of unsubscribe entries',
        destructive: false
      },
      {
        name: 'unsubscribes:check',
        description: 'Check if an email is unsubscribed',
        parameters: [
          { name: 'email', type: 'string', description: 'Email to check', required: true }
        ],
        returns: 'Boolean indicating unsubscribe status',
        destructive: false
      }
    ];

    functions.forEach(fn => {
      this.functions.set(fn.name, { ...fn, category });
      this.categories.get(category).functions.push(fn.name);
    });
  }

  // Register settings functions
  _registerSettingsFunctions() {
    const category = 'settings';
    this.categories.set(category, {
      name: 'Settings & Configuration',
      description: 'Manage application settings and configurations',
      functions: []
    });

    const functions = [
      {
        name: 'settings:get',
        description: 'Get a specific setting',
        parameters: [
          { name: 'key', type: 'string', description: 'Setting key', required: true }
        ],
        returns: 'Setting value',
        destructive: false
      },
      {
        name: 'settings:set',
        description: 'Set a configuration value',
        parameters: [
          { name: 'key', type: 'string', description: 'Setting key', required: true },
          { name: 'value', type: 'any', description: 'Setting value', required: true }
        ],
        returns: 'Success status',
        destructive: false
      },
      {
        name: 'smtp:getAll',
        description: 'Get all configured SMTP accounts',
        parameters: [],
        returns: 'Array of SMTP account objects',
        destructive: false
      },
      {
        name: 'smtp:add',
        description: 'Add a new SMTP account',
        parameters: [
          { name: 'name', type: 'string', description: 'Account name', required: true },
          { name: 'host', type: 'string', description: 'SMTP host', required: true },
          { name: 'port', type: 'number', description: 'SMTP port', required: true },
          { name: 'username', type: 'string', description: 'SMTP username', required: true },
          { name: 'password', type: 'string', description: 'SMTP password', required: true },
          { name: 'fromEmail', type: 'string', description: 'Sender email', required: false },
          { name: 'fromName', type: 'string', description: 'Sender name', required: false }
        ],
        returns: 'New SMTP account ID',
        destructive: false
      },
      {
        name: 'smtp:update',
        description: 'Update an SMTP account',
        parameters: [
          { name: 'id', type: 'string', description: 'Account ID', required: true },
          { name: 'host', type: 'string', description: 'SMTP host', required: false },
          { name: 'port', type: 'number', description: 'SMTP port', required: false },
          { name: 'password', type: 'string', description: 'SMTP password', required: false }
        ],
        returns: 'Success status',
        destructive: false
      },
      {
        name: 'smtp:delete',
        description: 'Delete an SMTP account',
        parameters: [
          { name: 'id', type: 'string', description: 'Account ID', required: true }
        ],
        returns: 'Success status',
        destructive: true
      }
    ];

    functions.forEach(fn => {
      this.functions.set(fn.name, { ...fn, category });
      this.categories.get(category).functions.push(fn.name);
    });
  }

  // Register automation functions
  _registerAutomationFunctions() {
    const category = 'automation';
    this.categories.set(category, {
      name: 'Automation & Workflows',
      description: 'Create and manage automated email workflows',
      functions: []
    });

    const functions = [
      {
        name: 'automations:getAll',
        description: 'Get all automation workflows',
        parameters: [],
        returns: 'Array of automation objects',
        destructive: false
      },
      {
        name: 'automations:add',
        description: 'Create a new automation workflow',
        parameters: [
          { name: 'name', type: 'string', description: 'Automation name', required: true },
          { name: 'triggerType', type: 'string', description: 'Trigger type (signup, purchase, etc.)', required: true },
          { name: 'triggerConfig', type: 'object', description: 'Trigger configuration', required: false },
          { name: 'nodes', type: 'array', description: 'Workflow nodes', required: false }
        ],
        returns: 'New automation ID',
        destructive: false
      },
      {
        name: 'automations:delete',
        description: 'Delete an automation workflow',
        parameters: [
          { name: 'id', type: 'string', description: 'Automation ID', required: true }
        ],
        returns: 'Success status',
        destructive: true
      }
    ];

    functions.forEach(fn => {
      this.functions.set(fn.name, { ...fn, category });
      this.categories.get(category).functions.push(fn.name);
    });
  }

  // Get all functions as a formatted string for AI system prompt
  getAIDescription() {
    let description = '=== AVAILABLE FUNCTIONS ===\n\n';
    
    for (const [categoryId, category] of this.categories) {
      description += `${category.name}: ${category.description}\n`;
      description += 'Functions:\n';
      
      for (const fnName of category.functions) {
        const fn = this.functions.get(fnName);
        description += `  - ${fnName}: ${fn.description}\n`;
        
        if (fn.parameters.length > 0) {
          const params = fn.parameters.map(p => {
            const req = p.required ? ' (required)' : ' (optional)';
            return `${p.name} (${p.type}): ${p.description}${req}`;
          });
          description += `    Parameters: ${params.join(', ')}\n`;
        }
        
        if (fn.destructive) {
          description += '    ⚠️ DESTRUCTIVE - requires user confirmation\n';
        }
      }
      description += '\n';
    }

    return description;
  }

  // Get function by name
  getFunction(name) {
    return this.functions.get(name);
  }

  // Get all functions in a category
  getFunctionsByCategory(category) {
    const cat = this.categories.get(category);
    if (!cat) return [];
    return cat.functions.map(name => this.functions.get(name));
  }

  // Search functions by keyword
  searchFunctions(query) {
    const lowerQuery = query.toLowerCase();
    const results = [];
    
    for (const [name, fn] of this.functions) {
      if (name.toLowerCase().includes(lowerQuery) || 
          fn.description.toLowerCase().includes(lowerQuery)) {
        results.push(fn);
      }
    }
    
    return results;
  }

  // Validate parameters for a function
  validateParameters(functionName, params) {
    const fn = this.functions.get(functionName);
    if (!fn) {
      return { valid: false, error: `Function "${functionName}" not found` };
    }

    const errors = [];
    const validatedParams = {};

    for (const param of fn.parameters) {
      const value = params?.[param.name];
      
      if (param.required && (value === undefined || value === null || value === '')) {
        errors.push(`Missing required parameter: ${param.name}`);
        continue;
      }

      if (value !== undefined && value !== null) {
        // Type validation
        let isValid = true;
        switch (param.type) {
          case 'number':
            isValid = !isNaN(Number(value));
            break;
          case 'boolean':
            isValid = typeof value === 'boolean' || value === 'true' || value === 'false';
            break;
          case 'array':
            isValid = Array.isArray(value);
            break;
          case 'object':
            isValid = typeof value === 'object' && !Array.isArray(value);
            break;
          case 'string':
          default:
            isValid = typeof value === 'string';
        }

        if (!isValid) {
          errors.push(`Invalid type for ${param.name}: expected ${param.type}`);
        } else {
          validatedParams[param.name] = value;
        }
      }
    }

    return {
      valid: errors.length === 0,
      error: errors.length > 0 ? errors.join('; ') : null,
      params: validatedParams
    };
  }

  // Get functions suitable for AI actions (non-destructive by default)
  getSafeFunctions() {
    const safe = [];
    for (const [name, fn] of this.functions) {
      if (!fn.destructive) {
        safe.push(fn);
      }
    }
    return safe;
  }

  // Get a concise summary of capabilities for the AI
  getCapabilitiesSummary() {
    const summary = [];
    
    for (const [categoryId, category] of this.categories) {
      summary.push(`${category.name}: ${category.functions.length} functions`);
    }
    
    return summary.join(', ');
  }
}

module.exports = FunctionRegistry;