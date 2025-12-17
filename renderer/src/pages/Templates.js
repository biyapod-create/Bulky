import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, FileText, Copy } from 'lucide-react';
import Modal from '../components/Modal';
import { useToast } from '../components/ToastContext';

function Templates() {
  const { addToast } = useToast();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    subject: '',
    content: ''
  });

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      if (window.electron) {
        const data = await window.electron.templates.getAll();
        setTemplates(data || []);
      }
    } catch (error) {
      addToast('Failed to load templates', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (template = null) => {
    if (template) {
      setEditingTemplate(template);
      setFormData({
        name: template.name,
        subject: template.subject,
        content: template.content
      });
    } else {
      setEditingTemplate(null);
      setFormData({ name: '', subject: '', content: getDefaultContent() });
    }
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formData.name || !formData.subject) {
      addToast('Name and subject are required', 'error');
      return;
    }

    try {
      if (editingTemplate) {
        await window.electron.templates.update({ ...formData, id: editingTemplate.id });
        addToast('Template updated', 'success');
      } else {
        await window.electron.templates.add(formData);
        addToast('Template created', 'success');
      }
      setShowModal(false);
      loadTemplates();
    } catch (error) {
      addToast('Failed to save template', 'error');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this template?')) return;
    try {
      await window.electron.templates.delete(id);
      addToast('Template deleted', 'success');
      loadTemplates();
    } catch (error) {
      addToast('Failed to delete template', 'error');
    }
  };

  const handleDuplicate = async (template) => {
    try {
      await window.electron.templates.add({
        name: `${template.name} (Copy)`,
        subject: template.subject,
        content: template.content
      });
      addToast('Template duplicated', 'success');
      loadTemplates();
    } catch (error) {
      addToast('Failed to duplicate template', 'error');
    }
  };

  return (
    <div>
      <div className="page-header flex justify-between items-center">
        <div>
          <h1 className="page-title">Templates</h1>
          <p className="page-subtitle">Save and reuse email templates.</p>
        </div>
        <button className="btn btn-primary" onClick={() => handleOpenModal()}>
          <Plus size={18} /> New Template
        </button>
      </div>

      <div className="card">
        {loading ? (
          <div className="text-center text-muted" style={{ padding: '40px' }}>Loading...</div>
        ) : templates.length === 0 ? (
          <div className="empty-state">
            <FileText className="empty-state-icon" />
            <h3 className="empty-state-title">No templates yet</h3>
            <p className="empty-state-text">Create reusable email templates for your campaigns.</p>
            <button className="btn btn-primary" onClick={() => handleOpenModal()}>
              <Plus size={16} /> Create Template
            </button>
          </div>
        ) : (
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', 
            gap: '16px' 
          }}>
            {templates.map(template => (
              <div key={template.id} className="card" style={{ padding: '16px' }}>
                <div className="flex justify-between items-center mb-2">
                  <h4 style={{ fontWeight: '600' }}>{template.name}</h4>
                  <div className="flex gap-2">
                    <button 
                      className="btn btn-outline btn-icon btn-sm"
                      onClick={() => handleDuplicate(template)}
                      title="Duplicate"
                    >
                      <Copy size={14} />
                    </button>
                    <button 
                      className="btn btn-outline btn-icon btn-sm"
                      onClick={() => handleOpenModal(template)}
                      title="Edit"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button 
                      className="btn btn-outline btn-icon btn-sm"
                      onClick={() => handleDelete(template.id)}
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                <p className="text-sm text-muted" style={{ marginBottom: '8px' }}>
                  {template.subject}
                </p>
                <p className="text-sm text-muted">
                  Created: {new Date(template.createdAt).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editingTemplate ? 'Edit Template' : 'New Template'}
        size="lg"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave}>
              {editingTemplate ? 'Update' : 'Create'} Template
            </button>
          </>
        }
      >
        <div className="form-group">
          <label className="form-label">Template Name *</label>
          <input
            type="text"
            className="form-input"
            placeholder="e.g., Welcome Email"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Subject Line *</label>
          <input
            type="text"
            className="form-input"
            placeholder="Email subject..."
            value={formData.subject}
            onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Content (HTML)</label>
          <textarea
            className="form-textarea"
            style={{ minHeight: '300px', fontFamily: 'monospace', fontSize: '13px' }}
            placeholder="HTML content..."
            value={formData.content}
            onChange={(e) => setFormData({ ...formData, content: e.target.value })}
          />
        </div>
      </Modal>
    </div>
  );
}

function getDefaultContent() {
  return `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Hello {{firstName}}!</h1>
    <p>Your content here...</p>
  </div>
</body>
</html>`;
}

export default Templates;
