import React, { useState, useEffect } from 'react';
import { FileInput, Plus, Edit3, Trash2, Clipboard, Check } from 'lucide-react';
import { useToast } from '../components/ToastContext';

const DEFAULT_FIELDS = [
  { name: 'email', label: 'Email', type: 'email', required: true },
  { name: 'firstName', label: 'First Name', type: 'text', required: false }
];

const DEFAULT_FORM = {
  name: '', listId: '', fields: DEFAULT_FIELDS,
  style: {}, successMessage: 'Thank you for subscribing!',
  redirectUrl: '', isActive: true, doubleOptin: false,
  confirmationSubject: 'Please confirm your subscription',
  confirmationTemplate: 'Click the link below to confirm your subscription: {{confirmLink}}'
};

export default function SignupForms() {
  const { addToast } = useToast();
  const [forms, setForms]             = useState([]);
  const [lists, setLists]             = useState([]);
  const [loading, setLoading]         = useState(true);
  const [showModal, setShowModal]     = useState(false);
  const [editingId, setEditingId]     = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [embedCode, setEmbedCode]     = useState('');
  const [copied, setCopied]           = useState(false);
  const [formData, setFormData]       = useState(DEFAULT_FORM);
  const patch = (key, val) => setFormData(p => ({ ...p, [key]: val }));

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const [fd, ld] = await Promise.all([
        window.electron.form?.getAll?.(),
        window.electron.lists?.getAll?.()
      ]);
      setForms(Array.isArray(fd) ? fd : []);
      setLists(Array.isArray(ld) ? ld : []);
    } catch (err) {
      console.error('Failed to load signup forms:', err);
    } finally {
      setLoading(false);
    }
  };

  const openNew = () => {
    setEditingId(null);
    setFormData(DEFAULT_FORM);
    setShowModal(true);
  };

  const openEdit = (form) => {
    setEditingId(form.id);
    let fields = form.fields;
    if (typeof fields === 'string') { try { fields = JSON.parse(fields); } catch { fields = DEFAULT_FIELDS; } }
    setFormData({
      name: form.name, listId: form.listId,
      fields: Array.isArray(fields) ? fields : DEFAULT_FIELDS,
      style: form.style || {},
      successMessage: form.successMessage || 'Thank you for subscribing!',
      redirectUrl: form.redirectUrl || '',
      isActive: !!form.isActive,
      doubleOptin: !!form.doubleOptin,
      confirmationSubject: form.confirmationSubject || 'Please confirm your subscription',
      confirmationTemplate: form.confirmationTemplate || ''
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const hasEmailField = formData.fields.some((f) => f.name === 'email' || f.type === 'email');
    if (!hasEmailField) {
      addToast('A form must have an email field to collect subscribers', 'error');
      return;
    }
    try {
      const payload = { ...formData, fields: formData.fields };
      if (editingId) {
        await window.electron.form?.update?.({ ...payload, id: editingId });
        addToast('Form updated', 'success');
      } else {
        await window.electron.form?.create?.(payload);
        addToast('Form created', 'success');
      }
      setShowModal(false);
      load();
    } catch {
      addToast('Failed to save form', 'error');
    }
  };

  const handleDelete = async () => {
    try {
      await window.electron.form?.delete?.(confirmDelete);
      addToast('Form deleted', 'success');
      load();
    } catch {
      addToast('Failed to delete form', 'error');
    } finally {
      setConfirmDelete(null);
    }
  };

  const handleGetEmbed = async (formId) => {
    try {
      const result = await window.electron.form?.getEmbedCode?.(formId);
      if (result?.embedCode) {
        setEmbedCode(result.embedCode);
      } else {
        addToast('Failed to generate embed code', 'error');
      }
    } catch {
      addToast('Failed to get embed code', 'error');
    }
  };

  const handleCopyEmbed = async () => {
    try {
      await navigator.clipboard.writeText(embedCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      addToast('Copy failed — please select and copy manually', 'warning');
    }
  };

  const addField = () =>
    patch('fields', [...formData.fields, { name: '', label: '', type: 'text', required: false }]);

  const updateField = (i, key, val) => {
    const next = [...formData.fields];
    next[i] = { ...next[i], [key]: val };
    patch('fields', next);
  };

  const removeField = (i) =>
    patch('fields', formData.fields.filter((_, idx) => idx !== i));

  const getListName = (id) =>
    lists.find(l => l.id === id)?.name || 'Unknown List';

  const parseFields = (raw) => {
    if (Array.isArray(raw)) return raw;
    try { return JSON.parse(raw || '[]'); } catch { return []; }
  };

  if (loading) {
    return (
      <div className="page-container">
        <div className="loading">Loading signup forms…</div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1>
            <FileInput size={22} style={{ color: 'var(--accent)' }} />
            Signup Forms
          </h1>
          <p className="subtitle">Create embeddable forms to grow your email list</p>
        </div>
        <button className="btn btn-primary" onClick={openNew}>
          <Plus size={16} /> New Form
        </button>
      </div>

      {forms.length === 0 ? (
        <div className="empty-state">
          <FileInput size={40} style={{ color: 'var(--text-muted)', marginBottom: '12px' }} />
          <h3>No signup forms yet</h3>
          <p>Create a form to embed on your website</p>
          <button className="btn btn-primary" style={{ marginTop: '16px' }} onClick={openNew}>
            Create Form
          </button>
        </div>
      ) : (
        <div className="form-list">
          {forms.map(form => (
            <div key={form.id} className={`form-card ${form.isActive ? 'active' : ''}`}>
              <div className="form-header">
                <div className="form-info">
                  <h3>{form.name}</h3>
                  <span className="form-list-target">List: {getListName(form.listId)}</span>
                </div>
              </div>
              <div className="form-fields-preview">
                {parseFields(form.fields).map((f, i) => (
                  <span key={i} className="field-tag">{f.label || f.name}</span>
                ))}
              </div>
              <div className="form-footer">
                <span className={`status-badge ${form.isActive ? 'active' : 'draft'}`}>
                  {form.isActive ? 'active' : 'inactive'}
                </span>
                <div className="form-actions">
                  <button className="btn-icon" aria-label="Get embed code"
                    onClick={() => handleGetEmbed(form.id)} title="Get Embed Code">
                    <Clipboard size={15} />
                  </button>
                  <button className="btn-icon" aria-label="Edit form"
                    onClick={() => openEdit(form)} title="Edit">
                    <Edit3 size={15} />
                  </button>
                  <button className="btn-icon danger" aria-label="Delete form"
                    onClick={() => setConfirmDelete(form.id)} title="Delete">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingId ? 'Edit Form' : 'New Signup Form'}</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
            </div>
            <form onSubmit={handleSubmit} className="modal-body">
              <div className="form-group">
                <label className="form-label">Form Name</label>
                <input type="text" className="form-input" value={formData.name}
                  onChange={e => patch('name', e.target.value)}
                  placeholder="e.g., Newsletter Signup" required />
              </div>
              <div className="form-group">
                <label className="form-label">Target List</label>
                <select className="form-select" value={formData.listId}
                  onChange={e => patch('listId', e.target.value)} required>
                  <option value="">Select a list</option>
                  {lists.map(l => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Form Fields</label>
                <div className="fields-editor">
                  {formData.fields.map((field, i) => (
                    <div key={i} className="field-row">
                      <input type="text" className="form-input" placeholder="Field name (internal)"
                        value={field.name} onChange={e => updateField(i, 'name', e.target.value)} />
                      <input type="text" className="form-input" placeholder="Label"
                        value={field.label} onChange={e => updateField(i, 'label', e.target.value)} />
                      <select className="form-select" value={field.type} onChange={e => updateField(i, 'type', e.target.value)}>
                        <option value="text">Text</option>
                        <option value="email">Email</option>
                        <option value="number">Number</option>
                      </select>
                      <label className="checkbox-label">
                        <input type="checkbox" checked={field.required}
                          onChange={e => updateField(i, 'required', e.target.checked)} />
                        Req
                      </label>
                      {formData.fields.length > 1 && (
                        <button type="button" className="btn-icon danger"
                          aria-label="Remove field" onClick={() => removeField(i)}>
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  ))}
                  <button type="button" className="btn btn-secondary btn-sm" onClick={addField}>
                    + Add Field
                  </button>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Success Message</label>
                <input type="text" className="form-input" value={formData.successMessage}
                  onChange={e => patch('successMessage', e.target.value)}
                  placeholder="Thank you for subscribing!" />
              </div>
              <div className="form-group">
                <label className="form-label">Redirect URL (optional)</label>
                <input type="url" className="form-input" value={formData.redirectUrl}
                  onChange={e => patch('redirectUrl', e.target.value)}
                  placeholder="https://example.com/thank-you" />
              </div>
              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={formData.doubleOptin}
                    onChange={e => patch('doubleOptin', e.target.checked)} />
                  Enable Double Opt-in
                </label>
                <p className="form-hint">Send a confirmation email before adding to the list</p>
              </div>
              {formData.doubleOptin && (
                <>
                  <div className="form-group">
                    <label className="form-label">Confirmation Email Subject</label>
                    <input type="text" className="form-input" value={formData.confirmationSubject}
                      onChange={e => patch('confirmationSubject', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Confirmation Email Template</label>
                    <textarea className="form-input" value={formData.confirmationTemplate}
                      onChange={e => patch('confirmationTemplate', e.target.value)} rows={3} />
                  </div>
                </>
              )}
              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={formData.isActive}
                    onChange={e => patch('isActive', e.target.checked)} />
                  Active
                </label>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">{editingId ? 'Update' : 'Create'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Embed code modal */}
      {embedCode && (
        <div className="modal-overlay" onClick={() => setEmbedCode('')}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Embed Code</h2>
              <button className="modal-close" onClick={() => setEmbedCode('')}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ color: 'var(--text-secondary)', marginBottom: '12px', fontSize: '14px' }}>
                Copy and paste this code into your website:
              </p>
              <textarea readOnly value={embedCode} rows={10}
                className="embed-code" style={{ marginBottom: '12px' }} />
              <button className="btn btn-primary" onClick={handleCopyEmbed}
                style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {copied ? <Check size={16} /> : <Clipboard size={16} />}
                {copied ? 'Copied!' : 'Copy to Clipboard'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {confirmDelete && (
        <div className="modal-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="modal" style={{ maxWidth: '380px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header"><h2>Delete Form</h2></div>
            <div className="modal-body">
              <p>Are you sure you want to delete this form? All submission data will also be removed.</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={handleDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
