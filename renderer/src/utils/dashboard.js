function buildDashboardViewModel(data = {}) {
  const contacts = data.contacts || {};
  const campaigns = data.campaigns || {};
  const emails = data.emails || {};
  const trends = data.trends || {};
  const deliverabilitySnapshot = data.deliverabilitySnapshot || {};

  return {
    totalContacts: contacts.total || 0,
    verifiedContacts: contacts.verified || 0,
    riskyContacts: contacts.risky || 0,
    invalidContacts: contacts.invalid || 0,
    totalCampaigns: campaigns.total || 0,
    totalSent: emails.totalSent || 0,
    successRate: emails.successRate || 0,
    openRate: emails.openRate || 0,
    clickRate: emails.clickRate || 0,
    deliverabilityScore: data.deliverabilityScore || 0,
    blacklistCount: data.blacklisted || 0,
    unsubscribeCount: data.unsubscribed || 0,
    recentCampaigns: data.recentCampaigns || [],
    smtpAccounts: data.smtpHealth || [],
    sendHistory: data.sendHistory || [],
    recentActivity: data.recentActivity || [],
    sentTrend: trends.sentWeeklyDelta || 0,
    contactsTrend: trends.contactsWeeklyDelta || 0,
    campaignsTrend: trends.campaignsWeeklyDelta || 0,
    retryQueue: data.retryQueue || { pending: 0, completed: 0, failed: 0 },
    deliverabilityWarnings: deliverabilitySnapshot.warnings || [],
    deliverabilityRecommendations: deliverabilitySnapshot.recommendations || [],
    isSafeToSend: deliverabilitySnapshot.isSafeToSend !== false
  };
}

module.exports = {
  buildDashboardViewModel
};
