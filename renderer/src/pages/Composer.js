import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Save, Eye, Code, FileText, ShieldCheck, Edit3, Tag, Users, ChevronDown, ChevronUp, Wand2, Layers, ExternalLink, Beaker, Sparkles, FolderOpen, Monitor, Search, X } from 'lucide-react';
import { useToast } from '../components/ToastContext';
import { useNavigation } from '../components/NavigationContext';
import EmailEditor from '../components/EmailEditor';
import EmailPreview from '../components/EmailPreview';
import { buildEmailPreviewDocument } from '../utils/emailPreview';

function Composer({ isActive }) {
  const { navigateTo, pageParams } = useNavigation();
  const navigate = (path, opts) => navigateTo(path, opts?.state || {});
  const { addToast } = useToast();
  const composerParams = pageParams['/composer'] || {};
  const campaignFromNav = composerParams.campaign;

  const [templates, setTemplates] = useState([]);
  const [lists, setLists] = useState([]);
  const [tags, setTags] = useState([]);
  const [contactsCatalog, setContactsCatalog] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [recipientCount, setRecipientCount] = useState(0);
  const [recipientBreakdown, setRecipientBreakdown] = useState({ total: 0, blacklisted: 0, unsubscribed: 0, valid: 0 });
  const [viewMode, setViewMode] = useState('visual');
  const [spamScore, setSpamScore] = useState(null);
  const [settingsCollapsed, setSettingsCollapsed] = useState(false);
  const [isABTest, setIsABTest] = useState(false);
  const [showTokenPicker, setShowTokenPicker] = useState(false);
  const [activeSubjectField, setActiveSubjectField] = useState('A');
  const tokenPickerRef = useRef(null);

  const [dataLoading, setDataLoading] = useState(true);
  const [showFullPreview, setShowFullPreview] = useState(false);
  const [aiInsights, setAiInsights] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSubjectSuggestions, setAiSubjectSuggestions] = useState([]);
  const [showAiGenerate, setShowAiGenerate] = useState(false);
  const [aiBrief, setAiBrief] = useState({
    prompt: '',
    tone: 'professional',
    objective: '',
    audience: '',
    cta: '',
    offer: '',
    brandVoice: '',
    includePersonalization: true
  });
  const [recipientMode, setRecipientMode] = useState('all'); // 'all' | 'list' | 'manual'
  const [manualEmails, setManualEmails] = useState('');
  const [individualSearch, setIndividualSearch] = useState('');

  // Auto-resize preview iframe to fit its content so there's no white gap
  // and no scrollbar inside the preview pane
  const handlePreviewIframeLoad = (e) => {
    try {
      const iframe = e.target;
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (doc) {
        const h = Math.max(
          doc.documentElement.scrollHeight,
          doc.body ? doc.body.scrollHeight : 0,
          300
        );
        iframe.style.height = h + 'px';
      }
    } catch (e) { /* cross-origin sandboxed iframe — fixed height fallback */ }
  };

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

  const normalizeEmailList = useCallback((value) => {
    return [...new Set(
      String(value || '')
        .split(/[\n,;]/)
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean)
    )];
  }, []);

  const selectedManualEmails = useMemo(() => normalizeEmailList(manualEmails), [manualEmails, normalizeEmailList]);
  const selectedManualEmailSet = useMemo(() => new Set(selectedManualEmails), [selectedManualEmails]);
  const filteredIndividualContacts = useMemo(() => {
    const query = individualSearch.trim().toLowerCase();
    return contactsCatalog
      .filter((contact) => {
        const email = String(contact.email || '').toLowerCase();
        const name = `${contact.firstName || ''} ${contact.lastName || ''}`.trim().toLowerCase();
        const company = String(contact.company || '').toLowerCase();
        const matchesQuery = !query || email.includes(query) || name.includes(query) || company.includes(query);
        return matchesQuery && email && !selectedManualEmailSet.has(email);
      })
      .slice(0, 10);
  }, [contactsCatalog, individualSearch, selectedManualEmailSet]);

  const toggleIndividualRecipient = useCallback((email) => {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!normalizedEmail) return;

    const nextEmails = selectedManualEmailSet.has(normalizedEmail)
      ? selectedManualEmails.filter((item) => item !== normalizedEmail)
      : [...selectedManualEmails, normalizedEmail];
    setManualEmails(nextEmails.join('\n'));
  }, [selectedManualEmails, selectedManualEmailSet]);

  const removeIndividualRecipient = useCallback((email) => {
    setManualEmails(selectedManualEmails.filter((item) => item !== email).join('\n'));
  }, [selectedManualEmails]);

  const loadData = useCallback(async () => {
    try {
      if (window.electron) {
        const [templatesData, listsData, tagsData, contactsData] = await Promise.all([
          window.electron.templates.getAll(),
          window.electron.lists.getAll(),
          window.electron.tags.getAll(),
          window.electron.contacts.getAll()
        ]);
        setTemplates(Array.isArray(templatesData) ? templatesData : []);
        setLists(Array.isArray(listsData) ? listsData : []);
        setTags(Array.isArray(tagsData) ? tagsData : []);
        setContactsCatalog(Array.isArray(contactsData) ? contactsData : []);
      }
    } catch (error) {
      addToast('Failed to load templates and lists', 'error');
    } finally {
      setDataLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Refresh templates/lists/tags when tab becomes active so dropdowns stay current
  useEffect(() => {
    if (isActive) loadData();
  }, [isActive, loadData]);

  // React to background mutations so Composer dropdowns auto-update
  // (e.g. new template saved from Templates page, contacts imported, list created)
  useEffect(() => {
    if (!window.electron?.onDataChanged) return;
    const unsub = window.electron.onDataChanged((data) => {
      if (data.type === 'templates' || data.type === 'contacts') loadData();
    });
    return unsub;
  }, [loadData]);

  // When navigated here with campaign params, apply them
  useEffect(() => {
    if (!isActive) return;

    setCampaign(prev => ({
      ...prev,
      name: campaignFromNav?.name || prev.name,
      subject: composerParams.subject || prev.subject,
      content: composerParams.content || prev.content,
      listId: campaignFromNav?.listId || prev.listId,
      batchSize: campaignFromNav?.batchSize || prev.batchSize,
      delayMinutes: campaignFromNav?.delayMinutes || prev.delayMinutes,
    }));

    if (composerParams.templateId) {
      setSelectedTemplateId(composerParams.templateId);
    }

    const incomingManualEmails = [
      ...(Array.isArray(composerParams.selectedContacts) ? composerParams.selectedContacts.map((contact) => contact?.email) : []),
      ...normalizeEmailList(composerParams.manualEmails || campaignFromNav?.manualEmails || '')
    ].filter(Boolean);

    if (incomingManualEmails.length > 0) {
      setManualEmails([...new Set(incomingManualEmails.map((email) => String(email).trim().toLowerCase()))].join('\n'));
      setRecipientMode('manual');
    } else if (campaignFromNav?.listId) {
      setRecipientMode('list');
    } else {
      setRecipientMode('all');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composerParams]);

  useEffect(() => {
    let isMounted = true;
    updateRecipientCount().then(() => {
      isMounted && setDataLoading(false);
    });
    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign.listId, campaign.selectedTags, recipientMode, manualEmails]);

  useEffect(() => {
    let isMounted = true;
    const timer = setTimeout(() => {
      if (isMounted) {
        checkSpamScore();
      }
    }, 1000);
    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign.subject, campaign.content]);

  // Auto-generate campaign name from subject — only when name is empty
  useEffect(() => {
    const nameIsBlank = !campaign.name || campaign.name.toString().trim() === '';
    if (nameIsBlank && campaign.subject && campaign.subject.length > 3) {
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

  // Autosave to localStorage every 30 seconds
  useEffect(() => {
    let isMounted = true;
    const timer = setInterval(() => {
      if (isMounted && (campaign.subject || campaign.content)) {
        localStorage.setItem('bulky_composer_draft', JSON.stringify({
          name: campaign.name,
          subject: campaign.subject,
          subjectB: campaign.subjectB,
          content: campaign.content,
          contentB: campaign.contentB,
          isABTest: campaign.isABTest,
          listId: campaign.listId,
          selectedTags: campaign.selectedTags || [],
          recipientMode,
          manualEmails,
          savedAt: new Date().toISOString()
        }));
      }
    }, 30000);
    return () => {
      isMounted = false;
      clearInterval(timer);
    };
  }, [campaign.name, campaign.subject, campaign.subjectB, campaign.content, campaign.contentB, campaign.isABTest, campaign.listId, campaign.selectedTags, recipientMode, manualEmails]);

  // Restore draft on mount
  useEffect(() => {
    if (campaignFromNav) return; // Don't restore if navigated with params
    try {
      const saved = localStorage.getItem('bulky_composer_draft');
      if (saved) {
        const draft = JSON.parse(saved);
        if (draft.subject || draft.content) {
          setCampaign(prev => ({
            ...prev,
            name: draft.name || prev.name,
            subject: draft.subject || prev.subject,
            subjectB: draft.subjectB || prev.subjectB,
            content: draft.content || prev.content,
            contentB: draft.contentB || prev.contentB,
            isABTest: draft.isABTest || prev.isABTest,
            listId: draft.listId || prev.listId,
            selectedTags: Array.isArray(draft.selectedTags) ? draft.selectedTags : prev.selectedTags,
          }));
          setRecipientMode(draft.recipientMode || 'all');
          setManualEmails(draft.manualEmails || '');
          addToast('Draft restored from autosave', 'info');
        }
      }
    } catch (e) {
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateRecipientCount = async () => {
    if (recipientMode === 'manual') {
      setRecipientCount(selectedManualEmails.length);
      setRecipientBreakdown({ total: selectedManualEmails.length, blacklisted: 0, unsubscribed: 0, valid: selectedManualEmails.length });
      return;
    }
    try {
      if (window.electron) {
        const filter = recipientMode === 'list' ? { listId: campaign.listId || '' } : {};
        if (recipientMode === 'list' && campaign.selectedTags && campaign.selectedTags.length > 0) {
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
            const fallback = { total, blacklisted: 0, unsubscribed: 0, valid: total };
            setRecipientBreakdown(fallback);
          }
        } catch {
          const fallback = { total, blacklisted: 0, unsubscribed: 0, valid: total };
          setRecipientBreakdown(fallback);
        }

        
      }
    } catch (error) {
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
    }
  };

  // Legacy effect - kept for compatibility
  useEffect(() => {
    // noop for legacy compatibility
  }, []);

  const handleLoadTemplate = (templateId) => {
    if (!templateId) {
      setSelectedTemplateId('');
      return;
    }
    const template = templates.find(t => t.id === templateId);
    if (template) {
      setSelectedTemplateId(templateId);
      setCampaign(prev => ({
        ...prev,
        subject: template.subject || prev.subject,
        content: template.content,
        isABTest: template.isABTest || prev.isABTest,
        abTestPercent: template.abTestPercent || prev.abTestPercent
      }));
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
    const normalizedName = String(campaign.name || '').replace(/\s+/g, ' ').trim();
    if (!normalizedName) {
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
      let totalEmails = 0;
      let savePayload = {
        ...campaign,
        name: normalizedName,
        isABTest,
        tagFilter: recipientMode === 'list' ? JSON.stringify(campaign.selectedTags || []) : '',
        manualEmails: ''
      };
      if (recipientMode === 'manual') {
        const emails = selectedManualEmails;
        if (emails.length === 0) { addToast('Enter at least one valid email address', 'error'); return; }
        savePayload.manualEmails = emails.join(',');
        savePayload.listId = '';
        savePayload.tagFilter = '';
        totalEmails = emails.length;
      } else {
        const filter = recipientMode === 'list' ? { listId: campaign.listId || '' } : {};
        if (recipientMode === 'list' && campaign.selectedTags && campaign.selectedTags.length > 0) filter.tags = campaign.selectedTags;
        if (recipientMode === 'all') {
          savePayload.listId = '';
        }
        const contacts = await window.electron.contacts.getForCampaign(filter);
        totalEmails = contacts.length;
      }
      savePayload.totalEmails = totalEmails;
      const saveResult = await window.electron.campaigns.add(savePayload);
      if (saveResult && saveResult.error) {
        addToast(`Failed to save campaign: ${saveResult.error}`, 'error');
        return;
      }
      localStorage.removeItem('bulky_composer_draft');
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
    // Navigate to templates page which has the builder
    navigate('/templates', {
      state: {
        openBuilder: true,
        content: campaign.content,
        subject: campaign.subject,
        aiBrief,
        returnTo: '/composer'
      }
    });
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

  // AI Functions
  const handleAiAnalyze = useCallback(async () => {
    try {
      if (window.electron?.ai?.localAnalysis) {
        const result = await window.electron.ai.localAnalysis({ subject: campaign.subject, content: campaign.content });
        setAiInsights(result);
      }
    } catch (e) {
      // ignored
    }
  }, [campaign.subject, campaign.content]);

  // A/B preview effect removed - was incorrectly overwriting subject/content on each keystroke

  const handleAiImproveSubject = async () => {
    if (!campaign.subject) { addToast('Enter a subject first', 'error'); return; }
    setAiLoading(true);
    try {
      const contextParts = [
        campaign.name && `Campaign: ${campaign.name}`,
        aiBrief.objective && `Objective: ${aiBrief.objective}`,
        aiBrief.audience && `Audience: ${aiBrief.audience}`,
        recipientCount > 0 && `Audience size: ${recipientCount}`
      ].filter(Boolean);
      const result = await window.electron?.ai?.improveSubject({ subject: campaign.subject, context: contextParts.join(' | ') });
      if (result.error) { addToast(result.error, 'error'); }
      else { setAiSubjectSuggestions(result.suggestions || []); }
    } catch (e) { addToast('AI request failed', 'error'); }
    finally { setAiLoading(false); }
  };

  const handleAiGenerate = async () => {
    if (!aiBrief.prompt) { addToast('Enter a prompt', 'error'); return; }
    setAiLoading(true);
    try {
      const result = await window.electron?.ai?.generateContent(aiBrief);
      if (result.error) { addToast(result.error, 'error'); }
      else {
        if (result.subject) setCampaign(prev => ({ ...prev, subject: result.subject }));
        if (result.html) setCampaign(prev => ({ ...prev, content: result.html }));
        setShowAiGenerate(false);
        setAiBrief(prev => ({ ...prev, prompt: '', objective: '', audience: '', cta: '', offer: '', brandVoice: '' }));
        addToast('Email generated', 'success');
      }
    } catch (e) { addToast('Generation failed', 'error'); }
    finally { setAiLoading(false); }
  };

  // Auto-run local analysis when subject/content changes
  useEffect(() => {
    const timer = setTimeout(() => { handleAiAnalyze(); }, 1500);
    return () => clearTimeout(timer);
  }, [handleAiAnalyze]);

  if (dataLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--text-muted)' }}>
        <div style={{ textAlign: 'center' }}>
          <Edit3 size={40} style={{ margin: '0 auto 1rem', opacity: 0.4, animation: 'spin 1.5s linear infinite' }} />
          <p>Loading composer...</p>
        </div>
      </div>
    );
  }

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
        <div className="card" style={{ overflow: 'hidden auto', transition: 'all 0.3s', position: 'relative', minWidth: 0 }}>
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
                <label className="form-label">Recipients</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '12px' }}>
                  <button
                    type="button"
                    className={`btn ${recipientMode === 'all' ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => setRecipientMode('all')}
                  >
                    <Users size={14} /> All Contacts
                  </button>
                  <button
                    type="button"
                    className={`btn ${recipientMode === 'list' ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => setRecipientMode('list')}
                  >
                    <FolderOpen size={14} /> By List
                  </button>
                  <button
                    type="button"
                    className={`btn ${recipientMode === 'manual' ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => setRecipientMode('manual')}
                  >
                    <Monitor size={14} /> Individual
                  </button>
                </div>
                {recipientMode === 'all' && (
                  <div style={{ padding: '12px 14px', borderRadius: '10px', background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', fontSize: '13px', lineHeight: 1.6 }}>
                    This campaign will target every active contact in Bulky. List and tag filters are ignored in this mode.
                  </div>
                )}
                {recipientMode === 'manual' ? (
                  <>
                    <div style={{ padding: '14px', borderRadius: '12px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', marginBottom: '10px' }}>
                      <label className="form-label" style={{ marginBottom: '8px' }}>Find Individual Contacts</label>
                      <div style={{ position: 'relative', marginBottom: '10px' }}>
                        <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                        <input
                          type="text"
                          className="form-input"
                          style={{ paddingLeft: '34px' }}
                          placeholder="Search contacts by email, name, or company"
                          value={individualSearch}
                          onChange={(e) => setIndividualSearch(e.target.value)}
                        />
                      </div>
                      {selectedManualEmails.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
                          {selectedManualEmails.map((email) => (
                            <button
                              key={email}
                              type="button"
                              className="btn btn-outline btn-sm"
                              onClick={() => removeIndividualRecipient(email)}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', maxWidth: '100%' }}
                            >
                              <span style={{ maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{email}</span>
                              <X size={12} />
                            </button>
                          ))}
                        </div>
                      )}
                      <div style={{ display: 'grid', gap: '8px' }}>
                        {filteredIndividualContacts.length > 0 ? filteredIndividualContacts.map((contact) => {
                          const displayName = `${contact.firstName || ''} ${contact.lastName || ''}`.trim();
                          return (
                            <button
                              key={contact.id}
                              type="button"
                              className="btn btn-outline"
                              onClick={() => toggleIndividualRecipient(contact.email)}
                              style={{ justifyContent: 'space-between', textAlign: 'left' }}
                            >
                              <span style={{ display: 'grid', gap: '2px' }}>
                                <span>{displayName || contact.email}</span>
                                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{contact.email}{contact.company ? ` • ${contact.company}` : ''}</span>
                              </span>
                              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Add</span>
                            </button>
                          );
                        }) : (
                          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                            {individualSearch.trim() ? 'No matching contacts found.' : 'Search to add specific contacts to this campaign.'}
                          </div>
                        )}
                      </div>
                    </div>
                    <textarea
                      className="form-textarea"
                      rows={4}
                      placeholder="You can also paste email addresses separated by commas or new lines"
                      value={manualEmails}
                      onChange={(e) => setManualEmails(e.target.value)}
                    />
                    <small className="text-muted">
                      Individual mode stores the exact recipients for this campaign, so it can be saved and sent later without rebuilding the audience.
                    </small>
                  </>
                ) : recipientMode === 'list' ? (
                  <select
                    className="form-select"
                    value={campaign.listId}
                    onChange={(e) => setCampaign({ ...campaign, listId: e.target.value })}
                  >
                    <option value="">All Lists</option>
                    {lists.map(list => (
                      <option key={list.id} value={list.id}>{list.name}</option>
                    ))}
                  </select>
                ) : null}
              </div>

              {/* Tag Filtering */}
              {recipientMode === 'list' && tags.length > 0 && (
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
                    {recipientMode === 'manual'
                      ? 'individual recipients locked for this campaign'
                      : recipientMode === 'all'
                      ? 'all available contacts'
                      : campaign.selectedTags?.length > 0
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
                    value={selectedTemplateId}
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
                    value={selectedTemplateId}
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
                          <span style={{ color: '#f59e0b' }}>!</span> {typeof issue === 'string' ? issue : issue.text || 'Issue detected'}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* AI Generate button — always visible when there's a subject or content */}
              {(campaign.subject || campaign.content) && (
                <div style={{ display: 'flex', gap: '6px', marginTop: '12px' }}>
                  <button className="btn btn-outline btn-sm" onClick={handleAiImproveSubject} disabled={aiLoading} style={{ fontSize: '11px' }}>
                    <Wand2 size={12} /> {aiLoading ? '...' : 'AI Subjects'}
                  </button>
                  <button className="btn btn-outline btn-sm" onClick={() => setShowAiGenerate(!showAiGenerate)} style={{ fontSize: '11px' }}>
                    <Sparkles size={12} /> Generate
                  </button>
                </div>
              )}

              {/* AI Insights Panel — only shows after analysis runs */}
              {(campaign.subject || campaign.content) && aiInsights && (
                <>
                  <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '20px 0' }} />
                  <h4 style={{ fontSize: '14px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Sparkles size={14} style={{ color: 'var(--accent)' }} /> AI Insights
                  </h4>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                    gap: '8px',
                    marginBottom: '12px',
                    overflow: 'hidden'
                  }}>
                    <div style={{ padding: '10px', borderRadius: '10px', background: 'var(--bg-tertiary)', minWidth: 0 }}>
                      <div style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '4px' }}>Recipients</div>
                      <div style={{ fontSize: '16px', fontWeight: 700 }}>{recipientCount.toLocaleString()}</div>
                    </div>
                    <div style={{ padding: '10px', borderRadius: '10px', background: 'var(--bg-tertiary)', minWidth: 0 }}>
                      <div style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '4px' }}>Tone</div>
                      <div style={{ fontSize: '16px', fontWeight: 700, textTransform: 'capitalize', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{aiBrief.tone}</div>
                    </div>
                    <div style={{ padding: '10px', borderRadius: '10px', background: 'var(--bg-tertiary)', minWidth: 0 }}>
                      <div style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '4px' }}>Goal</div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{aiBrief.objective || 'Not set'}</div>
                    </div>
                  </div>

                  {aiInsights.subject && (
                    <div style={{ marginBottom: '10px' }}>
                      <div style={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>Subject</div>
                      {aiInsights.subject.map((insight, i) => (
                        <div key={i} style={{ fontSize: '11px', marginBottom: '3px', color: insight.type === 'success' ? 'var(--success)' : insight.type === 'warning' ? 'var(--warning)' : insight.type === 'tip' ? 'var(--accent)' : 'var(--text-secondary)', display: 'flex', gap: '4px' }}>
                          <span>{insight.type === 'success' ? '✓' : insight.type === 'warning' ? '!' : '→'}</span>
                          <span>{insight.text}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {aiInsights.content && (
                    <div style={{ marginBottom: '10px' }}>
                      <div style={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>Content</div>
                      {aiInsights.content.map((insight, i) => (
                        <div key={i} style={{ fontSize: '11px', marginBottom: '3px', color: insight.type === 'success' ? 'var(--success)' : insight.type === 'warning' ? 'var(--warning)' : insight.type === 'tip' ? 'var(--accent)' : 'var(--text-secondary)', display: 'flex', gap: '4px' }}>
                          <span>{insight.type === 'success' ? '✓' : insight.type === 'warning' ? '!' : insight.type === 'info' ? '•' : '→'}</span>
                          <span>{insight.text}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {aiInsights.sendTime && (
                    <div style={{ marginBottom: '10px' }}>
                      <div style={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>Send Time</div>
                      {aiInsights.sendTime.map((tip, i) => (
                        <div key={i} style={{ fontSize: '11px', marginBottom: '3px', color: 'var(--text-secondary)', display: 'flex', gap: '4px' }}>
                          <span>⏰</span><span>{tip}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                    <button className="btn btn-outline btn-sm" onClick={handleAiImproveSubject} disabled={aiLoading} style={{ fontSize: '11px' }}>
                      <Wand2 size={12} /> {aiLoading ? '...' : 'AI Subjects'}
                    </button>
                  </div>

                  {/* AI Subject Suggestions */}
                  {aiSubjectSuggestions.length > 0 && (
                    <div style={{ marginTop: '8px', padding: '8px', background: 'var(--bg-tertiary)', borderRadius: '6px', fontSize: '12px' }}>
                      <div style={{ fontWeight: 600, marginBottom: '6px', color: 'var(--text)' }}>Suggested Subjects:</div>
                      {aiSubjectSuggestions.map((s, i) => (
                        <button
                          key={i}
                          type="button"
                          className="btn btn-outline btn-sm"
                          onClick={() => { setCampaign(prev => ({ ...prev, subject: s })); addToast('Subject applied', 'success'); }}
                          style={{ width: '100%', justifyContent: 'space-between', marginBottom: '6px', textAlign: 'left' }}
                        >
                          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s}</span>
                          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Apply</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* AI Generate Modal */}
                  {showAiGenerate && (
                    <div style={{ marginTop: '8px', padding: '12px', background: 'var(--bg-tertiary)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '10px' }}>
                        Give AI a real brief so it can generate something closer to send-ready copy.
                      </div>
                      <textarea
                        className="form-textarea"
                        placeholder="Describe the email you want... e.g. Welcome email for new customers with a 20% discount code"
                        value={aiBrief.prompt}
                        onChange={e => setAiBrief(prev => ({ ...prev, prompt: e.target.value }))}
                        rows={3}
                        style={{ fontSize: '12px', marginBottom: '8px' }}
                      />
                      <div className="form-row">
                        <div className="form-group">
                          <label className="form-label">Tone</label>
                          <select className="form-select" value={aiBrief.tone} onChange={e => setAiBrief(prev => ({ ...prev, tone: e.target.value }))}>
                            <option value="professional">Professional</option>
                            <option value="friendly">Friendly</option>
                            <option value="urgent">Urgent</option>
                            <option value="confident">Confident</option>
                            <option value="warm">Warm</option>
                          </select>
                        </div>
                        <div className="form-group">
                          <label className="form-label">Audience</label>
                          <input className="form-input" value={aiBrief.audience} onChange={e => setAiBrief(prev => ({ ...prev, audience: e.target.value }))} placeholder="New leads, customers, subscribers..." />
                        </div>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Objective</label>
                        <input className="form-input" value={aiBrief.objective} onChange={e => setAiBrief(prev => ({ ...prev, objective: e.target.value }))} placeholder="Drive signups, announce a launch, recover carts..." />
                      </div>
                      <div className="form-row">
                        <div className="form-group">
                          <label className="form-label">Offer / Hook</label>
                          <input className="form-input" value={aiBrief.offer} onChange={e => setAiBrief(prev => ({ ...prev, offer: e.target.value }))} placeholder="20% off, early access, free audit..." />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Primary CTA</label>
                          <input className="form-input" value={aiBrief.cta} onChange={e => setAiBrief(prev => ({ ...prev, cta: e.target.value }))} placeholder="Book demo, claim discount, reply now..." />
                        </div>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Brand Voice</label>
                        <input className="form-input" value={aiBrief.brandVoice} onChange={e => setAiBrief(prev => ({ ...prev, brandVoice: e.target.value }))} placeholder="Clear, premium, playful, straight-talking..." />
                      </div>
                      <label className="flex items-center gap-2 text-sm" style={{ marginBottom: '10px', color: 'var(--text-secondary)' }}>
                        <input type="checkbox" checked={aiBrief.includePersonalization} onChange={e => setAiBrief(prev => ({ ...prev, includePersonalization: e.target.checked }))} />
                        Include personalization placeholders when they fit the message
                      </label>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button className="btn btn-primary btn-sm" onClick={handleAiGenerate} disabled={aiLoading} style={{ flex: 1 }}>
                          {aiLoading ? 'Generating...' : 'Generate Email'}
                        </button>
                        <button
                          className="btn btn-outline btn-sm"
                          type="button"
                          onClick={handleOpenInBuilder}
                          style={{ flex: 1 }}
                        >
                          <ExternalLink size={12} /> Send to Builder
                        </button>
                      </div>
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
              <button
                className="tab"
                onClick={() => setShowFullPreview(true)}
                style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Monitor size={14} /> Client Preview
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
              {/* iframe + srcDoc correctly renders full HTML documents including
                  <style> blocks in <head>. dangerouslySetInnerHTML strips them,
                  causing styles not to apply and the content to overflow. */}
              <iframe
                key={campaign.subject + campaign.content.length}
                srcDoc={buildEmailPreviewDocument({
                  subject: campaign.subject || '(No Subject)',
                  content: campaign.content
                    .replace(/\{\{firstName\}\}/gi, 'John')
                    .replace(/\{\{lastName\}\}/gi, 'Doe')
                    .replace(/\{\{fullName\}\}/gi, 'John Doe')
                    .replace(/\{\{email\}\}/gi, 'john@example.com')
                    .replace(/\{\{company\}\}/gi, 'Acme Inc')
                    .replace(/\{\{phone\}\}/gi, '+1234567890')
                    .replace(/\{\{date\}\}/gi, new Date().toLocaleDateString())
                    .replace(/\{\{year\}\}/gi, new Date().getFullYear().toString()),
                  clientLabel: 'Preview',
                  clientStyle: { fontFamily: 'Arial, sans-serif', background: '#f5f5f5', accent: '#1a73e8' }
                })}
                onLoad={handlePreviewIframeLoad}
                style={{
                  width: '100%',
                  minHeight: '300px',
                  height: '300px',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  display: 'block',
                  transition: 'height 0.2s',
                }}
                sandbox="allow-same-origin"
                title="Email Preview"
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
                  <iframe
                    key={'b-' + (campaign.subjectB + (campaign.contentB || campaign.content).length)}
                    srcDoc={buildEmailPreviewDocument({
                      subject: campaign.subjectB || '(No Subject — Variant B)',
                      content: (campaign.contentB || campaign.content)
                        .replace(/\{\{firstName\}\}/gi, 'John')
                        .replace(/\{\{lastName\}\}/gi, 'Doe')
                        .replace(/\{\{fullName\}\}/gi, 'John Doe')
                        .replace(/\{\{email\}\}/gi, 'john@example.com')
                        .replace(/\{\{company\}\}/gi, 'Acme Inc'),
                      clientLabel: 'Variant B Preview',
                      clientStyle: { fontFamily: 'Arial, sans-serif', background: '#f5f0ff', accent: '#a855f7' }
                    })}
                    onLoad={handlePreviewIframeLoad}
                    style={{
                      width: '100%',
                      minHeight: '250px',
                      height: '300px',
                      border: '1px dashed rgba(139,92,246,0.4)',
                      borderRadius: '8px',
                      display: 'block',
                    }}
                    sandbox="allow-same-origin"
                    title="Variant B Preview"
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

      {showFullPreview && (
        <EmailPreview
          subject={campaign.subject}
          content={campaign.content}
          fromName={campaign.fromName || ''}
          fromEmail={campaign.fromEmail || ''}
          onClose={() => setShowFullPreview(false)}
        />
      )}
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
