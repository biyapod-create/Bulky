import React, { useState, useEffect } from 'react';

import { Zap, Plus, Edit2, Trash2, Play, Pause, UserPlus, Link, Mail, Calendar, Tag } from 'lucide-react';
import { useToast } from '../components/ToastContext';

const TRIGGER_TYPES = [
  { value: 'contact_added', label: 'Contact Added',  icon: UserPlus },
  { value: 'link_clicked',  label: 'Link Clicked',   icon: Link     },
  { value: 'email_opened',  label: 'Email Opened',   icon: Mail     },
  { value: 'date_based',    label: 'Date Based',      icon: Calendar },
  { value: 'tag_applied',   label: 'Tag Applied',    icon: Tag      },
];

function Automations({ isActive }) {
  const { addToast } = useToast();
  const [automations, setAutomations] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [showModal, setShowModal]     = useState(false);
  const [editing, setEditing]         = useState(null);
  const emptyForm = { name: '', description: '', triggerType: 'contact_added', isActive: false };
  const [form, setForm]               = useState(emptyForm);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (isActive) load(); }, [isActive]);

  const load = async () => {
    setLoading(true);
    try {
      const data = await window.electron?.automation?.getAll?.();
      setAutomations(Array.isArray(data) ? data : []);
    } catch (err) {
      addToast('Failed to load automations: ' + (err.message || 'Unknown error'), 'error');
    } finally { setLoading(false); }
  };

  const openNew = () => { setEditing(null); setForm(emptyForm); setShowModal(true); };
  const openEdit = (a) => {
    setEditing(a);
    setForm({ name: a.name, description: a.description || '', triggerType: a.triggerType, isActive: !!a.isActive });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { addToast('Name is required', 'error'); return; }
    try {
      if (editing) {
        const r = await window.electron?.automation?.update?.({ ...form, id: editing.id });
        if (r?.error) throw new Error(r.error);
        addToast('Automation updated', 'success');
      } else {
        const r = await window.electron?.automation?.create?.(form);
        if (r?.error) throw new Error(r.error);
        addToast('Automation created', 'success');
      }
      setShowModal(false); load();
    } catch (e) { addToast(e.message || 'Failed to save', 'error'); }
  };

  const handleToggle = async (id) => {
    try {
      const r = await window.electron?.automation?.toggle?.(id);
      if (r?.error) throw new Error(r.error);
      load();
    } catch (e) { addToast('Failed to toggle: ' + e.message, 'error'); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this automation?')) return;
    try {
      const r = await window.electron?.automation?.delete?.(id);
      if (r?.error) throw new Error(r.error);
      addToast('Deleted', 'success'); load();
    } catch (e) { addToast('Failed to delete: ' + e.message, 'error'); }
  };

  const TIcon = ({ type, size = 18 }) => {
    const t = TRIGGER_TYPES.find(t => t.value === type);
    const I = t?.icon || Zap;
    return <I size={size} />;
  };

  if (loading) return (
    <div className="page-fade-in">
      <div className="page-header"><h1 className="page-title">Automations</h1></div>
      <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>Loading...</div>
    </div>
  );

  return (
    <div className="page-fade-in">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 className="page-title">Automations</h1>
          <p className="page-subtitle">Create automated workflows triggered by contact behaviour.</p>
        </div>
        <button className="btn btn-primary" onClick={openNew}><Plus size={16} /> New Automation</button>
      </div>

      {(!Array.isArray(automations) || automations.length === 0) ? (
        <div className="card" style={{ textAlign: 'center', padding: '60px 24px' }}>
          <Zap size={48} style={{ color: 'var(--text-muted)', opacity: 0.3, display: 'block', margin: '0 auto 16px' }} />
          <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>No automations yet</h3>
          <p style={{ color: 'var(--text-muted)', marginBottom: '20px' }}>
            Build workflows that fire when contacts take specific actions.
          </p>
          <button className="btn btn-primary" onClick={openNew}><Plus size={16} /> Create Automation</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {automations.map((a, idx) => (
            <div key={a.id || `auto-${idx}`} className="card hover-lift" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '10px', flexShrink: 0,
                background: a.isActive ? 'rgba(91,180,212,0.15)' : 'var(--bg-tertiary)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: a.isActive ? 'var(--accent)' : 'var(--text-muted)' }}>
                <TIcon type={a.triggerType} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text)' }}>{a.name || 'Untitled'}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Trigger: {TRIGGER_TYPES.find(t => t.value === a.triggerType)?.label || a.triggerType || 'Unknown'}
                  {a.description ? ` · ${a.description}` : ''}
                </div>
              </div>
              <span className={`badge ${a.isActive ? 'badge-success' : 'badge-default'}`}>{a.isActive ? 'Active' : 'Inactive'}</span>
              <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                <button className="btn btn-outline btn-sm" onClick={() => handleToggle(a.id)} title={a.isActive ? 'Disable' : 'Enable'}>
                  {a.isActive ? <Pause size={14} /> : <Play size={14} />}
                </button>
                <button className="btn btn-outline btn-sm" onClick={() => openEdit(a)}><Edit2 size={14} /></button>
                <button className="btn btn-danger btn-sm" onClick={() => handleDelete(a.id)}><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" style={{ maxWidth: '480px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editing ? 'Edit Automation' : 'New Automation'}</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Name *</label>
                <input className="form-input" placeholder="e.g., Welcome Series" value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })} />
              </div>

              <div className="form-group">
                <label className="form-label">Trigger</label>
                <select className="form-select" value={form.triggerType}
                  onChange={e => setForm({ ...form, triggerType: e.target.value })}>
                  {TRIGGER_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Description <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>
                <textarea className="form-textarea" rows={3} placeholder="What does this automation do?"
                  value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
              </div>

              <label className="checkbox-label" style={{ marginBottom: '24px', padding: '12px', borderRadius: '10px', background: 'var(--bg-tertiary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}
                onClick={() => setForm({ ...form, isActive: !form.isActive })}>
                <input type="checkbox" checked={form.isActive} readOnly />
                <span style={{ fontSize: '13px', color: 'var(--text)' }}>Activate immediately after creating</span>
              </label>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave}>{editing ? 'Update' : 'Create'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Automations;
