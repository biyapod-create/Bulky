import React, { useState } from 'react';
import { ShieldCheck, AlertTriangle, CheckCircle, Lightbulb, ChevronDown, ChevronUp } from 'lucide-react';
import { useToast } from '../components/ToastContext';

const deliverabilityTips = [
  {
    category: "Email Authentication (Critical)",
    tips: [
      "Set up SPF record in your domain's DNS",
      "Configure DKIM signature for email authenticity",
      "Implement DMARC policy",
      "Use a custom domain email instead of free providers"
    ]
  },
  {
    category: "Sender Reputation",
    tips: [
      "Warm up new email accounts gradually (10-20 emails/day)",
      "Keep bounce rates below 2%",
      "Monitor spam complaint rates (under 0.1%)",
      "Maintain consistent sending volume"
    ]
  },
  {
    category: "Content Best Practices",
    tips: [
      "Avoid spam trigger words: FREE, URGENT, LIMITED TIME",
      "Keep subject lines under 50 characters, avoid ALL CAPS",
      "Maintain 80% text, 20% images ratio",
      "Include unsubscribe link and physical address"
    ]
  }
];

const spamWords = ['free', 'winner', 'click here', 'urgent', 'limited time', 'act now', 'buy now', 'order now', 'special offer', 'exclusive deal', 'no obligation', 'risk free', 'guarantee', 'cash', 'credit', 'loan', 'earn money', 'make money', 'work from home', 'double your', 'million dollars', 'congratulations', 'you have been selected', 'claim your prize'];

function SpamChecker() {
  const { addToast } = useToast();
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');
  const [result, setResult] = useState(null);
  const [isChecking, setIsChecking] = useState(false);
  const [showTips, setShowTips] = useState(false);

  const analyzeContent = () => {
    if (!subject.trim() && !content.trim()) {
      addToast('Please enter subject or content to analyze', 'error');
      return;
    }
    setIsChecking(true);
    setTimeout(() => {
      const combined = (subject + ' ' + content).toLowerCase();
      const issues = [];
      let score = 100;

      spamWords.forEach(word => {
        if (combined.includes(word.toLowerCase())) {
          issues.push({ type: 'spam_word', text: `Contains spam trigger: "${word}"`, severity: 'high' });
          score -= 10;
        }
      });

      if (subject === subject.toUpperCase() && subject.length > 3) {
        issues.push({ type: 'caps', text: 'Subject line is ALL CAPS', severity: 'medium' });
        score -= 15;
      }
      if ((combined.match(/!/g) || []).length > 2) {
        issues.push({ type: 'punctuation', text: 'Excessive exclamation marks', severity: 'low' });
        score -= 5;
      }
      if (subject.length > 60) {
        issues.push({ type: 'length', text: 'Subject line too long (over 60 chars)', severity: 'low' });
        score -= 5;
      }
      if (!content.includes('unsubscribe')) {
        issues.push({ type: 'compliance', text: 'No unsubscribe link detected', severity: 'medium' });
        score -= 10;
      }

      score = Math.max(0, Math.min(100, score));
      setResult({ score, issues, rating: score >= 80 ? 'good' : score >= 50 ? 'fair' : 'poor' });
      setIsChecking(false);
    }, 800);
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title"><ShieldCheck size={24} style={{ marginRight: '10px', verticalAlign: 'middle' }} /> Spam Checker</h1>
        <p className="page-subtitle">Analyze your email content for potential spam triggers.</p>
      </div>
      
      <div className="card">
        <h3 className="card-title mb-4">Analyze Your Email</h3>
        <div className="form-group">
          <label className="form-label">Subject Line</label>
          <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Enter email subject..." className="form-input" />
        </div>
        <div className="form-group">
          <label className="form-label">Email Content</label>
          <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="Paste your email content here..." className="form-textarea" rows={8} />
        </div>
        <button className="btn btn-primary" onClick={analyzeContent} disabled={isChecking}>
          <ShieldCheck size={16} /> {isChecking ? 'Analyzing...' : 'Check for Spam'}
        </button>
      </div>

      {result && (
        <div className="card mt-4">
          <h3 className="card-title mb-4">Analysis Result</h3>
          <div style={{ textAlign: 'center', margin: '20px 0' }}>
            <div className={`score-circle ${result.rating === 'good' ? 'excellent' : result.rating === 'fair' ? 'fair' : 'poor'}`}>
              <span className="score-value">{result.score}</span>
              <span className="score-label">{result.rating}</span>
            </div>
          </div>
          {result.issues.length > 0 ? (
            <div>
              <h4 style={{ marginBottom: '12px' }}>Issues Found ({result.issues.length}):</h4>
              {result.issues.map((issue, i) => (
                <div key={i} style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '10px', 
                  padding: '12px', 
                  background: issue.severity === 'high' ? 'rgba(239,68,68,0.1)' : issue.severity === 'medium' ? 'rgba(245,158,11,0.1)' : 'rgba(59,130,246,0.1)', 
                  borderRadius: '8px', 
                  marginBottom: '8px',
                  borderLeft: `3px solid ${issue.severity === 'high' ? 'var(--error)' : issue.severity === 'medium' ? 'var(--warning)' : 'var(--info)'}`
                }}>
                  <AlertTriangle size={18} color={issue.severity === 'high' ? '#ef4444' : issue.severity === 'medium' ? '#f59e0b' : '#3b82f6'} />
                  <span>{issue.text}</span>
                  <span className={`badge ${issue.severity === 'high' ? 'badge-error' : issue.severity === 'medium' ? 'badge-warning' : 'badge-info'}`} style={{ marginLeft: 'auto' }}>
                    {issue.severity}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--success)', padding: '20px', background: 'rgba(34,197,94,0.1)', borderRadius: '8px' }}>
              <CheckCircle size={24} /> <strong>Excellent!</strong> No spam issues detected. Your email looks good!
            </div>
          )}
        </div>
      )}

      <div className="card mt-4">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => setShowTips(!showTips)}>
          <h3 className="card-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}><Lightbulb size={20} color="var(--warning)" /> Deliverability Tips</h3>
          {showTips ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </div>
        {showTips && (
          <div style={{ marginTop: '20px' }}>
            {deliverabilityTips.map((cat, i) => (
              <div key={i} style={{ marginBottom: '20px' }}>
                <h4 style={{ color: 'var(--accent)', marginBottom: '10px', fontSize: '14px' }}>{cat.category}</h4>
                <ul style={{ margin: 0, paddingLeft: '20px' }}>
                  {cat.tips.map((tip, j) => <li key={j} style={{ marginBottom: '6px', color: 'var(--text-secondary)', fontSize: '13px' }}>{tip}</li>)}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default SpamChecker;
