import React, { useState, useEffect, useRef } from 'react';
import {
  Plus, Edit2, Trash2, FileText, Copy, Search, Grid, Eye, Send, Download,
  Upload, Tag, LayoutTemplate, Wand2, Code, Loader2
} from 'lucide-react';
import Modal from '../components/Modal';
import { useToast } from '../components/ToastContext';
import { useNavigate } from 'react-router-dom';

// Attempt to import TemplateBuilder -- may not exist yet
let TemplateBuilder = null;
try {
  TemplateBuilder = require('../components/TemplateBuilder').default;
} catch (e) {
  // TemplateBuilder not available yet
}

const CATEGORIES = [
  { id: 'all', label: 'All Templates', icon: Grid },
  { id: 'general', label: 'General', icon: FileText },
  { id: 'newsletter', label: 'Newsletter', icon: LayoutTemplate },
  { id: 'promotional', label: 'Promotional', icon: Tag },
  { id: 'transactional', label: 'Transactional', icon: Send },
  { id: 'welcome', label: 'Welcome', icon: Wand2 },
  { id: 'announcement', label: 'Announcement', icon: FileText }
];

function Templates() {
  const { addToast } = useToast();
  const navigate = useNavigate();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('my-templates');
  const [showModal, setShowModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [previewTemplate, setPreviewTemplate] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  // eslint-disable-next-line no-unused-vars
  const [viewMode, setViewMode] = useState('grid');

  // Template Builder state
  const [builderBlocks, setBuilderBlocks] = useState([]);
  const [builderName, setBuilderName] = useState('');
  const [builderSubject, setBuilderSubject] = useState('');
  const [builderCategory, setBuilderCategory] = useState('general');

  // Import state
  const [importText, setImportText] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    subject: '',
    content: '',
    category: 'general'
  });

  // eslint-disable-next-line no-unused-vars
  const fileInputRef = useRef(null);

  useEffect(() => {
    loadTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const filteredTemplates = templates.filter(t => {
    const matchesSearch = !searchQuery ||
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.subject || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || t.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const handleOpenModal = (template = null) => {
    if (template) {
      setEditingTemplate(template);
      setFormData({
        name: template.name,
        subject: template.subject,
        content: template.content,
        category: template.category || 'general'
      });
    } else {
      setEditingTemplate(null);
      setFormData({ name: '', subject: '', content: getDefaultContent(), category: 'general' });
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
        content: template.content,
        category: template.category || 'general'
      });
      addToast('Template duplicated', 'success');
      loadTemplates();
    } catch (error) {
      addToast('Failed to duplicate template', 'error');
    }
  };

  const handlePreview = (template) => {
    setPreviewTemplate(template);
    setShowPreviewModal(true);
  };

  const handleUseInComposer = (template) => {
    // Navigate to composer with template data
    if (window.electron?.templates?.loadInComposer) {
      window.electron.templates.loadInComposer(template.id);
    }
    navigate('/composer', { state: { templateId: template.id, content: template.content, subject: template.subject } });
  };

  const handleExportTemplate = async (template) => {
    try {
      const exportData = JSON.stringify({
        name: template.name,
        subject: template.subject,
        content: template.content,
        category: template.category || 'general',
        exportedAt: new Date().toISOString()
      }, null, 2);

      if (window.electron?.export?.templateFile) {
        const result = await window.electron.export.templateFile(exportData, template.name);
        if (result.success) {
          addToast('Template exported', 'success');
        }
      } else {
        // Fallback: copy to clipboard
        await navigator.clipboard.writeText(exportData);
        addToast('Template JSON copied to clipboard', 'success');
      }
    } catch (error) {
      addToast('Export failed', 'error');
    }
  };

  const handleImportTemplate = async () => {
    try {
      const parsed = JSON.parse(importText);
      if (!parsed.name || !parsed.content) {
        addToast('Invalid template format: missing name or content', 'error');
        return;
      }
      await window.electron.templates.add({
        name: parsed.name,
        subject: parsed.subject || '',
        content: parsed.content,
        category: parsed.category || 'general'
      });
      addToast('Template imported', 'success');
      setShowImportModal(false);
      setImportText('');
      loadTemplates();
    } catch (error) {
      addToast('Invalid JSON format', 'error');
    }
  };

  const handleImportFile = async () => {
    try {
      if (window.electron?.templates?.importFile) {
        const result = await window.electron.templates.importFile();
        if (result.success) {
          addToast('Template imported from file', 'success');
          loadTemplates();
        } else if (result.error) {
          addToast(result.error, 'error');
        }
      } else {
        setShowImportModal(true);
      }
    } catch (error) {
      addToast('Import failed', 'error');
    }
  };

  // Template Builder handlers
  const handleGenerateHtml = async (html) => {
    if (!builderName) {
      addToast('Please enter a template name', 'error');
      return;
    }
    try {
      await window.electron.templates.add({
        name: builderName,
        subject: builderSubject,
        content: html,
        category: builderCategory
      });
      addToast('Template saved from builder', 'success');
      setBuilderBlocks([]);
      setBuilderName('');
      setBuilderSubject('');
      setActiveTab('my-templates');
      loadTemplates();
    } catch (error) {
      addToast('Failed to save template', 'error');
    }
  };

  const getCategoryColor = (cat) => {
    const colors = {
      general: '#6366f1',
      newsletter: '#3b82f6',
      promotional: '#f59e0b',
      transactional: '#10b981',
      welcome: '#8b5cf6',
      announcement: '#ef4444'
    };
    return colors[cat] || '#6b7280';
  };

  const getPreviewSnippet = (content) => {
    if (!content) return '';
    const text = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    return text.length > 120 ? text.substring(0, 120) + '...' : text;
  };

  return (
    <div>
      <div className="page-header flex justify-between items-center">
        <div>
          <h1 className="page-title">Templates</h1>
          <p className="page-subtitle">Create, manage, and organize your email templates.</p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-outline" onClick={handleImportFile}>
            <Download size={16} /> Import
          </button>
          <button className="btn btn-primary" onClick={() => handleOpenModal()}>
            <Plus size={18} /> New Template
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs mb-4">
        <button
          className={`tab ${activeTab === 'my-templates' ? 'active' : ''}`}
          onClick={() => setActiveTab('my-templates')}
        >
          <Grid size={16} /> My Templates
        </button>
        <button
          className={`tab ${activeTab === 'builder' ? 'active' : ''}`}
          onClick={() => setActiveTab('builder')}
        >
          <LayoutTemplate size={16} /> Template Builder
        </button>
      </div>

      {/* My Templates Tab */}
      {activeTab === 'my-templates' && (
        <div>
          {/* Filter Bar */}
          <div className="card mb-4">
            <div className="flex gap-3 items-center flex-wrap">
              <div className="toolbar-search">
                <Search size={18} />
                <input
                  type="text"
                  className="form-input"
                  placeholder="Search templates..."
                  style={{ paddingLeft: '40px' }}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              {/* Category pills */}
              <div className="flex gap-2 flex-wrap" style={{ flex: 1 }}>
                {CATEGORIES.map(cat => (
                  <button
                    key={cat.id}
                    className={`btn btn-sm ${selectedCategory === cat.id ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => setSelectedCategory(cat.id)}
                    style={{ fontSize: '12px', padding: '4px 10px' }}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Templates Grid */}
          <div className="card">
            {loading ? (
              <div className="text-center text-muted" style={{ padding: '40px' }}>
                <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', marginBottom: '8px' }} />
                <p>Loading templates...</p>
              </div>
            ) : filteredTemplates.length === 0 ? (
              <div className="empty-state">
                <FileText className="empty-state-icon" />
                <h3 className="empty-state-title">
                  {templates.length === 0 ? 'No templates yet' : 'No templates match your search'}
                </h3>
                <p className="empty-state-text">
                  {templates.length === 0
                    ? 'Create reusable email templates for your campaigns.'
                    : 'Try a different search or category.'}
                </p>
                {templates.length === 0 && (
                  <div className="flex gap-2">
                    <button className="btn btn-primary" onClick={() => handleOpenModal()}>
                      <Plus size={16} /> Create Template
                    </button>
                    <button className="btn btn-outline" onClick={() => setActiveTab('builder')}>
                      <LayoutTemplate size={16} /> Use Builder
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                gap: '16px'
              }}>
                {filteredTemplates.map(template => (
                  <div
                    key={template.id}
                    className="card"
                    style={{
                      padding: '0',
                      overflow: 'hidden',
                      border: '1px solid var(--border)',
                      transition: 'transform 0.15s, box-shadow 0.15s'
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.12)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}
                  >
                    {/* Preview thumbnail */}
                    <div
                      style={{
                        height: '120px',
                        background: '#fff',
                        borderBottom: '1px solid var(--border)',
                        overflow: 'hidden',
                        position: 'relative',
                        cursor: 'pointer'
                      }}
                      onClick={() => handlePreview(template)}
                    >
                      <iframe
                        srcDoc={`<!DOCTYPE html><html><head><style>body{font-family:Arial,sans-serif;padding:8px;margin:0;color:#333;font-size:10px;transform:scale(0.6);transform-origin:top left;width:166%;pointer-events:none;}</style></head><body>${template.content || '<p style="color:#999;text-align:center;padding:20px;">No content</p>'}</body></html>`}
                        style={{ width: '100%', height: '100%', border: 'none', pointerEvents: 'none' }}
                        title={`Preview: ${template.name}`}
                        tabIndex={-1}
                      />
                      <div style={{
                        position: 'absolute',
                        inset: 0,
                        background: 'transparent',
                        cursor: 'pointer'
                      }} />
                      <div style={{
                        position: 'absolute',
                        top: '8px',
                        left: '8px',
                        display: 'flex',
                        gap: '4px'
                      }}>
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontSize: '10px',
                          fontWeight: 600,
                          background: getCategoryColor(template.category) + '20',
                          color: getCategoryColor(template.category),
                          border: `1px solid ${getCategoryColor(template.category)}40`
                        }}>
                          {template.category || 'general'}
                        </span>
                      </div>
                    </div>

                    {/* Card body */}
                    <div style={{ padding: '14px 16px' }}>
                      <div className="flex justify-between items-start mb-2">
                        <h4 style={{ fontWeight: 600, fontSize: '14px', margin: 0, lineHeight: 1.3 }}>
                          {template.name}
                        </h4>
                      </div>
                      <p className="text-sm text-muted" style={{ margin: '4px 0 8px', lineHeight: 1.4 }}>
                        {template.subject || 'No subject'}
                      </p>
                      <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '0 0 12px', lineHeight: 1.4 }}>
                        {getPreviewSnippet(template.content)}
                      </p>

                      {/* Actions */}
                      <div style={{
                        display: 'flex',
                        gap: '6px',
                        borderTop: '1px solid var(--border)',
                        paddingTop: '10px',
                        flexWrap: 'wrap'
                      }}>
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => handleUseInComposer(template)}
                          style={{ fontSize: '11px', flex: 1 }}
                        >
                          <Send size={12} /> Use
                        </button>
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={() => handlePreview(template)}
                          title="Preview"
                          style={{ fontSize: '11px' }}
                        >
                          <Eye size={12} />
                        </button>
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={() => handleOpenModal(template)}
                          title="Edit"
                          style={{ fontSize: '11px' }}
                        >
                          <Edit2 size={12} />
                        </button>
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={() => handleDuplicate(template)}
                          title="Duplicate"
                          style={{ fontSize: '11px' }}
                        >
                          <Copy size={12} />
                        </button>
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={() => handleExportTemplate(template)}
                          title="Export"
                          style={{ fontSize: '11px' }}
                        >
                          <Upload size={12} />
                        </button>
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={() => handleDelete(template.id)}
                          title="Delete"
                          style={{ fontSize: '11px', color: 'var(--error)' }}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>

                      <div className="text-xs text-muted" style={{ marginTop: '8px' }}>
                        {template.updatedAt
                          ? `Updated ${new Date(template.updatedAt).toLocaleDateString()}`
                          : `Created ${new Date(template.createdAt).toLocaleDateString()}`}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Template count */}
            {filteredTemplates.length > 0 && (
              <div className="text-sm text-muted mt-4" style={{ textAlign: 'center' }}>
                Showing {filteredTemplates.length} of {templates.length} templates
              </div>
            )}
          </div>
        </div>
      )}

      {/* Template Builder Tab */}
      {activeTab === 'builder' && (
        <div>
          {/* Builder header with save controls */}
          <div className="card mb-4">
            <div className="flex gap-3 items-end flex-wrap">
              <div className="form-group" style={{ flex: 1, minWidth: '200px', margin: 0 }}>
                <label className="form-label">Template Name *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="My Email Template"
                  value={builderName}
                  onChange={(e) => setBuilderName(e.target.value)}
                />
              </div>
              <div className="form-group" style={{ flex: 1, minWidth: '200px', margin: 0 }}>
                <label className="form-label">Subject Line</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Email subject..."
                  value={builderSubject}
                  onChange={(e) => setBuilderSubject(e.target.value)}
                />
              </div>
              <div className="form-group" style={{ width: '160px', margin: 0 }}>
                <label className="form-label">Category</label>
                <select
                  className="form-select"
                  value={builderCategory}
                  onChange={(e) => setBuilderCategory(e.target.value)}
                >
                  {CATEGORIES.filter(c => c.id !== 'all').map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Template Builder Component */}
          {TemplateBuilder ? (
            <TemplateBuilder
              blocks={builderBlocks}
              onBlocksChange={setBuilderBlocks}
              onGenerateHtml={handleGenerateHtml}
            />
          ) : (
            <div className="card">
              <div className="empty-state">
                <LayoutTemplate className="empty-state-icon" />
                <h3 className="empty-state-title">Template Builder</h3>
                <p className="empty-state-text">
                  The drag-and-drop template builder lets you visually create email templates with blocks.
                  Add headings, text, images, buttons, dividers, and more.
                </p>
                <p className="text-sm text-muted" style={{ maxWidth: '500px' }}>
                  The builder component is being set up. In the meantime, you can create templates using the HTML editor.
                </p>
                <button className="btn btn-primary mt-4" onClick={() => handleOpenModal()}>
                  <Code size={16} /> Create with HTML Editor
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create/Edit Template Modal */}
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
        <div className="form-row">
          <div className="form-group" style={{ flex: 2 }}>
            <label className="form-label">Template Name *</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g., Welcome Email"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label className="form-label">Category</label>
            <select
              className="form-select"
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
            >
              {CATEGORIES.filter(c => c.id !== 'all').map(cat => (
                <option key={cat.id} value={cat.id}>{cat.label}</option>
              ))}
            </select>
          </div>
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
          <div className="flex justify-between items-center mb-1">
            <label className="form-label" style={{ margin: 0 }}>Content (HTML)</label>
            <span className="text-xs text-muted">
              Variables: {'{{firstName}}'}, {'{{lastName}}'}, {'{{email}}'}, {'{{company}}'}, {'{{unsubscribeLink}}'}
            </span>
          </div>
          <textarea
            className="form-textarea"
            style={{ minHeight: '300px', fontFamily: 'monospace', fontSize: '13px' }}
            placeholder="HTML content..."
            value={formData.content}
            onChange={(e) => setFormData({ ...formData, content: e.target.value })}
          />
        </div>
      </Modal>

      {/* Preview Modal */}
      <Modal
        isOpen={showPreviewModal}
        onClose={() => { setShowPreviewModal(false); setPreviewTemplate(null); }}
        title={previewTemplate ? `Preview: ${previewTemplate.name}` : 'Preview'}
        size="xl"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => { setShowPreviewModal(false); setPreviewTemplate(null); }}>Close</button>
            {previewTemplate && (
              <button className="btn btn-primary" onClick={() => { setShowPreviewModal(false); handleUseInComposer(previewTemplate); }}>
                <Send size={14} /> Use in Composer
              </button>
            )}
          </>
        }
      >
        {previewTemplate && (
          <div>
            {/* Subject */}
            <div style={{
              padding: '10px 14px',
              background: 'var(--bg-tertiary)',
              borderRadius: '6px',
              marginBottom: '16px',
              borderLeft: '3px solid var(--accent)'
            }}>
              <span className="text-sm text-muted">Subject: </span>
              <strong>{previewTemplate.subject || 'No subject'}</strong>
            </div>

            {/* Rendered preview */}
            <div style={{
              border: '1px solid var(--border)',
              borderRadius: '8px',
              overflow: 'hidden',
              background: '#fff'
            }}>
              <iframe
                srcDoc={`<!DOCTYPE html><html><head><style>body{font-family:Arial,sans-serif;padding:20px;margin:0;color:#333;line-height:1.6;}img{max-width:100%;}</style></head><body>${previewTemplate.content || ''}</body></html>`}
                style={{ width: '100%', height: '500px', border: 'none' }}
                title="Template Preview"
              />
            </div>
          </div>
        )}
      </Modal>

      {/* Import Template Modal */}
      <Modal
        isOpen={showImportModal}
        onClose={() => { setShowImportModal(false); setImportText(''); }}
        title="Import Template"
        size="lg"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => { setShowImportModal(false); setImportText(''); }}>Cancel</button>
            <button className="btn btn-primary" onClick={handleImportTemplate}>
              <Download size={14} /> Import
            </button>
          </>
        }
      >
        <p className="text-muted mb-4">
          Paste exported template JSON below to import it.
        </p>
        <div className="form-group">
          <label className="form-label">Template JSON</label>
          <textarea
            className="form-textarea"
            style={{ minHeight: '250px', fontFamily: 'monospace', fontSize: '12px' }}
            placeholder='{"name": "My Template", "subject": "Hello", "content": "<p>...</p>", "category": "general"}'
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
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
