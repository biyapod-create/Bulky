import React, { useState, useEffect } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Play, Download, Trash2, RefreshCw, Users } from 'lucide-react';
import { useToast } from '../components/ToastContext';

function Verify() {
  const { addToast } = useToast();
  const [mode, setMode] = useState('single');
  const [singleEmail, setSingleEmail] = useState('');
  const [singleResult, setSingleResult] = useState(null);
  const [bulkEmails, setBulkEmails] = useState('');
  const [bulkResults, setBulkResults] = useState(null);
  const [progress, setProgress] = useState(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [contacts, setContacts] = useState([]);

  useEffect(() => {
    loadContacts();
    if (window.electron?.verify?.onProgress) {
      window.electron.verify.onProgress((data) => setProgress(data));
    }
  }, []);

  const loadContacts = async () => {
    try {
      if (window.electron) {
        const data = await window.electron.contacts.getAll();
        setContacts(data || []);
      }
    } catch (error) {
      console.error('Failed to load contacts:', error);
    }
  };

  const handleSingleVerify = async () => {
    if (!singleEmail) {
      addToast('Please enter an email address', 'error');
      return;
    }
    setIsVerifying(true);
    setSingleResult(null);
    try {
      const result = await window.electron.verify.email(singleEmail);
      setSingleResult(result);
    } catch (error) {
      addToast('Verification failed', 'error');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleBulkVerify = async () => {
    const emails = bulkEmails.split('\n').map(e => e.trim()).filter(e => e);
    if (emails.length === 0) {
      addToast('Please enter at least one email', 'error');
      return;
    }
    setIsVerifying(true);
    setBulkResults(null);
    setProgress({ current: 0, total: emails.length });
    try {
      const result = await window.electron.verify.bulk(emails);
      setBulkResults(result);
    } catch (error) {
      addToast('Bulk verification failed', 'error');
    } finally {
      setIsVerifying(false);
      setProgress(null);
    }
  };

  const handleVerifyContacts = async () => {
    const unverified = contacts.filter(c => !c.verified);
    if (unverified.length === 0) {
      addToast('No unverified contacts found', 'info');
      return;
    }
    const emails = unverified.map(c => c.email);
    setMode('bulk');
    setBulkEmails(emails.join('\n'));
    setIsVerifying(true);
    setBulkResults(null);
    setProgress({ current: 0, total: emails.length });

    try {
      const result = await window.electron.verify.bulk(emails);
      setBulkResults(result);
      
      // Update contact verification status
      for (const r of result.results) {
        const contact = contacts.find(c => c.email === r.email);
        if (contact) {
          await window.electron.contacts.update({
            ...contact,
            verified: r.status === 'valid',
            verificationScore: r.score
          });
        }
      }
      loadContacts();
      addToast('Contacts verification status updated', 'success');
    } catch (error) {
      addToast('Verification failed', 'error');
    } finally {
      setIsVerifying(false);
      setProgress(null);
    }
  };


  // Smart Workflow Actions
  const handleDeleteInvalid = async () => {
    if (!bulkResults) return;
    const invalidEmails = bulkResults.results.filter(r => r.status === 'invalid').map(r => r.email);
    if (invalidEmails.length === 0) {
      addToast('No invalid emails to delete', 'info');
      return;
    }
    if (!window.confirm(`Delete ${invalidEmails.length} invalid email(s) from contacts?`)) return;

    try {
      const result = await window.electron.contacts.deleteByVerification('invalid');
      addToast(`Deleted ${result.deleted} invalid contacts`, 'success');
      loadContacts();
    } catch (error) {
      addToast('Failed to delete invalid contacts', 'error');
    }
  };

  const handleExportValid = async () => {
    if (!bulkResults) return;
    const validResults = bulkResults.results.filter(r => r.status === 'valid');
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
    const validEmails = bulkResults.results.filter(r => r.status === 'valid');
    if (validEmails.length === 0) {
      addToast('No valid emails to add', 'info');
      return;
    }
    try {
      const toAdd = validEmails.map(r => ({ email: r.email, status: 'active', verified: true, verificationScore: r.score }));
      const result = await window.electron.contacts.addBulk(toAdd);
      addToast(`Added ${result.inserted} valid contacts (${result.skipped} already exist)`, 'success');
      loadContacts();
    } catch (error) {
      addToast('Failed to add contacts', 'error');
    }
  };

  const handleBlacklistInvalid = async () => {
    if (!bulkResults) return;
    const invalidEmails = bulkResults.results.filter(r => r.status === 'invalid').map(r => r.email);
    if (invalidEmails.length === 0) {
      addToast('No invalid emails to blacklist', 'info');
      return;
    }
    try {
      const result = await window.electron.blacklist.addBulk(invalidEmails);
      addToast(`Added ${result.added} emails to blacklist`, 'success');
    } catch (error) {
      addToast('Failed to add to blacklist', 'error');
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'valid': return <CheckCircle className="text-success" size={20} style={{ color: 'var(--success)' }} />;
      case 'invalid': return <XCircle className="text-error" size={20} style={{ color: 'var(--error)' }} />;
      case 'risky': return <AlertTriangle className="text-warning" size={20} style={{ color: 'var(--warning)' }} />;
      default: return <AlertTriangle className="text-muted" size={20} />;
    }
  };

  const exportAllResults = async () => {
    if (!bulkResults) return;
    try {
      const result = await window.electron.export.verificationResults(bulkResults.results);
      if (result.success) addToast('Results exported', 'success');
    } catch (error) {
      addToast('Export failed', 'error');
    }
  };


  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Email Verification</h1>
        <p className="page-subtitle">Validate email addresses and clean your lists.</p>
      </div>

      <div className="tabs">
        <button className={`tab ${mode === 'single' ? 'active' : ''}`} onClick={() => setMode('single')}>Single Email</button>
        <button className={`tab ${mode === 'bulk' ? 'active' : ''}`} onClick={() => setMode('bulk')}>Bulk Verification</button>
      </div>

      {mode === 'single' && (
        <div className="card">
          <div className="form-group">
            <label className="form-label">Email Address</label>
            <div className="flex gap-2">
              <input type="email" className="form-input" placeholder="email@example.com" value={singleEmail} onChange={(e) => setSingleEmail(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleSingleVerify()} />
              <button className="btn btn-primary" onClick={handleSingleVerify} disabled={isVerifying}>{isVerifying ? 'Checking...' : 'Verify'}</button>
            </div>
          </div>

          {singleResult && (
            <div className="card mt-4" style={{ background: 'var(--bg-tertiary)' }}>
              <div className="flex items-center gap-3 mb-4">
                {getStatusIcon(singleResult.status)}
                <div>
                  <h4>{singleResult.email}</h4>
                  <span className={`badge badge-${singleResult.status === 'valid' ? 'success' : singleResult.status === 'invalid' ? 'error' : 'warning'}`}>{singleResult.status}</span>
                </div>
                <div className={`score-circle ${singleResult.score >= 80 ? 'excellent' : singleResult.score >= 60 ? 'good' : singleResult.score >= 40 ? 'fair' : 'poor'}`} style={{ width: '60px', height: '60px', marginLeft: 'auto' }}>
                  <span className="score-value" style={{ fontSize: '18px' }}>{singleResult.score}</span>
                </div>
              </div>
              {singleResult.reason && <p className="text-sm text-muted mb-3">{singleResult.reason}</p>}
              <div className="flex gap-2 flex-wrap">
                {Object.entries(singleResult.checks || {}).map(([check, passed]) => (
                  <span key={check} className={`badge ${passed === true ? 'badge-success' : passed === false ? 'badge-error' : 'badge-default'}`}>{check}: {passed === true ? '✓' : passed === false ? '✗' : 'skipped'}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {mode === 'bulk' && (
        <div className="card">
          <div className="flex justify-between items-center mb-4">
            <h3 className="card-title">Bulk Verification</h3>
            <button className="btn btn-outline btn-sm" onClick={handleVerifyContacts} disabled={isVerifying}><Users size={16} /> Verify All Contacts ({contacts.filter(c => !c.verified).length} unverified)</button>
          </div>

          <div className="form-group">
            <label className="form-label">Email Addresses (one per line)</label>
            <textarea className="form-textarea" style={{ minHeight: '200px' }} placeholder="email1@example.com&#10;email2@example.com" value={bulkEmails} onChange={(e) => setBulkEmails(e.target.value)} />
          </div>

          <div className="flex gap-2">
            <button className="btn btn-primary" onClick={handleBulkVerify} disabled={isVerifying}><Play size={16} /> {isVerifying ? 'Verifying...' : 'Start Verification'}</button>
          </div>

          {progress && (
            <div className="mt-4">
              <div className="progress-bar"><div className="progress-fill" style={{ width: `${(progress.current / progress.total) * 100}%` }} /></div>
              <p className="text-sm text-muted mt-2">Verifying {progress.current} of {progress.total}...</p>
            </div>
          )}


          {bulkResults && (
            <div className="mt-4">
              {/* Summary Stats */}
              <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
                <div className="stat-card"><div className="stat-value">{bulkResults.summary.total}</div><div className="stat-label">Total</div></div>
                <div className="stat-card"><div className="stat-value" style={{ color: 'var(--success)' }}>{bulkResults.summary.valid}</div><div className="stat-label">Valid</div></div>
                <div className="stat-card"><div className="stat-value" style={{ color: 'var(--warning)' }}>{bulkResults.summary.risky}</div><div className="stat-label">Risky</div></div>
                <div className="stat-card"><div className="stat-value" style={{ color: 'var(--error)' }}>{bulkResults.summary.invalid}</div><div className="stat-label">Invalid</div></div>
              </div>

              {/* Smart Workflow Actions */}
              <div className="card mt-4" style={{ background: 'var(--accent-dim)', border: '1px solid var(--accent)' }}>
                <h4 className="mb-3" style={{ color: 'var(--accent)' }}><RefreshCw size={18} style={{ marginRight: '8px' }} />Smart Actions</h4>
                <div className="flex gap-2 flex-wrap">
                  {bulkResults.summary.valid > 0 && (
                    <>
                      <button className="btn btn-success btn-sm" onClick={handleAddValidToList}><CheckCircle size={14} /> Add {bulkResults.summary.valid} Valid to Contacts</button>
                      <button className="btn btn-outline btn-sm" onClick={handleExportValid}><Download size={14} /> Export Valid Emails</button>
                    </>
                  )}
                  {bulkResults.summary.invalid > 0 && (
                    <>
                      <button className="btn btn-danger btn-sm" onClick={handleDeleteInvalid}><Trash2 size={14} /> Delete {bulkResults.summary.invalid} Invalid from Contacts</button>
                      <button className="btn btn-outline btn-sm" onClick={handleBlacklistInvalid}><XCircle size={14} /> Add Invalid to Blacklist</button>
                    </>
                  )}
                  <button className="btn btn-outline btn-sm" onClick={exportAllResults}><Download size={14} /> Export All Results</button>
                </div>
              </div>

              {/* Results Table */}
              <div className="table-container mt-4" style={{ maxHeight: '400px', overflow: 'auto' }}>
                <table className="table">
                  <thead>
                    <tr><th>Email</th><th>Status</th><th>Score</th><th>Reason</th></tr>
                  </thead>
                  <tbody>
                    {bulkResults.results.map((result, index) => (
                      <tr key={index}>
                        <td>{result.email}</td>
                        <td><span className={`badge badge-${result.status === 'valid' ? 'success' : result.status === 'invalid' ? 'error' : 'warning'}`}>{result.status}</span></td>
                        <td>{result.score}</td>
                        <td className="text-sm text-muted">{result.reason || '-'}</td>
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
