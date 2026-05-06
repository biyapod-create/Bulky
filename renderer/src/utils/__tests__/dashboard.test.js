const { buildDashboardViewModel } = require('../dashboard');

describe('buildDashboardViewModel', () => {
  it('maps backend dashboard data into renderer state with safe defaults', () => {
    const model = buildDashboardViewModel({
      contacts: { total: 120, verified: 90, risky: 5, invalid: 3 },
      campaigns: { total: 12 },
      emails: { totalSent: 450, successRate: '97.2', openRate: '31.5', clickRate: '8.4' },
      deliverabilityScore: 88,
      blacklisted: 2,
      unsubscribed: 4,
      recentCampaigns: [{ id: 'campaign-1' }],
      smtpHealth: [{ id: 'smtp-1' }],
      sendHistory: [{ day: '2026-04-30', sent: 10 }],
      recentActivity: [{ type: 'send' }],
      retryQueue: { pending: 3, completed: 10, failed: 1 },
      trends: {
        sentWeeklyDelta: 22,
        contactsWeeklyDelta: 5,
        campaignsWeeklyDelta: -1
      },
      deliverabilitySnapshot: {
        warnings: ['Bounce rate is elevated.'],
        recommendations: ['Verify unverified contacts before your next campaign.'],
        isSafeToSend: true
      }
    });

    expect(model).toMatchObject({
      totalContacts: 120,
      verifiedContacts: 90,
      riskyContacts: 5,
      invalidContacts: 3,
      totalCampaigns: 12,
      totalSent: 450,
      deliverabilityScore: 88,
      sentTrend: 22,
      contactsTrend: 5,
      campaignsTrend: -1,
      retryQueue: { pending: 3, completed: 10, failed: 1 },
      deliverabilityWarnings: ['Bounce rate is elevated.'],
      deliverabilityRecommendations: ['Verify unverified contacts before your next campaign.'],
      isSafeToSend: true
    });
  });

  it('falls back to empty arrays and zeros when dashboard data is partial', () => {
    const model = buildDashboardViewModel({});

    expect(model).toMatchObject({
      totalContacts: 0,
      totalCampaigns: 0,
      totalSent: 0,
      sentTrend: 0,
      contactsTrend: 0,
      campaignsTrend: 0,
      recentCampaigns: [],
      smtpAccounts: [],
      recentActivity: [],
      deliverabilityWarnings: [],
      deliverabilityRecommendations: [],
      retryQueue: { pending: 0, completed: 0, failed: 0 },
      isSafeToSend: true
    });
  });
});
