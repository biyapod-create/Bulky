import React, { useState, useEffect, useRef, useCallback } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Play, Pause, Square, Download, Trash2, RefreshCw, Users, Mail, Loader2, Globe, Server, AtSign, Shield } from 'lucide-react';
import { useToast } from '../components/ToastContext';

function Verify({ isActive }) {
  const { addToast } = useToast();
  const [mode, setMode] = useState('single');
  const [verificationDepth, setVerificationDepth] = useState('quick');
  const [singleEmail, setSingleEmail] = useState('');
  const [singleResult, setSingleResult] = useState(null);
  const [verifySteps, setVerifySteps] = useState([]);
  const [bulkEmails, setBulkEmails] = useState('');
  const [bulkResults, setBulkResults] = useState(null);
  const [progress, setProgress] = useState(null);
  const [liveResults, setLiveResults] = useState([]);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [contacts, setContacts] = useState([]);
  const liveResultsRef = useRef([]);
  const verifyingRef = useRef(false); // tracks actual in-flight state

  // Refresh contacts when tab becomes active
  useEffect(() => {
    if (isActive) loadContacts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  // React to new contacts being added/imported in the background
  useEffect(() => {
    if (!window.electron?.onDataChanged) return;
    const unsub = window.electron.onDataChanged((data) => {
      if (data.type === 'contacts') loadContacts();
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadContacts();
    let cleanup;
    if (window.electron?.verify?.onProgress) {
      cleanup = window.electron.verify.onProgress((data) => {
        if (!verifyingRef.current) return; // ignore stale callbacks
        setProgress(data);
        // Accumulate live results for real-time feedback
        if (data.email && data.status) {
          const entry = { email: data.email, status: data.status };
          liveResultsRef.current = [entry, ...liveResultsRef.current].slice(0, 50);
          setLiveResults([...liveResultsRef.current]);
        }
        // Track paused state from backend
        if (data.paused !== undefined) setIsPaused(!!data.paused);
      });
    }
    return () => {
      if (cleanup) cleanup();
      else if (window.electron?.verify?.removeProgressListener) {
        window.electron.verify.removeProgressListener();
      }
    };
  }, []);

  const loadContacts = async () => {
    try {
      if (window.electron) {
        const data = await window.electron.contacts.getAll();
        setContacts(Array.isArray(data) ? data : []);
      }
    } catch (error) {
    }
  };

  const resetVerificationState = useCallback(() => {
    verifyingRef.current = false;
    setIsVerifying(false);
    setIsPaused(false);
    setProgress(null);
  }, []);

  const handleSingleVerify = async () => {
    if (!singleEmail) {
      addToast('Please enter an email address', 'error');
      return;
    }
    setIsVerifying(true);
    verifyingRef.current = true;
    setSingleResult(null);

    // Show animated verification steps
    const steps = [
      { label: 'Checking email syntax', icon: AtSign, key: 'syntax' },
      { label: 'Looking up MX records', icon: Globe, key: 'mx' },
      { label: 'Checking DNS records', icon: Server, key: 'dns' },
      { label: 'Analyzing domain reputation', icon: Shield, key: 'reputation' },
    ];
    if (isDeepVerification) {
      steps.push({ label: 'Testing mailbox response', icon: Mail, key: 'smtp' });
    }
    setVerifySteps(steps.map(s => ({ ...s, status: 'pending' })));

    // Animate steps sequentially
    for (let i = 0; i < steps.length; i++) {
      setVerifySteps(prev => prev.map((s, idx) =>
        idx === i ? { ...s, status: 'running' } : idx < i ? { ...s, status: 'done' } : s
      ));
      await new Promise(r => setTimeout(r, 400 + Math.random() * 300));
    }
    setVerifySteps(prev => prev.map(s => ({ ...s, status: 'done' })));

    try {
      const result = await window.electron.verify.email(singleEmail, { smtpCheck: isDeepVerification });
      if (result && result.error) {
        addToast(result.error, 'error');
        setVerifySteps([]);
      } else {
        setSingleResult(result);
      }
    } catch (error) {
      addToast('Verification failed', 'error');
      setVerifySteps([]);
    } finally {
      resetVerificationState();
    }
  };

  const handleBulkVerify = async () => {
    const emails = bulkEmails.split('\n').map(e => e.trim()).filter(e => e);
    if (emails.length === 0) {
      addToast('Please enter at least one email', 'error');
      return;
    }
    setIsVerifying(true);
    verifyingRef.current = true;
    setBulkResults(null);
    liveResultsRef.current = [];
    setLiveResults([]);
    setIsPaused(false);
    setProgress({ current: 0, total: emails.length });
    try {
      const result = await window.electron.verify.bulk(emails, { smtpCheck: isDeepVerification });
      if (result && result.error) {
        addToast(result.error, 'error');
      } else {
        setBulkResults(result);
        const count = result?.results?.length || 0;
        addToast(`Verification complete: ${count} emails processed`, 'success');
        if (window.__bulkyNotify) {
          const valid = result?.summary?.valid || 0;
          const invalid = result?.summary?.invalid || 0;
          window.__bulkyNotify({ type: 'verification_complete', title: 'Verification Complete', message: `${count} processed: ${valid} valid, ${invalid} invalid` });
        }
      }
    } catch (error) {
      addToast('Bulk verification failed', 'error');
    } finally {
      resetVerificationState();
      loadContacts();
    }
  };

  const handleVerifyContacts = async () => {
    const unverified = contacts.filter(c => !c.verificationStatus || c.verificationStatus === 'unverified');
    if (unverified.length === 0) {
      addToast('No unverified contacts found', 'info');
      return;
    }
    const emails = unverified.map(c => c.email);
    setMode('bulk');
    setBulkEmails(emails.join('\n'));
    setIsVerifying(true);
    verifyingRef.current = true;
    setBulkResults(null);
    liveResultsRef.current = [];
    setLiveResults([]);
    setIsPaused(false);
    setProgress({ current: 0, total: emails.length });

    try {
      const result = await window.electron.verify.bulk(emails, { smtpCheck: isDeepVerification });
      if (result?.error) {
        addToast(result.error, 'error');
        return;
      }
      setBulkResults(result);
      // Backend already persists verification results to contacts table
      const resultList = result?.results || (Array.isArray(result) ? result : []);
      addToast(`Verification complete: ${resultList.length} emails processed`, 'success');
    } catch (error) {
      addToast('Verification failed: ' + (error.message || 'Unknown error'), 'error');
    } finally {
      resetVerificationState();
      loadContacts();
    }
  };

  // Pause / Resume / Stop handlers
  const handlePause = async () => {
    try {
      await window.electron.verify.pause();
      setIsPaused(true);
      addToast('Verification paused', 'info');
    } catch (error) {
    }
  };

  const handleResume = async () => {
    try {
      await window.electron.verify.resume();
      setIsPaused(false);
      addToast('Verification resumed', 'info');
    } catch (error) {
    }
  };

  const handleStop = async () => {
    try {
      await window.electron.verify.stop();
      addToast('Verification stopped', 'warning');
    } catch (error) {
    }
    // The verify:bulk promise will resolve/reject and the finally block will clean up
  };

  // Smart Workflow Actions
  const handleDeleteInvalid = async () => {
    if (!bulkResults) return;
    const resultList = bulkResults?.results || [];
    const invalidEmails = resultList.filter(r => r.status === 'invalid').map(r => r.email);
    if (invalidEmails.length === 0) {
      addToast('No invalid emails to delete', 'info');
      return;
    }
    if (!window.confirm(`Delete ${invalidEmails.length} invalid email(s) from contacts?`)) return;

    try {
      const result = await window.electron.contacts.deleteByVerification('invalid');
      addToast(`Deleted ${result?.deleted || 0} invalid contacts`, 'success');
      loadContacts();
    } catch (error) {
      addToast('Failed to delete invalid contacts', 'error');
    }
  };

  const handleExportValid = async () => {
    if (!bulkResults) return;
    const resultList2 = bulkResults?.results || [];
    const validResults = resultList2.filter(r => r.status === 'valid');
    if (validResults.length === 0) {
      addToast('No valid emails to export', 'info');
      return;
    }
    try {
      const result = await window.electron.export.verificationResults(validResults);
      if (result.success) {
        addToast(`Exported ${validResults.length} valid emails`, 'success');
      }
    } catch (error) {
      addToast('Export failed', 'error');
    }
  };

  const handleAddValidToList = async () => {
    if (!bulkResults) return;
    const resultList3 = bulkResults?.results || [];
    const validEmails = resultList3.filter(r => r.status === 'valid');
    if (validEmails.length === 0) {
      addToast('No valid emails to add', 'info');
      return;
    }
    try {
      const toAdd = validEmails.map(r => ({
        email: r.email,
        status: 'active',
        verificationStatus: 'valid',
        verificationScore: r.score || 0
      }));
      const result = await window.electron.contacts.addBulk(toAdd);
      addToast(`Added ${result?.inserted || 0} valid contacts (${result?.skipped || 0} already exist)`, 'success');
      loadContacts();
    } catch (error) {
      addToast('Failed to add contacts', 'error');
    }
  };

  const handleBlacklistInvalid = async () => {
    if (!bulkResults) return;
    const resultList4 = bulkResults?.results || [];
    const invalidEmails2 = resultList4.filter(r => r.status === 'invalid').map(r => r.email);
    if (invalidEmails2.length === 0) {
      addToast('No invalid emails to blacklist', 'info');
      return;
    }
    try {
      const result = await window.electron.blacklist.addBulk(invalidEmails2);
      addToast(`Added ${result?.added || 0} emails to blacklist`, 'success');
    } catch (error) {
      addToast('Failed to add to blacklist', 'error');
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'valid': return <CheckCircle size={20} style={{ color: 'var(--success)' }} />;
      case 'invalid': return <XCircle size={20} style={{ color: 'var(--error)' }} />;
      case 'risky': return <AlertTriangle size={20} style={{ color: 'var(--warning)' }} />;
      default: return <AlertTriangle size={20} style={{ color: 'var(--text-muted)' }} />;
    }
  };

  const exportAllResults = async () => {
    if (!bulkResults) return;
    try {
      const result = await window.electron.export.verificationResults(bulkResults?.results || []);
      if (result.success) addToast('Results exported', 'success');
    } catch (error) {
      addToast('Export failed', 'error');
    }
  };

  const unverifiedCount = contacts.filter(c => !c.verificationStatus || c.verificationStatus === 'unverified').length;
  const progressPercent = progress ? Math.round((progress.current / Math.max(progress.total, 1)) * 100) : 0;
  const isDeepVerification = verificationDepth === 'deep';
  const verificationModeLabel = isDeepVerification ? 'Deep mailbox checks' : 'Fast DNS checks';

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Verify Contact</h1>
        <p className="page-subtitle">Validate contacts with a clearer workflow so you can see what Bulky is checking and why a result is valid, risky, or invalid.</p>
      </div>

      {/* Contact List Health Overview */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)', marginBottom: '20px' }}>
        <div className="stat-card">
          <div className="stat-icon" style={{ color: 'var(--accent)' }}><Users size={20} /></div>
          <div className="stat-content">
            <div className="stat-value">{contacts.length}</div>
            <div className="stat-label">Total Contacts</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ color: 'var(--success)' }}><CheckCircle size={20} /></div>
          <div className="stat-content">
            <div className="stat-value" style={{ color: 'var(--success)' }}>{contacts.filter(c => c.verificationStatus === 'valid').length}</div>
            <div className="stat-label">Valid</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ color: 'var(--warning)' }}><AlertTriangle size={20} /></div>
          <div className="stat-content">
            <div className="stat-value" style={{ color: 'var(--warning)' }}>{contacts.filter(c => c.verificationStatus === 'risky').length}</div>
            <div className="stat-label">Risky</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ color: 'var(--error)' }}><XCircle size={20} /></div>
          <div className="stat-content">
            <div className="stat-value" style={{ color: 'var(--error)' }}>{contacts.filter(c => c.verificationStatus === 'invalid').length}</div>
            <div className="stat-label">Invalid</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ color: 'var(--text-muted)' }}><Mail size={20} /></div>
          <div className="stat-content">
            <div className="stat-value">{unverifiedCount}</div>
            <div className="stat-label">Unverified</div>
          </div>
        </div>
      </div>

      {/* Verification Health Bar */}
      {contacts.length > 0 && (
        <div className="card" style={{ padding: '16px 20px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <Shield size={16} style={{ color: 'var(--accent)' }} />
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>List Health</span>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: 'auto' }}>
              {contacts.length > 0 ? Math.round((contacts.filter(c => c.verificationStatus === 'valid').length / contacts.length) * 100) : 0}% verified
            </span>
          </div>
          <div style={{ display: 'flex', height: '8px', borderRadius: '4px', overflow: 'hidden', background: 'var(--bg-tertiary)' }}>
            <div style={{ width: `${contacts.length > 0 ? (contacts.filter(c => c.verificationStatus === 'valid').length / contacts.length) * 100 : 0}%`, background: 'var(--success)', transition: 'width 0.3s' }} />
            <div style={{ width: `${contacts.length > 0 ? (contacts.filter(c => c.verificationStatus === 'risky').length / contacts.length) * 100 : 0}%`, background: 'var(--warning)', transition: 'width 0.3s' }} />
            <div style={{ width: `${contacts.length > 0 ? (contacts.filter(c => c.verificationStatus === 'invalid').length / contacts.length) * 100 : 0}%`, background: 'var(--error)', transition: 'width 0.3s' }} />
          </div>
        </div>
      )}

      <div className="card" style={{ marginBottom: '20px' }}>
        <div className="flex justify-between items-center" style={{ gap: '12px', flexWrap: 'wrap', marginBottom: '14px' }}>
          <div>
            <h3 className="card-title" style={{ margin: 0 }}>Verification Mode</h3>
            <div className="text-sm text-muted" style={{ marginTop: '6px' }}>
              {verificationModeLabel} {isDeepVerification ? 'check DNS plus mailbox behavior when the receiving server allows it.' : 'keep the check quick using syntax, DNS, and domain intelligence.'}
            </div>
          </div>
          <div className="flex gap-2">
            <button className={`btn ${verificationDepth === 'quick' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setVerificationDepth('quick')} disabled={isVerifying}>
              Fast Check
            </button>
            <button className={`btn ${verificationDepth === 'deep' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setVerificationDepth('deep')} disabled={isVerifying}>
              Deep Check
            </button>
          </div>
        </div>
        <div className="panel-grid">
          <div className="insight-card">
            <div className="insight-value">{verificationModeLabel}</div>
            <div className="insight-label">Current Workflow</div>
            <div className="insight-meta">
              {isDeepVerification
                ? 'Best when you want stronger mailbox-level confidence and can allow a slower run.'
                : 'Best for fast list hygiene and safer bulk verification at scale.'}
            </div>
          </div>
          <div className="insight-card">
            <div className="insight-value">{isDeepVerification ? 'Syntax → DNS → Mailbox' : 'Syntax → DNS → Reputation'}</div>
            <div className="insight-label">Process Visibility</div>
            <div className="insight-meta">
              Bulky now shows each step more clearly while verification is running and summarizes the evidence after completion.
            </div>
          </div>
        </div>
      </div>

      <div className="tabs">
        <button className={`tab ${mode === 'single' ? 'active' : ''}`} onClick={() => !isVerifying && setMode('single')} disabled={isVerifying}>
          <Mail size={14} style={{ marginRight: '6px' }} /> Single Email
        </button>
        <button className={`tab ${mode === 'bulk' ? 'active' : ''}`} onClick={() => !isVerifying && setMode('bulk')} disabled={isVerifying}>
          <Users size={14} style={{ marginRight: '6px' }} /> Bulk Verification
        </button>
      </div>

      {mode === 'single' && (
        <div className="card">
          <div className="form-group">
            <label className="form-label">Email Address</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input type="email" className="form-input" placeholder="someone@example.com" value={singleEmail} onChange={(e) => setSingleEmail(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleSingleVerify()} style={{ flex: 1 }} />
              <button className="btn btn-primary" onClick={handleSingleVerify} disabled={isVerifying}>
                {isVerifying ? <><Loader2 size={16} className="animate-spin" /> Checking...</> : <><Play size={16} /> Verify</>}
              </button>
            </div>
          </div>

          {!singleResult && !isVerifying && verifySteps.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
              <Mail size={48} style={{ opacity: 0.2, marginBottom: '12px' }} />
              <p style={{ fontSize: '14px' }}>Enter an email address to check its validity</p>
              <p style={{ fontSize: '12px', marginTop: '6px' }}>
                {isDeepVerification
                  ? 'We check syntax, MX records, DNS, domain reputation, and mailbox behavior when supported.'
                  : 'We check syntax, MX records, DNS, and domain reputation for a fast deliverability signal.'}
              </p>
            </div>
          )}

          {/* Verification steps animation */}
          {verifySteps.length > 0 && !singleResult && (
            <div style={{ marginTop: '20px', padding: '20px', background: 'var(--bg-tertiary)', borderRadius: '10px' }}>
              <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '16px', color: 'var(--text)' }}>Verifying {singleEmail}...</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {verifySteps.map((step) => {
                  const StepIcon = step.icon;
                  return (
                    <div key={step.key} style={{ display: 'flex', alignItems: 'center', gap: '12px', opacity: step.status === 'pending' ? 0.4 : 1, transition: 'opacity 0.3s' }}>
                      <div style={{ width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: step.status === 'done' ? 'rgba(34,197,94,0.15)' : step.status === 'running' ? 'rgba(91,180,212,0.15)' : 'var(--bg-secondary)' }}>
                        {step.status === 'running' ? <Loader2 size={16} className="animate-spin" style={{ color: 'var(--accent)' }} />
                          : step.status === 'done' ? <CheckCircle size={16} style={{ color: 'var(--success)' }} />
                          : <StepIcon size={16} style={{ color: 'var(--text-muted)' }} />}
                      </div>
                      <span style={{ fontSize: '13px', fontWeight: step.status === 'running' ? 600 : 400, color: step.status === 'running' ? 'var(--text)' : 'var(--text-secondary)' }}>{step.label}</span>
                      {step.status === 'done' && <CheckCircle size={14} style={{ color: 'var(--success)', marginLeft: 'auto' }} />}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {singleResult && (
            <div style={{ marginTop: '20px', padding: '24px', background: 'var(--bg-tertiary)', borderRadius: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: singleResult.status === 'valid' ? 'rgba(34,197,94,0.15)' : singleResult.status === 'invalid' ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)' }}>
                  {getStatusIcon(singleResult.status)}
                </div>
                <div style={{ flex: 1 }}>
                  <h4 style={{ margin: 0, fontSize: '16px', color: 'var(--text)' }}>{singleResult.email}</h4>
                  <span className={`badge badge-${singleResult.status === 'valid' ? 'success' : singleResult.status === 'invalid' ? 'error' : 'warning'}`} style={{ marginTop: '4px' }}>{singleResult.status}</span>
                </div>
                <div className={`score-circle ${singleResult.score >= 80 ? 'excellent' : singleResult.score >= 60 ? 'good' : singleResult.score >= 40 ? 'fair' : 'poor'}`} style={{ width: '64px', height: '64px' }}>
                  <span className="score-value" style={{ fontSize: '20px' }}>{singleResult.score}</span>
                </div>
              </div>
              {singleResult.reason && <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px', padding: '10px 14px', background: 'var(--bg-secondary)', borderRadius: '8px' }}>{singleResult.reason}</p>}
              <div className="panel-grid" style={{ marginBottom: '16px' }}>
                <div className="insight-card" style={{ padding: '16px' }}>
                  <div className="insight-value" style={{ fontSize: '18px' }}>{singleResult.details?.method || 'dns_only'}</div>
                  <div className="insight-label">Method Used</div>
                  <div className="insight-meta">Shows whether Bulky completed DNS-only verification or reached SMTP/mailbox checks.</div>
                </div>
                <div className="insight-card" style={{ padding: '16px' }}>
                  <div className="insight-value" style={{ fontSize: '18px' }}>{singleResult.details?.inboxProvider || 'Unknown'}</div>
                  <div className="insight-label">Inbox Provider</div>
                  <div className="insight-meta">Detected from MX records so you can understand where the mailbox is hosted.</div>
                </div>
                <div className="insight-card" style={{ padding: '16px' }}>
                  <div className="insight-value" style={{ fontSize: '18px' }}>{singleResult.details?.smtpCode || '—'}</div>
                  <div className="insight-label">SMTP Signal</div>
                  <div className="insight-meta">{singleResult.details?.smtpResponse || 'Mailbox-level checks were skipped or unavailable for this result.'}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
                <span className={`badge ${singleResult.details?.isDisposable ? 'badge-warning' : 'badge-success'}`}>Disposable: {singleResult.details?.isDisposable ? 'Yes' : 'No'}</span>
                <span className={`badge ${singleResult.details?.isRoleBased ? 'badge-warning' : 'badge-success'}`}>Role-based: {singleResult.details?.isRoleBased ? 'Yes' : 'No'}</span>
                <span className={`badge ${singleResult.details?.isCatchAll ? 'badge-warning' : 'badge-success'}`}>Catch-all: {singleResult.details?.isCatchAll ? 'Yes' : 'No'}</span>
                <span className={`badge ${singleResult.details?.isGreylisted ? 'badge-warning' : 'badge-default'}`}>Greylisted: {singleResult.details?.isGreylisted ? 'Yes' : 'No'}</span>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {Object.entries(singleResult.checks || {}).map(([check, passed]) => (
                  <span key={check} className={`badge ${passed === true ? 'badge-success' : passed === false ? 'badge-error' : 'badge-default'}`}>{check}: {passed === true ? 'Pass' : passed === false ? 'Fail' : 'Skipped'}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {mode === 'bulk' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <h3 className="card-title" style={{ margin: 0 }}>Bulk Verification</h3>
              <div className="text-sm text-muted" style={{ marginTop: '6px' }}>
                Running {verificationModeLabel.toLowerCase()} for larger lists with live process feedback.
              </div>
            </div>
            <div className="flex gap-2" style={{ flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <span className={`badge badge-${isDeepVerification ? 'warning' : 'info'}`}>{verificationModeLabel}</span>
              <button className="btn btn-outline btn-sm" onClick={handleVerifyContacts} disabled={isVerifying}>
                <Users size={14} /> Verify {unverifiedCount} Unverified Contacts
              </button>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Email Addresses (one per line)</label>
            <textarea
              className="form-textarea"
              style={{ minHeight: '180px', fontFamily: 'monospace', fontSize: '13px' }}
              placeholder={'email1@example.com\nemail2@example.com\nemail3@example.com'}
              value={bulkEmails}
              onChange={(e) => setBulkEmails(e.target.value)}
              disabled={isVerifying}
            />
          </div>

          {/* Control buttons */}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {!isVerifying && (
              <button className="btn btn-primary" onClick={handleBulkVerify}>
                <Play size={16} /> Start Verification
              </button>
            )}
            {isVerifying && !isPaused && (
              <>
                <button className="btn btn-warning" onClick={handlePause}><Pause size={16} /> Pause</button>
                <button className="btn btn-danger" onClick={handleStop}><Square size={14} /> Stop</button>
              </>
            )}
            {isVerifying && isPaused && (
              <>
                <button className="btn btn-success" onClick={handleResume}><Play size={16} /> Resume</button>
                <button className="btn btn-danger" onClick={handleStop}><Square size={14} /> Stop</button>
              </>
            )}
            {isVerifying && (
              <span style={{ fontSize: '13px', color: isPaused ? 'var(--warning)' : 'var(--accent)', fontWeight: 600, marginLeft: '8px' }}>
                {isPaused ? 'Paused' : 'Verifying...'}
              </span>
            )}
          </div>

          {/* Progress section */}
          {progress && (
            <div style={{ marginTop: '20px' }}>
              <div className="progress-bar" style={{ position: 'relative', overflow: 'hidden' }}>
                <div className="progress-fill" style={{
                  width: `${progressPercent}%`,
                  transition: 'width 0.3s',
                  background: isPaused ? 'var(--warning)' : undefined
                }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', fontSize: '12px', color: 'var(--text-muted)' }}>
                <span>{isPaused ? 'Paused at' : 'Verifying'} {progress.current} of {progress.total}</span>
                <span>{progressPercent}%</span>
              </div>
              {progress.email && !isPaused && (
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Loader2 size={12} className="animate-spin" style={{ color: 'var(--accent)' }} />
                  Checking: <strong style={{ color: 'var(--text)' }}>{progress.email}</strong>
                </div>
              )}

              {/* Live results feed */}
              {liveResults.length > 0 && (
                <div style={{ marginTop: '12px', maxHeight: '200px', overflow: 'auto', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-tertiary)' }}>
                  {liveResults.slice(0, 25).map((r, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', borderBottom: i < Math.min(liveResults.length, 25) - 1 ? '1px solid var(--border)' : 'none', fontSize: '12px' }}>
                      {r.status === 'valid' ? <CheckCircle size={12} style={{ color: 'var(--success)', flexShrink: 0 }} />
                        : r.status === 'invalid' ? <XCircle size={12} style={{ color: 'var(--error)', flexShrink: 0 }} />
                        : <AlertTriangle size={12} style={{ color: 'var(--warning)', flexShrink: 0 }} />}
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text)' }}>{r.email}</span>
                      <span className={`badge badge-${r.status === 'valid' ? 'success' : r.status === 'invalid' ? 'error' : 'warning'}`} style={{ fontSize: '10px', padding: '2px 8px' }}>{r.status}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Results */}
          {bulkResults && (
            <div style={{ marginTop: '20px' }}>
              {/* Summary Stats */}
              <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
                <div className="stat-card"><div className="stat-value">{bulkResults?.summary?.total || 0}</div><div className="stat-label">Total Checked</div></div>
                <div className="stat-card"><div className="stat-value" style={{ color: 'var(--success)' }}>{bulkResults?.summary?.valid || 0}</div><div className="stat-label">Valid</div></div>
                <div className="stat-card"><div className="stat-value" style={{ color: 'var(--warning)' }}>{bulkResults?.summary?.risky || 0}</div><div className="stat-label">Risky</div></div>
                <div className="stat-card"><div className="stat-value" style={{ color: 'var(--error)' }}>{bulkResults?.summary?.invalid || 0}</div><div className="stat-label">Invalid</div></div>
              </div>

              {/* Smart Actions */}
              <div className="card" style={{ marginTop: '16px', background: 'var(--accent-dim)', border: '1px solid var(--accent)', padding: '16px 20px' }}>
                <h4 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: 600, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <RefreshCw size={16} /> Smart Actions
                </h4>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {(bulkResults?.summary?.valid || 0) > 0 && (
                    <>
                      <button className="btn btn-success btn-sm" onClick={handleAddValidToList}><CheckCircle size={14} /> Add {bulkResults.summary.valid} Valid to Contacts</button>
                      <button className="btn btn-outline btn-sm" onClick={handleExportValid}><Download size={14} /> Export Valid</button>
                    </>
                  )}
                  {(bulkResults?.summary?.invalid || 0) > 0 && (
                    <>
                      <button className="btn btn-danger btn-sm" onClick={handleDeleteInvalid}><Trash2 size={14} /> Delete {bulkResults.summary.invalid} Invalid</button>
                      <button className="btn btn-outline btn-sm" onClick={handleBlacklistInvalid}><XCircle size={14} /> Blacklist Invalid</button>
                    </>
                  )}
                  <button className="btn btn-outline btn-sm" onClick={exportAllResults}><Download size={14} /> Export All Results</button>
                </div>
              </div>

              {/* Results Table */}
              <div style={{ marginTop: '16px', maxHeight: '400px', overflow: 'auto', borderRadius: '8px', border: '1px solid var(--border)' }}>
                <table className="table">
                  <thead>
                    <tr><th>Email</th><th>Status</th><th>Score</th><th>Reason</th></tr>
                  </thead>
                  <tbody>
                    {(bulkResults?.results || []).map((result, index) => (
                      <tr key={index}>
                        <td style={{ color: 'var(--text)' }}>{result.email}</td>
                        <td><span className={`badge badge-${result.status === 'valid' ? 'success' : result.status === 'invalid' ? 'error' : 'warning'}`}>{result.status}</span></td>
                        <td style={{ color: 'var(--text-secondary)' }}>{result.score}</td>
                        <td style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{result.reason || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default Verify;
