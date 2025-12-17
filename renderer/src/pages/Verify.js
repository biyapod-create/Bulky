import React, { useState, useEffect } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Play, Upload, Download } from 'lucide-react';
import { useToast } from '../components/ToastContext';

function Verify() {
  const { addToast } = useToast();
  const [mode, setMode] = useState('single'); // single, bulk
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
      window.electron.verify.onProgress((data) => {
        setProgress(data);
      });
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
    const emails = contacts.filter(c => !c.verified).map(c => c.email);
    
    if (emails.length === 0) {
      addToast('No unverified contacts found', 'info');
      return;
    }

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
        if (contact && r.status === 'valid') {
          await window.electron.contacts.update({
            ...contact,
            verified: true
          });
        }
      }
      loadContacts();
      addToast('Contacts updated', 'success');
    } catch (error) {
      addToast('Verification failed', 'error');
    } finally {
      setIsVerifying(false);
      setProgress(null);
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'valid': return <CheckCircle className="text-success" size={20} />;
      case 'invalid': return <XCircle className="text-error" size={20} />;
      case 'risky': return <AlertTriangle className="text-warning" size={20} />;
      default: return <AlertTriangle className="text-muted" size={20} />;
    }
  };

  const exportResults = () => {
    if (!bulkResults) return;
    
    const csv = 'email,status,score,reason\n' + 
      bulkResults.results.map(r => 
        `${r.email},${r.status},${r.score},${r.reason || ''}`
      ).join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'verification_results.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Email Verification</h1>
        <p className="page-subtitle">Validate email addresses before sending.</p>
      </div>

      <div className="tabs">
        <button 
          className={`tab ${mode === 'single' ? 'active' : ''}`}
          onClick={() => setMode('single')}
        >
          Single Email
        </button>
        <button 
          className={`tab ${mode === 'bulk' ? 'active' : ''}`}
          onClick={() => setMode('bulk')}
        >
          Bulk Verification
        </button>
      </div>

      {mode === 'single' && (
        <div className="card">
          <div className="form-group">
            <label className="form-label">Email Address</label>
            <div className="flex gap-2">
              <input
                type="email"
                className="form-input"
                placeholder="email@example.com"
                value={singleEmail}
                onChange={(e) => setSingleEmail(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSingleVerify()}
              />
              <button 
                className="btn btn-primary"
                onClick={handleSingleVerify}
                disabled={isVerifying}
              >
                {isVerifying ? 'Checking...' : 'Verify'}
              </button>
            </div>
          </div>

          {singleResult && (
            <div className="card mt-4" style={{ background: 'var(--bg-tertiary)' }}>
              <div className="flex items-center gap-3 mb-4">
                {getStatusIcon(singleResult.status)}
                <div>
                  <h4>{singleResult.email}</h4>
                  <p className="text-sm text-muted">
                    Status: <span className={`badge badge-${singleResult.status === 'valid' ? 'success' : singleResult.status === 'invalid' ? 'error' : 'warning'}`}>
                      {singleResult.status}
                    </span>
                  </p>
                </div>
                <div className={`score-circle ${singleResult.score >= 80 ? 'excellent' : singleResult.score >= 60 ? 'good' : singleResult.score >= 40 ? 'fair' : 'poor'}`} style={{ width: '60px', height: '60px', marginLeft: 'auto' }}>
                  <span className="score-value" style={{ fontSize: '18px' }}>{singleResult.score}</span>
                </div>
              </div>

              {singleResult.reason && (
                <p className="text-sm text-muted mb-3">{singleResult.reason}</p>
              )}

              <h5 style={{ fontSize: '13px', marginBottom: '8px' }}>Checks Performed:</h5>
              <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
                {Object.entries(singleResult.checks).map(([check, passed]) => (
                  <span 
                    key={check}
                    className={`badge ${passed === true ? 'badge-success' : passed === false ? 'badge-error' : 'badge-default'}`}
                  >
                    {check}: {passed === true ? '✓' : passed === false ? '✗' : 'skipped'}
                  </span>
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
            <button 
              className="btn btn-outline btn-sm"
              onClick={handleVerifyContacts}
              disabled={isVerifying}
            >
              <Upload size={16} /> Verify All Contacts
            </button>
          </div>

          <div className="form-group">
            <label className="form-label">Email Addresses (one per line)</label>
            <textarea
              className="form-textarea"
              style={{ minHeight: '200px' }}
              placeholder="email1@example.com&#10;email2@example.com&#10;email3@example.com"
              value={bulkEmails}
              onChange={(e) => setBulkEmails(e.target.value)}
            />
          </div>

          <div className="flex gap-2">
            <button 
              className="btn btn-primary"
              onClick={handleBulkVerify}
              disabled={isVerifying}
            >
              <Play size={16} /> {isVerifying ? 'Verifying...' : 'Start Verification'}
            </button>
            {bulkResults && (
              <button className="btn btn-outline" onClick={exportResults}>
                <Download size={16} /> Export Results
              </button>
            )}
          </div>

          {progress && (
            <div className="mt-4">
              <div className="progress-bar">
                <div 
                  className="progress-fill"
                  style={{ width: `${(progress.current / progress.total) * 100}%` }}
                />
              </div>
              <p className="text-sm text-muted mt-2">
                Verifying {progress.current} of {progress.total}... {progress.email}
              </p>
            </div>
          )}

          {bulkResults && (
            <div className="mt-4">
              <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
                <div className="stat-card">
                  <div className="stat-value">{bulkResults.summary.total}</div>
                  <div className="stat-label">Total</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value" style={{ color: 'var(--success)' }}>{bulkResults.summary.valid}</div>
                  <div className="stat-label">Valid</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value" style={{ color: 'var(--warning)' }}>{bulkResults.summary.risky}</div>
                  <div className="stat-label">Risky</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value" style={{ color: 'var(--error)' }}>{bulkResults.summary.invalid}</div>
                  <div className="stat-label">Invalid</div>
                </div>
              </div>

              <div className="table-container mt-4" style={{ maxHeight: '300px', overflow: 'auto' }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Email</th>
                      <th>Status</th>
                      <th>Score</th>
                      <th>Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bulkResults.results.map((result, index) => (
                      <tr key={index}>
                        <td>{result.email}</td>
                        <td>
                          <span className={`badge badge-${result.status === 'valid' ? 'success' : result.status === 'invalid' ? 'error' : 'warning'}`}>
                            {result.status}
                          </span>
                        </td>
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
