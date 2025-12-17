class SpamService {
  constructor() {
    // Spam trigger words and their weights
    this.spamWords = {
      // High risk words (weight: 3)
      'free': 3, 'winner': 3, 'won': 3, 'prize': 3, 'lottery': 3,
      'viagra': 3, 'cialis': 3, 'pharmacy': 3, 'pills': 3,
      'casino': 3, 'gambling': 3, 'bet now': 3,
      'nigerian': 3, 'prince': 3, 'inheritance': 3,
      'wire transfer': 3, 'western union': 3, 'moneygram': 3,
      
      // Medium risk words (weight: 2)
      'urgent': 2, 'act now': 2, 'limited time': 2, 'expires': 2,
      'click here': 2, 'click below': 2, 'click now': 2,
      'buy now': 2, 'order now': 2, 'shop now': 2,
      'discount': 2, 'cheap': 2, 'bargain': 2, 'sale': 2,
      'weight loss': 2, 'lose weight': 2, 'diet': 2,
      'credit card': 2, 'visa': 2, 'mastercard': 2,
      'no obligation': 2, 'risk free': 2, 'money back': 2,
      'double your': 2, 'earn money': 2, 'make money': 2,
      
      // Lower risk words (weight: 1)
      'unsubscribe': 1, 'opt-out': 1, 'remove me': 1,
      'deal': 1, 'offer': 1, 'promotion': 1, 'special': 1,
      'guarantee': 1, 'satisfaction': 1, 'promise': 1,
      'cash': 1, 'money': 1, 'dollars': 1, 'income': 1,
      'opportunity': 1, 'investment': 1, 'profit': 1
    };

    // Spam patterns (regex)
    this.spamPatterns = [
      { pattern: /\$\d+[,\d]*(?:\.\d{2})?/gi, weight: 1, name: 'Money amounts' },
      { pattern: /\d+%\s*off/gi, weight: 1, name: 'Percentage discounts' },
      { pattern: /!!!+/g, weight: 2, name: 'Multiple exclamation marks' },
      { pattern: /\?\?\?+/g, weight: 2, name: 'Multiple question marks' },
      { pattern: /[A-Z]{5,}/g, weight: 2, name: 'Excessive caps' },
      { pattern: /https?:\/\/[^\s]+/gi, weight: 0.5, name: 'Links' },
      { pattern: /\b(RE|FW|FWD):\s*/gi, weight: 1, name: 'Forward/Reply prefix' },
      { pattern: /dear\s+(friend|customer|user|member|sir|madam)/gi, weight: 2, name: 'Generic greeting' },
      { pattern: /congratulations?\s*[!]*/gi, weight: 2, name: 'Congratulations opener' },
      { pattern: /100%\s*(free|guaranteed|safe)/gi, weight: 3, name: '100% claims' }
    ];

    // Good practices that reduce spam score
    this.goodPractices = [
      { name: 'Has unsubscribe link', check: (content) => /unsubscribe/i.test(content), bonus: -2 },
      { name: 'Has physical address', check: (content) => /\d+\s+\w+\s+(st|street|ave|avenue|rd|road|blvd|boulevard)/i.test(content), bonus: -1 },
      { name: 'Personalization tokens', check: (content) => /\{\{(firstName|lastName|name|email)\}\}/i.test(content), bonus: -1 },
      { name: 'Plain text alternative exists', check: (content) => true, bonus: 0 }, // Would check actual multipart
      { name: 'Reasonable length', check: (content) => content.length > 100 && content.length < 10000, bonus: -1 }
    ];
  }

  analyzeContent(subject, content) {
    const fullText = `${subject} ${content}`.toLowerCase();
    const issues = [];
    let spamScore = 0;

    // Check spam words
    for (const [word, weight] of Object.entries(this.spamWords)) {
      const regex = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
      const matches = fullText.match(regex);
      if (matches) {
        const count = matches.length;
        const points = weight * count;
        spamScore += points;
        issues.push({
          type: 'word',
          word: word,
          count: count,
          points: points,
          severity: weight >= 3 ? 'high' : weight >= 2 ? 'medium' : 'low'
        });
      }
    }

    // Check spam patterns
    for (const { pattern, weight, name } of this.spamPatterns) {
      const matches = fullText.match(pattern);
      if (matches) {
        const count = matches.length;
        const points = weight * count;
        spamScore += points;
        issues.push({
          type: 'pattern',
          name: name,
          count: count,
          points: points,
          severity: weight >= 2 ? 'medium' : 'low'
        });
      }
    }

    // Check good practices (bonus points)
    const goodPracticesApplied = [];
    for (const practice of this.goodPractices) {
      if (practice.check(content)) {
        spamScore += practice.bonus;
        if (practice.bonus < 0) {
          goodPracticesApplied.push(practice.name);
        }
      }
    }

    // Additional checks
    
    // Subject line checks
    if (subject) {
      if (subject === subject.toUpperCase() && subject.length > 10) {
        spamScore += 3;
        issues.push({
          type: 'subject',
          name: 'All caps subject',
          points: 3,
          severity: 'high'
        });
      }
      
      if (subject.includes('RE:') && !content.includes('Original Message')) {
        spamScore += 2;
        issues.push({
          type: 'subject',
          name: 'Fake reply prefix',
          points: 2,
          severity: 'medium'
        });
      }
    }

    // Image to text ratio (simplified check for img tags)
    const imgTags = (content.match(/<img/gi) || []).length;
    const textLength = content.replace(/<[^>]*>/g, '').length;
    
    if (imgTags > 0 && textLength < 100) {
      spamScore += 2;
      issues.push({
        type: 'content',
        name: 'Low text to image ratio',
        points: 2,
        severity: 'medium'
      });
    }

    // Calculate deliverability score (inverse of spam score, 0-100)
    // Lower spam score = higher deliverability
    const maxSpamScore = 50; // Cap for calculation
    const normalizedSpam = Math.min(spamScore, maxSpamScore);
    const deliverabilityScore = Math.max(0, Math.round(100 - (normalizedSpam * 2)));

    // Determine rating
    let rating;
    let recommendation;
    
    if (deliverabilityScore >= 80) {
      rating = 'excellent';
      recommendation = 'Your email looks good! High chance of reaching inbox.';
    } else if (deliverabilityScore >= 60) {
      rating = 'good';
      recommendation = 'Minor issues detected. Consider addressing the warnings.';
    } else if (deliverabilityScore >= 40) {
      rating = 'fair';
      recommendation = 'Several spam triggers found. Review and modify content.';
    } else {
      rating = 'poor';
      recommendation = 'High spam risk! Significant changes needed before sending.';
    }

    return {
      score: deliverabilityScore,
      spamScore: spamScore,
      rating: rating,
      recommendation: recommendation,
      issues: issues.sort((a, b) => b.points - a.points),
      goodPractices: goodPracticesApplied,
      summary: {
        totalIssues: issues.length,
        highSeverity: issues.filter(i => i.severity === 'high').length,
        mediumSeverity: issues.filter(i => i.severity === 'medium').length,
        lowSeverity: issues.filter(i => i.severity === 'low').length
      }
    };
  }
}

module.exports = SpamService;
