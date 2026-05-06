import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bot, Loader2, RefreshCw, Radio, SendHorizontal, Sparkles, Trash2, Zap } from 'lucide-react';
import { useNavigation } from './NavigationContext';
import { getPageLabel } from '../config/navigation';

const ACTIVE_CAMPAIGN_STORAGE_KEY = 'bulky_active_campaign_snapshot';
const STORAGE_KEY = 'bulky_sidebar_ai_messages';
const WELCOME_MESSAGE = 'Hi. I can verify contacts, bulk-verify unverified contacts, generate templates, inspect deliverability, and help manage Bulky in real time.';

function readActiveCampaignSnapshot() {
  try {
    const raw = localStorage.getItem(ACTIVE_CAMPAIGN_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function ClarifyOptions({ question, options, onSelect, disabled }) {
  return (
    <div className="sidebar-ai-clarify">
      <div className="sidebar-ai-clarify-q">{question}</div>
      <div className="sidebar-ai-clarify-opts">
        {(options || []).map((option, index) => (
          <button
            key={`${option}-${index}`}
            className="sidebar-ai-clarify-btn"
            onClick={() => !disabled && onSelect(option)}
            disabled={disabled}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

function SidebarAssistant() {
  const { activePage, navigateTo } = useNavigation();
  const [messages, setMessages] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(saved) && saved.length > 0
        ? saved
        : [{ role: 'assistant', text: WELCOME_MESSAGE }];
    } catch {
      return [{ role: 'assistant', text: WELCOME_MESSAGE }];
    }
  });
  const [input, setInput] = useState('');
  const [working, setWorking] = useState(false);
  const [isSlowModel, setIsSlowModel] = useState(false);
  const [appContext, setAppContext] = useState(null);
  const [activeCampaign, setActiveCampaign] = useState(() => readActiveCampaignSnapshot());
  const [pendingClarify, setPendingClarify] = useState(null);
  const messagesRef = useRef(null);
  const abortRef = useRef(false);
  const slowTimerRef = useRef(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-32)));
    } catch {}
  }, [messages]);

  useEffect(() => {
    messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, pendingClarify, working]);

  const refreshContext = useCallback(async () => {
    try {
      const context = await window.electron?.ai?.getAppContext?.();
      if (context && !context.error) setAppContext(context);
    } catch {}
  }, []);

  useEffect(() => {
    refreshContext();
  }, [refreshContext, activePage]);

  useEffect(() => {
    const syncCampaign = () => setActiveCampaign(readActiveCampaignSnapshot());
    syncCampaign();
    window.addEventListener('bulky:active-campaign', syncCampaign);
    window.addEventListener('storage', syncCampaign);
    return () => {
      window.removeEventListener('bulky:active-campaign', syncCampaign);
      window.removeEventListener('storage', syncCampaign);
    };
  }, []);

  useEffect(() => {
    if (!window.electron?.onDataChanged) return undefined;
    return window.electron.onDataChanged(() => refreshContext());
  }, [refreshContext]);

  const pageLabel = useMemo(() => getPageLabel(activePage), [activePage]);

  const appendMessage = useCallback((role, text, extra = {}) => {
    if (!text) return;
    setMessages((prev) => [...prev, { role, text, ...extra }].slice(-32));
  }, []);

  const executeAction = useCallback(async (action) => {
    if (!action?.type) return null;
    const type = action.type;

    if (type === 'navigate') {
      navigateTo(action.to || '/');
      return `Navigated to ${action.to || '/'}.`;
    }
    if (type === 'openSettings') {
      navigateTo('/settings', { tab: action.tab || 'general' });
      return `Opened Settings - ${action.tab || 'general'}.`;
    }
    if (type === 'createCampaign') {
      navigateTo('/composer');
      return 'Opened Composer and prepared a new campaign flow.';
    }
    if (type === 'createTemplate') {
      navigateTo('/templates');
      return 'Opened Templates.';
    }

    const result = await window.electron?.ai?.executeAction?.(action);
    if (!result) return 'The assistant action channel is unavailable right now.';
    if (result.error) return result.error;

    if (type === 'verifyContact' && result.result) {
      const verification = result.result;
      return `Verification complete for ${result.email}: ${String(verification.status || 'unknown').toUpperCase()} (score ${verification.score ?? '?'}/100)${verification.reason ? ` - ${verification.reason}` : ''}.`;
    }

    if (type === 'verifyAllUnverified' && result.summary) {
      navigateTo('/verify');
      return `Bulk verification finished for ${result.summary.completed || 0} contacts: ${result.summary.valid || 0} valid, ${result.summary.risky || 0} risky, ${result.summary.invalid || 0} invalid.`;
    }

    if (type === 'searchContacts' && Array.isArray(result.contacts)) {
      if (result.contacts.length === 0) return 'No contacts matched that search.';
      return `Found ${result.count || result.contacts.length} contact(s):\n${result.contacts.slice(0, 8).map((contact) => `${contact.firstName || ''} ${contact.lastName || ''} <${contact.email}> (${contact.verificationStatus || 'unverified'})`).join('\n')}`;
    }

    if (type === 'getContactDetails' && result.contact) {
      const contact = result.contact.contact || result.contact;
      return `${contact.firstName || ''} ${contact.lastName || ''} | ${contact.email} | Status: ${contact.verificationStatus || 'unverified'} | Company: ${contact.company || '-'} | Tags: ${(contact.tags || []).join(', ') || 'none'}`;
    }

    if (type === 'getUnverifiedContacts' && Array.isArray(result.contacts)) {
      if (result.contacts.length === 0) return 'No unverified contacts found.';
      const preview = result.contacts.slice(0, 6).map((contact) => contact.email).join(', ');
      return `${result.count || result.contacts.length} unverified: ${preview}${result.contacts.length > 6 ? '...' : ''}`;
    }

    if ((type === 'getDeliverabilitySnapshot' || type === 'runDeliverabilityTest') && result.snapshot) {
      const snapshot = result.snapshot;
      const warnings = Array.isArray(snapshot.warnings) && snapshot.warnings.length > 0
        ? ` Warnings: ${snapshot.warnings.join(' ')}`
        : '';
      return `Deliverability: ${snapshot.activeSmtp || 0} active SMTP accounts, ${snapshot.totalSent || 0} total sent, ${snapshot.totalBounced || 0} bounced, ${snapshot.bounceRate || 0}% bounce rate, score ${snapshot.deliverabilityScore || 0}/100.${warnings}`;
    }

    if (type === 'getRecentCampaigns' && Array.isArray(result.campaigns)) {
      if (result.campaigns.length === 0) return 'No campaigns found.';
      return result.campaigns.map((campaign) => `"${campaign.name}" - ${campaign.status}, ${campaign.sent || 0} sent, ${campaign.openRate || 0}% open`).join('\n');
    }

    if (type === 'getCampaignStats' && result.stats) {
      const stats = result.stats;
      return `Campaign "${stats.name}": ${stats.sent || 0} sent, ${stats.opens || 0} opens (${stats.openRate || 0}%), ${stats.clicks || 0} clicks (${stats.clickRate || 0}%), ${stats.bounceRate || 0}% bounce rate.`;
    }

    if (type === 'checkDomainHealth' && result.health) {
      const health = result.health;
      return `${result.domain} - SPF ${health.spf?.found ? 'configured' : 'missing'}, DKIM ${health.dkim?.found ? `found (${health.dkim.selector})` : 'missing'}, DMARC ${health.dmarc?.found ? 'configured' : 'missing'}, MX ${health.mx?.found ? 'configured' : 'missing'}.`;
    }

    if (type === 'generateTemplate' && result.success) {
      navigateTo('/templates');
      return `Template "${result.name}" created as ${result.type === 'blocks' ? 'drag-and-drop blocks' : 'responsive HTML'} and saved.`;
    }

    if (type === 'remember' && result.success) return `Remembered "${result.key}".`;
    if (type === 'recall' && result.success) return `${result.key}: ${result.value}`;
    if (type === 'createList' && result.success) return `List "${result.name}" created.`;
    if (type === 'deleteContact' && result.success) return 'Contact deleted.';
    if (type === 'tagContact' && result.success) return `Tag "${result.tag}" added to ${result.email}.`;
    if (type === 'addContactToList' && result.success) return `Added ${result.email} to list "${result.list}".`;

    return result.message || 'Action completed.';
  }, [navigateTo]);

  const dispatchMessage = useCallback(async (userText, isClarifyAnswer = false) => {
    if (!userText || working) return;
    abortRef.current = false;

    let messageToSend = userText;
    if (isClarifyAnswer && pendingClarify) {
      const answers = Object.entries({
        ...(pendingClarify.collectedAnswers || {}),
        [pendingClarify.question]: userText
      }).map(([question, answer]) => `${question}: ${answer}`).join('; ');
      messageToSend = `${pendingClarify.originalMessage}. User choices: ${answers}`;
    }

    setMessages((prev) => [...prev, { role: 'user', text: userText }].slice(-32));
    setInput('');
    setWorking(true);
    setPendingClarify(null);
    slowTimerRef.current = setTimeout(() => setIsSlowModel(true), 8000);

    try {
      const response = await window.electron?.ai?.chat?.({
        message: messageToSend,
        history: messages,
        context: { ...(appContext || {}), currentPage: pageLabel, activeCampaign },
        currentPage: pageLabel,
        activeCampaign
      });

      if (abortRef.current) return;

      if (!response || response.error) {
        appendMessage('assistant', response?.error || 'The AI could not respond right now.');
        return;
      }

      if (response.clarify) {
        if (response.reply) appendMessage('assistant', response.reply);
        setPendingClarify({
          question: response.clarify.question,
          options: response.clarify.options || [],
          originalMessage: isClarifyAnswer && pendingClarify ? pendingClarify.originalMessage : userText,
          collectedAnswers: pendingClarify?.collectedAnswers || {}
        });
        return;
      }

      if (response.reply) appendMessage('assistant', response.reply);

      if (response.action) {
        const actionResult = await executeAction(response.action);
        if (actionResult) {
          appendMessage('assistant', actionResult);
          await refreshContext();
        }
      }
    } catch (error) {
      if (!abortRef.current) appendMessage('assistant', error.message || 'Unexpected error.');
    } finally {
      clearTimeout(slowTimerRef.current);
      setIsSlowModel(false);
      setWorking(false);
      refreshContext();
    }
  }, [working, pendingClarify, messages, appContext, pageLabel, activeCampaign, appendMessage, executeAction, refreshContext]);

  const sendMessage = useCallback(() => {
    const trimmed = input.trim();
    if (trimmed) dispatchMessage(trimmed, false);
  }, [input, dispatchMessage]);

  const clearHistory = useCallback(() => {
    setMessages([{ role: 'assistant', text: WELCOME_MESSAGE }]);
    setPendingClarify(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
  }, []);

  return (
    <div className="sidebar-ai-widget">
      <div className="sidebar-ai-header">
        <Bot size={14} style={{ color: 'var(--accent)' }} />
        <span className="sidebar-ai-title">Bulky AI</span>
        <span className="sidebar-ai-badge">{appContext?.smtpActive || 0} SMTP</span>
        <button
          onClick={clearHistory}
          title="Clear chat"
          style={{ marginLeft: '4px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: '2px' }}
        >
          <Trash2 size={11} />
        </button>
        <button
          onClick={refreshContext}
          title="Refresh context"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: '2px' }}
        >
          <RefreshCw size={11} />
        </button>
      </div>

      <div className="sidebar-ai-context">
        <div className="sidebar-ai-context-row">
          <Radio size={12} />
          <span>{pageLabel}</span>
        </div>
        <div className="sidebar-ai-context-row">
          <Sparkles size={12} />
          <span>{(appContext?.contacts || 0).toLocaleString()} contacts | {appContext?.campaigns || 0} campaigns</span>
        </div>
        {activeCampaign && (
          <div className="sidebar-ai-context-row accent">
            <Zap size={12} />
            <span>{activeCampaign.name}: {activeCampaign.sent || 0}/{activeCampaign.total || 0}</span>
          </div>
        )}
      </div>

      <div ref={messagesRef} className="sidebar-ai-messages">
        {messages.map((message, index) => (
          <div key={`${message.role}-${index}`} className={`sidebar-ai-bubble-wrap ${message.role}`}>
            <div className={`sidebar-ai-bubble ${message.role}`}>{message.text}</div>
          </div>
        ))}

        {pendingClarify && !working && (
          <ClarifyOptions
            question={pendingClarify.question}
            options={pendingClarify.options}
            onSelect={(answer) => dispatchMessage(answer, true)}
            disabled={working}
          />
        )}

        {working && (
          <div className="sidebar-ai-bubble-wrap assistant">
            <div className="sidebar-ai-bubble assistant sidebar-ai-thinking">
              <Loader2 size={12} className="sidebar-ai-spin" />
              <span>{isSlowModel ? 'Processing. Local models can take 30 to 90 seconds...' : 'Thinking...'}</span>
            </div>
          </div>
        )}
      </div>

      <div className="sidebar-ai-input-row">
        <input
          className="sidebar-ai-input"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              sendMessage();
            }
          }}
          placeholder={pendingClarify ? 'Or type a custom answer...' : 'Ask Bulky AI to act...'}
          disabled={working}
        />
        <button
          className={`sidebar-ai-send${working ? ' cancel' : ''}`}
          onClick={working ? () => { abortRef.current = true; setWorking(false); } : sendMessage}
          title={working ? 'Cancel' : 'Send'}
        >
          {working ? 'X' : <SendHorizontal size={13} />}
        </button>
      </div>
    </div>
  );
}

export default SidebarAssistant;
