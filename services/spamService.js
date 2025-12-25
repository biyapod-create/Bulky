// Bulky Spam Service - Analyzes content and provides auto-fix suggestions

class SpamService {
  constructor(db = null) {
    this.db = db;
    this.defaultSpamWords = [
      { word: 'free', replacement: 'complimentary', severity: 'high', category: 'pricing' },
      { word: 'winner', replacement: 'selected recipient', severity: 'high', category: 'claims' },
      { word: 'click here', replacement: 'learn more', severity: 'high', category: 'cta' },
      { word: 'buy now', replacement: 'get started today', severity: 'high', category: 'cta' },
      { word: 'act now', replacement: 'take action today', severity: 'high', category: 'urgency' },
      { word: 'limited time', replacement: 'available until', severity: 'high', category: 'urgency' },
      { word: 'urgent', replacement: 'important', severity: 'medium', category: 'urgency' },
      { word: 'order now', replacement: 'place your order', severity: 'medium', category: 'cta' },
      { word: 'special offer', replacement: 'exclusive opportunity', severity: 'medium', category: 'pricing' },
      { word: 'exclusive deal', replacement: 'special opportunity', severity: 'medium', category: 'pricing' },
      { word: 'no obligation', replacement: 'no commitment required', severity: 'medium', category: 'claims' },
      { word: 'risk free', replacement: 'worry-free', severity: 'medium', category: 'claims' },
      { word: 'guarantee', replacement: 'commitment', severity: 'medium', category: 'claims' },
      { word: 'congratulations', replacement: 'great news', severity: 'medium', category: 'claims' },
      { word: 'earn money', replacement: 'generate income', severity: 'high', category: 'money' },
      { word: 'make money', replacement: 'build revenue', severity: 'high', category: 'money' },
      { word: 'cash', replacement: 'funds', severity: 'medium', category: 'money' },
      { word: 'double your', replacement: 'increase your', severity: 'high', category: 'claims' },
      { word: 'million dollars', replacement: 'significant amount', severity: 'high', category: 'money' },
      { word: 'work from home', replacement: 'remote opportunity', severity: 'medium', category: 'claims' }
    ];
  }

  getSpamWords() {
    if (this.db) {
      try {
        const dbWords = this.db.getAllSpamReplacements();
        if (dbWords && dbWords.length > 0) {
          return dbWords.map(w => ({
            word: w.spamWord,
            replacement: w.replacement,
            severity: 'medium',
            category: w.category || 'general'
          }));
        }
      } catch (e) {
        console.error('Error getting spam words from DB:', e);
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
    
    // Remove all HTML tag attributes (including style="...", class="...", etc.)
    // This prevents style values from being analyzed
    text = text.replace(/<[^>]+>/g, (match) => {
      // Just get the tag name, ignore attributes
      const tagMatch = match.match(/<\/?([a-zA-Z0-9]+)/);
      if (tagMatch) {
        const tag = tagMatch[0];
        return match.startsWith('</') ? ' ' : ' ';
      }
      return ' ';
    });
    
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
    
    // Remove data:image/xxx;base64,... patterns (inline images)
    let cleaned = text.replace(/data:image\/[a-zA-Z]+;base64,[A-Za-z0-9+/=]+/gi, '');
    
    // Remove src="data:..." or src='data:...' patterns
    cleaned = cleaned.replace(/src\s*=\s*["']data:[^"']+["']/gi, '');
    
    // Remove background:url(data:...) patterns
    cleaned = cleaned.replace(/url\s*\(\s*["']?data:[^)]+["']?\s*\)/gi, '');
    
    // Remove any remaining long base64-like strings (50+ chars of base64 alphabet)
    cleaned = cleaned.replace(/[A-Za-z0-9+/=]{50,}/g, '');
    
    return cleaned;
  }


  analyzeContent(subject, content) {
    // Step 1: Strip base64 content first (from raw HTML)
    const cleanedHtml = this.stripBase64Content(content || '');
    
    // Step 2: Convert HTML to plain text for analysis (removes tags, attributes, etc.)
    const visibleText = this.stripHtmlToText(cleanedHtml);
    
    // Step 3: Subject doesn't need HTML stripping but strip base64 just in case
    const cleanedSubject = this.stripBase64Content(subject || '');
    
    // Now analyze the VISIBLE text only
    const subjectLower = cleanedSubject.toLowerCase();
    const contentLower = visibleText.toLowerCase();
    const combined = subjectLower + ' ' + contentLower;
    
    const issues = [];
    let score = 100;
    const spamWords = this.getSpamWords();

    // Check for spam trigger words in visible text
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
            canAutoFix: true
          });
          score -= penalty;
        }
      } catch (e) {
        console.error('Error checking spam word:', e);
      }
    }

    // Check for ALL CAPS in subject (but not if it's very short)
    if (cleanedSubject && cleanedSubject.length > 5 && cleanedSubject === cleanedSubject.toUpperCase() && /[A-Z]/.test(cleanedSubject)) {
      issues.push({
        type: 'caps_subject',
        text: 'Subject line is ALL CAPS',
        severity: 'high',
        canAutoFix: true
      });
      score -= 20;
    }

    // Check for excessive caps words in visible content (not HTML tags)
    const capsWords = visibleText.match(/\b[A-Z]{4,}\b/g) || [];
    if (capsWords.length > 2) {
      issues.push({
        type: 'caps_content',
        text: `Excessive capitalized words (${capsWords.length} found: ${capsWords.slice(0, 3).join(', ')}${capsWords.length > 3 ? '...' : ''})`,
        severity: 'medium',
        canAutoFix: true
      });
      score -= 10;
    }

    // Check for excessive exclamation marks in visible text
    const exclamations = (combined.match(/!/g) || []).length;
    if (exclamations > 3) {
      issues.push({
        type: 'exclamation',
        text: `Too many exclamation marks (${exclamations} found)`,
        severity: 'medium',
        canAutoFix: true
      });
      score -= Math.min(exclamations * 2, 15);
    }

    // Check subject line length
    if (cleanedSubject && cleanedSubject.length > 60) {
      issues.push({
        type: 'subject_length',
        text: `Subject line too long (${cleanedSubject.length} chars, recommended: under 60)`,
        severity: 'low',
        canAutoFix: false
      });
      score -= 5;
    }

    // Check for missing unsubscribe in visible text
    if (visibleText && visibleText.length > 50 && !contentLower.includes('unsubscribe')) {
      issues.push({
        type: 'no_unsubscribe',
        text: 'No unsubscribe link detected',
        severity: 'medium',
        canAutoFix: true
      });
      score -= 15;
    }

    // Check for suspicious patterns in visible text
    if (combined.includes('$$$') || combined.includes('£££')) {
      issues.push({
        type: 'suspicious',
        text: 'Suspicious currency symbols ($$$)',
        severity: 'high',
        canAutoFix: true
      });
      score -= 20;
    }

    score = Math.max(0, Math.min(100, score));
    
    return {
      score,
      rating: score >= 80 ? 'good' : score >= 50 ? 'fair' : 'poor',
      issues,
      autoFixAvailable: issues.some(i => i.canAutoFix)
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
        if (issue.type === 'spam_word' && issue.word && issue.replacement) {
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
          if (beforeS !== fixedSubject || beforeC !== fixedContent) {
            fixes.push({ type: 'reduced_exclamations' });
          }
        }

        if (issue.type === 'suspicious') {
          fixedContent = fixedContent.replace(/\${3,}/g, '').replace(/£{3,}/g, '');
          fixedSubject = fixedSubject.replace(/\${3,}/g, '').replace(/£{3,}/g, '');
          fixes.push({ type: 'removed_suspicious' });
        }

        if (issue.type === 'no_unsubscribe') {
          if (!fixedContent.toLowerCase().includes('unsubscribe')) {
            fixedContent += '\n\n<p style="font-size:12px;color:#666;margin-top:20px;">To unsubscribe, <a href="{{unsubscribeLink}}">click here</a></p>';
            fixes.push({ type: 'added_unsubscribe' });
          }
        }
      } catch (e) {
        console.error('Error fixing issue:', issue.type, e);
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
    // Split text by HTML tags, process only the text parts
    const parts = text.split(/(<[^>]+>)/g);
    
    return parts.map(part => {
      // If it's an HTML tag, don't modify it
      if (part.startsWith('<') && part.endsWith('>')) {
        return part;
      }
      // If it's text content, apply the replacement
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
      money: ['income', 'revenue', 'earnings', 'payment', 'funds']
    };
    return alternatives[category] || [];
  }
}

module.exports = SpamService;
