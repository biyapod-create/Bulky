import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Edit3 } from 'lucide-react';
import { useToast } from '../components/ToastContext';
import { useNavigation } from '../components/NavigationContext';
import ComposerHeader from '../features/composer/ComposerHeader';
import ComposerSettingsPanel from '../features/composer/ComposerSettingsPanel';
import ComposerEditorPanel from '../features/composer/ComposerEditorPanel';
const { evaluateContentReadiness } = require('../utils/contentReadiness');

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
  const [aiInsights, setAiInsights] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSubjectSuggestions, setAiSubjectSuggestions] = useState([]);
  const [showAiGenerate, setShowAiGenerate] = useState(false);
  const [deliverabilityInfo, setDeliverabilityInfo] = useState({});
  const [smtpAccounts, setSmtpAccounts] = useState([]);
  const [smtpSettings, setSmtpSettings] = useState({});
  const [smtpHealth, setSmtpHealth] = useState([]);
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
        const [templatesData, listsData, tagsData, contactsData, deliverabilityData, smtpAccountsData, smtpSettingsData, dashboardData] = await Promise.all([
          window.electron.templates.getAll(),
          window.electron.lists.getAll(),
          window.electron.tags.getAll(),
          window.electron.contacts.getAll(),
          window.electron.settings?.getDeliverability?.() || Promise.resolve({}),
          window.electron.smtpAccounts?.getAll?.() || Promise.resolve([]),
          window.electron.smtp?.get?.() || Promise.resolve({}),
          window.electron.stats?.getDashboard?.() || Promise.resolve({})
        ]);
        setTemplates(Array.isArray(templatesData) ? templatesData : []);
        setLists(Array.isArray(listsData) ? listsData : []);
        setTags(Array.isArray(tagsData) ? tagsData : []);
        setContactsCatalog(Array.isArray(contactsData) ? contactsData : []);
        setDeliverabilityInfo(deliverabilityData || {});
        setSmtpAccounts(Array.isArray(smtpAccountsData) ? smtpAccountsData : []);
        setSmtpSettings(smtpSettingsData || {});
        setSmtpHealth(Array.isArray(dashboardData?.smtpHealth) ? dashboardData.smtpHealth : []);
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

  const contentReadiness = useMemo(() => evaluateContentReadiness({
    subject: campaign.subject,
    content: campaign.content,
    spamScore,
    recipientBreakdown,
    deliverabilityInfo,
    smtpAccounts,
    smtpSettings,
    smtpHealth
  }), [
    campaign.subject,
    campaign.content,
    spamScore,
    recipientBreakdown,
    deliverabilityInfo,
    smtpAccounts,
    smtpSettings,
    smtpHealth
  ]);

  const activeSmtpCount = useMemo(
    () => (smtpAccounts || []).filter((account) => account.isActive !== false).length,
    [smtpAccounts]
  );

  const readinessTone = contentReadiness.blockers.length > 0
    ? 'error'
    : contentReadiness.warnings.length > 0
      ? 'warning'
      : 'success';

  const readinessLabel = contentReadiness.blockers.length > 0
    ? 'Blocked'
    : contentReadiness.warnings.length > 0
      ? 'Needs review'
      : 'Ready';

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

  const applySuggestedSubject = useCallback((subject) => {
    setCampaign((prev) => ({ ...prev, subject }));
    addToast('Subject applied', 'success');
  }, [addToast]);

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
    <div className="page-container page-composer">
      <ComposerHeader
        handleOpenInBuilder={handleOpenInBuilder}
        handleSaveAsTemplate={handleSaveAsTemplate}
        handleSaveCampaign={handleSaveCampaign}
        recipientCount={recipientCount}
        recipientMode={recipientMode}
        activeSmtpCount={activeSmtpCount}
        smtpAccountsCount={smtpAccounts.length}
        spamScore={spamScore}
        readinessTone={readinessTone}
        readinessLabel={readinessLabel}
      />

      <div className="composer-grid bulky-composer-shell" style={{ gridTemplateColumns: settingsCollapsed ? '52px 1fr' : '340px 1fr' }}>
        <ComposerSettingsPanel
          settingsCollapsed={settingsCollapsed}
          setSettingsCollapsed={setSettingsCollapsed}
          campaign={campaign}
          setCampaign={setCampaign}
          recipientMode={recipientMode}
          setRecipientMode={setRecipientMode}
          individualSearch={individualSearch}
          setIndividualSearch={setIndividualSearch}
          selectedManualEmails={selectedManualEmails}
          filteredIndividualContacts={filteredIndividualContacts}
          toggleIndividualRecipient={toggleIndividualRecipient}
          removeIndividualRecipient={removeIndividualRecipient}
          manualEmails={manualEmails}
          setManualEmails={setManualEmails}
          lists={lists}
          tags={tags}
          toggleTag={toggleTag}
          recipientCount={recipientCount}
          recipientBreakdown={recipientBreakdown}
          contentReadiness={contentReadiness}
          templateCategories={templateCategories}
          selectedTemplateId={selectedTemplateId}
          handleLoadTemplate={handleLoadTemplate}
          templates={templates}
          isABTest={isABTest}
          setIsABTest={setIsABTest}
          showTokenPicker={showTokenPicker}
          setShowTokenPicker={setShowTokenPicker}
          tokenPickerRef={tokenPickerRef}
          personalizationTokens={personalizationTokens}
          insertToken={insertToken}
          spamScore={spamScore}
          getScoreColor={getScoreColor}
          getScoreBarColor={getScoreBarColor}
          aiLoading={aiLoading}
          handleAiImproveSubject={handleAiImproveSubject}
          showAiGenerate={showAiGenerate}
          setShowAiGenerate={setShowAiGenerate}
          aiInsights={aiInsights}
          aiBrief={aiBrief}
          setAiBrief={setAiBrief}
          handleAiGenerate={handleAiGenerate}
          handleOpenInBuilder={handleOpenInBuilder}
          aiSubjectSuggestions={aiSubjectSuggestions}
          applySuggestedSubject={applySuggestedSubject}
          campaignSubjectOrContentExists={Boolean(campaign.subject || campaign.content)}
        />

        <ComposerEditorPanel
          viewMode={viewMode}
          setViewMode={setViewMode}
          isABTest={isABTest}
          campaign={campaign}
          setCampaign={setCampaign}
          setActiveSubjectField={setActiveSubjectField}
          setShowTokenPicker={setShowTokenPicker}
          handlePreviewIframeLoad={handlePreviewIframeLoad}
        />
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
