const dns = require('dns').promises;
const net = require('net');

class VerificationService {
  constructor() {
    this.emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    
    // Common disposable email domains
    this.disposableDomains = new Set([
      'tempmail.com', 'throwaway.email', 'guerrillamail.com', 'mailinator.com',
      '10minutemail.com', 'temp-mail.org', 'fakeinbox.com', 'trashmail.com',
      'sharklasers.com', 'guerrillamail.info', 'grr.la', 'spam4.me',
      'dispostable.com', 'yopmail.com', 'getnada.com', 'tempail.com'
    ]);

    // Common role-based prefixes (often undeliverable)
    this.roleBasedPrefixes = [
      'admin', 'administrator', 'webmaster', 'hostmaster', 'postmaster',
      'info', 'support', 'sales', 'marketing', 'help', 'contact',
      'noreply', 'no-reply', 'donotreply', 'mailer-daemon', 'abuse'
    ];
  }

  validateSyntax(email) {
    if (!email || typeof email !== 'string') {
      return { valid: false, reason: 'Empty or invalid input' };
    }

    const trimmed = email.trim().toLowerCase();
    
    if (!this.emailRegex.test(trimmed)) {
      return { valid: false, reason: 'Invalid email format' };
    }

    if (trimmed.length > 254) {
      return { valid: false, reason: 'Email too long' };
    }

    const [localPart, domain] = trimmed.split('@');
    
    if (localPart.length > 64) {
      return { valid: false, reason: 'Local part too long' };
    }

    return { valid: true, email: trimmed, localPart, domain };
  }

  async checkMxRecords(domain) {
    try {
      const records = await dns.resolveMx(domain);
      if (records && records.length > 0) {
        // Sort by priority (lower is better)
        records.sort((a, b) => a.priority - b.priority);
        return { 
          valid: true, 
          mxRecords: records.map(r => r.exchange),
          primaryMx: records[0].exchange
        };
      }
      return { valid: false, reason: 'No MX records found' };
    } catch (error) {
      if (error.code === 'ENOTFOUND' || error.code === 'ENODATA') {
        return { valid: false, reason: 'Domain does not exist' };
      }
      return { valid: false, reason: `DNS error: ${error.message}` };
    }
  }

  checkDisposable(domain) {
    return this.disposableDomains.has(domain);
  }

  checkRoleBased(localPart) {
    return this.roleBasedPrefixes.some(prefix => 
      localPart === prefix || localPart.startsWith(prefix + '.')
    );
  }

  // SMTP mailbox verification (use with caution - some servers block this)
  async verifyMailbox(email, mxHost) {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        socket.destroy();
        resolve({ valid: false, reason: 'Connection timeout' });
      }, 10000);

      const socket = net.createConnection(25, mxHost);
      let step = 0;
      let response = '';

      socket.on('data', (data) => {
        response = data.toString();
        
        if (step === 0 && response.startsWith('220')) {
          socket.write(`HELO verify.local\r\n`);
          step++;
        } else if (step === 1 && response.startsWith('250')) {
          socket.write(`MAIL FROM:<verify@verify.local>\r\n`);
          step++;
        } else if (step === 2 && response.startsWith('250')) {
          socket.write(`RCPT TO:<${email}>\r\n`);
          step++;
        } else if (step === 3) {
          socket.write(`QUIT\r\n`);
          clearTimeout(timeout);
          
          if (response.startsWith('250')) {
            resolve({ valid: true, deliverable: true });
          } else if (response.startsWith('550') || response.startsWith('551') || 
                     response.startsWith('552') || response.startsWith('553')) {
            resolve({ valid: false, reason: 'Mailbox does not exist' });
          } else {
            resolve({ valid: true, deliverable: 'unknown', reason: 'Could not verify mailbox' });
          }
        }
      });

      socket.on('error', () => {
        clearTimeout(timeout);
        resolve({ valid: true, deliverable: 'unknown', reason: 'SMTP check unavailable' });
      });

      socket.on('close', () => {
        clearTimeout(timeout);
      });
    });
  }

  async verifyEmail(email, skipSmtpCheck = false) {
    const result = {
      email: email,
      status: 'unknown',
      score: 0,
      checks: {}
    };

    // Step 1: Syntax validation
    const syntaxResult = this.validateSyntax(email);
    result.checks.syntax = syntaxResult.valid;
    
    if (!syntaxResult.valid) {
      result.status = 'invalid';
      result.reason = syntaxResult.reason;
      return result;
    }

    result.email = syntaxResult.email;
    result.score += 20;

    // Step 2: Check if disposable
    const isDisposable = this.checkDisposable(syntaxResult.domain);
    result.checks.disposable = !isDisposable;
    
    if (isDisposable) {
      result.status = 'risky';
      result.reason = 'Disposable email domain';
      result.score += 10;
      return result;
    }
    result.score += 20;

    // Step 3: Check if role-based
    const isRoleBased = this.checkRoleBased(syntaxResult.localPart);
    result.checks.roleBased = !isRoleBased;
    
    if (isRoleBased) {
      result.score -= 10; // Penalty but not invalid
    } else {
      result.score += 10;
    }

    // Step 4: MX record check
    const mxResult = await this.checkMxRecords(syntaxResult.domain);
    result.checks.mxRecords = mxResult.valid;
    
    if (!mxResult.valid) {
      result.status = 'invalid';
      result.reason = mxResult.reason;
      return result;
    }
    result.score += 30;

    // Step 5: SMTP mailbox verification (optional, can be slow/risky)
    if (!skipSmtpCheck) {
      try {
        const smtpResult = await this.verifyMailbox(result.email, mxResult.primaryMx);
        result.checks.smtp = smtpResult.valid;
        
        if (!smtpResult.valid) {
          result.status = 'invalid';
          result.reason = smtpResult.reason;
          return result;
        }
        
        if (smtpResult.deliverable === true) {
          result.score += 20;
        } else {
          result.score += 10;
        }
      } catch (error) {
        result.checks.smtp = 'skipped';
        result.score += 10;
      }
    } else {
      result.checks.smtp = 'skipped';
      result.score += 10;
    }

    // Determine final status based on score
    if (result.score >= 80) {
      result.status = 'valid';
    } else if (result.score >= 50) {
      result.status = 'risky';
      result.reason = result.reason || 'Some verification checks could not be completed';
    } else {
      result.status = 'invalid';
      result.reason = result.reason || 'Failed multiple verification checks';
    }

    return result;
  }

  async verifyBulk(emails, onProgress, skipSmtpCheck = true) {
    const results = [];
    const total = emails.length;

    for (let i = 0; i < emails.length; i++) {
      const email = emails[i];
      
      try {
        const result = await this.verifyEmail(email, skipSmtpCheck);
        results.push(result);
      } catch (error) {
        results.push({
          email,
          status: 'error',
          reason: error.message,
          score: 0,
          checks: {}
        });
      }

      onProgress({
        current: i + 1,
        total,
        email,
        status: results[results.length - 1].status
      });

      // Small delay to prevent overwhelming DNS servers
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return {
      results,
      summary: {
        total,
        valid: results.filter(r => r.status === 'valid').length,
        risky: results.filter(r => r.status === 'risky').length,
        invalid: results.filter(r => r.status === 'invalid').length,
        error: results.filter(r => r.status === 'error').length
      }
    };
  }
}

module.exports = VerificationService;
