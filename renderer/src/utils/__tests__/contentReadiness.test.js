const {
  analyzeMergeTags,
  applyPreviewPersonalization,
  evaluateContentReadiness
} = require('../contentReadiness');

describe('contentReadiness', () => {
  it('flags unsupported merge tags while allowing supported conditionals and fallbacks', () => {
    const analysis = analyzeMergeTags({
      subject: 'Hello {{firstName}}',
      content: '<p>{{#if company}}Hi {{firstName | Friend}}{{else}}Hi there{{/if}} {{unknownField}}</p>'
    });

    expect(analysis.supported).toEqual(expect.arrayContaining([
      '{{firstName}}',
      '{{#if company}}',
      '{{firstName | Friend}}',
      '{{else}}',
      '{{/if}}'
    ]));
    expect(analysis.unsupported).toEqual(['{{unknownField}}']);
  });

  it('builds blockers from missing recipients, unsupported tags, and failed guardrails', () => {
    const readiness = evaluateContentReadiness({
      subject: 'Offer for {{badToken}}',
      content: '<p>Hi {{firstName}}</p>',
      recipientBreakdown: { total: 0, valid: 0 },
      deliverabilityInfo: {
        sendingMode: 'bulk',
        trackingDomain: '',
        spfConfigured: false,
        dkimConfigured: false,
        dmarcConfigured: false,
        companyAddress: ''
      },
      smtpAccounts: [],
      smtpHealth: []
    });

    expect(readiness.isReady).toBe(false);
    expect(readiness.blockers.join(' ')).toContain('Unsupported merge tags');
    expect(readiness.blockers.join(' ')).toContain('Select at least one valid recipient');
    expect(readiness.blockers.join(' ')).toContain('Authentication Stack');
  });

  it('renders preview-safe content from merge tags and conditional blocks', () => {
    const preview = applyPreviewPersonalization(
      '<p>{{#if company}}Hi {{firstName:upper}}{{else}}Hi there{{/if}} from {{company}} on {{dayOfWeek}}. Code: {{uniqueCode}}</p>'
    );

    expect(preview).toContain('Hi JOHN');
    expect(preview).toContain('Acme Inc');
    expect(preview).toContain('Code: AB12CD34');
    expect(preview).not.toContain('{{');
  });
});
