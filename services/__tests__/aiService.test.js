const AIService = require('../aiService');

describe('AIService', () => {
  let aiService;

  beforeEach(() => {
    aiService = new AIService();
  });

  it('normalizes structured generation requests', () => {
    const result = aiService.normalizeGenerationRequest({
      prompt: 'Launch email for a new feature',
      tone: 'friendly',
      objective: 'Drive demo requests',
      audience: 'Existing customers',
      cta: 'Book a demo',
      offer: 'Priority onboarding',
      brandVoice: 'Clear and upbeat',
      format: 'announcement',
      keywords: ['launch', 'demo', 'onboarding'],
      includePersonalization: false
    });

    expect(result).toEqual({
      prompt: 'Launch email for a new feature',
      tone: 'friendly',
      objective: 'Drive demo requests',
      audience: 'Existing customers',
      cta: 'Book a demo',
      offer: 'Priority onboarding',
      brandVoice: 'Clear and upbeat',
      format: 'announcement',
      keywords: ['launch', 'demo', 'onboarding'],
      includePersonalization: false
    });
  });

  it('builds a generation brief with the useful fields', () => {
    const brief = aiService.buildGenerationBrief(aiService.normalizeGenerationRequest({
      prompt: 'Welcome email for new subscribers',
      tone: 'warm',
      objective: 'Encourage first purchase',
      audience: 'New subscribers',
      cta: 'Shop now',
      offer: '10% off first order',
      brandVoice: 'Warm and direct',
      keywords: ['welcome', 'discount'],
      includePersonalization: true
    }));

    expect(brief).toContain('Core request: Welcome email for new subscribers');
    expect(brief).toContain('Primary objective: Encourage first purchase');
    expect(brief).toContain('Audience: New subscribers');
    expect(brief).toContain('Call to action: Shop now');
    expect(brief).toContain('Keywords: welcome, discount');
    expect(brief).toContain('{{firstName}}');
  });

  it('keeps local content analysis messages readable', () => {
    const insights = aiService.analyzeContentLocal('<p>Hello</p><p>Please <a href="#">shop now</a>.</p>');

    expect(insights).toEqual(expect.arrayContaining([
      expect.objectContaining({ text: expect.stringContaining('words | ~') }),
      expect.objectContaining({ text: 'Primary call-to-action detected.' })
    ]));
  });

  it('supports switching to LM Studio settings', () => {
    aiService.setProvider('lmstudio');
    aiService.setLmstudioBaseUrl('http://localhost:1234/v1/');

    expect(aiService.provider).toBe('lmstudio');
    expect(aiService.lmstudioBaseUrl).toBe('http://localhost:1234/v1');
  });

  it('maps LM Studio model responses into picker options', async () => {
    aiService._doRequest = jest.fn(async () => ({
      body: {
        data: [
          { id: 'local-model-1' },
          { id: 'local-model-2' }
        ]
      }
    }));

    const result = await aiService.getLMStudioModels();

    expect(result).toEqual({
      models: [
        { id: 'local-model-1', label: 'local-model-1' },
        { id: 'local-model-2', label: 'local-model-2' }
      ]
    });
  });

  it('extracts JSON payloads even when wrapped in prose or code fences', async () => {
    aiService._callApi = jest.fn(async () => ({
      result: 'Here is the content:\n```json\n{"subject":"Hello","preheader":"World","html":"<html></html>","cta":"Go"}\n```'
    }));

    const result = await aiService.generateContent('Write a launch email');

    expect(result).toEqual({
      subject: 'Hello',
      preheader: 'World',
      html: '<html></html>',
      cta: 'Go'
    });
  });

  it('surfaces non-200 AI responses with cleaner error messages', async () => {
    aiService._doRequest = jest.fn(async () => ({
      statusCode: 429,
      body: { error: { message: 'Rate limit exceeded' } }
    }));
    aiService.setApiKey('test-key');
    aiService.setModel('openai/gpt-4o-mini');

    const result = await aiService._callApi([{ role: 'user', content: 'Hello' }], 50, 1000);

    expect(result).toEqual({
      error: 'AI request failed: Rate limit exceeded'
    });
  });

  it('parses assistant action and clarify blocks from chat responses', async () => {
    aiService._callApi = jest.fn(async () => ({
      result: 'I can help with that. ||ACTION:{"type":"verifyAllUnverified"}||'
    }));

    const actionReply = await aiService.chat('Verify my unverified contacts', [], { contacts: 10 });
    expect(actionReply.reply).toBe('I can help with that.');
    expect(actionReply.action).toEqual({ type: 'verifyAllUnverified' });

    aiService._callApi = jest.fn(async () => ({
      result: 'Let me shape that template. ||CLARIFY:{"question":"Do you want HTML email or drag-and-drop blocks?","options":["HTML email","Drag-and-drop blocks"]}||'
    }));

    const clarifyReply = await aiService.chat('Create a stunning template', [], { templates: 3 });
    expect(clarifyReply.reply).toBe('Let me shape that template.');
    expect(clarifyReply.clarify).toEqual({
      question: 'Do you want HTML email or drag-and-drop blocks?',
      options: ['HTML email', 'Drag-and-drop blocks']
    });
  });
});
