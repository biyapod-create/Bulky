// AI Service - OpenRouter integration for Bulky Email Sender
const https = require('https');

// Curated list of top paid + free OpenRouter models
const OPENROUTER_MODELS = [
  // --- Free tier ---
  { id: 'meta-llama/llama-3.1-8b-instruct:free', label: 'Llama 3.1 8B (Free)', tier: 'free' },
  { id: 'mistralai/mistral-7b-instruct:free', label: 'Mistral 7B (Free)', tier: 'free' },
  { id: 'google/gemma-2-9b-it:free', label: 'Gemma 2 9B (Free)', tier: 'free' },
  // --- Paid - OpenAI ---
  { id: 'openai/gpt-4o', label: 'GPT-4o', tier: 'paid' },
  { id: 'openai/gpt-4o-mini', label: 'GPT-4o Mini', tier: 'paid' },
  { id: 'openai/gpt-4-turbo', label: 'GPT-4 Turbo', tier: 'paid' },
  { id: 'openai/o1', label: 'OpenAI o1', tier: 'paid' },
  { id: 'openai/o1-mini', label: 'OpenAI o1 Mini', tier: 'paid' },
  { id: 'openai/o3-mini', label: 'OpenAI o3 Mini', tier: 'paid' },
  // --- Paid - Anthropic ---
  { id: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet', tier: 'paid' },
  { id: 'anthropic/claude-3.5-haiku', label: 'Claude 3.5 Haiku', tier: 'paid' },
  { id: 'anthropic/claude-3-opus', label: 'Claude 3 Opus', tier: 'paid' },
  // --- Paid - Google ---
  { id: 'google/gemini-2.0-flash-001', label: 'Gemini 2.0 Flash', tier: 'paid' },
  { id: 'google/gemini-pro-1.5', label: 'Gemini 1.5 Pro', tier: 'paid' },
  // --- Paid - Mistral ---
  { id: 'mistralai/mistral-large', label: 'Mistral Large', tier: 'paid' },
  { id: 'mistralai/mixtral-8x22b-instruct', label: 'Mixtral 8x22B', tier: 'paid' },
  // --- Paid - Meta ---
  { id: 'meta-llama/llama-3.3-70b-instruct', label: 'Llama 3.3 70B', tier: 'paid' },
  { id: 'meta-llama/llama-3.1-405b-instruct', label: 'Llama 3.1 405B', tier: 'paid' },
  // --- Paid - DeepSeek ---
  { id: 'deepseek/deepseek-chat', label: 'DeepSeek V3', tier: 'paid' },
  { id: 'deepseek/deepseek-r1', label: 'DeepSeek R1', tier: 'paid' },
  // --- Paid - xAI ---
  { id: 'x-ai/grok-2', label: 'Grok 2', tier: 'paid' },
  { id: 'x-ai/grok-3-mini-beta', label: 'Grok 3 Mini', tier: 'paid' }
];

class AIService {
  constructor() {
    this.apiKey = '';
    this.model = 'meta-llama/llama-3.1-8b-instruct:free';
    this.baseUrl = 'https://openrouter.ai/api/v1';
  }

  static getAvailableModels() {
    return OPENROUTER_MODELS;
  }

  getAvailableModels() {
    return OPENROUTER_MODELS;
  }

  setApiKey(key) {
    this.apiKey = key;
  }

  setModel(model) {
    this.model = model;
  }

  normalizeGenerationRequest(input, tone = 'professional') {
    if (typeof input === 'string') {
      return {
        prompt: input,
        tone,
        objective: '',
        audience: '',
        cta: '',
        offer: '',
        brandVoice: '',
        format: 'campaign',
        keywords: [],
        includePersonalization: true
      };
    }

    const payload = input || {};
    return {
      prompt: String(payload.prompt || '').trim(),
      tone: String(payload.tone || tone || 'professional').trim() || 'professional',
      objective: String(payload.objective || '').trim(),
      audience: String(payload.audience || '').trim(),
      cta: String(payload.cta || '').trim(),
      offer: String(payload.offer || '').trim(),
      brandVoice: String(payload.brandVoice || '').trim(),
      format: String(payload.format || 'campaign').trim() || 'campaign',
      keywords: Array.isArray(payload.keywords)
        ? payload.keywords.map((keyword) => String(keyword || '').trim()).filter(Boolean)
        : [],
      includePersonalization: payload.includePersonalization !== false
    };
  }

  buildGenerationBrief(options) {
    const lines = [
      `Core request: ${options.prompt}`,
      `Format: ${options.format || 'campaign'}`,
      `Tone: ${options.tone || 'professional'}`
    ];

    if (options.objective) lines.push(`Primary objective: ${options.objective}`);
    if (options.audience) lines.push(`Audience: ${options.audience}`);
    if (options.offer) lines.push(`Offer or key message: ${options.offer}`);
    if (options.cta) lines.push(`Call to action: ${options.cta}`);
    if (options.brandVoice) lines.push(`Brand voice: ${options.brandVoice}`);
    if (options.keywords?.length) lines.push(`Keywords to weave in naturally: ${options.keywords.join(', ')}`);
    lines.push(`Personalization: ${options.includePersonalization ? 'Use tasteful placeholders such as {{firstName}} when helpful.' : 'Do not use personalization placeholders.'}`);

    return lines.join('\n');
  }

  async _callOpenRouter(messages, maxTokens = 500) {
    if (!this.apiKey) {
      return { error: 'OpenRouter API key not configured. Go to Settings -> AI to add your key.' };
    }

    const payload = JSON.stringify({
      model: this.model,
      messages,
      max_tokens: maxTokens,
      temperature: 0.7
    });

    return new Promise((resolve) => {
      const url = new URL(this.baseUrl + '/chat/completions');
      const options = {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
          'HTTP-Referer': 'https://bulky-email.app',
          'X-Title': 'Bulky Email Sender',
          'Content-Length': Buffer.byteLength(payload)
        }
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.error) {
              resolve({ error: parsed.error.message || 'API error' });
            } else {
              const content = parsed.choices?.[0]?.message?.content || '';
              resolve({ result: content, model: parsed.model, usage: parsed.usage });
            }
          } catch {
            resolve({ error: 'Failed to parse AI response' });
          }
        });
      });

      req.on('error', (error) => {
        resolve({ error: `Connection failed: ${error.message}` });
      });

      req.setTimeout(30000, () => {
        req.destroy();
        resolve({ error: 'Request timed out (30s)' });
      });

      req.write(payload);
      req.end();
    });
  }

  async improveSubject(subject, context = '') {
    const messages = [
      {
        role: 'system',
        content: 'You are an email marketing expert. Generate 5 improved subject line variations. Return ONLY a JSON array of strings. No explanation, no markdown.'
      },
      {
        role: 'user',
        content: `Improve this email subject line for better open rates:\n\nOriginal: "${subject}"${context ? `\nContext: ${context}` : ''}\n\nReturn exactly 5 variations as a JSON array.`
      }
    ];

    const response = await this._callOpenRouter(messages, 300);
    if (response.error) return response;

    try {
      let text = response.result.trim();
      text = text.replace(/```json?\s*/gi, '').replace(/```\s*/g, '');
      const suggestions = JSON.parse(text);
      return { suggestions: Array.isArray(suggestions) ? suggestions : [text] };
    } catch {
      const lines = response.result
        .split('\n')
        .filter((line) => line.trim())
        .map((line) => line.replace(/^\d+[\.\)]\s*/, '').replace(/^["']|["']$/g, '').trim());
      return { suggestions: lines.slice(0, 5) };
    }
  }

  async analyzeContent(subject, content) {
    const plainText = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 1000);

    const messages = [
      {
        role: 'system',
        content: 'You are an email marketing expert. Analyze the email and provide actionable feedback. Return ONLY valid JSON with this structure: {"score":0-100,"strengths":["..."],"improvements":["..."],"spam_risk":"low|medium|high","tone":"professional|casual|urgent|friendly"}'
      },
      {
        role: 'user',
        content: `Analyze this marketing email:\n\nSubject: "${subject}"\nContent: "${plainText}"\n\nReturn JSON only.`
      }
    ];

    const response = await this._callOpenRouter(messages, 400);
    if (response.error) return response;

    try {
      let text = response.result.trim();
      text = text.replace(/```json?\s*/gi, '').replace(/```\s*/g, '');
      return { analysis: JSON.parse(text) };
    } catch {
      return { analysis: { score: 0, strengths: [], improvements: [response.result], spam_risk: 'unknown', tone: 'unknown' } };
    }
  }

  async generateContent(input, tone = 'professional') {
    const options = this.normalizeGenerationRequest(input, tone);
    const brief = this.buildGenerationBrief(options);
    const messages = [
      {
        role: 'system',
        content: [
          'You are an expert lifecycle email strategist and copywriter.',
          'Write one high-performing email in responsive HTML with inline styles that works in Gmail, Outlook, and Apple Mail.',
          `Use a ${options.tone} tone.`,
          'Return ONLY valid JSON with this exact shape:',
          '{"subject":"...","preheader":"...","html":"<html>...</html>","cta":"..."}',
          'The HTML must include a clear headline, concise body copy, one primary CTA, and a compliant unsubscribe mention.',
          'Keep the copy specific, useful, and conversion-focused. Avoid generic filler.'
        ].join(' ')
      },
      {
        role: 'user',
        content: brief
      }
    ];

    const response = await this._callOpenRouter(messages, 1200);
    if (response.error) return response;

    try {
      let text = response.result.trim();
      text = text.replace(/```json?\s*/gi, '').replace(/```\s*/g, '');
      return JSON.parse(text);
    } catch {
      return { subject: '', preheader: '', html: response.result, cta: options.cta || '' };
    }
  }

  analyzeSubjectLocal(subject) {
    if (!subject) return null;
    const insights = [];
    const len = subject.length;

    if (len < 20) insights.push({ type: 'warning', text: 'Too short. Aim for 30-60 characters.' });
    else if (len > 60) insights.push({ type: 'warning', text: 'May get truncated on mobile (>60 chars).' });
    else insights.push({ type: 'success', text: `Good length (${len} chars).` });

    if (subject.includes('{{')) insights.push({ type: 'success', text: 'Personalization can improve open rates.' });
    else insights.push({ type: 'tip', text: 'Try adding {{firstName}} when the audience list is clean.' });

    if (subject === subject.toUpperCase() && len > 5) insights.push({ type: 'warning', text: 'ALL CAPS can trigger spam filters.' });
    if (/!{2,}/.test(subject)) insights.push({ type: 'warning', text: 'Multiple exclamation marks look spammy.' });
    if (subject.includes('?')) insights.push({ type: 'tip', text: 'Questions can increase curiosity and opens.' });
    if (/\d/.test(subject)) insights.push({ type: 'success', text: 'Numbers often improve click-through rates.' });

    const spamWords = ['free', 'urgent', 'act now', 'limited time', 'buy now', 'click here', 'winner', 'congratulations', 'guarantee'];
    const found = spamWords.filter((word) => subject.toLowerCase().includes(word));
    if (found.length) insights.push({ type: 'warning', text: `Spam trigger words: ${found.join(', ')}` });

    return insights;
  }

  analyzeContentLocal(html) {
    if (!html) return null;
    const insights = [];
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const wordCount = text.split(/\s+/).filter((word) => word).length;
    const readingTime = Math.ceil(wordCount / 200);

    insights.push({ type: 'info', text: `${wordCount} words | about ${readingTime} min read` });

    if (wordCount < 50) insights.push({ type: 'warning', text: 'Very short. 50-200 words usually perform best.' });
    else if (wordCount > 500) insights.push({ type: 'warning', text: 'Long email. Most readers will scan instead of reading every line.' });
    else insights.push({ type: 'success', text: 'Good length for engagement.' });

    const hasCTA = /<a\s/i.test(html) || /click here|learn more|get started|sign up|buy now|shop now/i.test(text);
    if (hasCTA) insights.push({ type: 'success', text: 'Primary call-to-action detected.' });
    else insights.push({ type: 'tip', text: 'Add one clear call-to-action link or button.' });

    const imgCount = (html.match(/<img/gi) || []).length;
    if (imgCount > 5) insights.push({ type: 'warning', text: `${imgCount} images - this may slow loading.` });
    else if (imgCount > 0) insights.push({ type: 'info', text: `${imgCount} image(s). Make sure alt text is set.` });

    const tokens = (html.match(/\{\{[^}]+\}\}/g) || []);
    if (tokens.length > 0) insights.push({ type: 'success', text: `${tokens.length} personalization token(s) detected.` });

    if (!html.toLowerCase().includes('unsubscribe')) insights.push({ type: 'warning', text: 'No unsubscribe link - required for compliant campaigns.' });
    else insights.push({ type: 'success', text: 'Unsubscribe link present.' });

    return insights;
  }

  async generateTemplateBlocks(input, tone = 'professional') {
    const options = this.normalizeGenerationRequest(input, tone);
    const systemPrompt = `You are an email template designer. Generate a structured email template as a JSON array of blocks for a drag-and-drop email builder.

Each block must have this exact structure:
{ "type": "<blockType>", "data": { ...blockData } }

Block types and their data fields:
- "header": { "text": string, "fontSize": number, "color": "#hex", "backgroundColor": "#hex", "alignment": "left|center|right", "padding": number, "logoUrl": "" }
- "text": { "content": "<p>HTML text</p>", "fontSize": number, "color": "#hex", "alignment": "left|center|right", "padding": number, "lineHeight": number }
- "image": { "src": "", "alt": string, "width": "100%", "alignment": "center", "padding": number }
- "button": { "text": string, "url": "#", "backgroundColor": "#hex", "textColor": "#fff", "borderRadius": number, "alignment": "center", "fontSize": number, "padding": number, "paddingH": number, "paddingV": number }
- "divider": { "color": "#hex", "thickness": number, "width": "100%", "padding": number, "style": "solid|dashed|dotted" }
- "spacer": { "height": number }
- "social": { "alignment": "center", "padding": number, "iconSize": 32, "links": [{ "platform": "facebook|twitter|instagram|linkedin", "url": "#" }] }
- "footer": { "content": string, "unsubscribeText": "Unsubscribe", "unsubscribeUrl": "{{unsubscribeLink}}", "address": string, "fontSize": number, "color": "#hex", "alignment": "center", "padding": number }

Rules:
- Always start with a header block
- Always end with a footer block with unsubscribeUrl set to "{{unsubscribeLink}}"
- Use 4-8 blocks total for a professional layout
- Return ONLY the JSON array, no explanation, no markdown code fences`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Create a ${options.tone} email template for:\n${this.buildGenerationBrief(options)}\n\nReturn ONLY the JSON array of blocks.` }
    ];

    const response = await this._callOpenRouter(messages, 1500);
    if (response.error) return response;

    try {
      let text = response.result.trim();
      text = text.replace(/```json?\s*/gi, '').replace(/```\s*/g, '');
      const match = text.match(/\[[\s\S]*\]/);
      if (match) text = match[0];
      const blocks = JSON.parse(text);
      if (!Array.isArray(blocks)) throw new Error('Not an array');
      return {
        blocks: blocks.map((block) => ({
          ...block,
          id: Math.random().toString(36).slice(2, 10),
          data: block.data || {}
        }))
      };
    } catch (error) {
      return { error: 'Failed to parse template blocks from AI response: ' + error.message };
    }
  }

  getSendTimeAdvice() {
    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay();
    const tips = [];

    if (day === 0 || day === 6) tips.push('Weekdays usually have stronger open rates than weekends.');
    if (hour >= 9 && hour <= 11) tips.push('Great timing. 9-11 AM is a peak engagement window.');
    else if (hour >= 13 && hour <= 15) tips.push('Good timing - early afternoon is another strong delivery window.');
    else if (hour >= 20 || hour < 6) tips.push('Consider scheduling for 9-11 AM instead of sending late at night.');
    else tips.push('Best windows are usually Tuesday to Thursday, 9-11 AM or 1-3 PM.');

    tips.push('Tuesday and Thursday usually produce the highest average open rates.');
    return tips;
  }
}

module.exports = AIService;
