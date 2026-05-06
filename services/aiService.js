// AI Service - OpenRouter & LM Studio (local) support
// v7.0 - Dynamic function discovery with universal tool calling
const https = require('https');
const http  = require('http');
const FunctionRegistry = require('./functionRegistry');

const OPENROUTER_MODELS = [
  { id: 'meta-llama/llama-3.1-8b-instruct:free', label: 'Llama 3.1 8B (Free)', tier: 'free' },
  { id: 'mistralai/mistral-7b-instruct:free',     label: 'Mistral 7B (Free)',   tier: 'free' },
  { id: 'google/gemma-2-9b-it:free',              label: 'Gemma 2 9B (Free)',   tier: 'free' },
  { id: 'openai/gpt-4o',                          label: 'GPT-4o',              tier: 'paid' },
  { id: 'openai/gpt-4o-mini',                     label: 'GPT-4o Mini',         tier: 'paid' },
  { id: 'openai/gpt-4-turbo',                     label: 'GPT-4 Turbo',         tier: 'paid' },
  { id: 'openai/o1',                              label: 'OpenAI o1',           tier: 'paid' },
  { id: 'openai/o3-mini',                         label: 'OpenAI o3 Mini',      tier: 'paid' },
  { id: 'anthropic/claude-3.5-sonnet',            label: 'Claude 3.5 Sonnet',   tier: 'paid' },
  { id: 'anthropic/claude-3.5-haiku',             label: 'Claude 3.5 Haiku',    tier: 'paid' },
  { id: 'anthropic/claude-3-opus',                label: 'Claude 3 Opus',       tier: 'paid' },
  { id: 'google/gemini-2.0-flash-001',            label: 'Gemini 2.0 Flash',    tier: 'paid' },
  { id: 'google/gemini-pro-1.5',                  label: 'Gemini 1.5 Pro',      tier: 'paid' },
  { id: 'mistralai/mistral-large',                label: 'Mistral Large',       tier: 'paid' },
  { id: 'meta-llama/llama-3.3-70b-instruct',      label: 'Llama 3.3 70B',      tier: 'paid' },
  { id: 'deepseek/deepseek-chat',                 label: 'DeepSeek V3',         tier: 'paid' },
  { id: 'deepseek/deepseek-r1',                   label: 'DeepSeek R1',         tier: 'paid' },
  { id: 'x-ai/grok-3-mini-beta',                  label: 'Grok 3 Mini',         tier: 'paid' }
];

class AIService {
  constructor() {
    this.apiKey          = '';
    this.model           = '';
    this.provider        = 'openrouter';
    this.lmstudioBaseUrl = 'http://localhost:1234/v1';
    this.functionRegistry = new FunctionRegistry();
    this.functionRegistry.initialize();
  }

  static getAvailableModels() { return OPENROUTER_MODELS; }
  getAvailableModels()        { return OPENROUTER_MODELS; }

  setApiKey(key)        { this.apiKey = key; }
  setModel(model)       { this.model  = model; }
  setProvider(provider) { this.provider = (provider === 'lmstudio') ? 'lmstudio' : 'openrouter'; }
  setLmstudioBaseUrl(url) {
    if (url && typeof url === 'string' && url.trim()) {
      this.lmstudioBaseUrl = url.trim().replace(/\/+$/, '');
    }
  }

  // ── HTTP helper ─────────────────────────────────────────────────────────────
  _doRequest(urlString, method, body, extraHeaders = {}, timeoutMs = 60000) {
    return new Promise((resolve) => {
      let settled = false;
      const settle = (val) => { if (!settled) { settled = true; clearTimeout(wallClock); resolve(val); } };

      const wallClock = setTimeout(() => {
        req.destroy();
        settle({ error: `Request timed out after ${Math.round(timeoutMs / 1000)}s` });
      }, timeoutMs);

      let parsed;
      try { parsed = new URL(urlString); }
      catch { return settle({ error: `Invalid URL: ${urlString}` }); }

      const isHttps   = parsed.protocol === 'https:';
      const transport = isHttps ? https : http;
      const headers   = { 'Content-Type': 'application/json', ...extraHeaders };
      if (body) headers['Content-Length'] = Buffer.byteLength(body);

      const options = {
        hostname: parsed.hostname,
        port: parsed.port ? parseInt(parsed.port, 10) : (isHttps ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method, headers
      };

      const req = transport.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end',  () => {
          try   { settle({ statusCode: res.statusCode, body: JSON.parse(data) }); }
          catch { settle({ statusCode: res.statusCode, body: null, raw: data }); }
        });
        res.on('error', (err) => settle({ error: `Response error: ${err.message}` }));
      });

      req.on('error', (err) => settle({ error: `Connection failed: ${err.message}` }));
      if (body) req.write(body);
      req.end();
    });
  }

  // ── Core API call ────────────────────────────────────────────────────────────
  async _callApi(messages, maxTokens = 500, timeoutMs = 60000) {
    // LM Studio on local hardware is often very slow (20-120s per response).
    // Hard-cap tokens for local provider to prevent multi-minute hangs.
    const effectiveMaxTokens = (this.provider === 'lmstudio')
      ? Math.min(maxTokens, 400)
      : maxTokens;

    const payload = JSON.stringify({
      model: this.model,
      messages,
      max_tokens: effectiveMaxTokens,
      temperature: 0.7,
      stream: false
    });

    let endpoint, extraHeaders;
    if (this.provider === 'lmstudio') {
      if (!this.model) return { error: 'No model selected. Go to Settings → AI to pick a model.' };
      const base   = (this.lmstudioBaseUrl || 'http://localhost:1234/v1').replace(/\/chat\/completions$/, '');
      endpoint     = `${base}/chat/completions`;
      extraHeaders = {};
    } else {
      if (!this.apiKey) return { error: 'OpenRouter API key not configured. Go to Settings → AI.' };
      endpoint     = 'https://openrouter.ai/api/v1/chat/completions';
      extraHeaders = {
        Authorization: `Bearer ${this.apiKey}`,
        'HTTP-Referer': 'https://bulky-email.app',
        'X-Title':      'Bulky Email Sender'
      };
    }

    const res = await this._doRequest(endpoint, 'POST', payload, extraHeaders, timeoutMs);
    if (res.error) {
      return {
        error: this.provider === 'lmstudio'
          ? `LM Studio: ${res.error}. Make sure LM Studio is running and a model is loaded.`
          : res.error
      };
    }

    if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
      const apiError = res.body?.error?.message
        || res.body?.error
        || res.raw
        || `HTTP ${res.statusCode}`;
      return {
        error: this.provider === 'lmstudio'
          ? `LM Studio: ${apiError}`
          : `AI request failed: ${apiError}`
      };
    }

    const data = res.body;
    if (!data)        return { error: 'Empty response from AI server' };
    if (data.error)   return { error: typeof data.error === 'object' ? (data.error.message || JSON.stringify(data.error)) : String(data.error) };

    const content = data.choices?.[0]?.message?.content || '';
    return { result: content, model: data.model, usage: data.usage };
  }

  stripCodeFences(text) {
    return String(text || '').trim().replace(/```json?\s*/gi, '').replace(/```\s*/g, '').trim();
  }

  extractJsonSnippet(text, preferred = 'object') {
    const cleaned = this.stripCodeFences(text);
    if (!cleaned) return '';

    const patterns = preferred === 'array'
      ? [/\[[\s\S]*\]/, /\{[\s\S]*\}/]
      : preferred === 'object'
        ? [/\{[\s\S]*\}/, /\[[\s\S]*\]/]
        : [/\{[\s\S]*\}/, /\[[\s\S]*\]/];

    for (const pattern of patterns) {
      const match = cleaned.match(pattern);
      if (match) return match[0];
    }

    return cleaned;
  }

  parseJsonResponse(text, preferred = 'object') {
    const snippet = this.extractJsonSnippet(text, preferred);
    return JSON.parse(snippet);
  }

  // ── LM Studio model list ─────────────────────────────────────────────────
  async getLMStudioModels() {
    const base     = (this.lmstudioBaseUrl || 'http://localhost:1234/v1').replace(/\/models$/, '');
    const endpoint = `${base}/models`;
    const res = await this._doRequest(endpoint, 'GET', null, {}, 10000);
    if (res.error) return { error: `LM Studio connection failed: ${res.error}` };
    const data = res.body;
    if (!data)       return { error: 'No response from LM Studio.' };
    if (data.error)  return { error: `LM Studio error: ${typeof data.error === 'object' ? data.error.message : data.error}` };
    const models = Array.isArray(data.data) ? data.data.map((m) => ({ id: m.id, label: m.id })) : [];
    return { models };
  }

  // ── Normalise generation request ─────────────────────────────────────────
  normalizeGenerationRequest(input, tone = 'professional') {
    if (typeof input === 'string') {
      return { prompt: input, tone, objective: '', audience: '', cta: '', offer: '',
               brandVoice: '', format: 'campaign', keywords: [], includePersonalization: true };
    }
    const p = input || {};
    return {
      prompt:  String(p.prompt  || '').trim(),
      tone:    String(p.tone    || tone  || 'professional').trim() || 'professional',
      objective:  String(p.objective  || '').trim(),
      audience:   String(p.audience   || '').trim(),
      cta:        String(p.cta        || '').trim(),
      offer:      String(p.offer      || '').trim(),
      brandVoice: String(p.brandVoice || '').trim(),
      format:     String(p.format     || 'campaign').trim() || 'campaign',
      keywords:   Array.isArray(p.keywords) ? p.keywords.map((k) => String(k || '').trim()).filter(Boolean) : [],
      includePersonalization: p.includePersonalization !== false
    };
  }

  buildGenerationBrief(options) {
    const lines = [
      `Core request: ${options.prompt}`,
      `Format: ${options.format || 'campaign'}`,
      `Tone: ${options.tone || 'professional'}`
    ];
    if (options.objective)    lines.push(`Primary objective: ${options.objective}`);
    if (options.audience)     lines.push(`Audience: ${options.audience}`);
    if (options.offer)        lines.push(`Offer or key message: ${options.offer}`);
    if (options.cta)          lines.push(`Call to action: ${options.cta}`);
    if (options.brandVoice)   lines.push(`Brand voice: ${options.brandVoice}`);
    if (options.keywords?.length) lines.push(`Keywords: ${options.keywords.join(', ')}`);
    lines.push(`Personalization: ${options.includePersonalization ? 'Use {{firstName}}, {{company}} etc. where helpful.' : 'No personalization tokens.'}`);
    return lines.join('\n');
  }

  // ── AI Features ──────────────────────────────────────────────────────────
  async improveSubject(subject, context = '') {
    const messages = [
      { role: 'system', content: 'You are an email marketing expert. Generate 5 improved subject line variations. Return ONLY a JSON array of strings. No explanation, no markdown.' },
      { role: 'user',   content: `Improve this subject line for better open rates:\n\nOriginal: "${subject}"${context ? `\nContext: ${context}` : ''}\n\nReturn exactly 5 variations as a JSON array.` }
    ];
    const response = await this._callApi(messages, 300, 15000);
    if (response.error) return response;
    try {
      const suggestions = this.parseJsonResponse(response.result, 'array');
      return { suggestions: Array.isArray(suggestions) ? suggestions : [String(response.result || '').trim()] };
    } catch {
      const lines = response.result.split('\n').filter((l) => l.trim())
        .map((l) => l.replace(/^\d+[\.\)]\s*/, '').replace(/^["']|["']$/g, '').trim());
      return { suggestions: lines.slice(0, 5) };
    }
  }

  async analyzeContent(subject, content) {
    const plainText = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 1000);
    const messages = [
      { role: 'system', content: 'You are an email marketing expert. Return ONLY valid JSON: {"score":0-100,"strengths":["..."],"improvements":["..."],"spam_risk":"low|medium|high","tone":"professional|casual|urgent|friendly"}' },
      { role: 'user',   content: `Analyze:\nSubject: "${subject}"\nContent: "${plainText}"\n\nReturn JSON only.` }
    ];
    const response = await this._callApi(messages, 400, 15000);
    if (response.error) return response;
    try {
      return { analysis: this.parseJsonResponse(response.result, 'object') };
    } catch {
      return { analysis: { score: 0, strengths: [], improvements: [response.result], spam_risk: 'unknown', tone: 'unknown' } };
    }
  }

  async generateContent(input, tone = 'professional') {
    const options = this.normalizeGenerationRequest(input, tone);
    const brief   = this.buildGenerationBrief(options);
    const messages = [
      {
        role: 'system',
        content: [
          'You are an expert lifecycle email strategist and copywriter.',
          'Write one high-performing email in responsive HTML with inline styles that works in Gmail, Outlook, and Apple Mail.',
          `Use a ${options.tone} tone.`,
          'Return ONLY valid JSON: {"subject":"...","preheader":"...","html":"<html>...</html>","cta":"..."}',
          'The HTML must include headline, concise body, one CTA, and unsubscribe mention.',
          'Use table-safe email markup, mobile-friendly widths, no external CSS or scripts.',
          'Design: premium, modern, balanced spacing, polished button styling.'
        ].join(' ')
      },
      { role: 'user', content: brief }
    ];
    const genTimeout = this.provider === 'lmstudio' ? 300000 : 60000;
    const response  = await this._callApi(messages, 1200, genTimeout);
    if (response.error) return response;
    try {
      return this.parseJsonResponse(response.result, 'object');
    } catch {
      return { error: 'AI returned an invalid response. Try a different model or refine your prompt.' };
    }
  }

  async generateTemplateBlocks(input, tone = 'professional') {
    const options      = this.normalizeGenerationRequest(input, tone);
    const systemPrompt = `You are an email template designer. Generate a structured email template as a JSON array of blocks for a drag-and-drop email builder.
Each block: { "type": "<blockType>", "data": { ...blockData } }
Block types: header, text, image, button, divider, spacer, social, footer.
Start with header, end with footer (unsubscribeUrl: "{{unsubscribeLink}}"). Use 4-8 blocks. Return ONLY the JSON array.`;
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: `Create a ${options.tone} email template for:\n${this.buildGenerationBrief(options)}\n\nReturn ONLY the JSON array of blocks.` }
    ];
    const blocksTimeout = this.provider === 'lmstudio' ? 300000 : 60000;
    const response      = await this._callApi(messages, 1500, blocksTimeout);
    if (response.error) return response;
    try {
      const blocks = this.parseJsonResponse(response.result, 'array');
      if (!Array.isArray(blocks)) throw new Error('Not an array');
      return { blocks: blocks.map((b) => ({ ...b, id: Math.random().toString(36).slice(2, 10), data: b.data || {} })) };
    } catch (error) {
      return { error: 'Failed to parse template blocks: ' + error.message };
    }
  }

  // ── Dynamic Chat with full CRUD action schema ─────────────────────────────
  async chat(userMessage, history = [], appContext = null) {
    const contextLines = [];
    if (appContext) {
      if (appContext.contacts    !== undefined) contextLines.push(`Total contacts: ${appContext.contacts}`);
      if (appContext.verified    !== undefined) contextLines.push(`Verified contacts: ${appContext.verified}`);
      if (appContext.unverifiedContacts !== undefined) contextLines.push(`Unverified contacts needing verification: ${appContext.unverifiedContacts}`);
      if (appContext.lists       !== undefined) contextLines.push(`Contact lists: ${appContext.lists}`);
      if (appContext.campaigns   !== undefined) contextLines.push(`Total campaigns: ${appContext.campaigns}`);
      if (appContext.templates   !== undefined) contextLines.push(`Saved templates: ${appContext.templates}`);
      if (appContext.smtpAccounts !== undefined) contextLines.push(`SMTP accounts: ${appContext.smtpAccounts} (${appContext.smtpActive || 0} active)`);
      if (appContext.activeCampaign) contextLines.push(`Active campaign: "${appContext.activeCampaign.name}" — ${appContext.activeCampaign.sent}/${appContext.activeCampaign.total} sent`);
      if (appContext.recentCampaigns?.length) {
        contextLines.push(`Recent campaigns: ${appContext.recentCampaigns.map(c => `"${c.name}" (${c.status}, ${c.sent || 0} sent, ${c.openRate || 0}% open)`).join('; ')}`);
      }
      if (appContext.recentContacts?.length) {
        contextLines.push(`Recently added contacts: ${appContext.recentContacts.map(c => `${c.email} (${c.verificationStatus || 'unverified'})`).join(', ')}`);
      }
      if (appContext.memories) contextLines.push(`My memories:\n${appContext.memories}`);
      if (appContext.currentPage) contextLines.push(`User is on: "${appContext.currentPage}" page`);
      if (appContext.domainHealth) contextLines.push(`Domain health: SPF=${appContext.domainHealth.spf}, DKIM=${appContext.domainHealth.dkim}, DMARC=${appContext.domainHealth.dmarc}`);
      if (appContext.bounceRate !== undefined) contextLines.push(`Recent bounce rate: ${appContext.bounceRate}%`);
    }

    // Get dynamic function descriptions from registry
    const dynamicFunctions = this.functionRegistry.getAIDescription();
    const capabilitiesSummary = this.functionRegistry.getCapabilitiesSummary();

    const systemPrompt = [
      'You are Bulky AI, the built-in intelligent assistant for Bulky Email Sender.',
      'Bulky is a professional desktop bulk email marketing application with: contact management, campaigns, templates, SMTP rotation, email verification, spam checking, automations, drip sequences, signup forms, inbox placement, tracking, and analytics.',
      contextLines.length ? `\nLIVE APP STATE:\n${contextLines.join('\n')}` : '',
      '',
      '=== CAPABILITIES ===',
      `You have access to ${capabilitiesSummary}.`,
      '',
      dynamicFunctions,
      '',
      '=== HOW TO PERFORM ACTIONS ===',
      'To perform any action, append ONE action block at the very END of your reply:',
      '||ACTION:{ ...json... }||',
      '',
      'For any function in the registry above, use this format:',
      '||ACTION:{"type":"callFunction","function":"function:name","params":{"param1":"value1"}}||',
      '',
      '=== LEGACY SHORTCUT ACTIONS ===',
      'You can still use these shorthand actions for common operations:',
      '||ACTION:{"type":"navigate","to":"/campaigns"}||  (pages: /, /campaigns, /composer, /contacts, /verify, /templates, /spam-checker, /inbox-placement, /blacklist, /automations, /drip, /signup-forms, /settings)',
      '||ACTION:{"type":"openSettings","tab":"smtp"}||  (tabs: smtp, ai, general, deliverability, warmup, backup, seed)',
      '||ACTION:{"type":"verifyContact","email":"user@example.com"}||  — verify a specific email address',
      '||ACTION:{"type":"verifyAllUnverified"}||  — start bulk verification of all unverified contacts',
      '||ACTION:{"type":"searchContacts","query":"john"}||  — search contacts by name/email',
      '||ACTION:{"type":"generateTemplate","prompt":"...","format":"html","tone":"professional"}||  — generate a template',
      '||ACTION:{"type":"remember","key":"key","value":"value"}||  — save a memory',
      '||ACTION:{"type":"recall","key":"key"}||  — recall a saved memory',
      '',
      '=== CLARIFICATION FLOW ===',
      'When the user asks you to create a template, you MUST ask clarifying questions before generating.',
      'Ask: (1) Format — HTML email or drag-and-drop blocks? (2) Tone — professional, casual, urgent, friendly, bold? (3) Audience — who is it for? (4) Goal — what action should the reader take? (5) Visual direction — minimal, premium, editorial, bold, or product-focused?',
      'Do NOT generate a template without these answers. Use a CLARIFY block to ask:',
      '||CLARIFY:{"question":"What format do you want?","options":["HTML email","Drag-and-drop blocks"]}||',
      '',
      '=== RULES ===',
      '1. Only include ONE action or clarify block per response.',
      '2. If an action could be destructive (marked with ⚠️), briefly describe what will happen and ask for confirmation first.',
      '3. For verifyContact: tell the user you are running a live SMTP + DNS verification.',
      '4. For generateTemplate: confirm the details back to the user BEFORE generating.',
      '5. Keep conversational replies under 100 words. Plain text only — no markdown, no asterisks.',
      '6. Be specific and practical. Reference actual live data from the context above when answering.',
      '7. If history contains a CLARIFY answer, use it to fulfil the original request.',
      '8. When unsure which function to use, search the function registry by describing what you want to do.',
    ].filter(Boolean).join('\n');

    const chatMaxTokens = this.provider === 'lmstudio' ? 200 : 500;
    const chatTimeout   = this.provider === 'lmstudio' ? 120000 : 60000;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.slice(-16)
        .filter(h => h && (h.text || h.content || h.message))
        .map(h => ({
          role:    ['user', 'assistant', 'system'].includes(h.role) ? h.role : 'user',
          content: String(h.text || h.content || h.message || '').trim()
        })),
      { role: 'user', content: String(userMessage || '').trim() }
    ];

    const res = await this._callApi(messages, chatMaxTokens, chatTimeout);
    if (res.error) return { error: res.error };

    const raw = (res.result || '').trim();

    // Parse ACTION block — handles nested JSON with arrays/objects
    const actionMatch = raw.match(/\|\|ACTION:(\{[\s\S]*?\})\|\|/);
    let action  = null;
    let reply   = raw;
    if (actionMatch) {
      try   { action = this.parseJsonResponse(actionMatch[1], 'object'); }
      catch { /* ignore malformed */ }
      reply = raw.replace(/\|\|ACTION:[\s\S]*?\|\|/, '').trim();
    }

    // Parse CLARIFY block
    const clarifyMatch = raw.match(/\|\|CLARIFY:(\{[\s\S]*?\})\|\|/);
    let clarify = null;
    if (clarifyMatch) {
      try   { clarify = this.parseJsonResponse(clarifyMatch[1], 'object'); }
      catch { /* ignore */ }
      reply = raw.replace(/\|\|CLARIFY:[\s\S]*?\|\|/, '').trim();
    }

    return { reply, action, clarify };
  }

  // ── Local (offline) analysis ──────────────────────────────────────────────
  analyzeSubjectLocal(subject) {
    if (!subject) return null;
    const insights = [];
    const len = subject.length;
    if (len < 20)       insights.push({ type: 'warning', text: 'Too short. Aim for 30-60 characters.' });
    else if (len > 60)  insights.push({ type: 'warning', text: 'May get truncated on mobile (>60 chars).' });
    else                insights.push({ type: 'success', text: `Good length (${len} chars).` });
    if (subject.includes('{{')) insights.push({ type: 'success', text: 'Personalization can improve open rates.' });
    else                        insights.push({ type: 'tip',     text: 'Try adding {{firstName}} for personalization.' });
    if (subject === subject.toUpperCase() && len > 5) insights.push({ type: 'warning', text: 'ALL CAPS can trigger spam filters.' });
    if (/!{2,}/.test(subject))  insights.push({ type: 'warning', text: 'Multiple exclamation marks look spammy.' });
    if (subject.includes('?'))  insights.push({ type: 'tip',     text: 'Questions can increase curiosity and opens.' });
    if (/\d/.test(subject))     insights.push({ type: 'success', text: 'Numbers often improve click-through rates.' });
    const spamWords = ['free', 'urgent', 'act now', 'limited time', 'buy now', 'click here', 'winner', 'congratulations', 'guarantee'];
    const found     = spamWords.filter((w) => subject.toLowerCase().includes(w));
    if (found.length) insights.push({ type: 'warning', text: `Spam trigger words: ${found.join(', ')}` });
    return insights;
  }

  analyzeContentLocal(html) {
    if (!html) return null;
    const insights  = [];
    const text      = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const wordCount = text.split(/\s+/).filter((w) => w).length;
    insights.push({ type: 'info', text: `${wordCount} words | ~${Math.ceil(wordCount / 200)} min read` });
    if (wordCount < 50)       insights.push({ type: 'warning', text: 'Very short. 50-200 words usually perform best.' });
    else if (wordCount > 500) insights.push({ type: 'warning', text: 'Long email. Most readers will scan.' });
    else                      insights.push({ type: 'success', text: 'Good length for engagement.' });
    const hasCTA = /<a\s/i.test(html) || /click here|learn more|get started|sign up|buy now|shop now/i.test(text);
    if (hasCTA) insights.push({ type: 'success', text: 'Primary call-to-action detected.' });
    else        insights.push({ type: 'tip',     text: 'Add one clear call-to-action link or button.' });
    const imgCount = (html.match(/<img/gi) || []).length;
    if (imgCount > 5)     insights.push({ type: 'warning', text: `${imgCount} images - may slow loading.` });
    else if (imgCount > 0) insights.push({ type: 'info',   text: `${imgCount} image(s). Ensure alt text is set.` });
    const tokens = (html.match(/\{\{[^}]+\}\}/g) || []);
    if (tokens.length > 0) insights.push({ type: 'success', text: `${tokens.length} personalization token(s) detected.` });
    if (!html.toLowerCase().includes('unsubscribe')) insights.push({ type: 'warning', text: 'No unsubscribe link — required for compliance.' });
    else                                             insights.push({ type: 'success', text: 'Unsubscribe link present.' });
    return insights;
  }

  getSendTimeAdvice() {
    const now  = new Date();
    const hour = now.getHours();
    const day  = now.getDay();
    const tips = [];
    if (day === 0 || day === 6) tips.push('Weekdays have stronger open rates than weekends.');
    if (hour >= 9 && hour <= 11)       tips.push('Great timing. 9–11 AM is a peak engagement window.');
    else if (hour >= 13 && hour <= 15) tips.push('Good timing — early afternoon is another strong window.');
    else if (hour >= 20 || hour < 6)   tips.push('Consider scheduling for 9–11 AM instead of late night.');
    else tips.push('Best windows: Tuesday–Thursday, 9–11 AM or 1–3 PM.');
    tips.push('Tuesday and Thursday produce the highest average open rates.');
    return tips;
  }

  // ── Dynamic Function Validation ────────────────────────────────────────────
  // Validate parameters for a dynamic function call
  validateFunctionCall(functionName, params) {
    return this.functionRegistry.validateParameters(functionName, params);
  }

  // Get function details by name
  getFunctionDetails(functionName) {
    return this.functionRegistry.getFunction(functionName);
  }

  // Search functions by keyword
  searchFunctions(query) {
    return this.functionRegistry.searchFunctions(query);
  }

  // Get all safe (non-destructive) functions
  getSafeFunctions() {
    return this.functionRegistry.getSafeFunctions();
  }

  // Get the full function registry (for exposing to IPC handlers)
  getFunctionRegistry() {
    return this.functionRegistry;
  }

  // ── Enhanced Template Generation with Visual Direction ─────────────────
  async generateStunningTemplate(input, visualDirection = {}) {
    const options = this.normalizeGenerationRequest(input, visualDirection.tone || 'professional');
    
    // Visual direction parameters
    const {
      style = 'modern',        // modern, minimal, bold, editorial, playful
      colorScheme = 'brand',   // brand, dark, light, gradient
      layout = 'single-column', // single-column, two-column, grid
      imagery = 'illustration', // illustration, photo, icon, none
      typography = 'sans-serif' // sans-serif, serif, display
    } = visualDirection;

    const brief = this.buildGenerationBrief(options);
    
    const messages = [
      {
        role: 'system',
        content: [
          'You are an award-winning email template designer.',
          `Design style: ${style}, Color scheme: ${colorScheme}, Layout: ${layout}`,
          `Imagery: ${imagery}, Typography: ${typography}`,
          'Create a visually stunning, premium email template in responsive HTML with inline styles.',
          'The template must work perfectly in Gmail, Outlook, and Apple Mail.',
          'Return ONLY valid JSON: {"subject":"...","preheader":"...","html":"<html>...</html>","cta":"...","designNotes":"..."}',
          'Include: compelling headline, well-structured body with proper spacing, prominent CTA button, social links, unsubscribe.',
          'Use modern email design patterns: card-based layouts, subtle shadows, gradient buttons, proper whitespace.',
          'Ensure mobile-first responsive design with max-width 600px for main container.'
        ].join(' ')
      },
      { role: 'user', content: brief }
    ];

    const genTimeout = this.provider === 'lmstudio' ? 300000 : 90000;
    const response = await this._callApi(messages, 1500, genTimeout);
    
    if (response.error) return response;
    
    try {
      return this.parseJsonResponse(response.result, 'object');
    } catch {
      return { error: 'AI returned an invalid response. Try a different model or refine your prompt.' };
    }
  }

  // ── Vulnerability Scanner for Email Content ────────────────────────────
  scanForVulnerabilities(content, options = {}) {
    const { checkLinks = true, checkImages = true, checkScripts = true } = options;
    const vulnerabilities = [];
    
    // Check for malicious scripts
    if (checkScripts) {
      const scriptPatterns = [
        /<script[^>]*>[\s\S]*?<\/script>/gi,
        /javascript:/gi,
        /on\w+\s*=/gi,
        /vbscript:/gi,
        /data:text\/html/gi,
        /<iframe[^>]*>/gi,
        /<object[^>]*>/gi,
        /<embed[^>]*>/gi
      ];
      
      for (const pattern of scriptPatterns) {
        const matches = content.match(pattern);
        if (matches) {
          vulnerabilities.push({
            type: 'security',
            severity: 'high',
            message: `Potentially dangerous code detected: ${matches[0].substring(0, 50)}...`,
            pattern: pattern.source
          });
        }
      }
    }
    
    // Check for suspicious links
    if (checkLinks) {
      const linkPattern = /href\s*=\s*["']([^"']+)["']/gi;
      let match;
      while ((match = linkPattern.exec(content)) !== null) {
        const url = match[1];
        
        // Check for IP addresses instead of domains
        if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(url)) {
          vulnerabilities.push({
            type: 'security',
            severity: 'medium',
            message: `Link uses IP address instead of domain: ${url.substring(0, 50)}`,
            url
          });
        }
        
        // Check for suspicious TLDs
        const suspiciousTlds = ['.tk', '.ml', '.ga', '.cf', '.gq', '.xyz', '.top', '.click', '.link'];
        for (const tld of suspiciousTlds) {
          if (url.toLowerCase().includes(tld)) {
            vulnerabilities.push({
              type: 'security',
              severity: 'low',
              message: `Link uses suspicious TLD: ${url.substring(0, 50)}`,
              url
            });
            break;
          }
        }
        
        // Check for mixed content (http in https context)
        if (url.startsWith('http://') && !url.includes('localhost')) {
          vulnerabilities.push({
            type: 'security',
            severity: 'low',
            message: `Insecure HTTP link detected: ${url.substring(0, 50)}`,
            url
          });
        }
      }
    }
    
    // Check for tracking pixels (potential privacy issues)
    const trackingPixelPattern = /<img[^>]*width\s*=\s*["']?1["']?[^>]*height\s*=\s*["']?1["']?[^>]*>/gi;
    if (trackingPixelPattern.test(content)) {
      vulnerabilities.push({
        type: 'privacy',
        severity: 'info',
        message: '1x1 tracking pixel detected - recipients may be tracked'
      });
    }
    
    // Check for missing unsubscribe link
    if (!content.toLowerCase().includes('unsubscribe')) {
      vulnerabilities.push({
        type: 'compliance',
        severity: 'high',
        message: 'Missing unsubscribe link - required for CAN-SPAM/GDPR compliance'
      });
    }
    
    // Check for missing physical address
    if (!content.toLowerCase().includes('address') && !content.toLowerCase().includes('street')) {
      vulnerabilities.push({
        type: 'compliance',
        severity: 'medium',
        message: 'Missing physical mailing address - recommended for compliance'
      });
    }
    
    // Calculate overall risk score
    let riskScore = 0;
    for (const v of vulnerabilities) {
      switch (v.severity) {
        case 'high': riskScore += 30; break;
        case 'medium': riskScore += 15; break;
        case 'low': riskScore += 5; break;
        case 'info': riskScore += 2; break;
      }
    }
    
    return {
      vulnerabilities,
      riskScore: Math.min(100, riskScore),
      riskLevel: riskScore >= 50 ? 'high' : riskScore >= 25 ? 'medium' : 'low',
      passed: vulnerabilities.filter(v => v.severity === 'high').length === 0
    };
  }
}

module.exports = AIService;
