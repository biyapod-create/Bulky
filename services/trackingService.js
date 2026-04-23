const crypto = require('crypto');
const url = require('url');

class TrackingService {
  constructor(db) {
    this.db = db;
    this.trackingBaseUrl = 'http://127.0.0.1:3847';

    // HMAC secret for unsubscribe token validation
    // In production, this should be persisted and shared with emailService
    this.hmacSecret = null;
  }

  // Set the HMAC secret (should match emailService.hmacSecret)
  setHmacSecret(secret) {
    this.hmacSecret = secret;
  }

  // Generate HMAC token for unsubscribe link security
  generateUnsubscribeToken(email, campaignId) {
    if (!this.hmacSecret) return '';
    const data = `${email}:${campaignId}`;
    return crypto.createHmac('sha256', this.hmacSecret).update(data).digest('hex');
  }

  // Verify HMAC token on unsubscribe
  verifyUnsubscribeToken(email, campaignId, token) {
    if (!this.hmacSecret || !token) return false;
    try {
      const expected = this.generateUnsubscribeToken(email, campaignId);
      if (expected.length !== token.length) return false;
      return crypto.timingSafeEqual(
        Buffer.from(token, 'hex'),
        Buffer.from(expected, 'hex')
      );
    } catch (e) {
      return false;
    }
  }

  // Generate unique tracking ID for each email
  generateTrackingId() {
    return crypto.randomBytes(16).toString('hex');
  }

  // Sync tracking base URL port with runtime HTTP server
  // Allow external callers (main.js) to set full base URL override
  normalizeTrackingBaseUrl(baseUrl) {
    if (!baseUrl || typeof baseUrl !== 'string') return null;

    let candidate = baseUrl.trim();
    if (!candidate) return null;
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(candidate)) {
      candidate = `http://${candidate}`;
    }

    const parsed = new URL(candidate);
    const pathname = parsed.pathname && parsed.pathname !== '/'
      ? parsed.pathname.replace(/\/+$/, '')
      : '';
    return `${parsed.protocol}//${parsed.host}${pathname}`;
  }

  setTrackingBaseUrl(baseUrl) {
    if (baseUrl && typeof baseUrl === 'string') {
      try {
        const normalized = this.normalizeTrackingBaseUrl(baseUrl);
        if (normalized) {
          this.trackingBaseUrl = normalized;
        }
      } catch (e) {}
    }
  }

  setTrackingPort(port) {
    const parsed = Number(port);
    if (Number.isInteger(parsed) && parsed > 0 && parsed <= 65535) {
      try {
        const current = new URL(this.trackingBaseUrl);
        current.port = String(parsed);
        this.trackingBaseUrl = current.toString().replace(/\/$/, '');
      } catch (e) {
        this.trackingBaseUrl = `http://127.0.0.1:${parsed}`;
      }
    }
  }

  getTrackingBaseUrl() {
    return this.trackingBaseUrl;
  }

  // Create tracking pixel HTML for open tracking
  createTrackingPixel(campaignId, recipientId, trackingId) {
    const pixelUrl = `${this.getTrackingBaseUrl()}/track/open/${campaignId}/${recipientId}/${trackingId}`;
    return `<img src="${pixelUrl}" width="1" height="1" style="display:none;width:1px;height:1px;border:0;" alt="" />`;
  }

  // Wrap a link for click tracking
  wrapLink(originalUrl, campaignId, recipientId, trackingId) {
    const encodedUrl = encodeURIComponent(originalUrl);
    return `${this.getTrackingBaseUrl()}/track/click/${campaignId}/${recipientId}/${trackingId}?url=${encodedUrl}`;
  }

  // Process HTML content to add tracking
  addTrackingToEmail(html, campaignId, recipientId, trackingId, options = {}) {
    const { trackOpens = true, trackClicks = true } = options;
    let processedHtml = html;

    // Add click tracking - wrap all links
    if (trackClicks) {
      processedHtml = this.wrapAllLinks(processedHtml, campaignId, recipientId, trackingId);
    }

    // Add open tracking pixel before </body> or at end
    if (trackOpens) {
      const trackingPixel = this.createTrackingPixel(campaignId, recipientId, trackingId);

      if (processedHtml.toLowerCase().includes('</body>')) {
        processedHtml = processedHtml.replace(/<\/body>/i, `${trackingPixel}</body>`);
      } else if (processedHtml.toLowerCase().includes('</html>')) {
        processedHtml = processedHtml.replace(/<\/html>/i, `${trackingPixel}</html>`);
      } else {
        processedHtml += trackingPixel;
      }
    }

    return processedHtml;
  }

  // Wrap all links in HTML for click tracking
  wrapAllLinks(html, campaignId, recipientId, trackingId) {
    const linkRegex = /<a\s+([^>]*href\s*=\s*["'])([^"']+)(["'][^>]*)>/gi;

    return html.replace(linkRegex, (match, before, href, after) => {
      if (this.shouldSkipLink(href)) {
        return match;
      }

      const wrappedUrl = this.wrapLink(href, campaignId, recipientId, trackingId);
      return `<a ${before}${wrappedUrl}${after}>`;
    });
  }

  // Check if link should be skipped from tracking
  shouldSkipLink(href) {
    if (!href) return true;

    const skipPatterns = [
      /^mailto:/i,
      /^tel:/i,
      /^sms:/i,
      /^javascript:/i,
      /^#/,
      /unsubscribe/i,
      /optout/i,
      /manage.*preferences/i
    ];

    return skipPatterns.some(pattern => pattern.test(href));
  }

  // Create unsubscribe link with HMAC token
  createUnsubscribeLink(campaignId, recipientId, email) {
    const params = new URLSearchParams({ email: email || '' });
    const token = this.generateUnsubscribeToken(email, campaignId);
    if (token) {
      params.set('token', token);
    }
    return `${this.getTrackingBaseUrl()}/unsubscribe/${campaignId}/${recipientId}?${params.toString()}`;
  }

  // Replace unsubscribe placeholder in content
  addUnsubscribeLink(html, campaignId, recipientId, email) {
    const unsubscribeLink = this.createUnsubscribeLink(campaignId, recipientId, email);

    let processed = html.replace(/\{\{unsubscribeLink\}\}/gi, unsubscribeLink);
    processed = processed.replace(/\{\{unsubscribeUrl\}\}/gi, unsubscribeLink);

    return processed;
  }

  // Parse user-agent string for device/client detection
  parseUserAgent(userAgent) {
    if (!userAgent) {
      return { client: 'Unknown', device: 'Unknown', os: 'Unknown', isBot: false };
    }

    const ua = userAgent.toLowerCase();
    const result = { client: 'Unknown', device: 'Unknown', os: 'Unknown', isBot: false };

    // Bot detection
    const botPatterns = [
      'googlebot', 'bingbot', 'yahoo', 'baidu', 'yandex', 'bot', 'spider',
      'crawler', 'feedfetcher', 'slurp', 'mediapartners', 'facebookexternalhit',
      'linkedinbot', 'twitterbot', 'whatsapp', 'telegrambot'
    ];
    if (botPatterns.some(p => ua.includes(p))) {
      result.isBot = true;
      result.client = 'Bot';
    }

    // Email client detection
    if (ua.includes('thunderbird')) {
      result.client = 'Thunderbird';
    } else if (ua.includes('outlook') || ua.includes('microsoft')) {
      result.client = 'Outlook';
    } else if (ua.includes('apple mail') || ua.includes('applemail')) {
      result.client = 'Apple Mail';
    } else if (ua.includes('gmail')) {
      result.client = 'Gmail';
    } else if (ua.includes('yahoo')) {
      result.client = 'Yahoo Mail';
    } else if (ua.includes('chrome')) {
      result.client = 'Chrome (Webmail)';
    } else if (ua.includes('firefox')) {
      result.client = 'Firefox (Webmail)';
    } else if (ua.includes('safari') && !ua.includes('chrome')) {
      result.client = 'Safari (Webmail)';
    } else if (ua.includes('edge') || ua.includes('edg/')) {
      result.client = 'Edge (Webmail)';
    }

    // OS detection
    if (ua.includes('windows')) {
      result.os = 'Windows';
    } else if (ua.includes('mac os') || ua.includes('macintosh')) {
      result.os = 'macOS';
    } else if (ua.includes('linux') && !ua.includes('android')) {
      result.os = 'Linux';
    } else if (ua.includes('android')) {
      result.os = 'Android';
    } else if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ipod')) {
      result.os = 'iOS';
    } else if (ua.includes('cros')) {
      result.os = 'Chrome OS';
    }

    // Device type detection
    if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone') || ua.includes('ipod')) {
      result.device = 'Mobile';
    } else if (ua.includes('ipad') || ua.includes('tablet')) {
      result.device = 'Tablet';
    } else {
      result.device = 'Desktop';
    }

    return result;
  }

  // Extract geographic hints from request headers
  parseGeoHeaders(headers) {
    if (!headers) return { region: 'Unknown', country: 'Unknown', timezone: 'Unknown' };

    const result = { region: 'Unknown', country: 'Unknown', timezone: 'Unknown' };

    // Common CDN/proxy geo headers
    if (headers['cf-ipcountry']) {
      result.country = headers['cf-ipcountry'];
    } else if (headers['x-country-code']) {
      result.country = headers['x-country-code'];
    } else if (headers['x-appengine-country']) {
      result.country = headers['x-appengine-country'];
    }

    if (headers['cf-ipregion'] || headers['x-appengine-region']) {
      result.region = headers['cf-ipregion'] || headers['x-appengine-region'];
    }

    if (headers['cf-timezone'] || headers['x-timezone']) {
      result.timezone = headers['cf-timezone'] || headers['x-timezone'];
    }

    // X-Forwarded-For for IP-based geolocation hints
    if (headers['x-forwarded-for']) {
      result.forwardedIp = headers['x-forwarded-for'].split(',')[0].trim();
    }

    return result;
  }

  // Record an open event
  async recordOpen(campaignId, recipientId, trackingId, metadata = {}) {
    try {
      if (!campaignId || !trackingId) {
        return { success: false, error: 'Missing required parameters: campaignId and trackingId' };
      }

      // Get recipient email from campaign logs
      let email = '';
      try {
        const log = this.db.getCampaignLogByTracking(campaignId, trackingId);
        email = log?.email || '';
      } catch (dbError) {
      }

      // Parse user agent for device/client info
      const uaInfo = this.parseUserAgent(metadata.userAgent);
      const geoInfo = this.parseGeoHeaders(metadata.headers);

      // Check if this is a unique open (first time)
      let isUnique = false;
      try {
        const existingOpen = this.db._get(
          "SELECT id FROM tracking_events WHERE campaignId = ? AND contactId = ? AND type = 'open' LIMIT 1",
          [campaignId, recipientId]
        );
        isUnique = !existingOpen;
      } catch (e) {
        isUnique = true; // Assume unique on error
      }

      // Record the event
      try {
        this.db.addTrackingEvent({
          campaignId,
          contactId: recipientId,
          email,
          type: 'open',
          userAgent: metadata.userAgent || null,
          ipAddress: metadata.ipAddress || null,
          client: uaInfo.client,
          device: uaInfo.device,
          os: uaInfo.os,
          isBot: uaInfo.isBot,
          country: geoInfo.country,
          region: geoInfo.region
        });
      } catch (dbError) {
        return { success: false, error: 'Failed to save tracking event' };
      }

      // Update campaign log with opened timestamp
      if (isUnique) {
        try {
          this.db.updateCampaignLogOpened(campaignId, trackingId);
        } catch (e) {
        }
      }

      return { success: true, isUnique, client: uaInfo.client, device: uaInfo.device };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Record a click event
  async recordClick(campaignId, recipientId, trackingId, linkUrl, metadata = {}) {
    try {
      if (!campaignId || !trackingId) {
        return { success: false, error: 'Missing required parameters: campaignId and trackingId' };
      }

      // Validate and sanitize the redirect URL
      let safeRedirectUrl = linkUrl;
      try {
        if (linkUrl) {
          const parsed = new URL(linkUrl);
          // Only allow http and https redirects
          if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            safeRedirectUrl = '';
          }
        }
      } catch {
        safeRedirectUrl = ''; // Reject unparseable URLs rather than passing them through
      }

      // Get recipient email from campaign logs
      let email = '';
      try {
        const log = this.db.getCampaignLogByTracking(campaignId, trackingId);
        email = log?.email || '';
      } catch (dbError) {
      }

      // Parse user agent for device/client info
      const uaInfo = this.parseUserAgent(metadata.userAgent);
      const geoInfo = this.parseGeoHeaders(metadata.headers);

      // Check if this is a unique click
      let isUnique = false;
      try {
        const existingClick = this.db._get(
          "SELECT id FROM tracking_events WHERE campaignId = ? AND contactId = ? AND type = 'click' LIMIT 1",
          [campaignId, recipientId]
        );
        isUnique = !existingClick;
      } catch (e) {
        isUnique = true;
      }

      // Record the event
      try {
        this.db.addTrackingEvent({
          campaignId,
          contactId: recipientId,
          email,
          type: 'click',
          link: safeRedirectUrl,
          userAgent: metadata.userAgent || null,
          ipAddress: metadata.ipAddress || null,
          client: uaInfo.client,
          device: uaInfo.device,
          os: uaInfo.os,
          isBot: uaInfo.isBot,
          country: geoInfo.country,
          region: geoInfo.region
        });
      } catch (dbError) {
        return { success: false, error: 'Failed to save tracking event' };
      }

      // Update campaign log with clicked timestamp
      if (isUnique) {
        try {
          this.db.updateCampaignLogClicked(campaignId, trackingId);
        } catch (e) {
        }
      }

      return { success: true, isUnique, redirectUrl: safeRedirectUrl, client: uaInfo.client, device: uaInfo.device };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Handle unsubscribe request with HMAC token validation
  isKnownCampaignRecipient(campaignId, recipientId, email) {
    if (!this.db || typeof this.db._get !== 'function' || !campaignId || !recipientId || !email) {
      return false;
    }

    try {
      const log = this.db._get(
        'SELECT email FROM campaign_logs WHERE campaignId = ? AND contactId = ? ORDER BY rowid DESC LIMIT 1',
        [campaignId, recipientId]
      );
      return !!(log?.email && log.email.toLowerCase() === String(email).toLowerCase());
    } catch (e) {
      return false;
    }
  }

  async handleUnsubscribe(campaignId, recipientId, email, reason = null, token = null) {
    try {
      if (!email) {
        return { success: false, error: 'Email address is required' };
      }

      // Validate signed unsubscribe requests. For backward compatibility, allow
      // older unsigned links only when the recipient matches a sent campaign log.
      if (this.hmacSecret) {
        if (token) {
          const isValidToken = this.verifyUnsubscribeToken(email, campaignId, token);
          if (!isValidToken) {
            return { success: false, error: 'Invalid unsubscribe token' };
          }
        } else if (!this.isKnownCampaignRecipient(campaignId, recipientId, email)) {
          return { success: false, error: 'Unable to validate unsubscribe request' };
        }
      }

      // Add to unsubscribes table
      try {
        this.db.addUnsubscribe(email, campaignId, reason || 'User unsubscribed');
      } catch (dbError) {
        return { success: false, error: 'Failed to process unsubscribe' };
      }

      // Also add to blacklist to prevent future sends
      try {
        this.db.addToBlacklist({
          email,
          reason: 'Unsubscribed',
          source: 'unsubscribe'
        });
      } catch (dbError) {
        // Don't fail - the unsubscribe was recorded
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Calculate engagement score for a contact within a campaign
  calculateEngagementScore(campaignId, contactId) {
    try {
      const events = this.db.getTrackingEvents(campaignId)
        .filter(e => e.contactId === contactId);

      if (events.length === 0) return { score: 0, level: 'none' };

      let score = 0;
      const opens = events.filter(e => e.type === 'open');
      const clicks = events.filter(e => e.type === 'click');

      // Points for opening
      if (opens.length > 0) score += 30; // First open
      if (opens.length > 1) score += Math.min(opens.length - 1, 5) * 5; // Repeat opens (max +25)

      // Points for clicking
      if (clicks.length > 0) score += 40; // First click
      if (clicks.length > 1) score += Math.min(clicks.length - 1, 5) * 5; // Repeat clicks (max +25)

      // Unique link clicks bonus
      const uniqueLinks = new Set(clicks.filter(c => c.link).map(c => c.link));
      if (uniqueLinks.size > 1) score += Math.min(uniqueLinks.size, 3) * 5;

      // Recency bonus - engagement in last 24 hours
      const now = Date.now();
      const recentEvents = events.filter(e => {
        const eventTime = new Date(e.createdAt).getTime();
        return (now - eventTime) < 24 * 60 * 60 * 1000;
      });
      if (recentEvents.length > 0) score += 10;

      score = Math.min(100, score);

      let level;
      if (score >= 80) level = 'highly_engaged';
      else if (score >= 50) level = 'engaged';
      else if (score >= 20) level = 'somewhat_engaged';
      else level = 'low';

      return {
        score,
        level,
        totalOpens: opens.length,
        totalClicks: clicks.length,
        uniqueLinksClicked: new Set(clicks.filter(c => c.link).map(c => c.link)).size,
        lastActivity: events.length > 0
          ? events.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0].createdAt
          : null
      };
    } catch (error) {
      return { score: 0, level: 'error', error: error.message };
    }
  }

  // Get tracking statistics for a campaign
  getCampaignTrackingStats(campaignId) {
    const events = this.db.getTrackingEvents(campaignId);

    const opens = events.filter(e => e.type === 'open');
    const clicks = events.filter(e => e.type === 'click');

    // Unique counts by contactId
    const uniqueOpens = new Set(opens.map(e => e.contactId)).size;
    const uniqueClicks = new Set(clicks.map(e => e.contactId)).size;

    // Click by link breakdown
    const clicksByLink = {};
    clicks.forEach(c => {
      if (c.link) {
        clicksByLink[c.link] = (clicksByLink[c.link] || 0) + 1;
      }
    });

    // Opens by hour
    const opensByHour = {};
    opens.forEach(o => {
      const hour = new Date(o.createdAt).getHours().toString().padStart(2, '0');
      opensByHour[hour] = (opensByHour[hour] || 0) + 1;
    });

    // Device breakdown
    const deviceBreakdown = {};
    const clientBreakdown = {};
    const osBreakdown = {};
    events.forEach(e => {
      if (e.device) {
        deviceBreakdown[e.device] = (deviceBreakdown[e.device] || 0) + 1;
      }
      if (e.client) {
        clientBreakdown[e.client] = (clientBreakdown[e.client] || 0) + 1;
      }
      if (e.os) {
        osBreakdown[e.os] = (osBreakdown[e.os] || 0) + 1;
      }
    });

    // Country breakdown
    const countryBreakdown = {};
    events.forEach(e => {
      if (e.country && e.country !== 'Unknown') {
        countryBreakdown[e.country] = (countryBreakdown[e.country] || 0) + 1;
      }
    });

    return {
      totalOpens: opens.length,
      uniqueOpens,
      totalClicks: clicks.length,
      uniqueClicks,
      clicksByLink: Object.entries(clicksByLink)
        .map(([link, count]) => ({ link, count }))
        .sort((a, b) => b.count - a.count),
      opensByHour: Object.entries(opensByHour)
        .map(([hour, count]) => ({ hour, count }))
        .sort((a, b) => a.hour.localeCompare(b.hour)),
      deviceBreakdown,
      clientBreakdown,
      osBreakdown,
      countryBreakdown
    };
  }

  // 1x1 transparent GIF pixel (base64)
  getTrackingPixelBuffer() {
    const pixelBase64 = 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    return Buffer.from(pixelBase64, 'base64');
  }

  // Generate unsubscribe confirmation page HTML
  getUnsubscribePageHtml(success, email) {
    // Escape email before inserting into HTML to prevent XSS
    const safeEmail = (email || '').replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    const statusMessage = success
      ? `<h1>Successfully Unsubscribed</h1><p>${safeEmail} has been removed from our mailing list.</p><p>You will no longer receive emails from this sender.</p>`
      : `<h1>Unsubscribe Failed</h1><p>There was an error processing your request. Please try again or contact support.</p>`;

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Unsubscribe</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: #333;
    }
    .container {
      background: white;
      padding: 40px 60px;
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      text-align: center;
      max-width: 500px;
    }
    h1 { color: ${success ? '#22c55e' : '#ef4444'}; margin-bottom: 16px; }
    p { color: #666; line-height: 1.6; }
    .icon { font-size: 48px; margin-bottom: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">${success ? '&#10003;' : '&#10007;'}</div>
    ${statusMessage}
  </div>
</body>
</html>`;
  }
}

module.exports = TrackingService;
