import React from 'react';
import { Save, TestTube } from 'lucide-react';

export default function SmtpConfigTab({
  smtpSettings,
  setSmtpSettings,
  handleSaveSmtp,
  handleTestConnection,
  testing
}) {
  return (
    <div className="card">
      <h3 className="card-title mb-4">SMTP Server Settings</h3>
      <p className="text-muted mb-4">
        Configure your primary outgoing mail server. These settings are required to send emails.
      </p>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">SMTP Host *</label>
          <input
            type="text"
            className="form-input"
            placeholder="smtp.example.com"
            value={smtpSettings.host}
            onChange={(e) => setSmtpSettings({ ...smtpSettings, host: e.target.value })}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Port *</label>
          <input
            type="number"
            className="form-input"
            placeholder="587"
            value={smtpSettings.port}
            onChange={(e) => setSmtpSettings({ ...smtpSettings, port: parseInt(e.target.value, 10) })}
          />
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Username *</label>
          <input
            type="text"
            className="form-input"
            placeholder="your@email.com"
            value={smtpSettings.username}
            onChange={(e) => setSmtpSettings({ ...smtpSettings, username: e.target.value })}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Password *</label>
          <input
            type="password"
            className="form-input"
            placeholder={smtpSettings.hasStoredPassword ? 'Leave blank to keep the saved password' : '...'}
            value={smtpSettings.password}
            onChange={(e) => setSmtpSettings({ ...smtpSettings, password: e.target.value, hasStoredPassword: smtpSettings.hasStoredPassword })}
          />
          <small className="text-muted">
            {smtpSettings.hasStoredPassword
              ? 'A password is already stored locally. Enter a new one only if you want to replace it.'
              : 'The password is stored locally and is not sent back into the renderer after it is saved.'}
          </small>
        </div>
      </div>

      <div className="form-group">
        <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input
            type="checkbox"
            checked={smtpSettings.secure}
            onChange={(e) => setSmtpSettings({ ...smtpSettings, secure: e.target.checked })}
          />
          Use SSL/TLS (port 465)
        </label>
      </div>

      <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '24px 0' }} />

      <h4 style={{ marginBottom: '16px' }}>Sender Information</h4>
      <p className="text-muted mb-3" style={{ fontSize: '13px' }}>
        The <strong>From Email</strong> is what recipients see in their inbox. Some SMTP providers
        may override this with the authenticated username, so use a matching address for best results.
      </p>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">From Name *</label>
          <input
            type="text"
            className="form-input"
            placeholder="Your Name or Company"
            value={smtpSettings.fromName}
            onChange={(e) => setSmtpSettings({ ...smtpSettings, fromName: e.target.value })}
          />
        </div>
        <div className="form-group">
          <label className="form-label">From Email *</label>
          <input
            type="email"
            className="form-input"
            placeholder="noreply@yourdomain.com"
            value={smtpSettings.fromEmail}
            onChange={(e) => setSmtpSettings({ ...smtpSettings, fromEmail: e.target.value })}
          />
          <small className="text-muted">Tip: Use an address that matches your sending domain for better deliverability</small>
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Reply-To Email</label>
        <input
          type="email"
          className="form-input"
          placeholder="replies@yourdomain.com (optional)"
          value={smtpSettings.replyTo || ''}
          onChange={(e) => setSmtpSettings({ ...smtpSettings, replyTo: e.target.value })}
        />
        <small className="text-muted">Where replies should go (defaults to From Email)</small>
      </div>

      <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '24px 0' }} />

      <h4 style={{ marginBottom: '16px' }}>Unsubscribe Headers</h4>
      <p className="text-muted mb-3" style={{ fontSize: '13px' }}>
        Adding unsubscribe options helps your emails reach the inbox.
      </p>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Unsubscribe Email</label>
          <input
            type="email"
            className="form-input"
            placeholder="unsubscribe@yourdomain.com"
            value={smtpSettings.unsubscribeEmail || ''}
            onChange={(e) => setSmtpSettings({ ...smtpSettings, unsubscribeEmail: e.target.value })}
          />
          <small className="text-muted">Adds List-Unsubscribe header</small>
        </div>
        <div className="form-group">
          <label className="form-label">Unsubscribe URL</label>
          <input
            type="url"
            className="form-input"
            placeholder="https://yourdomain.com/unsubscribe"
            value={smtpSettings.unsubscribeUrl || ''}
            onChange={(e) => setSmtpSettings({ ...smtpSettings, unsubscribeUrl: e.target.value })}
          />
          <small className="text-muted">Alternative to email (use one)</small>
        </div>
      </div>

      <div className="flex gap-3 mt-4">
        <button className="btn btn-primary" onClick={handleSaveSmtp}>
          <Save size={16} /> Save Settings
        </button>
        <button className="btn btn-outline" onClick={handleTestConnection} disabled={testing}>
          <TestTube size={16} /> {testing ? 'Testing...' : 'Test Connection'}
        </button>
      </div>

      <div className="card mt-4" style={{ background: 'var(--bg-tertiary)', padding: '16px' }}>
        <h5 style={{ fontSize: '14px', marginBottom: '12px' }}>Common SMTP Settings:</h5>
        <div className="text-sm text-muted">
          <p><strong>Gmail:</strong> smtp.gmail.com, Port 587, Use App Password</p>
          <p><strong>Outlook:</strong> smtp-mail.outlook.com, Port 587</p>
          <p><strong>cPanel:</strong> mail.yourdomain.com, Port 465 (SSL) or 587</p>
          <p><strong>Amazon SES:</strong> email-smtp.[region].amazonaws.com, Port 587</p>
        </div>
      </div>
    </div>
  );
}
