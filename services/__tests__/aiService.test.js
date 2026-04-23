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
    expect(brief).toContain('Keywords to weave in naturally: welcome, discount');
    expect(brief).toContain('{{firstName}}');
  });

  it('keeps local content analysis messages readable', () => {
    const insights = aiService.analyzeContentLocal('<p>Hello</p><p>Please <a href="#">shop now</a>.</p>');

    expect(insights).toEqual(expect.arrayContaining([
      expect.objectContaining({ text: expect.stringContaining('words | about') }),
      expect.objectContaining({ text: 'Primary call-to-action detected.' })
    ]));
  });
});
