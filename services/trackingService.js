const crypto = require('crypto');
const url = require('url');

class TrackingService {
  constructor(db) {
    this.db = db;
    this.trackingPort = 3847; // Local tracking server port
    this.trackingHost = '127.0.0.1';
  }

  // Generate unique tracking ID for each email
  generateTrackingId() {
    return crypto.randomBytes(16).toString('hex');
  }

  // Get tracking base URL
  getTrackingBaseUrl() {
    return `http://${this.trackingHost}:${this.trackingPort}`;
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
    // Match href attributes in anchor tags
    const linkRegex = /<a\s+([^>]*href\s*=\s*["'])([^"']+)(["'][^>]*)>/gi;
    
    return html.replace(linkRegex, (match, before, href, after) => {
      // Skip certain links
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
      /^mailto:/i,           // Email links
      /^tel:/i,              // Phone links
      /^sms:/i,              // SMS links
      /^javascript:/i,       // JavaScript links
      /^#/,                  // Anchor links
      /unsubscribe/i,        // Unsubscribe links (handled separately)
      /optout/i,             // Opt-out links
      /manage.*preferences/i // Preference management
    ];
    
    return skipPatterns.some(pattern => pattern.test(href));
  }

  // Create unsubscribe link
  createUnsubscribeLink(campaignId, recipientId, email) {
    const encodedEmail = encodeURIComponent(email);
    return `${this.getTrackingBaseUrl()}/unsubscribe/${campaignId}/${recipientId}?email=${encodedEmail}`;
  }

  // Replace unsubscribe placeholder in content
  addUnsubscribeLink(html, campaignId, recipientId, email) {
    const unsubscribeLink = this.createUnsubscribeLink(campaignId, recipientId, email);
    
    // Replace placeholder
    let processed = html.replace(/\{\{unsubscribeLink\}\}/gi, unsubscribeLink);
    processed = processed.replace(/\{\{unsubscribeUrl\}\}/gi, unsubscribeLink);
    
    return processed;
  }

  // Record an open event
  async recordOpen(campaignId, recipientId, trackingId, metadata = {}) {
    try {
      // Get recipient email from campaign logs
      const log = this.db.getCampaignLogByTracking(campaignId, trackingId);
      const email = log?.email || '';

      // Check if this is a unique open (first time)
      const existingOpens = this.db.getTrackingEvents(campaignId)
        .filter(e => e.type === 'open' && e.contactId === recipientId);
      
      const isUnique = existingOpens.length === 0;

      // Record the event
      this.db.addTrackingEvent({
        campaignId,
        contactId: recipientId,
        email,
        type: 'open',
        userAgent: metadata.userAgent || null,
        ipAddress: metadata.ipAddress || null
      });

      // Update campaign log with opened timestamp
      if (isUnique) {
        this.db.updateCampaignLogOpened(campaignId, trackingId);
      }

      return { success: true, isUnique };
    } catch (error) {
      console.error('Error recording open:', error);
      return { success: false, error: error.message };
    }
  }

  // Record a click event
  async recordClick(campaignId, recipientId, trackingId, linkUrl, metadata = {}) {
    try {
      // Get recipient email from campaign logs
      const log = this.db.getCampaignLogByTracking(campaignId, trackingId);
      const email = log?.email || '';

      // Check if this is a unique click
      const existingClicks = this.db.getTrackingEvents(campaignId)
        .filter(e => e.type === 'click' && e.contactId === recipientId);
      
      const isUnique = existingClicks.length === 0;

      // Record the event
      this.db.addTrackingEvent({
        campaignId,
        contactId: recipientId,
        email,
        type: 'click',
        link: linkUrl,
        userAgent: metadata.userAgent || null,
        ipAddress: metadata.ipAddress || null
      });

      // Update campaign log with clicked timestamp
      if (isUnique) {
        this.db.updateCampaignLogClicked(campaignId, trackingId);
      }

      return { success: true, isUnique, redirectUrl: linkUrl };
    } catch (error) {
      console.error('Error recording click:', error);
      return { success: false, error: error.message };
    }
  }

  // Handle unsubscribe request
  async handleUnsubscribe(campaignId, recipientId, email, reason = null) {
    try {
      // Add to unsubscribes table
      this.db.addUnsubscribe(email, campaignId, reason || 'User unsubscribed');
      
      // Also add to blacklist to prevent future sends
      this.db.addToBlacklist({
        email,
        reason: 'Unsubscribed',
        source: 'unsubscribe'
      });

      return { success: true };
    } catch (error) {
      console.error('Error handling unsubscribe:', error);
      return { success: false, error: error.message };
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
        .sort((a, b) => a.hour.localeCompare(b.hour))
    };
  }

  // 1x1 transparent GIF pixel (base64)
  getTrackingPixelBuffer() {
    // Smallest valid 1x1 transparent GIF
    const pixelBase64 = 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    return Buffer.from(pixelBase64, 'base64');
  }

  // Generate unsubscribe confirmation page HTML
  getUnsubscribePageHtml(success, email) {
    const statusMessage = success 
      ? `<h1>Successfully Unsubscribed</h1><p>${email} has been removed from our mailing list.</p><p>You will no longer receive emails from this sender.</p>`
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
    <div class="icon">${success ? '✓' : '✗'}</div>
    ${statusMessage}
  </div>
</body>
</html>`;
  }
}

module.exports = TrackingService;
