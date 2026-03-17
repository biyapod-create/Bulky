import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Save, Eye, Code, FileText, ShieldCheck, Edit3, Tag, Users, ChevronDown, ChevronUp, Wand2, Layers, ExternalLink, Beaker, Sparkles, FolderOpen } from 'lucide-react';
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
  const [recipientBreakdown, setRecipientBreakdown] = useState({ total: 0, blacklisted: 0, unsubscribed: 0, valid: 0 });
  const [viewMode, setViewMode] = useState('visual');
  const [spamScore, setSpamScore] = useState(null);
  const [settingsCollapsed, setSettingsCollapsed] = useState(false);
  const [isABTest, setIsABTest] = useState(false);
  const [showTokenPicker, setShowTokenPicker] = useState(false);
  const [activeSubjectField, setActiveSubjectField] = useState('A');
  const tokenPickerRef = useRef(null);

  const [campaign, setCampaign] = useState({
    name: campaignFromNav?.name || '',
    subject: '',
    subjectB: '',
    content: getDefaultTemplate(),
    contentB: '',
    isABTest: false,
    abTestPercent: 50,
    listId: campaignFromNav?.listId || '',
    selectedTags: [],
    batchSize: campaignFromNav?.batchSize || 50,
    delayMinutes: campaignFromNav?.delayMinutes || 10,
    status: 'draft'
  });

  // Template categories computed from templates
  const templateCategories = templates.reduce((cats, t) => {
    const cat = t.category || 'General';
    if (!cats[cat]) cats[cat] = [];
    cats[cat].push(t);
    return cats;
  }, {});

  const personalizationTokens = [
    { token: 'firstName', label: 'First Name', preview: 'John', group: 'Contact' },
    { token: 'lastName', label: 'Last Name', preview: 'Doe', group: 'Contact' },
    { token: 'fullName', label: 'Full Name', preview: 'John Doe', group: 'Contact' },
    { token: 'email', label: 'Email Address', preview: 'john@example.com', group: 'Contact' },
    { token: 'company', label: 'Company', preview: 'Acme Inc', group: 'Contact' },
    { token: 'phone', label: 'Phone', preview: '+1234567890', group: 'Contact' },
    { token: 'date', label: 'Current Date', preview: new Date().toLocaleDateString(), group: 'Dynamic' },
    { token: 'year', label: 'Current Year', preview: new Date().getFullYear().toString(), group: 'Dynamic' },
    { token: 'unsubscribeLink', label: 'Unsubscribe Link', preview: '#', group: 'System' },
  ];

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    updateRecipientCount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign.listId, campaign.selectedTags]);

  useEffect(() => {
    const timer = setTimeout(() => {
      checkSpamScore();
    }, 1000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign.subject, campaign.content]);

  // Auto-generate campaign name from subject
  useEffect(() => {
    if (!campaign.name && campaign.subject && campaign.subject.length > 3) {
      const autoName = campaign.subject.slice(0, 50).replace(/[^\w\s-]/g, '').trim();
      if (autoName) {
        setCampaign(prev => ({ ...prev, name: autoName }));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign.subject]);

  // Close token picker on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (tokenPickerRef.current && !tokenPickerRef.current.contains(e.target)) {
        setShowTokenPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loadData = async () => {
    try {
      if (window.electron) {
        const [templatesData, listsData, tagsData] = await Promise.all([
          window.electron.templates.getAll(),
          window.electron.lists.getAll(),
          window.electron.tags.getAll()
        ]);
        setTemplates(Array.isArray(templatesData) ? templatesData : []);
        setLists(Array.isArray(listsData) ? listsData : []);
        setTags(Array.isArray(tagsData) ? tagsData : []);
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
        const total = count || 0;
        setRecipientCount(total);

        // Try to get breakdown if API supports it
        try {
          const breakdown = await window.electron.contacts.getRecipientBreakdown(filter);
          if (breakdown) {
            setRecipientBreakdown(breakdown);
          } else {
            setRecipientBreakdown({ total, blacklisted: 0, unsubscribed: 0, valid: total });
          }
        } catch {
          setRecipientBreakdown({ total, blacklisted: 0, unsubscribed: 0, valid: total });
        }
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
        subject: template.subject || campaign.subject,
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
    if (isABTest && !campaign.subjectB) {
      addToast('Variant B subject is required for A/B test', 'error');
      return;
    }

    try {
      const filter = { listId: campaign.listId || '' };
      if (campaign.selectedTags && campaign.selectedTags.length > 0) {
        filter.tags = campaign.selectedTags;
      }
      const contacts = await window.electron.contacts.getForCampaign(filter);

      await window.electron.campaigns.add({
        ...campaign,
        isABTest,
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
    setShowTokenPicker(false);
  };

  // eslint-disable-next-line no-unused-vars
  const insertTokenInSubject = (token) => {
    if (activeSubjectField === 'B') {
      setCampaign(prev => ({ ...prev, subjectB: prev.subjectB + `{{${token}}}` }));
    } else {
      setCampaign(prev => ({ ...prev, subject: prev.subject + `{{${token}}}` }));
    }
    setShowTokenPicker(false);
  };

  const handleOpenInBuilder = () => {
    // Navigate to template builder with current content
    navigate('/template-builder', { state: { content: campaign.content, returnTo: '/composer' } });
  };

  const getScoreColor = () => {
    if (!spamScore) return '';
    if (spamScore.score >= 80) return 'excellent';
    if (spamScore.score >= 60) return 'good';
    if (spamScore.score >= 40) return 'fair';
    return 'poor';
  };

  const getScoreBarColor = () => {
    if (!spamScore) return '#6b7280';
    if (spamScore.score >= 80) return '#22c55e';
    if (spamScore.score >= 60) return '#3b82f6';
    if (spamScore.score >= 40) return '#f59e0b';
    return '#ef4444';
  };

  return (
    <div>
      <div className="page-header flex justify-between items-center">
        <div>
          <h1 className="page-title">Email Composer</h1>
          <p className="page-subtitle">Create and design your email content.</p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-outline" onClick={handleOpenInBuilder} title="Open in Template Builder">
            <ExternalLink size={16} /> Open in Builder
          </button>
          <button className="btn btn-outline" onClick={handleSaveAsTemplate}>
            <FileText size={16} /> Save as Template
          </button>
          <button className="btn btn-primary" onClick={handleSaveCampaign}>
            <Save size={16} /> Save Campaign
          </button>
        </div>
      </div>

      <div className="composer-grid" style={{ gridTemplateColumns: settingsCollapsed ? '48px 1fr' : '340px 1fr' }}>
        {/* Left Panel - Settings */}
        <div className="card" style={{ overflow: 'hidden', transition: 'all 0.3s', position: 'relative' }}>
          {/* Collapse toggle */}
          <button
            onClick={() => setSettingsCollapsed(!settingsCollapsed)}
            style={{
              position: 'absolute', top: '12px', right: '12px', background: 'none', border: 'none',
              cursor: 'pointer', color: 'var(--text-muted)', padding: '4px', zIndex: 1
            }}
            title={settingsCollapsed ? 'Expand settings' : 'Collapse settings'}
          >
            {settingsCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
          </button>

          {settingsCollapsed ? (
            <div style={{ writingMode: 'vertical-rl', textOrientation: 'mixed', padding: '16px 8px', color: 'var(--text-muted)', fontSize: '12px', cursor: 'pointer' }}
              onClick={() => setSettingsCollapsed(false)}
            >
              Campaign Settings
            </div>
          ) : (
            <>
              <h3 className="card-title mb-4">Campaign Settings</h3>

              <div className="form-group">
                <label className="form-label">Campaign Name *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Auto-generated from subject"
                  value={campaign.name}
                  onChange={(e) => setCampaign({ ...campaign, name: e.target.value })}
                />
                {!campaign.name && campaign.subject && (
                  <small className="text-muted">Will auto-generate from subject line</small>
                )}
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
                          padding: '4px 10px', borderRadius: '12px',
                          border: campaign.selectedTags?.includes(tag.id) ? 'none' : '1px solid var(--border)',
                          background: campaign.selectedTags?.includes(tag.id) ? tag.color : 'var(--bg-secondary)',
                          color: campaign.selectedTags?.includes(tag.id) ? '#fff' : 'var(--text)',
                          fontSize: '12px', cursor: 'pointer', transition: 'all 0.2s'
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

              {/* Enhanced Recipient Count with Breakdown */}
              <div style={{
                background: 'var(--bg-tertiary)', borderRadius: '8px', padding: '12px', marginBottom: '16px'
              }}>
                <div className="flex items-center gap-2 mb-2">
                  <Users size={18} style={{ color: 'var(--accent)' }} />
                  <div style={{ fontSize: '20px', fontWeight: '600' }}>{recipientCount.toLocaleString()}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    {campaign.selectedTags?.length > 0
                      ? `recipients (${campaign.selectedTags.length} tag${campaign.selectedTags.length > 1 ? 's' : ''} applied)`
                      : 'total recipients'}
                  </div>
                </div>
                {(recipientBreakdown.blacklisted > 0 || recipientBreakdown.unsubscribed > 0) && (
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', borderTop: '1px solid var(--border)', paddingTop: '8px', marginTop: '4px' }}>
                    <div className="flex justify-between">
                      <span style={{ color: '#22c55e' }}>Valid: {recipientBreakdown.valid}</span>
                      <span style={{ color: '#f59e0b' }}>Blacklisted: {recipientBreakdown.blacklisted}</span>
                      <span style={{ color: '#ef4444' }}>Unsub: {recipientBreakdown.unsubscribed}</span>
                    </div>
                  </div>
                )}
                {recipientCount > 0 && campaign.batchSize > 0 && (
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
                    ~{Math.ceil(recipientCount / campaign.batchSize)} batches, ~{Math.ceil(recipientCount / campaign.batchSize) * campaign.delayMinutes} min total
                  </div>
                )}
              </div>

              {/* Load Template with Categories */}
              <div className="form-group">
                <label className="form-label"><FolderOpen size={14} style={{ marginRight: '4px' }} /> Load Template</label>
                {Object.keys(templateCategories).length > 0 ? (
                  <select
                    className="form-select"
                    onChange={(e) => handleLoadTemplate(e.target.value)}
                    value=""
                  >
                    <option value="">Select template...</option>
                    {Object.entries(templateCategories).map(([category, catTemplates]) => (
                      <optgroup key={category} label={category}>
                        {catTemplates.map(template => (
                          <option key={template.id} value={template.id}>{template.name}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                ) : (
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
                )}
              </div>

              <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '20px 0' }} />

              {/* A/B Testing Toggle */}
              <div className="form-group">
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={isABTest}
                    onChange={(e) => {
                      setIsABTest(e.target.checked);
                      setCampaign(prev => ({ ...prev, isABTest: e.target.checked }));
                    }}
                  />
                  <Beaker size={14} /> Enable A/B Testing
                </label>
                {isABTest && (
                  <div style={{ marginTop: '8px' }}>
                    <label className="form-label" style={{ fontSize: '12px' }}>
                      Test Split: {campaign.abTestPercent}% / {100 - campaign.abTestPercent}%
                    </label>
                    <input
                      type="range"
                      min="10" max="90" step="5"
                      value={campaign.abTestPercent}
                      onChange={(e) => setCampaign({ ...campaign, abTestPercent: parseInt(e.target.value) })}
                      style={{ width: '100%' }}
                    />
                    <div className="flex justify-between text-sm text-muted">
                      <span>Variant A ({campaign.abTestPercent}%)</span>
                      <span>Variant B ({100 - campaign.abTestPercent}%)</span>
                    </div>
                  </div>
                )}
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

              {/* Personalization Token Picker */}
              <h4 style={{ fontSize: '14px', marginBottom: '12px' }}>
                <Sparkles size={14} style={{ marginRight: '4px' }} /> Personalization
              </h4>
              <div style={{ position: 'relative' }} ref={tokenPickerRef}>
                <button
                  className="btn btn-outline btn-sm"
                  onClick={() => setShowTokenPicker(!showTokenPicker)}
                  style={{ width: '100%', justifyContent: 'space-between', display: 'flex' }}
                >
                  <span>Insert Token...</span>
                  <ChevronDown size={14} />
                </button>
                {showTokenPicker && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
                    background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                    borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.2)', maxHeight: '280px', overflow: 'auto'
                  }}>
                    {['Contact', 'Dynamic', 'System'].map(group => (
                      <div key={group}>
                        <div style={{ padding: '8px 12px', fontSize: '10px', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', background: 'var(--bg-tertiary)' }}>
                          {group}
                        </div>
                        {personalizationTokens.filter(t => t.group === group).map(({ token, label, preview }) => (
                          <div key={token} style={{ display: 'flex', gap: '8px' }}>
                            <button
                              style={{
                                flex: 1, padding: '8px 12px', background: 'none', border: 'none',
                                textAlign: 'left', cursor: 'pointer', color: 'var(--text)', fontSize: '13px',
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                              }}
                              onClick={() => insertToken(token)}
                              onMouseEnter={(e) => e.target.style.background = 'var(--bg-tertiary)'}
                              onMouseLeave={(e) => e.target.style.background = 'none'}
                            >
                              <span>{label}</span>
                              <code style={{ fontSize: '10px', color: 'var(--text-muted)', background: 'var(--bg-tertiary)', padding: '2px 6px', borderRadius: '4px' }}>
                                {`{{${token}}}`}
                              </code>
                            </button>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Spam Score Preview */}
              {spamScore && (
                <>
                  <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '20px 0' }} />
                  <h4 style={{ fontSize: '14px', marginBottom: '12px' }}>
                    <ShieldCheck size={16} style={{ display: 'inline', marginRight: '6px' }} />
                    Spam Score
                  </h4>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                    <div className={`score-circle ${getScoreColor()}`} style={{ width: '60px', height: '60px', flexShrink: 0 }}>
                      <span className="score-value" style={{ fontSize: '20px' }}>{spamScore.score}</span>
                    </div>
                    <div>
                      <div style={{ fontWeight: '600', fontSize: '14px' }}>{spamScore.rating}</div>
                      <div style={{ height: '6px', width: '120px', background: 'var(--bg-tertiary)', borderRadius: '3px', overflow: 'hidden', marginTop: '4px' }}>
                        <div style={{ height: '100%', width: `${spamScore.score}%`, background: getScoreBarColor(), transition: 'width 0.5s' }} />
                      </div>
                    </div>
                  </div>
                  {spamScore.issues && spamScore.issues.length > 0 && (
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px' }}>
                      {spamScore.issues.slice(0, 3).map((issue, i) => (
                        <div key={i} style={{ padding: '3px 0', display: 'flex', alignItems: 'flex-start', gap: '4px' }}>
                          <span style={{ color: '#f59e0b' }}>!</span> {issue}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
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
            {isABTest && (
              <span className="badge badge-info" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Beaker size={12} /> A/B Test Mode
              </span>
            )}
          </div>

          {/* Subject Line(s) */}
          <div className="form-group">
            <label className="form-label">Subject Line {isABTest ? '(Variant A)' : ''} *</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                className="form-input"
                placeholder="Enter email subject..."
                value={campaign.subject}
                onChange={(e) => setCampaign({ ...campaign, subject: e.target.value })}
                onFocus={() => setActiveSubjectField('A')}
                style={{ flex: 1 }}
              />
              <button
                className="btn btn-outline btn-sm"
                onClick={() => {
                  setActiveSubjectField('A');
                  setShowTokenPicker(true);
                }}
                title="Insert personalization token"
              >
                <Wand2 size={14} />
              </button>
            </div>
          </div>

          {/* A/B Test Variant B Subject */}
          {isABTest && (
            <div className="form-group" style={{ background: 'rgba(139, 92, 246, 0.05)', padding: '12px', borderRadius: '8px', border: '1px dashed rgba(139, 92, 246, 0.3)' }}>
              <label className="form-label" style={{ color: '#a855f7' }}>Subject Line (Variant B) *</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Enter variant B subject..."
                  value={campaign.subjectB}
                  onChange={(e) => setCampaign({ ...campaign, subjectB: e.target.value })}
                  onFocus={() => setActiveSubjectField('B')}
                  style={{ flex: 1 }}
                />
                <button
                  className="btn btn-outline btn-sm"
                  onClick={() => {
                    setActiveSubjectField('B');
                    setShowTokenPicker(true);
                  }}
                  title="Insert personalization token"
                >
                  <Wand2 size={14} />
                </button>
              </div>
            </div>
          )}

          {/* Content Editor - Variant A */}
          {viewMode === 'visual' && (
            <div className="form-group">
              <label className="form-label">Email Content {isABTest ? '(Variant A)' : ''}</label>
              <EmailEditor
                value={campaign.content}
                onChange={(html) => setCampaign({ ...campaign, content: html })}
                placeholder="Start typing your email content..."
              />
            </div>
          )}

          {viewMode === 'code' && (
            <div className="form-group">
              <label className="form-label">HTML Source Code {isABTest ? '(Variant A)' : ''}</label>
              <textarea
                className="form-textarea"
                style={{
                  minHeight: '400px', fontFamily: 'monospace',
                  fontSize: '13px', lineHeight: '1.6'
                }}
                value={campaign.content}
                onChange={(e) => setCampaign({ ...campaign, content: e.target.value })}
                placeholder="<html>&#10;<body>&#10;  <h1>Hello {{firstName}}!</h1>&#10;</body>&#10;</html>"
              />
            </div>
          )}

          {viewMode === 'preview' && (
            <div className="form-group">
              <label className="form-label">Email Preview {isABTest ? '(Variant A)' : ''}</label>
              <div
                className="preview-content"
                style={{
                  minHeight: '400px', border: '1px solid var(--border)',
                  borderRadius: '8px', padding: '20px',
                  background: '#ffffff', color: '#000000', overflow: 'auto'
                }}
                dangerouslySetInnerHTML={{
                  __html: campaign.content
                    .replace(/\{\{firstName\}\}/g, 'John')
                    .replace(/\{\{lastName\}\}/g, 'Doe')
                    .replace(/\{\{email\}\}/g, 'john@example.com')
                    .replace(/\{\{fullName\}\}/g, 'John Doe')
                    .replace(/\{\{company\}\}/g, 'Acme Inc')
                    .replace(/\{\{phone\}\}/g, '+1234567890')
                    .replace(/\{\{date\}\}/g, new Date().toLocaleDateString())
                    .replace(/\{\{year\}\}/g, new Date().getFullYear().toString())
                }}
              />
            </div>
          )}

          {/* A/B Test Variant B Content */}
          {isABTest && (
            <>
              <hr style={{ border: 'none', borderTop: '2px dashed rgba(139, 92, 246, 0.3)', margin: '24px 0' }} />
              <div style={{ background: 'rgba(139, 92, 246, 0.05)', padding: '16px', borderRadius: '8px', border: '1px dashed rgba(139, 92, 246, 0.3)' }}>
                <h4 style={{ color: '#a855f7', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Layers size={16} /> Variant B Content
                </h4>

                {viewMode === 'visual' && (
                  <div className="form-group">
                    <EmailEditor
                      value={campaign.contentB || campaign.content}
                      onChange={(html) => setCampaign({ ...campaign, contentB: html })}
                      placeholder="Variant B content (leave empty to use same content with different subject)"
                    />
                  </div>
                )}

                {viewMode === 'code' && (
                  <div className="form-group">
                    <textarea
                      className="form-textarea"
                      style={{ minHeight: '250px', fontFamily: 'monospace', fontSize: '13px' }}
                      value={campaign.contentB || ''}
                      onChange={(e) => setCampaign({ ...campaign, contentB: e.target.value })}
                      placeholder="Leave empty to use same content as Variant A with different subject"
                    />
                  </div>
                )}

                {viewMode === 'preview' && (
                  <div
                    className="preview-content"
                    style={{
                      minHeight: '250px', border: '1px solid rgba(139, 92, 246, 0.3)',
                      borderRadius: '8px', padding: '20px',
                      background: '#ffffff', color: '#000000', overflow: 'auto'
                    }}
                    dangerouslySetInnerHTML={{
                      __html: (campaign.contentB || campaign.content)
                        .replace(/\{\{firstName\}\}/g, 'John')
                        .replace(/\{\{lastName\}\}/g, 'Doe')
                        .replace(/\{\{email\}\}/g, 'john@example.com')
                        .replace(/\{\{fullName\}\}/g, 'John Doe')
                        .replace(/\{\{company\}\}/g, 'Acme Inc')
                    }}
                  />
                )}

                <div className="text-sm text-muted mt-2">
                  Leave variant B content empty to test only different subject lines with the same email body.
                </div>
              </div>
            </>
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
