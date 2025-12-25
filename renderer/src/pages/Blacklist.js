import React, { useState, useEffect } from 'react';
import { Shield, Plus, Upload, Download, Trash2, Search, AlertTriangle, XCircle, Ban } from 'lucide-react';
import Modal from '../components/Modal';
import { useToast } from '../components/ToastContext';

function Blacklist() {
  const { addToast } = useToast();
  const [blacklist, setBlacklist] = useState([]);
  const [unsubscribes, setUnsubscribes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [activeTab, setActiveTab] = useState('blacklist');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedItems, setSelectedItems] = useState([]);
  
  const [formData, setFormData] = useState({
    type: 'email',
    value: '',
    reason: ''
  });

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        ? { email: formData.value.trim(), reason: formData.reason }
        : { domain: formData.value.trim(), reason: formData.reason };
      
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
    if (!window.confirm(`Remove ${selectedItems.length} item(s) from blacklist?`)) return;

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

  const toggleSelect = (id) => {
    setSelectedItems(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const filteredBlacklist = blacklist.filter(item => 
    (item.email || item.domain || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (item.reason || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredUnsubscribes = unsubscribes.filter(item =>
    item.email.toLowerCase().includes(searchTerm.toLowerCase())
  );


  return (
    <div>
      <div className="page-header flex justify-between items-center">
        <div>
          <h1 className="page-title"><Shield size={24} style={{ marginRight: '10px', verticalAlign: 'middle' }} /> Blacklist & Unsubscribes</h1>
          <p className="page-subtitle">Manage blocked emails and unsubscribed contacts.</p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-outline" onClick={handleImport}><Upload size={16} /> Import</button>
          <button className="btn btn-outline" onClick={handleExport}><Download size={16} /> Export</button>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}><Plus size={16} /> Add Entry</button>
        </div>
      </div>

      <div className="tabs mb-4">
        <button className={`tab ${activeTab === 'blacklist' ? 'active' : ''}`} onClick={() => setActiveTab('blacklist')}>
          <Ban size={16} /> Blacklist ({blacklist.length})
        </button>
        <button className={`tab ${activeTab === 'unsubscribes' ? 'active' : ''}`} onClick={() => setActiveTab('unsubscribes')}>
          <XCircle size={16} /> Unsubscribes ({unsubscribes.length})
        </button>
      </div>

      <div className="card mb-4">
        <div className="flex gap-3 items-center">
          <div className="toolbar-search" style={{ flex: 1 }}>
            <Search size={18} />
            <input type="text" className="form-input" placeholder="Search..." style={{ paddingLeft: '40px' }} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
          {selectedItems.length > 0 && (
            <button className="btn btn-danger btn-sm" onClick={handleBulkDelete}>
              <Trash2 size={14} /> Delete {selectedItems.length} Selected
            </button>
          )}
        </div>
      </div>

      {activeTab === 'blacklist' && (
        <div className="card">
          {loading ? (
            <div className="text-center text-muted" style={{ padding: '40px' }}>Loading...</div>
          ) : filteredBlacklist.length === 0 ? (
            <div className="empty-state">
              <Shield className="empty-state-icon" />
              <h3 className="empty-state-title">No blacklisted entries</h3>
              <p className="empty-state-text">Add emails or domains to prevent sending to them.</p>
            </div>
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: '40px' }}><input type="checkbox" onChange={(e) => setSelectedItems(e.target.checked ? filteredBlacklist.map(b => b.id) : [])} checked={selectedItems.length === filteredBlacklist.length && filteredBlacklist.length > 0} /></th>
                    <th>Email/Domain</th>
                    <th>Type</th>
                    <th>Reason</th>
                    <th>Source</th>
                    <th>Added</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBlacklist.map(item => (
                    <tr key={item.id}>
                      <td><input type="checkbox" checked={selectedItems.includes(item.id)} onChange={() => toggleSelect(item.id)} /></td>
                      <td><strong>{item.email || item.domain}</strong></td>
                      <td><span className={`badge ${item.email ? 'badge-info' : 'badge-warning'}`}>{item.email ? 'Email' : 'Domain'}</span></td>
                      <td className="text-muted">{item.reason || '-'}</td>
                      <td><span className="badge badge-default">{item.source}</span></td>
                      <td className="text-sm text-muted">{new Date(item.createdAt).toLocaleDateString()}</td>
                      <td><button className="btn btn-outline btn-icon btn-sm" onClick={() => handleDelete(item.id)}><Trash2 size={14} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'unsubscribes' && (
        <div className="card">
          {loading ? (
            <div className="text-center text-muted" style={{ padding: '40px' }}>Loading...</div>
          ) : filteredUnsubscribes.length === 0 ? (
            <div className="empty-state">
              <XCircle className="empty-state-icon" />
              <h3 className="empty-state-title">No unsubscribes</h3>
              <p className="empty-state-text">Contacts who unsubscribe will appear here.</p>
            </div>
          ) : (
            <div className="table-container">
              <table className="table">
                <thead><tr><th>Email</th><th>Reason</th><th>Date</th></tr></thead>
                <tbody>
                  {filteredUnsubscribes.map(item => (
                    <tr key={item.id}>
                      <td><strong>{item.email}</strong></td>
                      <td className="text-muted">{item.reason || '-'}</td>
                      <td className="text-sm text-muted">{new Date(item.unsubscribedAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="text-sm text-muted mt-4">
            <AlertTriangle size={14} style={{ marginRight: '6px' }} />
            Unsubscribed contacts are automatically added to the blacklist and will never receive emails.
          </div>
        </div>
      )}

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Add to Blacklist"
        footer={<><button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button><button className="btn btn-primary" onClick={handleAdd}>Add</button></>}>
        <div className="form-group">
          <label className="form-label">Type</label>
          <select className="form-select" value={formData.type} onChange={(e) => setFormData({ ...formData, type: e.target.value })}>
            <option value="email">Email Address</option>
            <option value="domain">Domain (block all emails)</option>
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">{formData.type === 'email' ? 'Email Address' : 'Domain'}</label>
          <input type="text" className="form-input" placeholder={formData.type === 'email' ? 'spam@example.com' : 'example.com'} value={formData.value} onChange={(e) => setFormData({ ...formData, value: e.target.value })} />
        </div>
        <div className="form-group">
          <label className="form-label">Reason (optional)</label>
          <input type="text" className="form-input" placeholder="e.g., Spam complaint, Hard bounce" value={formData.reason} onChange={(e) => setFormData({ ...formData, reason: e.target.value })} />
        </div>
      </Modal>
    </div>
  );
}

export default Blacklist;
