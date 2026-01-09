import React, { useState, useEffect } from 'react';
import { Shield, Plus, Upload, Download, Trash2, Search, XCircle, Ban, UserX, MailX, RefreshCw, AlertTriangle } from 'lucide-react';
import Modal from '../components/Modal';
import { useToast } from '../components/ToastContext';

function Blacklist() {
  const { addToast } = useToast();
  const [blacklist, setBlacklist] = useState([]);
  const [unsubscribes, setUnsubscribes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [activeTab, setActiveTab] = useState('blacklist');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterSource, setFilterSource] = useState('all');
  const [selectedItems, setSelectedItems] = useState([]);
  const [bulkEmails, setBulkEmails] = useState('');
  
  const [formData, setFormData] = useState({
    type: 'email',
    value: '',
    reason: ''
  });

  const [stats, setStats] = useState({
    totalBlacklist: 0,
    manualBlocks: 0,
    autoBounces: 0,
    unsubscribes: 0
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      if (window.electron) {
        const [blacklistData, unsubData] = await Promise.all([
          window.electron.blacklist.getAll(),
          window.electron.unsubscribes.getAll()
        ]);
        setBlacklist(blacklistData || []);
        setUnsubscribes(unsubData || []);
        
        // Calculate stats
        const bl = blacklistData || [];
        setStats({
          totalBlacklist: bl.length,
          manualBlocks: bl.filter(b => b.source === 'manual').length,
          autoBounces: bl.filter(b => b.source === 'auto_bounce' || b.source === 'bounce').length,
          unsubscribes: (unsubData || []).length
        });
      }
    } catch (error) {
      addToast('Failed to load data', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    if (!formData.value.trim()) {
      addToast('Please enter an email or domain', 'error');
      return;
    }
    try {
      const entry = formData.type === 'email' 
        ? { email: formData.value.trim().toLowerCase(), reason: formData.reason, source: 'manual' }
        : { domain: formData.value.trim().toLowerCase(), reason: formData.reason, source: 'manual' };
      
      const result = await window.electron.blacklist.add(entry);
      if (result.success) {
        addToast('Added to blacklist', 'success');
        setShowModal(false);
        setFormData({ type: 'email', value: '', reason: '' });
        loadData();
      }
    } catch (error) {
      addToast('Failed to add', 'error');
    }
  };

  const handleBulkAdd = async () => {
    const emails = bulkEmails
      .split(/[\n,;]+/)
      .map(e => e.trim().toLowerCase())
      .filter(e => e && e.includes('@'));
    
    if (emails.length === 0) {
      addToast('No valid emails found', 'error');
      return;
    }

    try {
      const entries = emails.map(email => ({ email, reason: 'Bulk import', source: 'manual' }));
      const result = await window.electron.blacklist.addBulk(entries);
      addToast(`Added ${result.added || emails.length} emails to blacklist`, 'success');
      setShowBulkModal(false);
      setBulkEmails('');
      loadData();
    } catch (error) {
      addToast('Failed to add emails', 'error');
    }
  };

  const handleImport = async () => {
    try {
      const result = await window.electron.blacklist.import();
      if (result.success) {
        addToast(`Imported ${result.added} entries`, 'success');
        loadData();
      }
    } catch (error) {
      addToast('Import failed', 'error');
    }
  };

  const handleExport = async () => {
    try {
      const result = await window.electron.export.blacklist();
      if (result.success) {
        addToast('Blacklist exported', 'success');
      }
    } catch (error) {
      addToast('Export failed', 'error');
    }
  };

  const handleDelete = async (id) => {
    try {
      await window.electron.blacklist.remove(id);
      addToast('Removed from blacklist', 'success');
      loadData();
    } catch (error) {
      addToast('Failed to remove', 'error');
    }
  };

  const handleBulkDelete = async () => {
    if (selectedItems.length === 0) return;
    if (!window.confirm(`Remove ${selectedItems.length} item(s)?`)) return;
    try {
      for (const id of selectedItems) {
        await window.electron.blacklist.remove(id);
      }
      addToast(`Removed ${selectedItems.length} items`, 'success');
      setSelectedItems([]);
      loadData();
    } catch (error) {
      addToast('Failed to remove items', 'error');
    }
  };

  const handleResubscribe = async (email) => {
    if (!window.confirm(`Re-subscribe ${email}? They will receive emails again.`)) return;
    try {
      await window.electron.unsubscribes.remove(email);
      addToast(`${email} re-subscribed`, 'success');
      loadData();
    } catch (error) {
      addToast('Failed to re-subscribe', 'error');
    }
  };

  const toggleSelect = (id) => {
    setSelectedItems(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const toggleSelectAll = () => {
    if (selectedItems.length === filteredBlacklist.length) {
      setSelectedItems([]);
    } else {
      setSelectedItems(filteredBlacklist.map(b => b.id));
    }
  };

  // Filtered lists
  const filteredBlacklist = blacklist.filter(item => {
    const matchesSearch = (item.email || item.domain || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (item.reason || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesSource = filterSource === 'all' || 
                         (filterSource === 'manual' && item.source === 'manual') ||
                         (filterSource === 'bounce' && (item.source === 'auto_bounce' || item.source === 'bounce')) ||
                         (filterSource === 'unsubscribe' && item.source === 'unsubscribe');
    return matchesSearch && matchesSource;
  });

  const filteredUnsubscribes = unsubscribes.filter(item =>
    item.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (item.reason || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getSourceBadge = (source) => {
    switch (source) {
      case 'manual': return <span className="badge badge-info">Manual</span>;
      case 'auto_bounce': case 'bounce': return <span className="badge badge-warning">Bounce</span>;
      case 'unsubscribe': return <span className="badge badge-error">Unsubscribed</span>;
      default: return <span className="badge badge-default">{source}</span>;
    }
  };

  return (
    <div>
      <div className="page-header flex justify-between items-center">
        <div>
          <h1 className="page-title"><Shield size={24} style={{ marginRight: '10px', verticalAlign: 'middle' }} /> Do Not Contact</h1>
          <p className="page-subtitle">Manage blocked emails, domains, and unsubscribed contacts.</p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-outline" onClick={handleImport}><Upload size={16} /> Import</button>
          <button className="btn btn-outline" onClick={handleExport}><Download size={16} /> Export</button>
          <button className="btn btn-outline" onClick={() => setShowBulkModal(true)}><Plus size={16} /> Bulk Add</button>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}><Plus size={16} /> Block Email</button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="stats-grid mb-4" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="stat-card">
          <div className="stat-icon" style={{ color: '#ef4444' }}><Ban size={24} /></div>
          <div className="stat-content">
            <div className="stat-value">{stats.totalBlacklist}</div>
            <div className="stat-label">Total Blocked</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ color: '#3b82f6' }}><UserX size={24} /></div>
          <div className="stat-content">
            <div className="stat-value">{stats.manualBlocks}</div>
            <div className="stat-label">Manual Blocks</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ color: '#f59e0b' }}><MailX size={24} /></div>
          <div className="stat-content">
            <div className="stat-value">{stats.autoBounces}</div>
            <div className="stat-label">Auto Bounces</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ color: '#a855f7' }}><XCircle size={24} /></div>
          <div className="stat-content">
            <div className="stat-value">{stats.unsubscribes}</div>
            <div className="stat-label">Unsubscribes</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs mb-4">
        <button className={`tab ${activeTab === 'blacklist' ? 'active' : ''}`} onClick={() => { setActiveTab('blacklist'); setSelectedItems([]); }}>
          <Ban size={16} /> Blacklist ({blacklist.length})
        </button>
        <button className={`tab ${activeTab === 'unsubscribes' ? 'active' : ''}`} onClick={() => { setActiveTab('unsubscribes'); setSelectedItems([]); }}>
          <XCircle size={16} /> Unsubscribes ({unsubscribes.length})
        </button>
      </div>

      {/* Filters */}
      <div className="card mb-4">
        <div className="flex gap-3 items-center">
          <div className="toolbar-search" style={{ flex: 1 }}>
            <Search size={18} />
            <input type="text" className="form-input" placeholder="Search emails, domains, or reasons..." style={{ paddingLeft: '40px' }} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
          {activeTab === 'blacklist' && (
            <select className="form-select" style={{ width: '180px' }} value={filterSource} onChange={(e) => setFilterSource(e.target.value)}>
              <option value="all">All Sources</option>
              <option value="manual">Manual Blocks</option>
              <option value="bounce">Auto Bounces</option>
              <option value="unsubscribe">Unsubscribes</option>
            </select>
          )}
          {selectedItems.length > 0 && (
            <button className="btn btn-danger btn-sm" onClick={handleBulkDelete}>
              <Trash2 size={14} /> Delete {selectedItems.length}
            </button>
          )}
        </div>
      </div>

      {/* Blacklist Tab */}
      {activeTab === 'blacklist' && (
        <div className="card">
          {loading ? (
            <div className="text-center text-muted" style={{ padding: '40px' }}>Loading...</div>
          ) : filteredBlacklist.length === 0 ? (
            <div className="empty-state">
              <Shield className="empty-state-icon" />
              <h3 className="empty-state-title">No blocked entries</h3>
              <p className="empty-state-text">Add emails or domains to prevent sending to them.</p>
            </div>
          ) : (
            <div className="table-container" style={{ maxHeight: '500px', overflowY: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: '40px' }}>
                      <input type="checkbox" onChange={toggleSelectAll} checked={selectedItems.length === filteredBlacklist.length && filteredBlacklist.length > 0} />
                    </th>
                    <th>Email/Domain</th>
                    <th>Type</th>
                    <th>Reason</th>
                    <th>Source</th>
                    <th>Added</th>
                    <th style={{ width: '80px' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBlacklist.map(item => (
                    <tr key={item.id}>
                      <td><input type="checkbox" checked={selectedItems.includes(item.id)} onChange={() => toggleSelect(item.id)} /></td>
                      <td><strong>{item.email || item.domain}</strong></td>
                      <td><span className={`badge ${item.email ? 'badge-info' : 'badge-warning'}`}>{item.email ? 'Email' : 'Domain'}</span></td>
                      <td className="text-muted" style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.reason || '-'}</td>
                      <td>{getSourceBadge(item.source)}</td>
                      <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{new Date(item.createdAt).toLocaleDateString()}</td>
                      <td>
                        <button className="btn btn-outline btn-sm" onClick={() => handleDelete(item.id)} title="Remove">
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Unsubscribes Tab */}
      {activeTab === 'unsubscribes' && (
        <div className="card">
          {loading ? (
            <div className="text-center text-muted" style={{ padding: '40px' }}>Loading...</div>
          ) : filteredUnsubscribes.length === 0 ? (
            <div className="empty-state">
              <XCircle className="empty-state-icon" />
              <h3 className="empty-state-title">No unsubscribes</h3>
              <p className="empty-state-text">Users who unsubscribe will appear here.</p>
            </div>
          ) : (
            <div className="table-container" style={{ maxHeight: '500px', overflowY: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Campaign</th>
                    <th>Reason</th>
                    <th>Unsubscribed At</th>
                    <th style={{ width: '120px' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUnsubscribes.map(item => (
                    <tr key={item.id}>
                      <td><strong>{item.email}</strong></td>
                      <td className="text-muted">{item.campaignId ? `Campaign ${item.campaignId.slice(0,8)}...` : '-'}</td>
                      <td className="text-muted">{item.reason || 'User requested'}</td>
                      <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{new Date(item.createdAt).toLocaleString()}</td>
                      <td>
                        <button className="btn btn-outline btn-sm" onClick={() => handleResubscribe(item.email)} title="Re-subscribe">
                          <RefreshCw size={14} /> Re-sub
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Add Entry Modal */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Block Email or Domain">
        <div className="form-group">
          <label className="form-label">Type</label>
          <div className="flex gap-2">
            <button className={`btn btn-sm ${formData.type === 'email' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setFormData({ ...formData, type: 'email' })}>Email</button>
            <button className={`btn btn-sm ${formData.type === 'domain' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setFormData({ ...formData, type: 'domain' })}>Domain</button>
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">{formData.type === 'email' ? 'Email Address' : 'Domain'}</label>
          <input type="text" className="form-input" placeholder={formData.type === 'email' ? 'user@example.com' : 'example.com'} value={formData.value} onChange={(e) => setFormData({ ...formData, value: e.target.value })} />
        </div>
        <div className="form-group">
          <label className="form-label">Reason (optional)</label>
          <input type="text" className="form-input" placeholder="Why are you blocking this?" value={formData.reason} onChange={(e) => setFormData({ ...formData, reason: e.target.value })} />
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button className="btn btn-outline" onClick={() => setShowModal(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={handleAdd}><Ban size={16} /> Block</button>
        </div>
      </Modal>

      {/* Bulk Add Modal */}
      <Modal isOpen={showBulkModal} onClose={() => setShowBulkModal(false)} title="Bulk Add to Blacklist">
        <div className="form-group">
          <label className="form-label">Email Addresses</label>
          <textarea
            className="form-input"
            rows={8}
            placeholder="Enter email addresses (one per line, or comma/semicolon separated)"
            value={bulkEmails}
            onChange={(e) => setBulkEmails(e.target.value)}
          />
          <div className="text-sm text-muted mt-1">
            {bulkEmails.split(/[\n,;]+/).filter(e => e.trim() && e.includes('@')).length} valid emails detected
          </div>
        </div>
        <div style={{ background: 'var(--bg-tertiary)', borderRadius: '8px', padding: '12px', marginBottom: '16px' }}>
          <div className="flex items-center gap-2 text-sm">
            <AlertTriangle size={16} style={{ color: '#f59e0b' }} />
            <span>These emails will be permanently blocked from receiving campaigns.</span>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button className="btn btn-outline" onClick={() => setShowBulkModal(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={handleBulkAdd}><Plus size={16} /> Add All</button>
        </div>
      </Modal>
    </div>
  );
}

export default Blacklist;
