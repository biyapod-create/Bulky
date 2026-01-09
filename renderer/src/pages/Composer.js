import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Save, Eye, Code, FileText, ShieldCheck, Edit3, Tag, Users } from 'lucide-react';
import { useToast } from '../components/ToastContext';
import EmailEditor from '../components/EmailEditor';

function Composer() {
  const location = useLocation();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const campaignFromNav = location.state?.campaign;

  const [templates, setTemplates] = useState([]);
  const [lists, setLists] = useState([]);
  const [tags, setTags] = useState([]);
  const [recipientCount, setRecipientCount] = useState(0);
  const [viewMode, setViewMode] = useState('visual'); // visual, code, preview
  const [spamScore, setSpamScore] = useState(null);
  const [campaign, setCampaign] = useState({
    name: campaignFromNav?.name || '',
    subject: '',
    content: getDefaultTemplate(),
    listId: campaignFromNav?.listId || '',
    selectedTags: [],
    batchSize: campaignFromNav?.batchSize || 50,
    delayMinutes: campaignFromNav?.delayMinutes || 10,
    status: 'draft'
  });

  useEffect(() => {
    loadData();
  }, []);

  // Update recipient count when filters change
  useEffect(() => {
    updateRecipientCount();
  }, [campaign.listId, campaign.selectedTags]);

  // Debounced spam check
  useEffect(() => {
    const timer = setTimeout(() => {
      checkSpamScore();
    }, 1000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign.subject, campaign.content]);

  const loadData = async () => {
    try {
      if (window.electron) {
        const [templatesData, listsData, tagsData] = await Promise.all([
          window.electron.templates.getAll(),
          window.electron.lists.getAll(),
          window.electron.tags.getAll()
        ]);
        setTemplates(templatesData || []);
        setLists(listsData || []);
        setTags(tagsData || []);
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    }
  };

  const updateRecipientCount = async () => {
    try {
      if (window.electron) {
        const filter = { listId: campaign.listId || '' };
        if (campaign.selectedTags && campaign.selectedTags.length > 0) {
          filter.tags = campaign.selectedTags;
        }
        const count = await window.electron.contacts.getRecipientCount(filter);
        setRecipientCount(count || 0);
      }
    } catch (error) {
      console.error('Failed to get recipient count:', error);
    }
  };

  const toggleTag = (tagId) => {
    setCampaign(prev => {
      const currentTags = prev.selectedTags || [];
      const newTags = currentTags.includes(tagId)
        ? currentTags.filter(t => t !== tagId)
        : [...currentTags, tagId];
      return { ...prev, selectedTags: newTags };
    });
  };

  const checkSpamScore = async () => {
    if (!campaign.subject && !campaign.content) return;
    try {
      if (window.electron?.spam) {
        const result = await window.electron.spam.check({
          subject: campaign.subject,
          content: campaign.content
        });
        setSpamScore(result);
      }
    } catch (error) {
      console.error('Spam check failed:', error);
    }
  };

  const handleLoadTemplate = (templateId) => {
    const template = templates.find(t => t.id === templateId);
    if (template) {
      setCampaign({
        ...campaign,
        subject: template.subject,
        content: template.content
      });
      addToast('Template loaded', 'success');
    }
  };

  const handleSaveAsTemplate = async () => {
    if (!campaign.subject) {
      addToast('Subject is required to save template', 'error');
      return;
    }
    const name = prompt('Enter template name:');
    if (!name) return;
    
    try {
      await window.electron.templates.add({
        name,
        subject: campaign.subject,
        content: campaign.content
      });
      addToast('Template saved', 'success');
      loadData();
    } catch (error) {
      addToast('Failed to save template', 'error');
    }
  };

  const handleSaveCampaign = async () => {
    if (!campaign.name) {
      addToast('Campaign name is required', 'error');
      return;
    }
    if (!campaign.subject) {
      addToast('Subject is required', 'error');
      return;
    }

    try {
      // Count contacts with tag filtering
      const filter = { listId: campaign.listId || '' };
      if (campaign.selectedTags && campaign.selectedTags.length > 0) {
        filter.tags = campaign.selectedTags;
      }
      const contacts = await window.electron.contacts.getForCampaign(filter);

      await window.electron.campaigns.add({
        ...campaign,
        selectedTags: campaign.selectedTags || [],
        totalEmails: contacts.length
      });
      addToast('Campaign saved as draft', 'success');
      navigate('/campaigns');
    } catch (error) {
      addToast('Failed to save campaign', 'error');
    }
  };

  const insertToken = (token) => {
    setCampaign({
      ...campaign,
      content: campaign.content + `{{${token}}}`
    });
  };

  const getScoreColor = () => {
    if (!spamScore) return '';
    if (spamScore.score >= 80) return 'excellent';
    if (spamScore.score >= 60) return 'good';
    if (spamScore.score >= 40) return 'fair';
    return 'poor';
  };

  return (
    <div>
      <div className="page-header flex justify-between items-center">
        <div>
          <h1 className="page-title">Email Composer</h1>
          <p className="page-subtitle">Create and design your email content.</p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-outline" onClick={handleSaveAsTemplate}>
            <FileText size={16} /> Save as Template
          </button>
          <button className="btn btn-primary" onClick={handleSaveCampaign}>
            <Save size={16} /> Save Campaign
          </button>
        </div>
      </div>

      <div className="composer-grid">
        {/* Left Panel - Settings */}
        <div className="card">
          <h3 className="card-title mb-4">Campaign Settings</h3>
          
          <div className="form-group">
            <label className="form-label">Campaign Name *</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g., Summer Newsletter"
              value={campaign.name}
              onChange={(e) => setCampaign({ ...campaign, name: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Select List</label>
            <select
              className="form-select"
              value={campaign.listId}
              onChange={(e) => setCampaign({ ...campaign, listId: e.target.value })}
            >
              <option value="">All Contacts</option>
              {lists.map(list => (
                <option key={list.id} value={list.id}>{list.name}</option>
              ))}
            </select>
          </div>

          {/* Tag Filtering */}
          {tags.length > 0 && (
            <div className="form-group">
              <label className="form-label"><Tag size={14} style={{ marginRight: '4px' }} /> Filter by Tags</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                {tags.map(tag => (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => toggleTag(tag.id)}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '12px',
                      border: campaign.selectedTags?.includes(tag.id) ? 'none' : '1px solid var(--border)',
                      background: campaign.selectedTags?.includes(tag.id) ? tag.color : 'var(--bg-secondary)',
                      color: campaign.selectedTags?.includes(tag.id) ? '#fff' : 'var(--text)',
                      fontSize: '12px',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    {tag.name}
                  </button>
                ))}
              </div>
              {campaign.selectedTags?.length > 0 && (
                <button
                  type="button"
                  className="btn btn-outline btn-sm mt-2"
                  onClick={() => setCampaign({ ...campaign, selectedTags: [] })}
                  style={{ fontSize: '11px' }}
                >
                  Clear Tags
                </button>
              )}
            </div>
          )}

          {/* Recipient Count */}
          <div style={{ 
            background: 'var(--bg-tertiary)', 
            borderRadius: '8px', 
            padding: '12px', 
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <Users size={18} style={{ color: 'var(--accent)' }} />
            <div>
              <div style={{ fontSize: '18px', fontWeight: '600' }}>{recipientCount.toLocaleString()}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                {campaign.selectedTags?.length > 0 
                  ? `Recipients (filtered by ${campaign.selectedTags.length} tag${campaign.selectedTags.length > 1 ? 's' : ''})`
                  : 'Total Recipients'}
              </div>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Load Template</label>
            <select
              className="form-select"
              onChange={(e) => handleLoadTemplate(e.target.value)}
              value=""
            >
              <option value="">Select template...</option>
              {templates.map(template => (
                <option key={template.id} value={template.id}>{template.name}</option>
              ))}
            </select>
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '20px 0' }} />

          <h4 style={{ fontSize: '14px', marginBottom: '12px' }}>Throttle Settings</h4>
          
          <div className="form-group">
            <label className="form-label">Batch Size</label>
            <input
              type="number"
              className="form-input"
              value={campaign.batchSize}
              onChange={(e) => setCampaign({ ...campaign, batchSize: parseInt(e.target.value) })}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Delay (minutes)</label>
            <input
              type="number"
              className="form-input"
              value={campaign.delayMinutes}
              onChange={(e) => setCampaign({ ...campaign, delayMinutes: parseInt(e.target.value) })}
            />
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '20px 0' }} />

          <h4 style={{ fontSize: '14px', marginBottom: '12px' }}>Personalization</h4>
          <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
            <button className="btn btn-outline btn-sm" onClick={() => insertToken('firstName')}>
              First Name
            </button>
            <button className="btn btn-outline btn-sm" onClick={() => insertToken('lastName')}>
              Last Name
            </button>
            <button className="btn btn-outline btn-sm" onClick={() => insertToken('email')}>
              Email
            </button>
            <button className="btn btn-outline btn-sm" onClick={() => insertToken('fullName')}>
              Full Name
            </button>
          </div>

          {spamScore && (
            <>
              <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '20px 0' }} />
              <h4 style={{ fontSize: '14px', marginBottom: '12px' }}>
                <ShieldCheck size={16} style={{ display: 'inline', marginRight: '6px' }} />
                Spam Score
              </h4>
              <div className={`score-circle ${getScoreColor()}`} style={{ width: '80px', height: '80px' }}>
                <span className="score-value" style={{ fontSize: '24px' }}>{spamScore.score}</span>
              </div>
              <p className="text-sm text-muted text-center mt-2">{spamScore.rating}</p>
            </>
          )}
        </div>

        {/* Right Panel - Editor */}
        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="flex justify-between items-center mb-4">
            <div className="tabs" style={{ marginBottom: 0, borderBottom: 'none', display: 'flex', gap: '4px' }}>
              <button 
                className={`tab ${viewMode === 'visual' ? 'active' : ''}`}
                onClick={() => setViewMode('visual')}
                style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Edit3 size={14} /> Visual
              </button>
              <button 
                className={`tab ${viewMode === 'code' ? 'active' : ''}`}
                onClick={() => setViewMode('code')}
                style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Code size={14} /> HTML
              </button>
              <button 
                className={`tab ${viewMode === 'preview' ? 'active' : ''}`}
                onClick={() => setViewMode('preview')}
                style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Eye size={14} /> Preview
              </button>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Subject Line *</label>
            <input
              type="text"
              className="form-input"
              placeholder="Enter email subject..."
              value={campaign.subject}
              onChange={(e) => setCampaign({ ...campaign, subject: e.target.value })}
            />
          </div>

          {viewMode === 'visual' && (
            <div className="form-group">
              <label className="form-label">Email Content (Visual Editor)</label>
              <EmailEditor
                value={campaign.content}
                onChange={(html) => setCampaign({ ...campaign, content: html })}
                placeholder="Start typing your email content..."
              />
            </div>
          )}

          {viewMode === 'code' && (
            <div className="form-group">
              <label className="form-label">HTML Source Code</label>
              <textarea
                className="form-textarea"
                style={{ 
                  minHeight: '400px', 
                  fontFamily: 'monospace',
                  fontSize: '13px',
                  lineHeight: '1.6'
                }}
                value={campaign.content}
                onChange={(e) => setCampaign({ ...campaign, content: e.target.value })}
                placeholder="<html>&#10;<body>&#10;  <h1>Hello {{firstName}}!</h1>&#10;</body>&#10;</html>"
              />
            </div>
          )}

          {viewMode === 'preview' && (
            <div className="form-group">
              <label className="form-label">Email Preview</label>
              <div 
                className="preview-content"
                style={{ 
                  minHeight: '400px', 
                  border: '1px solid var(--border)', 
                  borderRadius: '8px',
                  padding: '20px',
                  background: '#ffffff',
                  color: '#000000',
                  overflow: 'auto'
                }}
                dangerouslySetInnerHTML={{ 
                  __html: campaign.content
                    .replace(/\{\{firstName\}\}/g, 'John')
                    .replace(/\{\{lastName\}\}/g, 'Doe')
                    .replace(/\{\{email\}\}/g, 'john@example.com')
                    .replace(/\{\{fullName\}\}/g, 'John Doe')
                    .replace(/\{\{company\}\}/g, 'Acme Inc')
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function getDefaultTemplate() {
  return `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { text-align: center; padding: 20px 0; }
    .content { padding: 20px 0; }
    .footer { text-align: center; padding: 20px 0; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Hello {{firstName}}!</h1>
    </div>
    <div class="content">
      <p>Your email content goes here...</p>
    </div>
    <div class="footer">
      <p>If you no longer wish to receive these emails, please unsubscribe.</p>
    </div>
  </div>
</body>
</html>`;
}

export default Composer;
