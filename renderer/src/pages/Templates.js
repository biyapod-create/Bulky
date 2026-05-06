import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Plus, Edit2, Trash2, FileText, Copy, Search, Grid, Eye, Send, Download,
  Upload, Tag, LayoutTemplate, Wand2, Code, Loader2
} from 'lucide-react';
import Modal from '../components/Modal';
import { useToast } from '../components/ToastContext';
import { useNavigation } from '../components/NavigationContext';

import TemplateBuilder, { createBlock, generateFullHtml } from '../components/TemplateBuilder';
import { buildEmailPreviewDocument } from '../utils/emailPreview';
const { analyzeMergeTags, applyPreviewPersonalization } = require('../utils/contentReadiness');

const CATEGORIES = [
  { id: 'all', label: 'All Templates', icon: Grid },
  { id: 'general', label: 'General', icon: FileText },
  { id: 'newsletter', label: 'Newsletter', icon: LayoutTemplate },
  { id: 'promotional', label: 'Promotional', icon: Tag },
  { id: 'transactional', label: 'Transactional', icon: Send },
  { id: 'welcome', label: 'Welcome', icon: Wand2 },
  { id: 'announcement', label: 'Announcement', icon: FileText }
];

const HTML_STARTERS = {
  newsletter: `<section style="font-family:Arial,sans-serif;padding:32px;background:#ffffff;color:#1f2937;">
  <p style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#0891b2;margin:0 0 14px;">Monthly Update</p>
  <h1 style="font-size:30px;line-height:1.2;margin:0 0 16px;">What’s new at {{company}}</h1>
  <p style="font-size:16px;line-height:1.7;margin:0 0 16px;">Hi {{firstName}}, here’s a clean roundup of what shipped this month, what customers are loving, and what to look out for next.</p>
  <ul style="padding-left:20px;line-height:1.8;margin:0 0 20px;">
    <li>One major product update with a clear benefit</li>
    <li>One customer story or proof point</li>
    <li>One next step readers can take today</li>
  </ul>
  <a href="#" style="display:inline-block;background:#0891b2;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:bold;">Read the full update</a>
</section>`,
  promo: `<section style="font-family:Arial,sans-serif;padding:36px;background:linear-gradient(135deg,#eff6ff,#ffffff);color:#111827;">
  <p style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#2563eb;margin:0 0 14px;">Limited-time offer</p>
  <h1 style="font-size:32px;line-height:1.15;margin:0 0 16px;">A focused offer for your best-fit customers</h1>
  <p style="font-size:16px;line-height:1.7;margin:0 0 18px;">Use this section to explain the value, urgency, and exact outcome the reader should expect when they click through.</p>
  <div style="padding:16px 18px;border:1px solid #bfdbfe;border-radius:12px;background:#ffffff;margin:0 0 18px;">
    <strong style="display:block;margin-bottom:8px;">Offer highlight</strong>
    <span style="font-size:15px;line-height:1.6;">20% off your first month, early access, free audit, or another concrete hook.</span>
  </div>
  <a href="#" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:13px 22px;border-radius:999px;font-weight:bold;">Claim this offer</a>
</section>`,
  note: `<section style="font-family:Arial,sans-serif;padding:28px;background:#ffffff;color:#1f2937;">
  <p style="margin:0 0 14px;">Hi {{firstName}},</p>
  <p style="margin:0 0 14px;line-height:1.7;">I wanted to send you a quick note about something relevant to your team. Keep this format conversational, useful, and easy to skim.</p>
  <p style="margin:0 0 14px;line-height:1.7;">Use the second paragraph to add context, social proof, or a concise recommendation.</p>
  <p style="margin:0 0 18px;line-height:1.7;">If it makes sense, reply directly or use the link below.</p>
  <a href="#" style="display:inline-block;color:#0891b2;font-weight:bold;text-decoration:none;">Open the next step</a>
</section>`
};

const HTML_AI_PRESETS = [
  {
    label: 'Welcome',
    prompt: 'Create a polished welcome email for new subscribers with a premium hero, a short benefits section, and one clear CTA.',
    objective: 'Introduce the brand and drive a first click',
    cta: 'Explore the welcome offer',
    tone: 'warm',
    format: 'welcome'
  },
  {
    label: 'Promo',
    prompt: 'Create a conversion-focused promotional email with a stylish hero image, clear offer framing, and one strong CTA.',
    objective: 'Drive clicks and purchases',
    cta: 'Claim the offer',
    tone: 'confident',
    format: 'promotional'
  },
  {
    label: 'Newsletter',
    prompt: 'Create a modern newsletter email with a strong headline, three concise updates, and one main CTA.',
    objective: 'Keep subscribers engaged',
    cta: 'Read the full update',
    tone: 'professional',
    format: 'newsletter'
  }
];

function createBuilderSeedBlocks(content, subject = '') {
  const blocks = [];
  if (subject) {
    const header = createBlock('header');
    header.data.text = subject;
    blocks.push(header);
  }

  const safeContent = content || '<p>Start writing your email here...</p>';
  const fallbackTextBlock = () => {
    const text = createBlock('text');
    text.data.content = safeContent;
    blocks.push(text);
  };

  if (typeof DOMParser !== 'undefined' && content) {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(content, 'text/html');
      const body = doc.body;

      const firstHeading = body.querySelector('h1, h2, h3');
      if (firstHeading && !subject) {
        const header = createBlock('header');
        header.data.text = firstHeading.textContent?.trim() || header.data.text;
        blocks.push(header);
      }

      const images = Array.from(body.querySelectorAll('img')).slice(0, 2);
      images.forEach((img) => {
        const image = createBlock('image');
        image.data.src = img.getAttribute('src') || '';
        image.data.alt = img.getAttribute('alt') || 'Image';
        blocks.push(image);
      });

      const textSections = [];
      Array.from(body.querySelectorAll('p, ul, ol, blockquote, h2, h3')).forEach((node) => {
        const html = node.outerHTML?.trim();
        const text = node.textContent?.replace(/\s+/g, ' ').trim();
        if (html && text) {
          textSections.push(html);
        }
      });

      const chunkedSections = [];
      let currentChunk = '';
      textSections.forEach((section) => {
        const nextChunk = currentChunk ? `${currentChunk}${section}` : section;
        const textOnly = nextChunk.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        if (textOnly.length > 420 && currentChunk) {
          chunkedSections.push(currentChunk);
          currentChunk = section;
        } else {
          currentChunk = nextChunk;
        }
      });
      if (currentChunk) {
        chunkedSections.push(currentChunk);
      }

      chunkedSections.slice(0, 3).forEach((sectionHtml) => {
        const text = createBlock('text');
        text.data.content = sectionHtml;
        blocks.push(text);
      });

      const firstCta = body.querySelector('a[href]');
      if (firstCta) {
        const button = createBlock('button');
        button.data.text = firstCta.textContent?.trim() || 'Learn more';
        button.data.url = firstCta.getAttribute('href') || '#';
        blocks.push(button);
      }

      const hadDivider = !!body.querySelector('hr');
      if (hadDivider) {
        const divider = createBlock('divider');
        blocks.push(divider);
      }
    } catch (error) {
      fallbackTextBlock();
    }
  }

  if (blocks.length === (subject ? 1 : 0)) {
    fallbackTextBlock();
  }

  const footer = createBlock('footer');
  blocks.push(footer);
  return blocks;
}

function createBuilderLayout(layout) {
  if (layout === 'promo') {
    const header = createBlock('header');
    header.data.text = 'A focused offer your audience can act on';
    header.data.backgroundColor = '#eff6ff';
    header.data.color = '#1d4ed8';

    const text = createBlock('text');
    text.data.content = '<p>Lead with one clear benefit, support it with one short proof point, and keep the copy tight enough to scan in seconds.</p>';

    const button = createBlock('button');
    button.data.text = 'Claim the offer';
    button.data.backgroundColor = '#2563eb';

    const footer = createBlock('footer');
    return [header, text, button, footer];
  }

  if (layout === 'digest') {
    const header = createBlock('header');
    header.data.text = 'This week at {{company}}';
    header.data.backgroundColor = '#f8fafc';
    header.data.color = '#0f172a';

    const intro = createBlock('text');
    intro.data.content = '<p>Open with a concise note that frames the update and tells readers why these highlights matter right now.</p>';

    const columns = createBlock('columns');
    columns.data.count = 2;
    columns.data.contents = [
      '<strong>Update one</strong><br/>Share the most useful thing that changed.',
      '<strong>Update two</strong><br/>Use the second column for proof, launches, or customer wins.'
    ];

    const button = createBlock('button');
    button.data.text = 'Read the full update';

    const footer = createBlock('footer');
    return [header, intro, columns, button, footer];
  }

  const header = createBlock('header');
  header.data.text = 'Welcome to {{company}}';
  header.data.backgroundColor = '#f0fdf4';
  header.data.color = '#166534';

  const text = createBlock('text');
  text.data.content = '<p>Welcome new readers with a warm introduction, set expectations clearly, and point them to the best first step.</p>';

  const button = createBlock('button');
  button.data.text = 'Explore what comes next';
  button.data.backgroundColor = '#16a34a';

  const footer = createBlock('footer');
  return [header, text, button, footer];
}

function Templates({ isActive }) {
  const { addToast } = useToast();
  const { navigateTo, pageParams } = useNavigation();
  const navigate = (path, opts) => navigateTo(path, opts?.state || {});
  const handlePreviewIframeLoad = (event) => {
    try {
      const iframe = event.target;
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!doc) return;
      iframe.style.height = `${Math.max(
        doc.documentElement?.scrollHeight || 0,
        doc.body?.scrollHeight || 0,
        320
      )}px`;
    } catch {
      event.target.style.height = '320px';
    }
  };
  const templateParams = useMemo(() => pageParams['/templates'] || {}, [pageParams]);
  const openBuilder = templateParams.openBuilder;
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
  const [htmlAiBrief, setHtmlAiBrief] = useState({
    prompt: '',
    tone: 'professional',
    objective: '',
    audience: '',
    cta: '',
    offer: '',
    brandVoice: ''
  });
  // null = creating new template; an id = editing existing one in the builder
  const [editingBuilderTemplateId, setEditingBuilderTemplateId] = useState(null);
  const [htmlAiLoading, setHtmlAiLoading] = useState(false);

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

  // Refresh when becoming the active tab
  useEffect(() => {
    if (isActive) loadTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  // React to template mutations from other parts of the app (e.g. Composer saving a template)
  useEffect(() => {
    if (!window.electron?.onDataChanged) return;
    const unsub = window.electron.onDataChanged((data) => {
      if (data.type === 'templates') loadTemplates();
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When navigated from Composer with openBuilder flag, switch to builder tab
  useEffect(() => {
    if (openBuilder) {
      setActiveTab('builder');
    }
  }, [openBuilder]);

  useEffect(() => {
    if (!openBuilder) return;

    if (templateParams.aiBrief) {
      setHtmlAiBrief(prev => ({
        ...prev,
        ...templateParams.aiBrief
      }));
    }

    if (templateParams.content) {
      setBuilderBlocks(prev => (prev.length > 0 ? prev : createBuilderSeedBlocks(templateParams.content, templateParams.subject || '')));
      if (templateParams.subject) {
        setBuilderSubject(prev => prev || templateParams.subject);
      }
      setBuilderName(prev => prev || 'Composer Draft');
    }
  }, [openBuilder, templateParams]);

  const loadTemplates = async () => {
    try {
      if (window.electron) {
        const data = await window.electron.templates.getAll();
        setTemplates(Array.isArray(data) ? data : []);
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
      // If the template was built with the drag-and-drop builder (has blocks),
      // route straight to the builder so the user can re-edit visually.
      let hasBlocks = false;
      try {
        const parsed = template.blocks ? JSON.parse(template.blocks) : [];
        hasBlocks = Array.isArray(parsed) && parsed.length > 0;
      } catch (e) {}
      if (hasBlocks) {
        handleEditInBuilder(template);
        return;
      }
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
    const mergeTagAnalysis = analyzeMergeTags({ subject: formData.subject, content: formData.content });
    if (mergeTagAnalysis.unsupported.length > 0) {
      addToast(`Unsupported merge tags: ${mergeTagAnalysis.unsupported.join(', ')}`, 'error');
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
    navigate('/composer', { state: { templateId: template.id, content: template.content, subject: template.subject } });
  };

  const handleAiGenerateHtmlTemplate = async () => {
    const prompt = htmlAiBrief.prompt.trim() || formData.subject.trim() || formData.name.trim();
    if (!prompt) {
      addToast('Add a real AI brief, template name, or subject first', 'warning');
      return;
    }

    setHtmlAiLoading(true);
    try {
      const result = await window.electron.ai.generateContent({
        prompt,
        tone: htmlAiBrief.tone || 'professional',
        objective: htmlAiBrief.objective,
        audience: htmlAiBrief.audience,
        cta: htmlAiBrief.cta,
        offer: htmlAiBrief.offer,
        brandVoice: htmlAiBrief.brandVoice,
        format: `responsive-${formData.category || 'general'}-html-template`,
        includePersonalization: true
      });

      if (result?.error) {
        addToast(result.error, 'error');
        return;
      }

      setFormData((prev) => ({
        ...prev,
        subject: result?.subject || prev.subject,
        content: result?.html || prev.content
      }));
      addToast('AI created a responsive HTML template draft', 'success');
    } catch (error) {
      addToast('Failed to generate HTML template', 'error');
    } finally {
      setHtmlAiLoading(false);
    }
  };

  const applyBuilderLayout = (layout, config = {}) => {
    setBuilderBlocks(createBuilderLayout(layout));
    if (config.subject) {
      setBuilderSubject(prev => prev || config.subject);
    }
    if (config.category) {
      setBuilderCategory(config.category);
    }
    if (config.name) {
      setBuilderName(prev => prev || config.name);
    }
    addToast('Builder starter layout applied', 'success');
  };

  const handleOpenHtmlInBuilder = () => {
    setBuilderName(formData.name || 'HTML Draft');
    setBuilderSubject(formData.subject || '');
    setBuilderCategory(formData.category || 'general');
    setBuilderBlocks(createBuilderSeedBlocks(formData.content, formData.subject || ''));
    setEditingBuilderTemplateId(null);
    setShowModal(false);
    setActiveTab('builder');
    addToast('HTML draft moved into the builder', 'success');
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

      let result = null;
      if (window.electron?.templates?.exportTemplate) {
        result = await window.electron.templates.exportTemplate(template, template.name);
      } else if (window.electron?.export?.templateFile) {
        result = await window.electron.export.templateFile(exportData, template.name);
      }

      if (result?.success) {
        addToast('Template exported to: ' + result.filePath, 'success');
      } else {
        // Fallback: copy to clipboard
        await navigator.clipboard.writeText(exportData);
        addToast('Template JSON copied to clipboard', 'success');
      }
    } catch (error) {
      addToast('Export failed: ' + error.message, 'error');
    }
  };

  const handleImportTemplate = async () => {
    try {
      const parsed = JSON.parse(importText);
      if (!parsed.name || !parsed.content) {
        addToast('Invalid template format: missing name or content', 'error');
        return;
      }
      const mergeTagAnalysis = analyzeMergeTags({ subject: parsed.subject || '', content: parsed.content || '' });
      if (mergeTagAnalysis.unsupported.length > 0) {
        addToast(`Unsupported merge tags: ${mergeTagAnalysis.unsupported.join(', ')}`, 'error');
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
        } else {
          addToast('Import cancelled', 'info');
        }
      } else {
        setShowImportModal(true);
      }
    } catch (error) {
      addToast('Import failed: ' + error.message, 'error');
    }
  };

  // Template Builder handlers
  const saveBuilderTemplate = async () => {
    if (!builderName) {
      addToast('Please enter a template name', 'error');
      return;
    }
    if (!builderBlocks || builderBlocks.length === 0) {
      addToast('Please add at least one block to the template', 'error');
      return;
    }
    try {
      const renderedContent = generateFullHtml(builderBlocks);
      const mergeTagAnalysis = analyzeMergeTags({ subject: builderSubject, content: renderedContent });
      if (mergeTagAnalysis.unsupported.length > 0) {
        addToast(`Unsupported merge tags: ${mergeTagAnalysis.unsupported.join(', ')}`, 'error');
        return;
      }
      const payload = {
        name: builderName,
        subject: builderSubject,
        content: renderedContent,
        category: builderCategory,
        blocks: JSON.stringify(builderBlocks)
      };
      if (editingBuilderTemplateId) {
        await window.electron.templates.update({ ...payload, id: editingBuilderTemplateId });
        addToast('Template updated', 'success');
      } else {
        await window.electron.templates.add(payload);
        addToast('Template saved from builder', 'success');
      }
      setBuilderBlocks([]);
      setBuilderName('');
      setBuilderSubject('');
      setEditingBuilderTemplateId(null);
      setActiveTab('my-templates');
      loadTemplates();
    } catch (error) {
      addToast('Failed to save template: ' + error.message, 'error');
    }
  };

  // Load a saved template into the drag-and-drop builder for editing
  const handleEditInBuilder = async (template) => {
    try {
      // Fetch stored block data (only present for builder-created templates)
      let blocks = [];
      if (window.electron?.templates?.getWithBlocks) {
        const result = await window.electron.templates.getWithBlocks(template.id);
        if (result?.blocks) {
          try { blocks = JSON.parse(result.blocks); } catch (e) { blocks = []; }
        }
      }
      setBuilderName(template.name || '');
      setBuilderSubject(template.subject || '');
      setBuilderCategory(template.category || 'general');
      setBuilderBlocks(Array.isArray(blocks) ? blocks : []);
      setEditingBuilderTemplateId(template.id);
      setActiveTab('builder');
      if (blocks.length === 0) {
        addToast('No builder blocks found — starting with an empty canvas. The original HTML is preserved unless you save.', 'info');
      } else {
        addToast(`Loaded ${blocks.length} block${blocks.length !== 1 ? 's' : ''} from "${template.name}"`, 'success');
      }
    } catch (err) {
      addToast('Failed to load template into builder', 'error');
    }
  };

  const getCategoryColor = (cat) => {
    const colors = {
      general: '#5bb4d4',
      newsletter: '#5bb4d4',
      promotional: '#5bb4d4',
      transactional: '#5bb4d4',
      welcome: '#5bb4d4',
      announcement: '#5bb4d4'
    };
    return colors[cat] || '#6b7280';
  };

  const getPreviewSnippet = (content) => {
    if (!content) return '';
    const text = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    return text.length > 120 ? text.substring(0, 120) + '...' : text;
  };

  return (
    <div className="page-container page-templates">
      <div className="page-header bulky-page-header">
        <div>
          <h1 className="page-title">Templates</h1>
          <p className="page-subtitle">Create, manage, and organize your email templates.</p>
        </div>
        <div className="page-header-actions">
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
          <div className="card filter-toolbar-card mb-4">
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
          <div className="card dense-data-card">
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
              <div className="template-gallery-grid">
                {filteredTemplates.map(template => (
                  <div
                    key={template.id}
                    className="card template-gallery-card"
                  >
                    {/* Preview thumbnail */}
                    <div
                      className="template-gallery-preview"
                      onClick={() => handlePreview(template)}
                    >
                      <iframe
                        srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><style>*{box-sizing:border-box;}html,body{margin:0;padding:0;width:100%;background:#fff;overflow:hidden;}</style></head><body><div style="transform:scale(0.47);transform-origin:top left;width:213%;pointer-events:none;overflow:hidden;">${template.content || '<p style="color:#999;text-align:center;padding:40px;font-family:Arial">No content</p>'}</div></body></html>`}
                        style={{ width: '100%', height: '100%', border: 'none', pointerEvents: 'none', display: 'block' }}
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
                    <div className="template-gallery-body">
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
                          title="Edit HTML"
                          style={{ fontSize: '11px' }}
                        >
                          <Edit2 size={12} />
                        </button>
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={() => handleEditInBuilder(template)}
                          title="Edit in Builder"
                          style={{ fontSize: '11px' }}
                        >
                          <LayoutTemplate size={12} />
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
        <div className="template-builder-shell">
          {/* Builder header with save controls */}
          <div className="card mb-4">
            {editingBuilderTemplateId && (
              <div style={{ marginBottom: '12px', padding: '8px 12px', background: 'rgba(91,180,212,0.1)', borderRadius: '6px', border: '1px solid rgba(91,180,212,0.3)', fontSize: '13px', color: 'var(--accent)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>✏️ Editing existing template in builder</span>
                <button className="btn btn-outline btn-sm" style={{ fontSize: '11px' }} onClick={() => { setEditingBuilderTemplateId(null); setBuilderBlocks([]); setBuilderName(''); setBuilderSubject(''); }}>
                  New Template
                </button>
              </div>
            )}
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

            <div style={{ marginTop: '16px', padding: '16px', borderRadius: '12px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)' }}>
              <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '6px' }}>Manual Builder Workflow</div>
              <div className="text-sm text-muted">
                The drag-and-drop builder is now manual-only. Add blocks, reorder them, and tune spacing visually without AI-generated block structures interfering with the layout.
              </div>
            </div>

            <div style={{ marginTop: '16px', padding: '16px', borderRadius: '12px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)' }}>
              <div className="flex justify-between items-center" style={{ gap: '12px', flexWrap: 'wrap', marginBottom: '10px' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '13px' }}>Starter Layouts</div>
                  <div className="text-sm text-muted">Drop in a proven structure, then refine the content block by block.</div>
                </div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => applyBuilderLayout('welcome', { subject: 'Welcome to our list', category: 'welcome', name: 'Welcome Flow' })}
                  >
                    Welcome Layout
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => applyBuilderLayout('promo', { subject: 'A timely offer for your audience', category: 'promotional', name: 'Promo Flow' })}
                  >
                    Promo Layout
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => applyBuilderLayout('digest', { subject: 'Your weekly digest', category: 'newsletter', name: 'Digest Flow' })}
                  >
                    Digest Layout
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Template Builder Component */}
          {TemplateBuilder ? (
            <div>
              <TemplateBuilder
                blocks={builderBlocks}
                onBlocksChange={setBuilderBlocks}
              />
              <div style={{ marginTop: 16, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <button className="btn btn-primary" onClick={saveBuilderTemplate}>
                  Save Template
                </button>
                <button className="btn btn-outline" onClick={() => { setBuilderBlocks([]); setBuilderName(''); setBuilderSubject(''); }}>
                  Clear
                </button>
              </div>
            </div>
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
            <button className="btn btn-outline" onClick={handleOpenHtmlInBuilder}>
              <LayoutTemplate size={14} /> Open in Builder
            </button>
            <button className="btn btn-outline" onClick={handleAiGenerateHtmlTemplate} disabled={htmlAiLoading}>
              {htmlAiLoading ? <Loader2 size={14} className="spin" /> : <Wand2 size={14} />} AI Create HTML
            </button>
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
          <div
            style={{
              display: 'grid',
              gap: '10px',
              marginBottom: '12px',
              padding: '14px',
              borderRadius: '12px',
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border)'
            }}
          >
            <div className="flex justify-between items-center" style={{ gap: '12px', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '13px' }}>AI HTML Creator</div>
                <div className="text-sm text-muted">Use AI for polished responsive HTML templates. The drag-and-drop builder stays manual.</div>
              </div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {HTML_AI_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => {
                      setFormData((prev) => ({
                        ...prev,
                        category: preset.format || prev.category
                      }));
                      setHtmlAiBrief((prev) => ({
                        ...prev,
                        prompt: preset.prompt,
                        objective: preset.objective,
                        cta: preset.cta,
                        tone: preset.tone
                      }));
                    }}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
            <textarea
              className="form-textarea"
              rows={3}
              placeholder="Describe the template you want, including layout, mood, offer, and any imagery direction."
              value={htmlAiBrief.prompt}
              onChange={(e) => setHtmlAiBrief((prev) => ({ ...prev, prompt: e.target.value }))}
            />
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Tone</label>
                <select
                  className="form-select"
                  value={htmlAiBrief.tone}
                  onChange={(e) => setHtmlAiBrief((prev) => ({ ...prev, tone: e.target.value }))}
                >
                  <option value="professional">Professional</option>
                  <option value="friendly">Friendly</option>
                  <option value="warm">Warm</option>
                  <option value="confident">Confident</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Audience</label>
                <input
                  className="form-input"
                  value={htmlAiBrief.audience}
                  onChange={(e) => setHtmlAiBrief((prev) => ({ ...prev, audience: e.target.value }))}
                  placeholder="New leads, customers, subscribers..."
                />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Objective</label>
                <input
                  className="form-input"
                  value={htmlAiBrief.objective}
                  onChange={(e) => setHtmlAiBrief((prev) => ({ ...prev, objective: e.target.value }))}
                  placeholder="Drive clicks, welcome users, announce a launch..."
                />
              </div>
              <div className="form-group">
                <label className="form-label">CTA</label>
                <input
                  className="form-input"
                  value={htmlAiBrief.cta}
                  onChange={(e) => setHtmlAiBrief((prev) => ({ ...prev, cta: e.target.value }))}
                  placeholder="Book a demo, explore the offer..."
                />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Offer / Hook</label>
                <input
                  className="form-input"
                  value={htmlAiBrief.offer}
                  onChange={(e) => setHtmlAiBrief((prev) => ({ ...prev, offer: e.target.value }))}
                  placeholder="Free audit, seasonal launch, onboarding value..."
                />
              </div>
              <div className="form-group">
                <label className="form-label">Brand Voice</label>
                <input
                  className="form-input"
                  value={htmlAiBrief.brandVoice}
                  onChange={(e) => setHtmlAiBrief((prev) => ({ ...prev, brandVoice: e.target.value }))}
                  placeholder="Elegant, bold, calm, premium..."
                />
              </div>
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              gap: '8px',
              flexWrap: 'wrap',
              marginBottom: '10px',
              padding: '12px',
              borderRadius: '10px',
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border)'
            }}
          >
            <span className="text-sm text-muted" style={{ width: '100%' }}>
              Start faster with a production-friendly HTML starter:
            </span>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => setFormData(prev => ({
                ...prev,
                category: prev.category === 'general' ? 'newsletter' : prev.category,
                content: HTML_STARTERS.newsletter
              }))}
            >
              Newsletter Starter
            </button>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => setFormData(prev => ({
                ...prev,
                category: prev.category === 'general' ? 'promotional' : prev.category,
                content: HTML_STARTERS.promo
              }))}
            >
              Promo Starter
            </button>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => setFormData(prev => ({ ...prev, content: HTML_STARTERS.note }))}
            >
              Plain Note Starter
            </button>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => setFormData(prev => ({
                ...prev,
                content: getDefaultContent()
              }))}
            >
              Reset Default
            </button>
          </div>
          <textarea
            className="form-textarea"
            style={{ minHeight: '300px', fontFamily: 'monospace', fontSize: '13px' }}
            placeholder="HTML content..."
            value={formData.content}
            onChange={(e) => setFormData({ ...formData, content: e.target.value })}
          />
          <div style={{ marginTop: '12px' }}>
            <div className="text-sm text-muted" style={{ marginBottom: '8px' }}>
              Live preview
            </div>
            <div style={{ border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden', background: '#ffffff' }}>
              <iframe
                key={`${formData.subject}-${formData.content.length}`}
                srcDoc={buildEmailPreviewDocument({
                  subject: formData.subject || '(No Subject)',
                  content: applyPreviewPersonalization(formData.content || getDefaultContent()),
                  clientLabel: 'HTML Preview',
                  clientStyle: { fontFamily: 'Arial, sans-serif', background: '#f8fafc', accent: '#2563eb' }
                })}
                onLoad={handlePreviewIframeLoad}
                style={{ width: '100%', minHeight: '320px', height: '320px', border: 'none', display: 'block' }}
                title="HTML Template Preview"
                sandbox="allow-same-origin"
              />
            </div>
          </div>
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

            {/* Rendered preview -- uses buildEmailPreviewDocument so that full HTML
                pastes (with <html><head><style>...) render correctly. Styles defined
                inside <style> blocks in the head are extracted and re-injected, so
                they actually apply instead of being stripped by dangerouslySetInnerHTML. */}
            <div style={{
              border: '1px solid var(--border)',
              borderRadius: '8px',
              overflow: 'hidden',
              background: '#fff'
            }}>
              <iframe
                key={previewTemplate.id}
                srcDoc={buildEmailPreviewDocument({
                  subject: previewTemplate.subject,
                  content: applyPreviewPersonalization(previewTemplate.content),
                  clientLabel: 'Preview',
                  clientStyle: { fontFamily: 'Arial, sans-serif', background: '#ffffff', accent: '#1a73e8' }
                })}
                onLoad={handlePreviewIframeLoad}
                style={{ width: '100%', minHeight: '420px', height: '420px', border: 'none', display: 'block' }}
                title="Template Preview"
                sandbox="allow-same-origin"
              />
            </div>

            {/* Template details strip */}
            <div style={{ marginTop: '12px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
              {[
                { label: 'Category', value: previewTemplate.category || 'general' },
                { label: 'Subject', value: previewTemplate.subject || '—' },
                { label: 'Created', value: previewTemplate.createdAt ? new Date(previewTemplate.createdAt).toLocaleDateString() : '—' },
                { label: 'Updated', value: previewTemplate.updatedAt ? new Date(previewTemplate.updatedAt).toLocaleDateString() : '—' },
              ].map(({ label, value }) => (
                <div key={label} style={{ background: 'var(--bg-tertiary)', borderRadius: '6px', padding: '8px 10px' }}>
                  <div style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '2px' }}>{label}</div>
                  <div style={{ fontSize: '12px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
                </div>
              ))}
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
