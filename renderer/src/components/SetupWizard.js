import React, { useState, useEffect } from 'react';
import { Server, Users, Send, CheckCircle, ArrowRight, ArrowLeft, Loader2, X, Shield, RefreshCw, AlertTriangle } from 'lucide-react';
import { getPrimarySmtpAccount, getSenderDomain as resolveSenderDomain } from '../utils/smtpAccounts';

function SetupWizard({ onComplete, onDismiss }) {
  const [step, setStep] = useState(0);
  const [smtpForm, setSmtpForm] = useState({ host: '', port: 587, secure: false, username: '', password: '', fromName: '', fromEmail: '' });
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [checkingDomainHealth, setCheckingDomainHealth] = useState(false);
  const [domainHealth, setDomainHealth] = useState(null);
  const [hasContacts, setHasContacts] = useState(false);
  const [contactCount, setContactCount] = useState(0);

  const getSenderDomain = (form = smtpForm) => {
    return resolveSenderDomain(form);
  };

  const runDomainHealthCheck = async (form = smtpForm) => {
    const domain = getSenderDomain(form);
    if (!domain || !window.electron?.settings?.checkDomain) {
      setDomainHealth(null);
      return null;
    }

    setCheckingDomainHealth(true);
    try {
      const result = await window.electron.settings.checkDomain(domain);
      setDomainHealth(result || null);
      return result;
    } catch (error) {
      setDomainHealth({ error: error.message, domain });
      return null;
    } finally {
      setCheckingDomainHealth(false);
    }
  };

  useEffect(() => {
    const checkExistingSetup = async () => {
      try {
        if (window.electron) {
          const preloadDomainHealth = async (form) => {
            const domain = resolveSenderDomain(form);
            if (!domain || !window.electron?.settings?.checkDomain) {
              setDomainHealth(null);
              return;
            }

            setCheckingDomainHealth(true);
            try {
              const result = await window.electron.settings.checkDomain(domain);
              setDomainHealth(result || null);
            } catch (error) {
              setDomainHealth({ error: error.message, domain });
            } finally {
              setCheckingDomainHealth(false);
            }
          };

          const smtpAccounts = await window.electron.smtpAccounts?.getActive?.();
          const primaryAccount = getPrimarySmtpAccount(smtpAccounts, { activeOnly: true });
          const smtp = primaryAccount || await window.electron.smtp.get();

          if (smtp?.host) {
            setSmtpForm(prev => ({ ...prev, ...smtp }));
            setTestResult({ success: true });
            await preloadDomainHealth(smtp);
          }
          const stats = await window.electron.contacts.getStats();
          if (stats?.total > 0) {
            setHasContacts(true);
            setContactCount(stats.total);
          }
        }
      } catch {}
    };

    checkExistingSetup();
  }, []);

  const handleTestSmtp = async () => {
    if (!smtpForm.host || !smtpForm.username) return;
    setTesting(true);
    setTestResult(null);
    try {
      const result = await window.electron.smtp.test(smtpForm);
      setTestResult(result);
      if (result?.success) {
        await window.electron.smtp.save(smtpForm);
        await runDomainHealthCheck(smtpForm);
      }

    } catch (err) {
      setTestResult({ success: false, message: err.message });
    } finally {
      setTesting(false);
    }
  };

  const handleImportContacts = async () => {
    try {
      const result = await window.electron.contacts.import();
      if (result?.success && result.contacts?.length > 0) {
        const imported = await window.electron.contacts.addBulk(result.contacts);
        setContactCount(imported?.inserted || result.contacts.length);
        setHasContacts(true);
      }
    } catch {}
  };

  const steps = [
    {
      icon: Server, title: 'Configure SMTP',
      desc: 'Set up your email sending server to start sending campaigns.',
      content: (
        <div style={{ display: 'grid', gap: '12px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: '10px' }}>
            <div>
              <label className="form-label">SMTP Host</label>
              <input className="form-input" placeholder="smtp.gmail.com" value={smtpForm.host} onChange={e => setSmtpForm(p => ({ ...p, host: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Port</label>
              <input className="form-input" type="number" value={smtpForm.port} onChange={e => setSmtpForm(p => ({ ...p, port: Number(e.target.value) }))} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <label className="form-label">Username</label>
              <input className="form-input" placeholder="your@email.com" value={smtpForm.username} onChange={e => setSmtpForm(p => ({ ...p, username: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Password</label>
              <input className="form-input" type="password" placeholder="App password" value={smtpForm.password} onChange={e => setSmtpForm(p => ({ ...p, password: e.target.value }))} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <label className="form-label">From Name</label>
              <input className="form-input" placeholder="Your Name" value={smtpForm.fromName} onChange={e => setSmtpForm(p => ({ ...p, fromName: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">From Email</label>
              <input className="form-input" placeholder="your@email.com" value={smtpForm.fromEmail} onChange={e => setSmtpForm(p => ({ ...p, fromEmail: e.target.value }))} />
            </div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
            <input type="checkbox" checked={smtpForm.secure} onChange={e => setSmtpForm(p => ({ ...p, secure: e.target.checked }))} />
            Use SSL/TLS (port 465)
          </label>
          <button className="btn btn-primary" onClick={handleTestSmtp} disabled={testing || !smtpForm.host}>
            {testing ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Testing...</> : 'Test Connection'}
          </button>
          {testResult && (
            <div style={{ padding: '10px 14px', borderRadius: '6px', fontSize: '13px', fontWeight: 500,
              background: testResult.success ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
              color: testResult.success ? '#22c55e' : '#ef4444',
              border: `1px solid ${testResult.success ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`
            }}>
              {testResult.success ? <><CheckCircle size={14} style={{ marginRight: '6px' }} /> Connected successfully!</> : testResult.message || 'Connection failed'}
            </div>
          )}
          {getSenderDomain() && (
            <div style={{ marginTop: '4px', padding: '14px', borderRadius: '10px', background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', marginBottom: '10px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
                    <Shield size={16} />
                    Domain Health
                  </div>
                  <div className="text-sm text-muted" style={{ marginTop: '4px' }}>
                    Check SPF, DKIM, DMARC, and MX for {getSenderDomain()}.
                  </div>
                </div>
                <button className="btn btn-outline" onClick={() => runDomainHealthCheck()} disabled={checkingDomainHealth}>
                  {checkingDomainHealth ? <><RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> Checking...</> : 'Check Domain'}
                </button>
              </div>

              {domainHealth?.error && (
                <div style={{ padding: '10px 12px', borderRadius: '8px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444', fontSize: '12px' }}>
                  {domainHealth.error}
                </div>
              )}

              {!domainHealth?.error && domainHealth && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px' }}>
                    {[
                      { key: 'mx', label: 'MX', found: domainHealth.mx?.found },
                      { key: 'spf', label: 'SPF', found: domainHealth.spf?.found },
                      { key: 'dkim', label: 'DKIM', found: domainHealth.dkim?.found },
                      { key: 'dmarc', label: 'DMARC', found: domainHealth.dmarc?.found }
                    ].map((item) => (
                      <div key={item.key} style={{
                        padding: '10px',
                        borderRadius: '8px',
                        border: `1px solid ${item.found ? 'rgba(34,197,94,0.3)' : 'rgba(245,158,11,0.3)'}`,
                        background: item.found ? 'rgba(34,197,94,0.06)' : 'rgba(245,158,11,0.06)',
                        fontSize: '12px'
                      }}>
                        <div style={{ fontWeight: 600 }}>{item.label}</div>
                        <div className="text-sm text-muted" style={{ marginTop: '4px' }}>
                          {item.found ? 'Detected' : 'Needs attention'}
                        </div>
                      </div>
                    ))}
                  </div>

                  {domainHealth.mx?.found && domainHealth.spf?.found && domainHealth.dkim?.found && domainHealth.dmarc?.found ? (
                    <div style={{ marginTop: '10px', padding: '10px 12px', borderRadius: '8px', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', color: '#22c55e', fontSize: '12px', fontWeight: 600 }}>
                      Domain health looks good for inbox delivery.
                    </div>
                  ) : (
                    <div style={{ marginTop: '10px', padding: '10px 12px', borderRadius: '8px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', color: '#d97706', fontSize: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
                        <AlertTriangle size={14} />
                        Inbox placement can improve further
                      </div>
                      <div style={{ marginTop: '4px' }}>
                        You can continue setup now and finish the remaining DNS records later in Settings.
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )
    },
    {
      icon: Users, title: 'Import Contacts',
      desc: 'Add your email recipients. You can import from CSV, Excel, or add them manually later.',
      content: (
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          {hasContacts ? (
            <div>
              <CheckCircle size={48} style={{ color: 'var(--success)', margin: '0 auto 12px' }} />
              <p style={{ fontSize: '18px', fontWeight: 600 }}>{contactCount.toLocaleString()} contacts ready</p>
              <p className="text-sm text-muted mt-2">You can import more anytime from the Contacts page.</p>
            </div>
          ) : (
            <div>
              <Users size={48} style={{ color: 'var(--accent)', margin: '0 auto 12px', opacity: 0.5 }} />
              <p className="text-muted mb-4">Import a CSV or Excel file with your contacts</p>
              <button className="btn btn-primary" onClick={handleImportContacts}>
                <Users size={16} /> Import Contacts
              </button>
              <p className="text-sm text-muted mt-3">Or skip this step and add contacts later.</p>
            </div>
          )}
        </div>
      )
    },
    {
      icon: Send, title: 'You\'re Ready!',
      desc: 'Your setup is complete. Start by creating your first email campaign.',
      content: (
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'rgba(34,197,94,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <CheckCircle size={40} style={{ color: '#22c55e' }} />
          </div>
          <p style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>Bulky is ready to send!</p>
          <p className="text-sm text-muted">Head to Campaigns to create your first email blast, or explore the app at your own pace.</p>
        </div>
      )
    }
  ];

  const currentStep = steps[step];
  const StepIcon = currentStep.icon;
  const canProceed = step === 0 ? !!testResult?.success : true;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--bg-primary)', borderRadius: '16px', width: '560px', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        {/* Header */}
        <div style={{ padding: '24px 24px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'var(--accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <StepIcon size={20} style={{ color: 'var(--accent)' }} />
              </div>
              <h2 style={{ margin: 0, fontSize: '18px' }}>{currentStep.title}</h2>
            </div>
            <p className="text-sm text-muted" style={{ marginLeft: '46px' }}>{currentStep.desc}</p>
          </div>
          <button onClick={onDismiss} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px' }}>
            <X size={18} />
          </button>
        </div>

        {/* Step indicator */}
        <div style={{ display: 'flex', gap: '6px', padding: '16px 24px', justifyContent: 'center' }}>
          {steps.map((_, i) => (
            <div key={i} style={{ width: i === step ? '32px' : '8px', height: '8px', borderRadius: '4px', transition: 'all 0.3s',
              background: i < step ? 'var(--success)' : i === step ? 'var(--accent)' : 'var(--border)' }} />
          ))}
        </div>

        {/* Content */}
        <div style={{ padding: '0 24px 24px' }}>
          {currentStep.content}
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
          <button className="btn btn-outline" onClick={() => step > 0 ? setStep(step - 1) : onDismiss()}>
            {step > 0 ? <><ArrowLeft size={14} /> Back</> : 'Skip Setup'}
          </button>
          {step < steps.length - 1 ? (
            <button className="btn btn-primary" onClick={() => setStep(step + 1)} disabled={step === 0 && !canProceed}>
              Next <ArrowRight size={14} />
            </button>
          ) : (
            <button className="btn btn-primary" onClick={onComplete}>
              Get Started <ArrowRight size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default SetupWizard;
