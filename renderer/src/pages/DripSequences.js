import React, { useState, useEffect } from 'react';
import { Mail, Plus, Edit2, Trash2, Play, Pause, Clock, X } from 'lucide-react';
import { useToast } from '../components/ToastContext';

const EMPTY_STEP = { delay: 1, unit: 'days', subject: '' };

function DripSequences({ isActive }) {
  const { addToast } = useToast();
  const [sequences, setSequences] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing]     = useState(null);
  const emptyForm = { name: '', description: '', campaignId: '', steps: [{ ...EMPTY_STEP }], isActive: false };
  const [form, setForm]           = useState(emptyForm);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (isActive) loadData(); }, [isActive]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [seqData, campData] = await Promise.all([
        window.electron?.drip?.getAll?.(),
        window.electron?.campaigns?.getAll?.()
      ]);
      setSequences(Array.isArray(seqData) ? seqData : []);
      setCampaigns(Array.isArray(campData) ? campData : []);
    } catch (e) { addToast('Failed to load: ' + e.message, 'error'); }
    finally { setLoading(false); }
  };

  const openNew  = () => { setEditing(null); setForm({ ...emptyForm, steps: [{ ...EMPTY_STEP }] }); setShowModal(true); };
  const openEdit = (s) => {
    setEditing(s);
    let steps = [];
    try { steps = typeof s.steps === 'string' ? JSON.parse(s.steps) : s.steps || []; } catch { steps = [{ ...EMPTY_STEP }]; }
    setForm({ name: s.name, description: s.description || '', campaignId: s.campaignId || '', steps, isActive: !!s.isActive });
    setShowModal(true);
  };

  const save = async () => {
    if (!form.name.trim()) { addToast('Name is required', 'error'); return; }
    if (!form.campaignId)  { addToast('Select a campaign', 'error'); return; }
    try {
      const payload = { ...form, steps: JSON.stringify(form.steps) };
      const r = editing
        ? await window.electron?.drip?.update?.({ ...payload, id: editing.id })
        : await window.electron?.drip?.create?.(payload);
      if (r?.error) throw new Error(r.error);
      addToast(editing ? 'Sequence updated' : 'Sequence created', 'success');
      setShowModal(false); loadData();
    } catch (e) { addToast(e.message || 'Save failed', 'error'); }
  };

  const toggle = async (id) => { try { await window.electron?.drip?.toggle?.(id); loadData(); } catch (e) { addToast('Toggle failed', 'error'); } };
  const del    = async (id) => {
    if (!window.confirm('Delete this sequence?')) return;
    try { await window.electron?.drip?.delete?.(id); addToast('Deleted', 'success'); loadData(); }
    catch (e) { addToast('Delete failed', 'error'); }
  };

  const addStep    = () => setForm(f => ({ ...f, steps: [...f.steps, { ...EMPTY_STEP }] }));
  const updateStep = (i, k, v) => setForm(f => { const s = [...f.steps]; s[i] = { ...s[i], [k]: v }; return { ...f, steps: s }; });
  const removeStep = (i) => setForm(f => ({ ...f, steps: f.steps.filter((_, idx) => idx !== i) }));
  const campName   = (id) => campaigns.find(c => c.id === id)?.name || 'Unknown';
  const stepCount  = (s) => { try { return (typeof s.steps === 'string' ? JSON.parse(s.steps) : s.steps || []).length; } catch { return 0; } };
  if (loading) return (
    <div className="page-fade-in">
      <div className="page-header"><h1 className="page-title">Drip Sequences</h1></div>
      <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>Loading...</div>
    </div>
  );

  return (
    <div className="page-fade-in">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 className="page-title">Drip Sequences</h1>
          <p className="page-subtitle">Build multi-step email sequences with timed delays.</p>
        </div>
        <button className="btn btn-primary" onClick={openNew}><Plus size={16} /> New Sequence</button>
      </div>

      {sequences.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '60px 24px' }}>
          <Clock size={48} style={{ color: 'var(--text-muted)', opacity: 0.3, display: 'block', margin: '0 auto 16px' }} />
          <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>No drip sequences yet</h3>
          <p style={{ color: 'var(--text-muted)', marginBottom: '20px' }}>Build timed follow-up emails that send automatically.</p>
          <button className="btn btn-primary" onClick={openNew}><Plus size={16} /> Create Sequence</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {sequences.map(s => (
            <div key={s.id} className="card hover-lift" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '10px', flexShrink: 0, background: s.isActive ? 'rgba(91,180,212,0.15)' : 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: s.isActive ? 'var(--accent)' : 'var(--text-muted)' }}>
                <Mail size={18} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text)' }}>{s.name}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  {campName(s.campaignId)} &middot; {stepCount(s)} step{stepCount(s) !== 1 ? 's' : ''}
                  {s.description ? ` \u00b7 ${s.description}` : ''}
                </div>
              </div>
              <span className={`badge ${s.isActive ? 'badge-success' : 'badge-default'}`}>{s.isActive ? 'Active' : 'Inactive'}</span>
              <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                <button className="btn btn-outline btn-sm" onClick={() => toggle(s.id)}>{s.isActive ? <Pause size={14} /> : <Play size={14} />}</button>
                <button className="btn btn-outline btn-sm" onClick={() => openEdit(s)}><Edit2 size={14} /></button>
                <button className="btn btn-danger btn-sm" onClick={() => del(s.id)}><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal modal-lg" style={{ maxWidth: '540px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editing ? 'Edit Sequence' : 'New Drip Sequence'}</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Name *</label>
                <input className="form-input" placeholder="e.g., Welcome Series" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Campaign *</label>
                <select className="form-select" value={form.campaignId} onChange={e => setForm({ ...form, campaignId: e.target.value })}>
                  <option value="">Select a campaign</option>
                  {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea className="form-textarea" rows={2} placeholder="Describe this sequence" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
              </div>

              <div className="form-group">
                <label className="form-label">Steps</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '10px' }}>
                  {form.steps.map((step, i) => (
                    <div key={i} className="card" style={{ padding: '14px', background: 'var(--bg-tertiary)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Step {i + 1}</span>
                        {form.steps.length > 1 && <button className="btn-icon" onClick={() => removeStep(i)} style={{ color: 'var(--text-muted)' }}><X size={13} /></button>}
                      </div>
                      <div className="form-row" style={{ marginBottom: '8px' }}>
                        <input className="form-input" type="number" min="1" style={{ width: '80px' }} value={step.delay} onChange={e => updateStep(i, 'delay', parseInt(e.target.value) || 1)} />
                        <select className="form-select" value={step.unit} onChange={e => updateStep(i, 'unit', e.target.value)}>
                          <option value="minutes">Minutes</option>
                          <option value="hours">Hours</option>
                          <option value="days">Days</option>
                          <option value="weeks">Weeks</option>
                        </select>
                      </div>
                      <input className="form-input" placeholder="Subject line for this step" value={step.subject || ''} onChange={e => updateStep(i, 'subject', e.target.value)} />
                    </div>
                  ))}
                </div>
                <button className="btn btn-outline btn-sm" onClick={addStep} style={{ width: '100%' }}><Plus size={14} /> Add Step</button>
              </div>

              <label className="checkbox-label" style={{ marginBottom: '24px', padding: '12px', borderRadius: '10px', background: 'var(--bg-tertiary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}
                onClick={() => setForm({ ...form, isActive: !form.isActive })}>
                <input type="checkbox" checked={form.isActive} readOnly />
                <span style={{ fontSize: '13px', color: 'var(--text)' }}>Activate this sequence immediately</span>
              </label>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={save}>{editing ? 'Update' : 'Create'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DripSequences;