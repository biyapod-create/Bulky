import React, { useState, useEffect } from 'react';
import { Users, Plus, Upload, Download, Trash2, Search, Edit2, Tag, CheckCircle, XCircle, AlertTriangle, RefreshCw } from 'lucide-react';
import Modal from '../components/Modal';
import { useToast } from '../components/ToastContext';

function Contacts() {
  const { addToast } = useToast();
  const [contacts, setContacts] = useState([]);
  const [lists, setLists] = useState([]);
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showTagModal, setShowTagModal] = useState(false);
  const [editingContact, setEditingContact] = useState(null);
  const [selectedContacts, setSelectedContacts] = useState([]);
  const [importData, setImportData] = useState({ contacts: [], listId: '' });

  // Filters
  const [filters, setFilters] = useState({
    search: '',
    listId: '',
    status: '',
    verified: '',
    tag: '',
    sortBy: 'createdAt',
    sortOrder: 'DESC'
  });

  const [formData, setFormData] = useState({
    email: '', firstName: '', lastName: '', company: '', phone: '',
    customField1: '', customField2: '', listId: '', tags: []
  });

  const [newTag, setNewTag] = useState({ name: '', color: '#5bb4d4' });

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    applyFilters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  const loadData = async () => {
    try {
      if (window.electron) {
        const [contactsData, listsData, tagsData] = await Promise.all([
          window.electron.contacts.getAll(),
          window.electron.lists.getAll(),
          window.electron.tags.getAll()
        ]);
        setContacts(contactsData || []);
        setLists(listsData || []);
        setTags(tagsData || []);
      }
    } catch (error) {
      addToast('Failed to load contacts', 'error');
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = async () => {
    if (!window.electron) return;
    try {
      const filtered = await window.electron.contacts.getFiltered(filters);
      setContacts(filtered || []);
    } catch (error) {
      console.error('Filter error:', error);
    }
  };

  const handleOpenModal = (contact = null) => {
    if (contact) {
      setEditingContact(contact);
      setFormData({
        email: contact.email,
        firstName: contact.firstName || '',
        lastName: contact.lastName || '',
        company: contact.company || '',
        phone: contact.phone || '',
        customField1: contact.customField1 || '',
        customField2: contact.customField2 || '',
        listId: contact.listId || '',
        tags: contact.tags ? JSON.parse(contact.tags) : []
      });
    } else {
      setEditingContact(null);
      setFormData({ email: '', firstName: '', lastName: '', company: '', phone: '', customField1: '', customField2: '', listId: '', tags: [] });
    }
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formData.email) {
      addToast('Email is required', 'error');
      return;
    }

    try {
      if (editingContact) {
        await window.electron.contacts.update({ ...formData, id: editingContact.id, tags: formData.tags });
        addToast('Contact updated', 'success');
      } else {
        const result = await window.electron.contacts.add({ ...formData, tags: formData.tags });
        if (!result.success) {
          addToast(result.error || 'Failed to add contact', 'error');
          return;
        }
        addToast('Contact added', 'success');
      }
      setShowModal(false);
      loadData();
    } catch (error) {
      addToast('Failed to save contact', 'error');
    }
  };


  const handleImport = async () => {
    try {
      const result = await window.electron.contacts.import();
      if (result.success) {
        // Parsing is done server-side now
        setImportData({ contacts: result.contacts, listId: '' });
        setShowImportModal(true);
      } else if (result.error) {
        addToast(result.error, 'error');
      }
    } catch (error) {
      addToast('Import failed: ' + error.message, 'error');
    }
  };

  const confirmImport = async () => {
    if (importData.contacts.length === 0) {
      addToast('No valid contacts to import', 'error');
      return;
    }

    try {
      const toImport = importData.contacts.map(c => ({ ...c, listId: importData.listId || null }));
      const result = await window.electron.contacts.addBulk(toImport);
      addToast(`Imported ${result.inserted} contacts (${result.skipped} skipped)`, 'success');
      setShowImportModal(false);
      loadData();
    } catch (error) {
      addToast('Import failed', 'error');
    }
  };

  const handleDelete = async () => {
    if (selectedContacts.length === 0) return;
    if (!window.confirm(`Delete ${selectedContacts.length} contact(s)?`)) return;

    try {
      await window.electron.contacts.delete(selectedContacts);
      addToast(`Deleted ${selectedContacts.length} contacts`, 'success');
      setSelectedContacts([]);
      loadData();
    } catch (error) {
      addToast('Delete failed', 'error');
    }
  };

  const handleExport = async () => {
    try {
      const toExport = selectedContacts.length > 0 
        ? contacts.filter(c => selectedContacts.includes(c.id))
        : contacts;
      const result = await window.electron.export.contacts(toExport);
      if (result.success) {
        addToast(`Exported ${toExport.length} contacts`, 'success');
      }
    } catch (error) {
      addToast('Export failed', 'error');
    }
  };

  const handleAddTag = async () => {
    if (!newTag.name.trim()) return;
    try {
      const result = await window.electron.tags.add(newTag);
      if (result.success) {
        addToast('Tag created', 'success');
        setNewTag({ name: '', color: '#5bb4d4' });
        loadData();
      } else {
        addToast(result.error || 'Failed to create tag', 'error');
      }
    } catch (error) {
      addToast('Failed to create tag', 'error');
    }
  };

  const toggleSelectAll = () => {
    if (selectedContacts.length === contacts.length) {
      setSelectedContacts([]);
    } else {
      setSelectedContacts(contacts.map(c => c.id));
    }
  };

  const toggleSelect = (id) => {
    setSelectedContacts(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const getVerificationBadge = (contact) => {
    if (contact.verified) return <span className="badge badge-success"><CheckCircle size={12} /> Verified</span>;
    if (contact.verificationScore > 0) {
      if (contact.verificationScore >= 70) return <span className="badge badge-warning"><AlertTriangle size={12} /> Risky</span>;
      return <span className="badge badge-error"><XCircle size={12} /> Invalid</span>;
    }
    return <span className="badge badge-default">Not Verified</span>;
  };


  return (
    <div>
      <div className="page-header flex justify-between items-center">
        <div>
          <h1 className="page-title">Contacts</h1>
          <p className="page-subtitle">Manage your email contacts and lists.</p>
        </div>
        <div className="flex gap-2">
          <div style={{ position: 'relative' }}>
            <button className="btn btn-outline" onClick={handleImport} title="Supported: CSV, TXT, Excel, JSON"><Upload size={16} /> Import</button>
            <span className="text-xs text-muted" style={{ position: 'absolute', bottom: '-18px', left: '0', whiteSpace: 'nowrap', fontSize: '10px' }}>CSV, TXT, XLSX, JSON</span>
          </div>
          <button className="btn btn-outline" onClick={handleExport}><Download size={16} /> Export</button>
          <button className="btn btn-primary" onClick={() => handleOpenModal()}><Plus size={16} /> Add Contact</button>
        </div>
      </div>

      {/* Filters */}
      <div className="card mb-4">
        <div className="flex gap-3 items-center flex-wrap">
          <div className="toolbar-search">
            <Search size={18} />
            <input
              type="text"
              className="form-input"
              placeholder="Search contacts..."
              style={{ paddingLeft: '40px' }}
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            />
          </div>
          
          <select className="form-select" style={{ width: '150px' }} value={filters.listId} onChange={(e) => setFilters({ ...filters, listId: e.target.value })}>
            <option value="">All Lists</option>
            {lists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>

          <select className="form-select" style={{ width: '130px' }} value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="bounced">Bounced</option>
          </select>

          <select className="form-select" style={{ width: '140px' }} value={filters.verified} onChange={(e) => setFilters({ ...filters, verified: e.target.value })}>
            <option value="">Verification</option>
            <option value="1">Verified</option>
            <option value="0">Not Verified</option>
          </select>

          <select className="form-select" style={{ width: '120px' }} value={filters.sortBy} onChange={(e) => setFilters({ ...filters, sortBy: e.target.value })}>
            <option value="createdAt">Date Added</option>
            <option value="email">Email</option>
            <option value="firstName">First Name</option>
            <option value="engagementScore">Engagement</option>
          </select>

          <button className="btn btn-outline btn-sm" onClick={() => setFilters({ search: '', listId: '', status: '', verified: '', tag: '', sortBy: 'createdAt', sortOrder: 'DESC' })}>
            <RefreshCw size={14} /> Reset
          </button>

          <button className="btn btn-outline btn-sm" onClick={() => setShowTagModal(true)}>
            <Tag size={14} /> Manage Tags
          </button>
        </div>
      </div>

      {/* Bulk Actions */}
      {selectedContacts.length > 0 && (
        <div className="card mb-4" style={{ background: 'var(--accent-dim)', borderColor: 'var(--accent)' }}>
          <div className="flex justify-between items-center">
            <span>{selectedContacts.length} contact(s) selected</span>
            <div className="flex gap-2">
              <button className="btn btn-danger btn-sm" onClick={handleDelete}><Trash2 size={14} /> Delete Selected</button>
              <button className="btn btn-outline btn-sm" onClick={() => setSelectedContacts([])}>Clear Selection</button>
            </div>
          </div>
        </div>
      )}

      {/* Contacts Table */}
      <div className="card">
        {loading ? (
          <div className="text-center text-muted" style={{ padding: '40px' }}>Loading...</div>
        ) : contacts.length === 0 ? (
          <div className="empty-state">
            <Users className="empty-state-icon" />
            <h3 className="empty-state-title">No contacts found</h3>
            <p className="empty-state-text">Import contacts or add them manually.</p>
            <button className="btn btn-primary" onClick={() => handleOpenModal()}><Plus size={16} /> Add Contact</button>
          </div>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: '40px' }}>
                    <input type="checkbox" checked={selectedContacts.length === contacts.length && contacts.length > 0} onChange={toggleSelectAll} />
                  </th>
                  <th>Email</th>
                  <th>Name</th>
                  <th>Company</th>
                  <th>List</th>
                  <th>Status</th>
                  <th>Engagement</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {contacts.map(contact => {
                  // Check if firstName/lastName are actually timestamps (fix for old data)
                  const isTimestamp = (val) => val && typeof val === 'string' && (val.includes('T') && val.includes(':'));
                  const firstName = isTimestamp(contact.firstName) ? '' : (contact.firstName || '');
                  const lastName = isTimestamp(contact.lastName) ? '' : (contact.lastName || '');
                  const displayName = [firstName, lastName].filter(Boolean).join(' ');
                  
                  return (
                  <tr key={contact.id}>
                    <td><input type="checkbox" checked={selectedContacts.includes(contact.id)} onChange={() => toggleSelect(contact.id)} /></td>
                    <td><strong>{contact.email}</strong></td>
                    <td>{displayName || <span className="text-muted">-</span>}</td>
                    <td>{contact.company || '-'}</td>
                    <td>{contact.listName || <span className="text-muted">No list</span>}</td>
                    <td>{getVerificationBadge(contact)}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="progress-bar" style={{ width: '60px' }}>
                          <div className="progress-fill" style={{ width: `${Math.min(contact.engagementScore || 0, 100)}%` }} />
                        </div>
                        <span className="text-sm">{contact.engagementScore || 0}</span>
                      </div>
                    </td>
                    <td>
                      <button className="btn btn-outline btn-icon btn-sm" onClick={() => handleOpenModal(contact)} title="Edit">
                        <Edit2 size={14} />
                      </button>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex justify-between items-center mt-4 text-sm text-muted">
          <span>Showing {contacts.length} contacts</span>
        </div>
      </div>


      {/* Add/Edit Contact Modal */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editingContact ? 'Edit Contact' : 'Add Contact'}
        footer={<><button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button><button className="btn btn-primary" onClick={handleSave}>Save</button></>}>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Email *</label>
            <input type="email" className="form-input" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">List</label>
            <select className="form-select" value={formData.listId} onChange={(e) => setFormData({ ...formData, listId: e.target.value })}>
              <option value="">No List</option>
              {lists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">First Name</label>
            <input type="text" className="form-input" value={formData.firstName} onChange={(e) => setFormData({ ...formData, firstName: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">Last Name</label>
            <input type="text" className="form-input" value={formData.lastName} onChange={(e) => setFormData({ ...formData, lastName: e.target.value })} />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Company</label>
            <input type="text" className="form-input" value={formData.company} onChange={(e) => setFormData({ ...formData, company: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">Phone</label>
            <input type="text" className="form-input" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Custom Field 1</label>
            <input type="text" className="form-input" value={formData.customField1} onChange={(e) => setFormData({ ...formData, customField1: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">Custom Field 2</label>
            <input type="text" className="form-input" value={formData.customField2} onChange={(e) => setFormData({ ...formData, customField2: e.target.value })} />
          </div>
        </div>
      </Modal>

      {/* Import Modal */}
      <Modal isOpen={showImportModal} onClose={() => setShowImportModal(false)} title="Import Contacts" size="lg"
        footer={<><button className="btn btn-secondary" onClick={() => setShowImportModal(false)}>Cancel</button><button className="btn btn-primary" onClick={confirmImport}>Import {importData.contacts.length} Contacts</button></>}>
        <div className="mb-4" style={{ padding: '12px', background: 'var(--bg-tertiary)', borderRadius: '8px' }}>
          <p style={{ margin: 0 }}><strong>✓ Found {importData.contacts.length} valid email addresses</strong></p>
          <p className="text-sm text-muted" style={{ margin: '8px 0 0 0' }}>Review the data below before importing. Names and company info are automatically detected from column headers.</p>
        </div>
        <div className="form-group">
          <label className="form-label">Add to List (optional)</label>
          <select className="form-select" value={importData.listId} onChange={(e) => setImportData({ ...importData, listId: e.target.value })}>
            <option value="">No List</option>
            {lists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
        <div className="table-container" style={{ maxHeight: '300px', overflow: 'auto' }}>
          <table className="table">
            <thead><tr><th>Email</th><th>First Name</th><th>Last Name</th><th>Company</th></tr></thead>
            <tbody>
              {importData.contacts.slice(0, 100).map((c, i) => (
                <tr key={i}><td>{c.email}</td><td>{c.firstName || '-'}</td><td>{c.lastName || '-'}</td><td>{c.company || '-'}</td></tr>
              ))}
            </tbody>
          </table>
          {importData.contacts.length > 100 && <p className="text-muted text-center mt-2">...and {importData.contacts.length - 100} more</p>}
        </div>
      </Modal>

      {/* Tag Management Modal */}
      <Modal isOpen={showTagModal} onClose={() => setShowTagModal(false)} title="Manage Tags"
        footer={<button className="btn btn-secondary" onClick={() => setShowTagModal(false)}>Close</button>}>
        <div className="flex gap-2 mb-4">
          <input type="text" className="form-input" placeholder="New tag name" value={newTag.name} onChange={(e) => setNewTag({ ...newTag, name: e.target.value })} />
          <input type="color" value={newTag.color} onChange={(e) => setNewTag({ ...newTag, color: e.target.value })} style={{ width: '50px', height: '40px', border: 'none', cursor: 'pointer' }} />
          <button className="btn btn-primary" onClick={handleAddTag}><Plus size={16} /></button>
        </div>
        <div className="flex flex-wrap gap-2">
          {tags.map(tag => (
            <span key={tag.id} className="badge" style={{ background: tag.color + '20', color: tag.color, border: `1px solid ${tag.color}` }}>
              {tag.name}
              <button onClick={async () => { await window.electron.tags.delete(tag.id); loadData(); }} style={{ marginLeft: '8px', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}>×</button>
            </span>
          ))}
          {tags.length === 0 && <p className="text-muted">No tags created yet</p>}
        </div>
      </Modal>
    </div>
  );
}

export default Contacts;
