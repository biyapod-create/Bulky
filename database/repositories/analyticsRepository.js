function formatRelativeTime(value) {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const diffMs = Date.now() - date.getTime();
  if (diffMs < 60 * 1000) {
    return 'Just now';
  }
  if (diffMs < 60 * 60 * 1000) {
    return `${Math.floor(diffMs / (60 * 1000))}m ago`;
  }
  if (diffMs < 24 * 60 * 60 * 1000) {
    return `${Math.floor(diffMs / (60 * 60 * 1000))}h ago`;
  }

  return date.toLocaleDateString();
}

function getCampaignAnalytics(db, campaignId) {
  const campaign = db._get('SELECT * FROM campaigns WHERE id = ?', [campaignId]);
  if (!campaign) {
    return null;
  }

  const logs = db.getCampaignLogs(campaignId);
  const events = db.getTrackingEvents(campaignId);

  const sent = logs.filter((log) => log.status === 'sent').length;
  const failed = logs.filter((log) => log.status === 'failed').length;
  const bounced = logs.filter((log) => log.status === 'bounced').length;
  const softBounced = logs.filter((log) => log.status === 'soft_bounce').length;
  const opened = logs.filter((log) => log.openedAt).length;
  const clicked = logs.filter((log) => log.clickedAt).length;

  const openEvents = events.filter((event) => event.type === 'open');
  const clickEvents = events.filter((event) => event.type === 'click');
  const humanOpenEvents = openEvents.filter((event) => !event.isBot);
  const humanClickEvents = clickEvents.filter((event) => !event.isBot);
  const botOpenEvents = openEvents.filter((event) => event.isBot);
  const botClickEvents = clickEvents.filter((event) => event.isBot);
  const uniqueOpens = new Set(humanOpenEvents.map((event) => event.contactId)).size;
  const uniqueClicks = new Set(humanClickEvents.map((event) => event.contactId)).size;
  const totalOpenEvents = humanOpenEvents.length;
  const totalClickEvents = humanClickEvents.length;
  const averageClicksPerOpened = uniqueOpens > 0 ? Number((totalClickEvents / uniqueOpens).toFixed(2)) : 0;
  const averageClicksPerClickedRecipient = uniqueClicks > 0 ? Number((totalClickEvents / uniqueClicks).toFixed(2)) : 0;
  const lastOpenedAt = humanOpenEvents.length > 0 ? humanOpenEvents[0].createdAt : null;
  const lastClickedAt = humanClickEvents.length > 0 ? humanClickEvents[0].createdAt : null;

  const variantA = logs.filter((log) => log.variant === 'A');
  const variantB = logs.filter((log) => log.variant === 'B');

  const opensByHourMap = {};
  openEvents.forEach((event) => {
    const hour = new Date(event.createdAt).getHours().toString().padStart(2, '0');
    opensByHourMap[hour] = (opensByHourMap[hour] || 0) + 1;
  });
  const opensByHour = Object.entries(opensByHourMap)
    .map(([hour, count]) => ({ hour, count }))
    .sort((a, b) => a.hour.localeCompare(b.hour));

  const clicksByLinkMap = {};
  clickEvents.forEach((event) => {
    if (event.link) {
      clicksByLinkMap[event.link] = (clicksByLinkMap[event.link] || 0) + 1;
    }
  });
  const clicksByLink = Object.entries(clicksByLinkMap)
    .map(([link, count]) => ({ link, count }))
    .sort((a, b) => b.count - a.count);

  const enrichedCampaign = {
    ...campaign,
    isABTest: !!campaign.isABTest,
    sentEmails: campaign.sentEmails || sent,
    totalEmails: campaign.totalEmails || logs.length,
    failedEmails: campaign.failedEmails || failed,
    bouncedEmails: campaign.bouncedEmails || bounced,
    softBouncedEmails: softBounced,
    openedEmails: opened,
    clickedEmails: clicked,
    openedEmailsA: variantA.filter((log) => log.openedAt).length,
    openedEmailsB: variantB.filter((log) => log.openedAt).length,
    sentEmailsA: variantA.filter((log) => log.status === 'sent').length,
    sentEmailsB: variantB.filter((log) => log.status === 'sent').length
  };

  return {
    campaign: enrichedCampaign,
    logs,
    opensByHour,
    clicksByLink,
    total: logs.length,
    sent,
    failed,
    bounced,
    softBounced,
    opened,
    clicked,
    uniqueOpens,
    uniqueClicks,
    totalOpenEvents,
    totalClickEvents,
    botOpenEvents: botOpenEvents.length,
    botClickEvents: botClickEvents.length,
    averageClicksPerOpened,
    averageClicksPerClickedRecipient,
    lastOpenedAt,
    lastClickedAt,
    openRate: sent > 0 ? ((uniqueOpens / sent) * 100).toFixed(1) : 0,
    clickRate: sent > 0 ? ((uniqueClicks / sent) * 100).toFixed(1) : 0,
    bounceRate: logs.length > 0 ? (((bounced + softBounced) / logs.length) * 100).toFixed(1) : 0,
    abTest: {
      A: {
        sent: variantA.filter((log) => log.status === 'sent').length,
        opened: variantA.filter((log) => log.openedAt).length
      },
      B: {
        sent: variantB.filter((log) => log.status === 'sent').length,
        opened: variantB.filter((log) => log.openedAt).length
      }
    }
  };
}

function getDashboardStats(db) {
  const contactStats = db.getContactStats();

  const campaignAgg = db._get(`
    SELECT
      COUNT(*) AS total,
      COALESCE(SUM(sentEmails),   0) AS totalSent,
      COALESCE(SUM(failedEmails), 0) AS totalFailed,
      COALESCE(SUM(bouncedEmails),0) AS totalBounced,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
      SUM(CASE WHEN status = 'draft'     THEN 1 ELSE 0 END) AS drafts,
      SUM(CASE WHEN status = 'scheduled' THEN 1 ELSE 0 END) AS scheduled,
      SUM(CASE WHEN status = 'running'   THEN 1 ELSE 0 END) AS running
    FROM campaigns
  `) || {};

  const totalSent = campaignAgg.totalSent || 0;
  const totalFailed = campaignAgg.totalFailed || 0;
  const totalBounced = campaignAgg.totalBounced || 0;

  const blacklistCount = db._get('SELECT COUNT(*) as count FROM blacklist') || { count: 0 };
  const unsubCount = db._get('SELECT COUNT(*) as count FROM unsubscribes') || { count: 0 };

  const logAgg = db._get(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN openedAt  IS NOT NULL AND openedAt  != '' THEN 1 ELSE 0 END) AS opened,
      SUM(CASE WHEN clickedAt IS NOT NULL AND clickedAt != '' THEN 1 ELSE 0 END) AS clicked
    FROM campaign_logs WHERE status = 'sent'
  `) || { total: 0, opened: 0, clicked: 0 };

  const openRate = logAgg.total > 0 ? ((logAgg.opened / logAgg.total) * 100).toFixed(1) : 0;
  const clickRate = logAgg.total > 0 ? ((logAgg.clicked / logAgg.total) * 100).toFixed(1) : 0;

  const recentCampaigns = db._all(`
    SELECT c.id, c.name, c.status, c.sentEmails, c.totalEmails, c.createdAt, c.startedAt, c.completedAt,
           l.name AS listName,
           COALESCE(stats.openedEmails, 0) AS openedEmails,
           COALESCE(stats.clickedEmails, 0) AS clickedEmails
    FROM campaigns c
    LEFT JOIN lists l ON c.listId = l.id
    LEFT JOIN (
      SELECT campaignId,
             SUM(CASE WHEN openedAt IS NOT NULL AND openedAt != '' THEN 1 ELSE 0 END) AS openedEmails,
             SUM(CASE WHEN clickedAt IS NOT NULL AND clickedAt != '' THEN 1 ELSE 0 END) AS clickedEmails
      FROM campaign_logs
      GROUP BY campaignId
    ) stats ON stats.campaignId = c.id
    ORDER BY c.createdAt DESC
    LIMIT 10
  `).map((campaign) => ({
    id: campaign.id,
    name: campaign.name,
    status: campaign.status,
    listName: campaign.listName || '',
    sentEmails: Number(campaign.sentEmails) || 0,
    totalEmails: Number(campaign.totalEmails) || 0,
    openedEmails: Number(campaign.openedEmails) || 0,
    clickedEmails: Number(campaign.clickedEmails) || 0,
    createdAt: campaign.createdAt,
    startedAt: campaign.startedAt,
    completedAt: campaign.completedAt
  }));

  const smtpAccounts = db.getAllSmtpAccounts();
  const smtpHealth = smtpAccounts.map((account) => {
    const sentToday = Number(account.sentToday) || 0;
    const dailyLimit = Number(account.dailyLimit) || 0;
    const usageRatio = dailyLimit > 0 ? Math.min(sentToday / dailyLimit, 1) : 0;
    const storedHealth = Number(account.healthScore);
    const computedHealth = Number.isFinite(storedHealth) && storedHealth > 0
      ? storedHealth
      : account.isActive
        ? 100 - (usageRatio * 35)
        : 20;

    return {
      id: account.id,
      name: account.name || account.fromEmail,
      host: account.host || '',
      isActive: !!account.isActive,
      sentToday,
      dailyLimit,
      lastResetDate: account.lastResetDate || '',
      warmUpEnabled: !!account.warmUpEnabled,
      health: Math.max(0, Math.min(100, Math.round(computedHealth)))
    };
  });

  let recentLogs = [];
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    recentLogs = db._all(
      `SELECT
        date(createdAt) as day,
        SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN status = 'bounced' THEN 1 ELSE 0 END) as bounced,
        SUM(CASE WHEN openedAt IS NOT NULL AND openedAt != '' THEN 1 ELSE 0 END) as opened,
        SUM(CASE WHEN clickedAt IS NOT NULL AND clickedAt != '' THEN 1 ELSE 0 END) as clicked
      FROM campaign_logs
      WHERE createdAt >= ?
      GROUP BY date(createdAt)
      ORDER BY day ASC`,
      [thirtyDaysAgo]
    );
  } catch {
    recentLogs = [];
  }

  const scores = [];
  const deliveryRate = totalSent > 0 ? ((totalSent - totalBounced) / totalSent) * 100 : 100;
  scores.push({ value: deliveryRate, weight: 0.4 });
  const contactTotal = contactStats.total || 0;
  const contactVerified = contactStats.verified || 0;
  const listQuality = contactTotal > 0 ? (contactVerified / contactTotal) * 100 : 50;
  scores.push({ value: listQuality, weight: 0.25 });
  const engagementScore = Math.min(parseFloat(openRate) * 2, 100);
  scores.push({ value: engagementScore, weight: 0.2 });
  const bounceRate = totalSent > 0 ? (totalBounced / totalSent) : 0;
  const cleanScore = Math.max(0, 100 - (bounceRate * 300));
  scores.push({ value: cleanScore, weight: 0.15 });
  let deliverabilityScore = Math.round(scores.reduce((sum, score) => sum + score.value * score.weight, 0));
  deliverabilityScore = Math.max(0, Math.min(100, deliverabilityScore));

  const recentSendActivity = db._all(`
    SELECT cl.email, cl.status, cl.createdAt, c.name AS campaignName
    FROM campaign_logs cl
    LEFT JOIN campaigns c ON c.id = cl.campaignId
    WHERE cl.createdAt IS NOT NULL AND cl.createdAt != ''
    ORDER BY cl.createdAt DESC
    LIMIT 12
  `).map((item) => ({
    type: item.status === 'bounced' ? 'bounce' : 'send',
    message: item.status === 'bounced'
      ? `Bounce detected in ${item.campaignName || 'campaign'}`
      : `Email sent from ${item.campaignName || 'campaign'}`,
    email: item.email || '',
    time: formatRelativeTime(item.createdAt),
    createdAt: item.createdAt
  }));

  const recentTrackingActivity = db._all(`
    SELECT email, type, createdAt
    FROM tracking_events
    WHERE createdAt IS NOT NULL AND createdAt != '' AND type IN ('open', 'click')
    ORDER BY createdAt DESC
    LIMIT 12
  `).map((item) => ({
    type: item.type,
    message: item.type === 'click' ? 'Tracked click recorded' : 'Tracked open recorded',
    email: item.email || '',
    time: formatRelativeTime(item.createdAt),
    createdAt: item.createdAt
  }));

  const recentUnsubscribes = db._all(`
    SELECT email, createdAt
    FROM unsubscribes
    WHERE createdAt IS NOT NULL AND createdAt != ''
    ORDER BY createdAt DESC
    LIMIT 6
  `).map((item) => ({
    type: 'unsubscribe',
    message: 'Recipient unsubscribed',
    email: item.email || '',
    time: formatRelativeTime(item.createdAt),
    createdAt: item.createdAt
  }));

  const recentActivity = [...recentTrackingActivity, ...recentSendActivity, ...recentUnsubscribes]
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
    .slice(0, 20);

  const now = Date.now();
  const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
  const fourteenDaysAgo = new Date(now - 14 * 24 * 60 * 60 * 1000).toISOString();

  const contactTrendAgg = db._get(
    `SELECT
      SUM(CASE WHEN createdAt >= ? THEN 1 ELSE 0 END) AS currentWindow,
      SUM(CASE WHEN createdAt >= ? AND createdAt < ? THEN 1 ELSE 0 END) AS previousWindow
     FROM contacts`,
    [sevenDaysAgo, fourteenDaysAgo, sevenDaysAgo]
  ) || {};

  const campaignTrendAgg = db._get(
    `SELECT
      SUM(CASE WHEN createdAt >= ? THEN 1 ELSE 0 END) AS currentWindow,
      SUM(CASE WHEN createdAt >= ? AND createdAt < ? THEN 1 ELSE 0 END) AS previousWindow
     FROM campaigns`,
    [sevenDaysAgo, fourteenDaysAgo, sevenDaysAgo]
  ) || {};

  const last7Logs = recentLogs.slice(-7);
  const prev7Logs = recentLogs.slice(-14, -7);
  const sentTrend = last7Logs.reduce((sum, row) => sum + Number(row.sent || row.count || 0), 0)
    - prev7Logs.reduce((sum, row) => sum + Number(row.sent || row.count || 0), 0);
  const contactsTrend = Number(contactTrendAgg.currentWindow || 0) - Number(contactTrendAgg.previousWindow || 0);
  const campaignsTrend = Number(campaignTrendAgg.currentWindow || 0) - Number(campaignTrendAgg.previousWindow || 0);

  const deliverabilitySnapshot = getDeliverabilitySnapshot(db);

  return {
    contacts: contactStats || { total: 0, verified: 0, unverified: 0, invalid: 0, risky: 0, active: 0 },
    campaigns: {
      total: campaignAgg?.total || 0,
      active: campaignAgg?.running || 0,
      completed: campaignAgg?.completed || 0,
      scheduled: campaignAgg?.scheduled || 0,
      draft: campaignAgg?.drafts || 0
    },
    emails: {
      totalSent,
      totalFailed,
      totalBounced,
      successRate: totalSent > 0 ? (((totalSent - totalBounced) / totalSent) * 100).toFixed(1) : 0,
      openRate,
      clickRate
    },
    deliverabilityScore,
    deliverabilitySnapshot,
    blacklisted: blacklistCount?.count || 0,
    unsubscribed: unsubCount?.count || 0,
    trends: {
      contactsWeeklyDelta: contactsTrend,
      campaignsWeeklyDelta: campaignsTrend,
      sentWeeklyDelta: sentTrend
    },
    recentCampaigns: recentCampaigns || [],
    recentActivity,
    smtpHealth: smtpHealth || [],
    sendHistory: recentLogs || []
  };
}

function getDeliverabilitySnapshot(db) {
  const totalSent = db._get("SELECT COUNT(*) as count FROM campaign_logs WHERE status = 'sent'")?.count || 0;
  const totalBounced = db._get("SELECT COUNT(*) as count FROM campaign_logs WHERE status = 'bounced'")?.count || 0;
  const totalOpened = db._get("SELECT COUNT(*) as count FROM campaign_logs WHERE openedAt IS NOT NULL AND openedAt != ''")?.count || 0;
  const totalClicked = db._get("SELECT COUNT(*) as count FROM campaign_logs WHERE clickedAt IS NOT NULL AND clickedAt != ''")?.count || 0;
  const blacklistCount = db._get('SELECT COUNT(*) as count FROM blacklist')?.count || 0;
  const smtpAccounts = db.getAllSmtpAccounts();
  const activeSmtp = smtpAccounts.filter((account) => account.isActive).length;
  const bounceRate = totalSent > 0 ? Number(((totalBounced / totalSent) * 100).toFixed(1)) : 0;
  const openRate = totalSent > 0 ? Number(((totalOpened / totalSent) * 100).toFixed(1)) : 0;
  const clickRate = totalSent > 0 ? Number(((totalClicked / totalSent) * 100).toFixed(1)) : 0;
  const deliverabilityScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        100
        - (bounceRate * 6)
        - (activeSmtp === 0 ? 25 : 0)
        - (blacklistCount > 0 ? Math.min(blacklistCount, 20) : 0)
        + Math.min(openRate * 0.35, 12)
        + Math.min(clickRate * 0.45, 8)
      )
    )
  );

  const warnings = [];
  if (activeSmtp === 0) {
    warnings.push('No active SMTP accounts are available.');
  }
  if (bounceRate >= 8) {
    warnings.push('Bounce rate is critically high.');
  } else if (bounceRate >= 4) {
    warnings.push('Bounce rate is elevated.');
  }
  if (openRate < 10 && totalSent > 25) {
    warnings.push('Open rate is low for recent sending volume.');
  }
  if (blacklistCount > 0) {
    warnings.push('Blacklist entries exist and may indicate list hygiene issues.');
  }

  const recommendations = [];
  if (activeSmtp === 0) {
    recommendations.push('Activate at least one healthy SMTP account before sending.');
  }
  if (bounceRate >= 4) {
    recommendations.push('Verify unverified contacts before your next campaign.');
  }
  if (blacklistCount > 0) {
    recommendations.push('Review blacklist and remove stale or risky addresses from future sends.');
  }
  if (openRate < 10 && totalSent > 25) {
    recommendations.push('Improve subject lines and sender reputation before scaling volume.');
  }

  return {
    totalSent,
    totalBounced,
    totalOpened,
    totalClicked,
    bounceRate,
    openRate,
    clickRate,
    deliverabilityScore,
    blacklistCount,
    smtpAccounts: smtpAccounts.length,
    activeSmtp,
    warnings,
    recommendations,
    isSafeToSend: activeSmtp > 0 && (totalSent === 0 || (totalBounced / totalSent) < 0.1)
  };
}

function getInstallDate(db) {
  let stored = db.getSetting('installDate');
  if (!stored) {
    const earliest = db._get(
      "SELECT MIN(createdAt) AS minDate FROM campaign_logs WHERE createdAt IS NOT NULL AND createdAt != ''"
    );
    const installDate = (earliest && earliest.minDate)
      ? earliest.minDate.split('T')[0]
      : new Date().toISOString().split('T')[0];
    db.setSetting('installDate', installDate);
    stored = installDate;
  }
  return stored;
}

function getEngagementAnalytics(db, dateFrom, dateTo) {
  const from = dateFrom || getInstallDate(db);
  const to = dateTo || new Date().toISOString().split('T')[0];
  const fromTs = `${from}T00:00:00.000Z`;
  const toTs = `${to}T23:59:59.999Z`;

  const dailyRows = db._all(
    `SELECT
      date(createdAt) AS day,
      SUM(CASE WHEN status = 'sent'    THEN 1 ELSE 0 END) AS sent,
      SUM(CASE WHEN status = 'failed'  THEN 1 ELSE 0 END) AS failed,
      SUM(CASE WHEN status = 'bounced' THEN 1 ELSE 0 END) AS bounced,
      SUM(CASE WHEN openedAt  IS NOT NULL AND openedAt  != '' THEN 1 ELSE 0 END) AS opened,
      SUM(CASE WHEN clickedAt IS NOT NULL AND clickedAt != '' THEN 1 ELSE 0 END) AS clicked
    FROM campaign_logs
    WHERE createdAt >= ? AND createdAt <= ?
    GROUP BY date(createdAt)
    ORDER BY day ASC`,
    [fromTs, toTs]
  );

  const totals = db._get(
    `SELECT
      SUM(CASE WHEN status = 'sent'    THEN 1 ELSE 0 END) AS totalSent,
      SUM(CASE WHEN status = 'failed'  THEN 1 ELSE 0 END) AS totalFailed,
      SUM(CASE WHEN status = 'bounced' THEN 1 ELSE 0 END) AS totalBounced,
      SUM(CASE WHEN openedAt  IS NOT NULL AND openedAt  != '' THEN 1 ELSE 0 END) AS totalOpened,
      SUM(CASE WHEN clickedAt IS NOT NULL AND clickedAt != '' THEN 1 ELSE 0 END) AS totalClicked
    FROM campaign_logs
    WHERE createdAt >= ? AND createdAt <= ?`,
    [fromTs, toTs]
  ) || {};

  const diffMs = new Date(toTs) - new Date(fromTs);
  const prevFromTs = new Date(new Date(fromTs) - diffMs).toISOString();
  const prevToTs = fromTs;
  const prevTotals = db._get(
    `SELECT
      SUM(CASE WHEN status = 'sent'    THEN 1 ELSE 0 END) AS totalSent,
      SUM(CASE WHEN openedAt  IS NOT NULL AND openedAt  != '' THEN 1 ELSE 0 END) AS totalOpened,
      SUM(CASE WHEN clickedAt IS NOT NULL AND clickedAt != '' THEN 1 ELSE 0 END) AS totalClicked,
      SUM(CASE WHEN status = 'bounced' THEN 1 ELSE 0 END) AS totalBounced
    FROM campaign_logs
    WHERE createdAt >= ? AND createdAt <= ?`,
    [prevFromTs, prevToTs]
  ) || {};

  const sent = Number(totals.totalSent || 0);
  const opened = Number(totals.totalOpened || 0);
  const clicked = Number(totals.totalClicked || 0);
  const bounced = Number(totals.totalBounced || 0);
  const failed = Number(totals.totalFailed || 0);
  const replies = 0;

  const prevOpened = Number(prevTotals.totalOpened || 0);
  const prevClicked = Number(prevTotals.totalClicked || 0);

  const pctChange = (curr, prev) => {
    if (prev === 0 && curr === 0) {
      return 0;
    }
    if (prev === 0) {
      return 100;
    }
    return parseFloat((((curr - prev) / prev) * 100).toFixed(1));
  };
  const diff = (curr, prev) => curr - prev;

  return {
    installDate: getInstallDate(db),
    dateFrom: from,
    dateTo: to,
    totals: { sent, opened, clicked, bounced, failed, replies },
    openRate: sent > 0 ? parseFloat(((opened / sent) * 100).toFixed(1)) : 0,
    clickRate: sent > 0 ? parseFloat(((clicked / sent) * 100).toFixed(1)) : 0,
    bounceRate: sent > 0 ? parseFloat(((bounced / sent) * 100).toFixed(1)) : 0,
    summary: [
      { key: 'likes', label: 'Likes (Opens)', value: opened, change: diff(opened, prevOpened), growth: pctChange(opened, prevOpened), color: '#f59e0b' },
      { key: 'retweets', label: 'Forwards', value: clicked, change: diff(clicked, prevClicked), growth: pctChange(clicked, prevClicked), color: '#ef4444' },
      { key: 'replies', label: 'Replies', value: replies, change: 0, growth: 0, color: '#7c3aed' }
    ],
    donut: [
      { key: 'opened', label: 'Opens', value: opened, color: '#f59e0b' },
      { key: 'clicked', label: 'Clicks', value: clicked, color: '#ef4444' },
      { key: 'bounced', label: 'Bounces', value: bounced, color: '#7c3aed' }
    ],
    daily: dailyRows,
    hasData: sent > 0 || dailyRows.length > 0
  };
}

module.exports = {
  getCampaignAnalytics,
  getDashboardStats,
  getDeliverabilitySnapshot,
  getInstallDate,
  getEngagementAnalytics
};
