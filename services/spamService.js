// Bulky Spam Service - Analyzes content and provides auto-fix suggestions

class SpamService {
  constructor(db = null) {
    this.db = db;
    this.defaultSpamWords = [
      // Pricing / offers
      { word: 'free', replacement: 'complimentary', severity: 'high', category: 'pricing' },
      { word: 'special offer', replacement: 'exclusive opportunity', severity: 'medium', category: 'pricing' },
      { word: 'exclusive deal', replacement: 'special opportunity', severity: 'medium', category: 'pricing' },
      { word: 'lowest price', replacement: 'competitive pricing', severity: 'high', category: 'pricing' },
      { word: 'best price', replacement: 'great value', severity: 'medium', category: 'pricing' },
      { word: 'cheap', replacement: 'affordable', severity: 'medium', category: 'pricing' },
      { word: 'bargain', replacement: 'value', severity: 'medium', category: 'pricing' },
      { word: 'discount', replacement: 'savings', severity: 'medium', category: 'pricing' },
      { word: 'save big', replacement: 'great savings', severity: 'high', category: 'pricing' },
      { word: 'pennies on the dollar', replacement: 'cost-effective solution', severity: 'high', category: 'pricing' },
      { word: 'unbeatable offer', replacement: 'competitive offer', severity: 'high', category: 'pricing' },

      // CTA (Call to Action)
      { word: 'click here', replacement: 'learn more', severity: 'high', category: 'cta' },
      { word: 'buy now', replacement: 'get started today', severity: 'high', category: 'cta' },
      { word: 'order now', replacement: 'place your order', severity: 'medium', category: 'cta' },
      { word: 'click below', replacement: 'see details below', severity: 'medium', category: 'cta' },
      { word: 'sign up free', replacement: 'create your account', severity: 'medium', category: 'cta' },
      { word: 'subscribe now', replacement: 'join us', severity: 'medium', category: 'cta' },
      { word: 'apply now', replacement: 'submit your application', severity: 'low', category: 'cta' },
      { word: 'call now', replacement: 'contact us', severity: 'medium', category: 'cta' },
      { word: 'visit our website', replacement: 'learn more on our site', severity: 'low', category: 'cta' },

      // Urgency
      { word: 'act now', replacement: 'take action today', severity: 'high', category: 'urgency' },
      { word: 'limited time', replacement: 'available until', severity: 'high', category: 'urgency' },
      { word: 'urgent', replacement: 'important', severity: 'medium', category: 'urgency' },
      { word: 'expires', replacement: 'valid through', severity: 'medium', category: 'urgency' },
      { word: 'hurry', replacement: 'don\'t miss out', severity: 'high', category: 'urgency' },
      { word: 'immediately', replacement: 'promptly', severity: 'medium', category: 'urgency' },
      { word: 'now or never', replacement: 'time-sensitive', severity: 'high', category: 'urgency' },
      { word: 'last chance', replacement: 'final opportunity', severity: 'high', category: 'urgency' },
      { word: 'don\'t delay', replacement: 'act soon', severity: 'medium', category: 'urgency' },
      { word: 'while supplies last', replacement: 'limited availability', severity: 'medium', category: 'urgency' },
      { word: 'offer expires', replacement: 'available until', severity: 'medium', category: 'urgency' },
      { word: 'time limited', replacement: 'currently available', severity: 'medium', category: 'urgency' },

      // Claims / deceptive
      { word: 'winner', replacement: 'selected recipient', severity: 'high', category: 'claims' },
      { word: 'no obligation', replacement: 'no commitment required', severity: 'medium', category: 'claims' },
      { word: 'risk free', replacement: 'worry-free', severity: 'medium', category: 'claims' },
      { word: 'guarantee', replacement: 'commitment', severity: 'medium', category: 'claims' },
      { word: 'congratulations', replacement: 'great news', severity: 'medium', category: 'claims' },
      { word: 'double your', replacement: 'increase your', severity: 'high', category: 'claims' },
      { word: 'work from home', replacement: 'remote opportunity', severity: 'medium', category: 'claims' },
      { word: 'you have been selected', replacement: 'you are invited', severity: 'high', category: 'claims' },
      { word: 'you\'re a winner', replacement: 'you\'ve been chosen', severity: 'high', category: 'claims' },
      { word: 'as seen on', replacement: 'featured in', severity: 'medium', category: 'claims' },
      { word: 'no catch', replacement: 'straightforward', severity: 'medium', category: 'claims' },
      { word: 'no strings attached', replacement: 'simple and clear', severity: 'medium', category: 'claims' },
      { word: 'once in a lifetime', replacement: 'rare opportunity', severity: 'high', category: 'claims' },
      { word: 'miracle', replacement: 'breakthrough', severity: 'high', category: 'claims' },
      { word: 'amazing', replacement: 'impressive', severity: 'low', category: 'claims' },
      { word: 'incredible', replacement: 'remarkable', severity: 'low', category: 'claims' },
      { word: 'satisfaction guaranteed', replacement: 'quality assured', severity: 'medium', category: 'claims' },

      // Money / financial
      { word: 'earn money', replacement: 'generate income', severity: 'high', category: 'money' },
      { word: 'make money', replacement: 'build revenue', severity: 'high', category: 'money' },
      { word: 'cash', replacement: 'funds', severity: 'medium', category: 'money' },
      { word: 'million dollars', replacement: 'significant amount', severity: 'high', category: 'money' },
      { word: 'extra income', replacement: 'additional revenue', severity: 'medium', category: 'money' },
      { word: 'financial freedom', replacement: 'financial stability', severity: 'high', category: 'money' },
      { word: 'get paid', replacement: 'receive compensation', severity: 'medium', category: 'money' },
      { word: 'no fees', replacement: 'no additional costs', severity: 'medium', category: 'money' },
      { word: 'credit card', replacement: 'payment method', severity: 'medium', category: 'money' },
      { word: 'debt consolidation', replacement: 'financial planning', severity: 'high', category: 'money' },
      { word: 'investment opportunity', replacement: 'business opportunity', severity: 'high', category: 'money' },
      { word: 'no credit check', replacement: 'simplified approval', severity: 'high', category: 'money' },
      { word: 'bitcoin', replacement: 'digital payment', severity: 'medium', category: 'money' },
      { word: 'cryptocurrency', replacement: 'digital assets', severity: 'medium', category: 'money' },

      // Pharma / health
      { word: 'weight loss', replacement: 'wellness program', severity: 'high', category: 'pharma' },
      { word: 'lose weight', replacement: 'get healthier', severity: 'high', category: 'pharma' },
      { word: 'viagra', replacement: '', severity: 'high', category: 'pharma' },
      { word: 'cialis', replacement: '', severity: 'high', category: 'pharma' },
      { word: 'pharmacy', replacement: 'health provider', severity: 'medium', category: 'pharma' },
      { word: 'prescription', replacement: 'medical guidance', severity: 'medium', category: 'pharma' },
      { word: 'diet pill', replacement: 'health supplement', severity: 'high', category: 'pharma' },
      { word: 'supplement', replacement: 'wellness product', severity: 'low', category: 'pharma' },
      { word: 'anti-aging', replacement: 'skincare', severity: 'medium', category: 'pharma' },
      { word: 'cure', replacement: 'treatment', severity: 'high', category: 'pharma' },
      { word: 'testosterone', replacement: 'health support', severity: 'high', category: 'pharma' },

      // Technical / deceptive
      { word: 'click to remove', replacement: 'manage preferences', severity: 'high', category: 'technical' },
      { word: 'not spam', replacement: '', severity: 'high', category: 'technical' },
      { word: 'this is not spam', replacement: '', severity: 'high', category: 'technical' },
      { word: 'bulk email', replacement: 'newsletter', severity: 'high', category: 'technical' },
      { word: 'mass email', replacement: 'email campaign', severity: 'high', category: 'technical' },
      { word: 'dear friend', replacement: 'hello', severity: 'high', category: 'technical' },
      { word: 'dear sir', replacement: 'hello', severity: 'medium', category: 'technical' },
      { word: 'undisclosed recipients', replacement: '', severity: 'high', category: 'technical' },
      { word: 'multi-level marketing', replacement: 'business opportunity', severity: 'high', category: 'technical' },
      { word: 'mlm', replacement: 'network', severity: 'high', category: 'technical' }
    ];

    // URL shortener domains to flag
    this.shortenerDomains = [
      'bit.ly', 'tinyurl.com', 'goo.gl', 't.co', 'is.gd', 'ow.ly',
      'buff.ly', 'adf.ly', 'j.mp', 'surl.li', 'rb.gy', 'cutt.ly',
      'shorturl.at', 'tiny.cc', 'bc.vc', 'v.gd', 'clck.ru', 'shorte.st',
      'rebrand.ly', 'bl.ink', 'short.io', 'lnkd.in', 'db.tt', 'qr.ae'
    ];

    // Suspicious TLDs
    this.suspiciousTlds = [
      '.xyz', '.top', '.club', '.win', '.bid', '.stream', '.gq',
      '.cf', '.tk', '.ml', '.ga', '.buzz', '.work', '.click',
      '.loan', '.racing', '.download', '.review', '.party', '.faith'
    ];
  }

  getSpamWords() {
    if (this.db) {
      try {
        const dbWords = this.db.getAllSpamReplacements();
        if (dbWords && dbWords.length > 0) {
          const dbMapped = dbWords.map(w => ({
            word: w.spamWord,
            replacement: w.replacement,
            severity: 'medium',
            category: w.category || 'general'
          }));
          // Merge: DB words override matching defaults, preserving all built-in rules
          const merged = [...this.defaultSpamWords];
          for (const dbWord of dbMapped) {
            const i = merged.findIndex(d => d.word.toLowerCase() === dbWord.word.toLowerCase());
            if (i >= 0) merged[i] = dbWord; else merged.push(dbWord);
          }
          return merged;
        }
      } catch (e) {
      }
    }
    return this.defaultSpamWords;
  }

  escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // Strip HTML tags and get only visible text content for analysis
  stripHtmlToText(html) {
    if (!html) return '';

    let text = html;

    // Remove script and style tags with their content entirely
    text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

    // Remove HTML comments
    text = text.replace(/<!--[\s\S]*?-->/g, '');

    // Replace block-level tags with a space so adjacent words don't merge
    text = text.replace(/<\/?(p|div|h[1-6]|li|td|th|br|hr|blockquote|section|article|header|footer|main|aside|tr)[^>]*>/gi, ' ');
    // Remove all remaining HTML tags
    text = text.replace(/<[^>]+>/g, '');

    // Decode common HTML entities
    text = text.replace(/&nbsp;/gi, ' ');
    text = text.replace(/&amp;/gi, '&');
    text = text.replace(/&lt;/gi, '<');
    text = text.replace(/&gt;/gi, '>');
    text = text.replace(/&quot;/gi, '"');
    text = text.replace(/&#39;/gi, "'");
    text = text.replace(/&apos;/gi, "'");
    text = text.replace(/&#x27;/gi, "'");
    text = text.replace(/&#(\d+);/gi, (match, dec) => String.fromCharCode(dec));

    // Clean up extra whitespace
    text = text.replace(/\s+/g, ' ').trim();

    return text;
  }

  // Strip base64 encoded content to avoid false positives
  stripBase64Content(text) {
    if (!text) return '';

    let cleaned = text.replace(/data:image\/[a-zA-Z]+;base64,[A-Za-z0-9+/=]+/gi, '');
    cleaned = cleaned.replace(/src\s*=\s*["']data:[^"']+["']/gi, '');
    cleaned = cleaned.replace(/url\s*\(\s*["']?data:[^)]+["']?\s*\)/gi, '');
    cleaned = cleaned.replace(/[A-Za-z0-9+/=]{50,}/g, '');

    return cleaned;
  }

  // Extract all links from HTML content
  _extractLinks(html) {
    if (!html) return [];
    const links = [];
    const regex = /href\s*=\s*["']([^"']+)["']/gi;
    let match;
    while ((match = regex.exec(html)) !== null) {
      const url = match[1].trim();
      if (url && !url.startsWith('#') && !url.startsWith('mailto:') && !url.startsWith('tel:')) {
        links.push(url);
      }
    }
    return links;
  }

  // Extract all image tags from HTML
  _extractImages(html) {
    if (!html) return [];
    const images = [];
    const regex = /<img[^>]*>/gi;
    let match;
    while ((match = regex.exec(html)) !== null) {
      const tag = match[0];
      const srcMatch = tag.match(/src\s*=\s*["']([^"']+)["']/i);
      const altMatch = tag.match(/alt\s*=\s*["']([^"']*)["']/i);
      images.push({
        tag,
        src: srcMatch ? srcMatch[1] : '',
        hasAlt: !!altMatch && altMatch[1].trim().length > 0
      });
    }
    return images;
  }

  // Analyze links for spam signals
  _analyzeLinkQuality(html) {
    const issues = [];
    const links = this._extractLinks(html);

    if (links.length === 0) return issues;

    // Check for URL shorteners
    const shortenerLinks = links.filter(link => {
      try {
        const hostname = new URL(link).hostname.toLowerCase();
        return this.shortenerDomains.some(d => hostname === d || hostname.endsWith('.' + d));
      } catch {
        return false;
      }
    });

    if (shortenerLinks.length > 0) {
      issues.push({
        type: 'shortened_urls',
        text: `Shortened URLs detected (${shortenerLinks.length}): ${shortenerLinks.slice(0, 3).join(', ')}${shortenerLinks.length > 3 ? '...' : ''}`,
        severity: 'high',
        category: 'links',
        penalty: 15,
        canAutoFix: false
      });
    }

    // Check for excessive links
    if (links.length > 10) {
      issues.push({
        type: 'excessive_links',
        text: `Too many links (${links.length}). Keep under 10 for best deliverability.`,
        severity: 'medium',
        category: 'links',
        penalty: 10,
        canAutoFix: false
      });
    }

    // Check for suspicious TLDs
    const suspiciousLinks = links.filter(link => {
      try {
        const hostname = new URL(link).hostname.toLowerCase();
        return this.suspiciousTlds.some(tld => hostname.endsWith(tld));
      } catch {
        return false;
      }
    });

    if (suspiciousLinks.length > 0) {
      issues.push({
        type: 'suspicious_tlds',
        text: `Links with suspicious TLDs detected (${suspiciousLinks.length})`,
        severity: 'high',
        category: 'links',
        penalty: 15,
        canAutoFix: false
      });
    }

    return issues;
  }

  // Analyze image to text ratio
  _analyzeImageTextRatio(html, visibleText) {
    const issues = [];
    const images = this._extractImages(html);

    if (images.length === 0) return issues;

    const textLength = visibleText.length;
    const imageCount = images.length;

    // Check for single-image emails (image-only)
    if (imageCount >= 1 && textLength < 100) {
      issues.push({
        type: 'image_only_email',
        text: 'Email appears to be mostly images with very little text. Spam filters penalize image-only emails.',
        severity: 'high',
        category: 'structure',
        penalty: 20,
        canAutoFix: false
      });
    }

    // Check for missing alt tags
    const missingAlt = images.filter(img => !img.hasAlt);
    if (missingAlt.length > 0) {
      issues.push({
        type: 'missing_alt_tags',
        text: `${missingAlt.length} image(s) missing alt text. Add descriptive alt attributes.`,
        severity: 'medium',
        category: 'structure',
        penalty: 5,
        canAutoFix: false
      });
    }

    // Too many images relative to text
    if (imageCount > 5 && textLength < 500) {
      issues.push({
        type: 'high_image_ratio',
        text: `High image-to-text ratio (${imageCount} images, only ${textLength} chars of text).`,
        severity: 'medium',
        category: 'structure',
        penalty: 10,
        canAutoFix: false
      });
    }

    return issues;
  }

  // Analyze subject line quality
  _analyzeSubjectLine(subject) {
    const issues = [];
    if (!subject) return issues;

    // Subject too short
    if (subject.length < 10) {
      issues.push({
        type: 'subject_too_short',
        text: `Subject line is very short (${subject.length} chars). Aim for 30-60 characters.`,
        severity: 'low',
        category: 'subject',
        penalty: 5,
        canAutoFix: false
      });
    }

    // Subject too long
    if (subject.length > 60) {
      issues.push({
        type: 'subject_length',
        text: `Subject line too long (${subject.length} chars, recommended: under 60)`,
        severity: 'low',
        category: 'subject',
        penalty: 5,
        canAutoFix: false
      });
    }

    // Excessive special characters
    const specialChars = (subject.match(/[!@#$%^&*()+=\[\]{}<>~`|\\]/g) || []).length;
    if (specialChars > 3) {
      issues.push({
        type: 'subject_special_chars',
        text: `Subject contains excessive special characters (${specialChars} found)`,
        severity: 'medium',
        category: 'subject',
        penalty: 10,
        canAutoFix: false
      });
    }

    // ALL CAPS subject — strip merge tags first so {{FIRSTNAME}} doesn't trigger a false positive
    const subjectWithoutTags = subject.replace(/\{\{[^}]+\}\}/g, '').trim();
    if (subjectWithoutTags.length > 5 && subjectWithoutTags === subjectWithoutTags.toUpperCase() && /[A-Z]/.test(subjectWithoutTags)) {
      issues.push({
        type: 'caps_subject',
        text: 'Subject line is ALL CAPS',
        severity: 'high',
        category: 'subject',
        penalty: 20,
        canAutoFix: true
      });
    }

    // Starts with "Re:" or "Fwd:" deceptively
    if (/^(re|fw|fwd):/i.test(subject.trim())) {
      issues.push({
        type: 'deceptive_re_fwd',
        text: 'Subject starts with "Re:" or "Fwd:" which can appear deceptive for new contacts',
        severity: 'medium',
        category: 'subject',
        penalty: 10,
        canAutoFix: false
      });
    }

    // Emoji overuse in subject
    const emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;
    const emojiCount = (subject.match(emojiRegex) || []).length;
    if (emojiCount > 2) {
      issues.push({
        type: 'subject_emoji_overuse',
        text: `Too many emojis in subject line (${emojiCount} found). Use 1-2 max.`,
        severity: 'medium',
        category: 'subject',
        penalty: 5,
        canAutoFix: false
      });
    }

    return issues;
  }

  // Analyze email headers and structure
  _analyzeHeaders(html) {
    const issues = [];
    const contentLower = (html || '').toLowerCase();

    // Check for missing unsubscribe
    if (html && html.length > 50 && !contentLower.includes('unsubscribe')) {
      issues.push({
        type: 'no_unsubscribe',
        text: 'No unsubscribe link detected. Required by CAN-SPAM and GDPR.',
        severity: 'high',
        category: 'compliance',
        penalty: 15,
        canAutoFix: true
      });
    }

    // List-Unsubscribe header is auto-added by Bulky for all campaign sends -- no suggestion needed

    // Check for missing physical address (CAN-SPAM)
    const hasAddress = contentLower.includes('address') || contentLower.includes('street') ||
      contentLower.includes('suite') || contentLower.includes('p.o. box') ||
      /\d{5}(-\d{4})?/.test(html); // ZIP code pattern
    if (html && html.length > 200 && !hasAddress) {
      issues.push({
        type: 'no_physical_address',
        text: 'No physical mailing address detected. Required by CAN-SPAM.',
        severity: 'medium',
        category: 'compliance',
        penalty: 10,
        canAutoFix: false
      });
    }

    return issues;
  }

  // Analyze content structure (text/html ratio)
  _analyzeContentStructure(html, visibleText) {
    const issues = [];
    if (!html) return issues;

    const htmlLength = html.length;
    const textLength = visibleText.length;

    // Very low text-to-HTML ratio
    if (htmlLength > 500 && textLength > 0) {
      const ratio = textLength / htmlLength;
      if (ratio < 0.1) {
        issues.push({
          type: 'low_text_html_ratio',
          text: `Very low text-to-HTML ratio (${(ratio * 100).toFixed(1)}%). Add more visible text content.`,
          severity: 'medium',
          category: 'structure',
          penalty: 10,
          canAutoFix: false
        });
      }
    }

    // Check for hidden text (font-size:0, display:none with text, color matching background)
    const hiddenTextPatterns = [
      /font-size\s*:\s*0/i,
      /visibility\s*:\s*hidden/i
    ];
    for (const pattern of hiddenTextPatterns) {
      if (pattern.test(html)) {
        issues.push({
          type: 'hidden_text',
          text: 'Potentially hidden text detected (font-size:0 or visibility:hidden). Spam filters penalize this.',
          severity: 'high',
          category: 'structure',
          penalty: 20,
          canAutoFix: false
        });
        break;
      }
    }

    return issues;
  }

  // Calculate weighted deliverability score
  _calculateDeliverabilityScore(issues) {
    let score = 100;
    const categoryScores = {};

    for (const issue of issues) {
      if (issue.severity === 'info') continue;
      const penalty = issue.penalty || (issue.severity === 'high' ? 15 : issue.severity === 'medium' ? 10 : 5);
      score -= penalty;

      const cat = issue.category || 'general';
      if (!categoryScores[cat]) {
        categoryScores[cat] = { total: 0, count: 0 };
      }
      categoryScores[cat].total += penalty;
      categoryScores[cat].count++;
    }

    score = Math.max(0, Math.min(100, score));

    let rating;
    if (score >= 80) rating = 'good';
    else if (score >= 60) rating = 'fair';
    else if (score >= 40) rating = 'poor';
    else rating = 'critical';

    return { score, rating, categoryScores };
  }


  analyzeContent(subject, content) {
    // Step 1: Strip base64 content first (from raw HTML)
    const cleanedHtml = this.stripBase64Content(content || '');

    // Step 2: Convert HTML to plain text for analysis
    const visibleText = this.stripHtmlToText(cleanedHtml);

    // Step 3: Subject doesn't need HTML stripping but strip base64 just in case
    const cleanedSubject = this.stripBase64Content(subject || '');

    const subjectLower = cleanedSubject.toLowerCase();
    const contentLower = visibleText.toLowerCase();
    const combined = subjectLower + ' ' + contentLower;

    const issues = [];
    const spamWords = this.getSpamWords();

    // --- Spam trigger word check ---
    for (const item of spamWords) {
      try {
        const wordLower = item.word.toLowerCase();
        const regex = new RegExp(`\\b${this.escapeRegex(wordLower)}\\b`, 'gi');
        if (regex.test(combined)) {
          const penalty = item.severity === 'high' ? 15 : item.severity === 'medium' ? 10 : 5;
          issues.push({
            type: 'spam_word',
            text: `Contains spam trigger: "${item.word}"`,
            word: item.word,
            replacement: item.replacement,
            severity: item.severity,
            category: item.category,
            penalty,
            canAutoFix: true
          });
        }
      } catch (e) {
      }
    }

    // --- Subject line analysis ---
    const subjectIssues = this._analyzeSubjectLine(cleanedSubject);
    issues.push(...subjectIssues);

    // --- Caps in content ---
    const capsWords = visibleText.match(/\b[A-Z]{4,}\b/g) || [];
    if (capsWords.length > 2) {
      issues.push({
        type: 'caps_content',
        text: `Excessive capitalized words (${capsWords.length} found: ${capsWords.slice(0, 3).join(', ')}${capsWords.length > 3 ? '...' : ''})`,
        severity: 'medium',
        category: 'formatting',
        penalty: 10,
        canAutoFix: true
      });
    }

    // --- Exclamation marks ---
    const exclamations = (combined.match(/!/g) || []).length;
    if (exclamations > 3) {
      issues.push({
        type: 'exclamation',
        text: `Too many exclamation marks (${exclamations} found)`,
        severity: 'medium',
        category: 'formatting',
        penalty: Math.min(exclamations * 2, 15),
        canAutoFix: true
      });
    }

    // --- Suspicious currency patterns ---
    if (combined.includes('$$$') || combined.includes('\u00a3\u00a3\u00a3')) {
      issues.push({
        type: 'suspicious',
        text: 'Suspicious currency symbols ($$$)',
        severity: 'high',
        category: 'content',
        penalty: 20,
        canAutoFix: true
      });
    }

    // --- Link analysis ---
    const linkIssues = this._analyzeLinkQuality(content || '');
    issues.push(...linkIssues);

    // --- Image-to-text ratio ---
    const imageIssues = this._analyzeImageTextRatio(content || '', visibleText);
    issues.push(...imageIssues);

    // --- Header / compliance analysis ---
    const headerIssues = this._analyzeHeaders(content || '');
    issues.push(...headerIssues);

    // --- Content structure ---
    const structureIssues = this._analyzeContentStructure(content || '', visibleText);
    issues.push(...structureIssues);

    // --- Domain reputation suggestions ---
    const links = this._extractLinks(content || '');
    if (links.length > 0) {
      issues.push({
        type: 'domain_reputation_check',
        text: 'Tip: Check your sending domain reputation at mail-tester.com, mxtoolbox.com, or Google Postmaster Tools',
        severity: 'info',
        category: 'reputation',
        penalty: 0,
        canAutoFix: false
      });
    }

    // --- Calculate final score with weighted categories ---
    const { score, rating, categoryScores } = this._calculateDeliverabilityScore(issues);

    // Filter out info-level issues from the actionable list
    const actionableIssues = issues.filter(i => i.severity !== 'info');

    return {
      score,
      rating,
      issues: actionableIssues,
      suggestions: issues.filter(i => i.severity === 'info'),
      categoryScores,
      autoFixAvailable: actionableIssues.some(i => i.canAutoFix),
      deliverabilityScore: score,
      deliverabilityRating: rating
    };
  }


  autoFix(subject, content, issues) {
    let fixedSubject = subject || '';
    let fixedContent = content || '';
    const fixes = [];
    const originalScore = this.analyzeContent(subject, content).score;

    if (!issues || issues.length === 0) {
      const analysis = this.analyzeContent(subject, content);
      issues = analysis.issues;
    }

    for (const issue of issues) {
      if (!issue.canAutoFix) continue;

      try {
        if (issue.type === 'spam_word' && issue.word && issue.replacement != null) {
          const regex = new RegExp(`\\b${this.escapeRegex(issue.word)}\\b`, 'gi');
          const replacement = issue.replacement;

          const beforeS = fixedSubject;
          fixedSubject = fixedSubject.replace(regex, (match) => {
            if (match === match.toUpperCase()) return replacement.toUpperCase();
            if (match[0] === match[0].toUpperCase()) return replacement.charAt(0).toUpperCase() + replacement.slice(1);
            return replacement;
          });
          if (beforeS !== fixedSubject) {
            fixes.push({ type: 'replaced', original: issue.word, replacement, location: 'subject' });
          }

          const beforeC = fixedContent;
          fixedContent = this.replaceOutsideHtmlTags(fixedContent, regex, (match) => {
            if (match === match.toUpperCase()) return replacement.toUpperCase();
            if (match[0] === match[0].toUpperCase()) return replacement.charAt(0).toUpperCase() + replacement.slice(1);
            return replacement;
          });
          if (beforeC !== fixedContent) {
            fixes.push({ type: 'replaced', original: issue.word, replacement, location: 'content' });
          }
        }

        if (issue.type === 'caps_subject') {
          const before = fixedSubject;
          fixedSubject = this.toTitleCase(fixedSubject);
          if (before !== fixedSubject) {
            fixes.push({ type: 'title_cased', location: 'subject' });
          }
        }

        if (issue.type === 'caps_content') {
          const before = fixedContent;
          fixedContent = this.replaceOutsideHtmlTags(fixedContent, /\b[A-Z]{4,}\b/g, (match) => {
            return match.charAt(0) + match.slice(1).toLowerCase();
          });
          if (before !== fixedContent) {
            fixes.push({ type: 'lowercased_caps', location: 'content' });
          }
        }

        if (issue.type === 'exclamation') {
          const beforeS = fixedSubject;
          const beforeC = fixedContent;
          fixedSubject = fixedSubject.replace(/!{2,}/g, '!');
          fixedContent = fixedContent.replace(/!{2,}/g, '!');
          // trim total exclamations in subject to max 2
          let _eC = (fixedSubject.match(/!/g) || []).length;
          while (_eC > 2) { fixedSubject = fixedSubject.replace(/!([^!]|$)/, '$1'); _eC--; }
          if (beforeS !== fixedSubject || beforeC !== fixedContent) {
            fixes.push({ type: 'reduced_exclamations' });
          }
        }

        if (issue.type === 'suspicious') {
          fixedContent = fixedContent.replace(/\${3,}/g, '').replace(/\u00a3{3,}/g, '');
          fixedSubject = fixedSubject.replace(/\${3,}/g, '').replace(/\u00a3{3,}/g, '');
          fixes.push({ type: 'removed_suspicious' });
        }

        if (issue.type === 'no_unsubscribe') {
          if (!fixedContent.toLowerCase().includes('unsubscribe')) {
            fixedContent += '\n\n<p style="font-size:12px;color:#666;margin-top:20px;">To unsubscribe, <a href="{{unsubscribeLink}}">click here</a></p>';
            fixes.push({ type: 'added_unsubscribe' });
          }
        }
      } catch (e) {
      }
    }

    const newAnalysis = this.analyzeContent(fixedSubject, fixedContent);

    return {
      subject: fixedSubject,
      content: fixedContent,
      fixes,
      fixCount: fixes.length,
      originalScore,
      newScore: newAnalysis.score,
      improvement: newAnalysis.score - originalScore,
      remainingIssues: newAnalysis.issues.filter(i => !i.canAutoFix)
    };
  }


  // Replace text but only in visible content (outside HTML tags)
  replaceOutsideHtmlTags(text, regex, replacer) {
    const parts = text.split(/(<[^>]+>)/g);

    return parts.map(part => {
      if (part.startsWith('<') && part.endsWith('>')) {
        return part;
      }
      return part.replace(regex, replacer);
    }).join('');
  }

  toTitleCase(str) {
    return str.toLowerCase().replace(/\b\w/g, char => char.toUpperCase());
  }

  getSuggestions(word) {
    const spamWords = this.getSpamWords();
    const found = spamWords.find(w => w.word.toLowerCase() === word.toLowerCase());
    if (found) {
      return { word: found.word, replacement: found.replacement, alternatives: this.getAlternatives(found.category) };
    }
    return null;
  }

  getAlternatives(category) {
    const alternatives = {
      pricing: ['value', 'savings', 'offer', 'deal', 'price'],
      urgency: ['timely', 'important', 'notable', 'significant'],
      cta: ['discover', 'explore', 'see details', 'find out more', 'get started'],
      claims: ['opportunity', 'possibility', 'potential', 'chance'],
      money: ['income', 'revenue', 'earnings', 'payment', 'funds'],
      pharma: ['wellness', 'health solution', 'care program', 'treatment option'],
      technical: ['communication', 'message', 'notification', 'update'],
      links: [],
      structure: [],
      compliance: [],
      formatting: [],
      subject: [],
      headers: [],
      reputation: [],
      content: []
    };
    return alternatives[category] || [];
  }
}

module.exports = SpamService;
