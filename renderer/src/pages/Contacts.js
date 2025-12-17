import React, { useState, useEffect } from 'react';
import { Search, Plus, Upload, Download, Trash2, Check, Users, FolderOpen } from 'lucide-react';
import Modal from '../components/Modal';
import { useToast } from '../components/ToastContext';
import Papa from 'papaparse';

function Contacts() {
  const { addToast } = useToast();
  const [contacts, setContacts] = useState([]);
  const [lists, setLists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedList, setSelectedList] = useState('all');
  const [selectedContacts, setSelectedContacts] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showListModal, setShowListModal] = useState(false);
  const [newContact, setNewContact] = useState({ email: '', firstName: '', lastName: '', listId: '' });
  const [newList, setNewList] = useState({ name: '', description: '' });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      if (window.electron) {
        const [contactsData, listsData] = await Promise.all([
          window.electron.contacts.getAll(),
          window.electron.lists.getAll()
        ]);
        setContacts(contactsData || []);
        setLists(listsData || []);
      }
    } catch (error) {
      addToast('Failed to load contacts', 'error');
    } finally {
      setLoading(false);
    }
  };

  const filteredContacts = contacts.filter(contact => {
    const matchesSearch = contact.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (contact.firstName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (contact.lastName || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesList = selectedList === 'all' || contact.listId === selectedList;
    return matchesSearch && matchesList;
  });

  const handleAddContact = async () => {
    if (!newContact.email) {
      addToast('Email is required', 'error');
      return;
    }
    try {
      const result = await window.electron.contacts.add(newContact);
      if (result.success) {
        addToast('Contact added successfully', 'success');
        setShowAddModal(false);
        setNewContact({ email: '', firstName: '', lastName: '', listId: '' });
        loadData();
      } else {
        addToast(result.error || 'Failed to add contact', 'error');
      }
    } catch (error) {
      addToast('Failed to add contact', 'error');
    }
  };

  const handleImportCSV = async () => {
    try {
      const result = await window.electron.contacts.import();
      if (result.success) {
        Papa.parse(result.content, {
          header: true,
          skipEmptyLines: true,
          complete: async (parsed) => {
            const contactsToImport = parsed.data.map(row => ({
              email: row.email || row.Email || row.EMAIL || '',
              firstName: row.firstName || row.first_name || row.FirstName || row['First Name'] || '',
              lastName: row.lastName || row.last_name || row.LastName || row['Last Name'] || '',
              listId: selectedList !== 'all' ? selectedList : null
            })).filter(c => c.email);

            if (contactsToImport.length === 0) {
              addToast('No valid emails found in CSV', 'error');
              return;
            }

            const importResult = await window.electron.contacts.addBulk(contactsToImport);
            if (importResult.success) {
              addToast(`Imported ${importResult.inserted} contacts (${importResult.skipped} skipped)`, 'success');
              loadData();
            }
          }
        });
      }
    } catch (error) {
      addToast('Failed to import CSV', 'error');
    }
  };

  const handleExport = async () => {
    try {
      const result = await window.electron.export.contacts(filteredContacts);
      if (result.success) {
        addToast('Contacts exported successfully', 'success');
      }
    } catch (error) {
      addToast('Failed to export contacts', 'error');
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedContacts.length === 0) return;
    try {
      await window.electron.contacts.delete(selectedContacts);
      addToast(`Deleted ${selectedContacts.length} contacts`, 'success');
      setSelectedContacts([]);
      loadData();
    } catch (error) {
      addToast('Failed to delete contacts', 'error');
    }
  };

  const handleAddList = async () => {
    if (!newList.name) {
      addToast('List name is required', 'error');
      return;
    }
    try {
      await window.electron.lists.add(newList);
      addToast('List created successfully', 'success');
      setShowListModal(false);
      setNewList({ name: '', description: '' });
      loadData();
    } catch (error) {
      addToast('Failed to create list', 'error');
    }
  };

  const toggleSelectAll = () => {
    if (selectedContacts.length === filteredContacts.length) {
      setSelectedContacts([]);
    } else {
      setSelectedContacts(filteredContacts.map(c => c.id));
    }
  };

  const toggleSelect = (id) => {
    setSelectedContacts(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const getStatusBadge = (contact) => {
    if (contact.verified) return <span className="badge badge-success">Verified</span>;
    if (contact.status === 'bounced') return <span className="badge badge-error">Bounced</span>;
    return <span className="badge badge-default">Pending</span>;
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Contacts</h1>
        <p className="page-subtitle">Manage your email contacts and lists.</p>
      </div>

      <div className="toolbar">
        <div className="toolbar-search">
          <Search />
          <input
            type="text"
            className="form-input"
            placeholder="Search contacts..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <select
          className="form-select"
          style={{ width: '200px' }}
          value={selectedList}
          onChange={(e) => setSelectedList(e.target.value)}
        >
          <option value="all">All Contacts</option>
          {lists.map(list => (
            <option key={list.id} value={list.id}>{list.name} ({list.contactCount})</option>
          ))}
        </select>

        <div className="toolbar-actions">
          <button className="btn btn-outline btn-sm" onClick={() => setShowListModal(true)}>
            <FolderOpen size={16} /> New List
          </button>
          <button className="btn btn-outline btn-sm" onClick={handleImportCSV}>
            <Upload size={16} /> Import CSV
          </button>
          <button className="btn btn-outline btn-sm" onClick={handleExport}>
            <Download size={16} /> Export
          </button>
          {selectedContacts.length > 0 && (
            <button className="btn btn-danger btn-sm" onClick={handleDeleteSelected}>
              <Trash2 size={16} /> Delete ({selectedContacts.length})
            </button>
          )}
          <button className="btn btn-primary btn-sm" onClick={() => setShowAddModal(true)}>
            <Plus size={16} /> Add Contact
          </button>
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div className="text-center text-muted" style={{ padding: '40px' }}>Loading...</div>
        ) : filteredContacts.length === 0 ? (
          <div className="empty-state">
            <Users className="empty-state-icon" />
            <h3 className="empty-state-title">No contacts found</h3>
            <p className="empty-state-text">Add contacts manually or import from a CSV file.</p>
            <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
              <Plus size={16} /> Add Contact
            </button>
          </div>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th className="table-checkbox">
                    <div
                      className={`checkbox ${selectedContacts.length === filteredContacts.length ? 'checked' : ''}`}
                      onClick={toggleSelectAll}
                    >
                      {selectedContacts.length === filteredContacts.length && <Check size={14} />}
                    </div>
                  </th>
                  <th>Email</th>
                  <th>Name</th>
                  <th>List</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredContacts.map(contact => (
                  <tr key={contact.id}>
                    <td>
                      <div
                        className={`checkbox ${selectedContacts.includes(contact.id) ? 'checked' : ''}`}
                        onClick={() => toggleSelect(contact.id)}
                      >
                        {selectedContacts.includes(contact.id) && <Check size={14} />}
                      </div>
                    </td>
                    <td>{contact.email}</td>
                    <td>{[contact.firstName, contact.lastName].filter(Boolean).join(' ') || '-'}</td>
                    <td>{contact.listName || '-'}</td>
                    <td>{getStatusBadge(contact)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Contact Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Add Contact"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setShowAddModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleAddContact}>Add Contact</button>
          </>
        }
      >
        <div className="form-group">
          <label className="form-label">Email *</label>
          <input
            type="email"
            className="form-input"
            placeholder="email@example.com"
            value={newContact.email}
            onChange={(e) => setNewContact({ ...newContact, email: e.target.value })}
          />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">First Name</label>
            <input
              type="text"
              className="form-input"
              placeholder="John"
              value={newContact.firstName}
              onChange={(e) => setNewContact({ ...newContact, firstName: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Last Name</label>
            <input
              type="text"
              className="form-input"
              placeholder="Doe"
              value={newContact.lastName}
              onChange={(e) => setNewContact({ ...newContact, lastName: e.target.value })}
            />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">List</label>
          <select
            className="form-select"
            value={newContact.listId}
            onChange={(e) => setNewContact({ ...newContact, listId: e.target.value })}
          >
            <option value="">No List</option>
            {lists.map(list => (
              <option key={list.id} value={list.id}>{list.name}</option>
            ))}
          </select>
        </div>
      </Modal>

      {/* Add List Modal */}
      <Modal
        isOpen={showListModal}
        onClose={() => setShowListModal(false)}
        title="Create New List"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setShowListModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleAddList}>Create List</button>
          </>
        }
      >
        <div className="form-group">
          <label className="form-label">List Name *</label>
          <input
            type="text"
            className="form-input"
            placeholder="e.g., Newsletter Subscribers"
            value={newList.name}
            onChange={(e) => setNewList({ ...newList, name: e.target.value })}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Description</label>
          <textarea
            className="form-textarea"
            placeholder="Optional description..."
            value={newList.description}
            onChange={(e) => setNewList({ ...newList, description: e.target.value })}
            rows={3}
          />
        </div>
      </Modal>
    </div>
  );
}

export default Contacts;
