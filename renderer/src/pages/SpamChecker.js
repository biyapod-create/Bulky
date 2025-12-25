import React, { useState } from 'react';
import { ShieldCheck, AlertTriangle, CheckCircle, Lightbulb, ChevronDown, ChevronUp, Wand2, Eye, Code, Search } from 'lucide-react';
import { useToast } from '../components/ToastContext';
import Modal from '../components/Modal';

function SpamChecker() {
  const { addToast } = useToast();
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');
  const [result, setResult] = useState(null);
  const [isChecking, setIsChecking] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const [showTips, setShowTips] = useState(false);
  const [showFixModal, setShowFixModal] = useState(false);
  const [selectedFixes, setSelectedFixes] = useState({});

  const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Strip HTML to get visible text only (for context snippets)
  const stripHtmlToText = (html) => {
    if (!html) return '';
    let text = html;
    text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
    text = text.replace(/<!--[\s\S]*?-->/g, '');
    text = text.replace(/<[^>]+>/g, ' ');
    text = text.replace(/&nbsp;/gi, ' ');
    text = text.replace(/&amp;/gi, '&');
    text = text.replace(/&lt;/gi, '<');
    text = text.replace(/&gt;/gi, '>');
    text = text.replace(/&quot;/gi, '"');
    text = text.replace(/&#?\w+;/gi, ' ');
    text = text.replace(/\s+/g, ' ').trim();
    return text;
  };

  const analyzeContent = async () => {
    if (!subject.trim() && !content.trim()) {
      addToast('Please enter subject or content to analyze', 'error');
      return;
    }
    setIsChecking(true);
    setResult(null);

    try {
      const analysis = await window.electron.spam.check({ subject, content });
      setResult(analysis);
      
      // Initialize all fixes as selected
      const fixes = {};
      analysis.issues?.forEach((issue, idx) => {
        if (issue.canAutoFix) fixes[idx] = true;
      });
      setSelectedFixes(fixes);

      if (analysis.issues?.length > 0) {
        addToast(`Found ${analysis.issues.length} issue(s) - Score: ${analysis.score}/100`, 'warning');
      } else {
        addToast('No spam issues found! Score: 100/100', 'success');
      }
    } catch (error) {
      console.error('Analysis error:', error);
      addToast('Analysis failed: ' + (error.message || 'Unknown error'), 'error');
    } finally {
      setIsChecking(false);
    }
  };

  const toggleFix = (idx) => {
    setSelectedFixes(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  // Replace text only outside HTML tags (preserve tag attributes)
  const replaceOutsideHtmlTags = (text, regex, replacer) => {
    const parts = text.split(/(<[^>]+>)/g);
    return parts.map(part => {
      if (part.startsWith('<') && part.endsWith('>')) return part;
      return part.replace(regex, replacer);
    }).join('');
  };

  const applyFixes = () => {
    let fixedSubject = subject;
    let fixedContent = content;
    let count = 0;

    result.issues?.forEach((issue, idx) => {
      if (!selectedFixes[idx] || !issue.canAutoFix) return;

      if (issue.type === 'spam_word' && issue.word && issue.replacement) {
        // Use word boundaries to match whole words only
        const regex = new RegExp(`\\b${escapeRegex(issue.word)}\\b`, 'gi');
        const replacer = (match) => {
          if (match === match.toUpperCase()) return issue.replacement.toUpperCase();
          if (match[0] === match[0].toUpperCase()) return issue.replacement.charAt(0).toUpperCase() + issue.replacement.slice(1);
          return issue.replacement;
        };
        const beforeS = fixedSubject;
        fixedSubject = fixedSubject.replace(regex, replacer);
        // For content, only replace outside HTML tags
        const beforeC = fixedContent;
        fixedContent = replaceOutsideHtmlTags(fixedContent, regex, replacer);
        if (beforeS !== fixedSubject || beforeC !== fixedContent) count++;
      }
      else if (issue.type === 'caps_subject') {
        fixedSubject = fixedSubject.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
        count++;
      }
      else if (issue.type === 'caps_content') {
        fixedContent = replaceOutsideHtmlTags(fixedContent, /\b[A-Z]{4,}\b/g, m => m.charAt(0) + m.slice(1).toLowerCase());
        count++;
      }
      else if (issue.type === 'exclamation') {
        fixedSubject = fixedSubject.replace(/!{2,}/g, '!');
        fixedContent = fixedContent.replace(/!{2,}/g, '!');
        count++;
      }
      else if (issue.type === 'no_unsubscribe') {
        fixedContent += '\n\n<p style="font-size:12px;color:#666;">To unsubscribe <a href="{{unsubscribeLink}}">click here</a></p>';
        count++;
      }
      else if (issue.type === 'suspicious') {
        fixedContent = fixedContent.replace(/\${3,}/g, '').replace(/£{3,}/g, '');
        count++;
      }
    });

    setSubject(fixedSubject);
    setContent(fixedContent);
    setShowFixModal(false);
    setResult(null);
    addToast(`Applied ${count} fix(es). Check spam again to verify.`, 'success');
  };

  const getScoreColor = (score) => score >= 80 ? '#22c55e' : score >= 50 ? '#f59e0b' : '#ef4444';
  const getSeverityStyle = (sev) => ({
    high: { bg: '#fee2e2', border: '#ef4444', text: '#991b1b' },
    medium: { bg: '#fef3c7', border: '#f59e0b', text: '#92400e' },
    low: { bg: '#dbeafe', border: '#3b82f6', text: '#1e40af' }
  }[sev] || { bg: '#f3f4f6', border: '#9ca3af', text: '#374151' });

  // Get context snippet around the spam word (from visible text only)
  const getContextSnippet = (issue) => {
    if (!issue.word) return null;
    // Use visible text only, not HTML code
    const visibleText = subject + ' ' + stripHtmlToText(content);
    const idx = visibleText.toLowerCase().indexOf(issue.word.toLowerCase());
    if (idx === -1) return null;
    
    const start = Math.max(0, idx - 30);
    const end = Math.min(visibleText.length, idx + issue.word.length + 30);
    let snippet = visibleText.substring(start, end);
    if (start > 0) snippet = '...' + snippet;
    if (end < visibleText.length) snippet = snippet + '...';
    
    // Highlight the word in snippet
    const regex = new RegExp(`(${escapeRegex(issue.word)})`, 'gi');
    return snippet.replace(regex, '【$1】');
  };

  const fixableCount = result?.issues?.filter(i => i.canAutoFix).length || 0;


  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">
          <ShieldCheck size={24} style={{ marginRight: '10px', verticalAlign: 'middle' }} /> 
          Spam Checker
        </h1>
        <p className="page-subtitle">Analyze your email content for spam triggers and fix issues.</p>
      </div>

      {/* Main Grid: Editor + Preview */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        
        {/* Left: Editor */}
        <div className="card">
          <h3 className="card-title mb-4"><Code size={18} /> Email Editor</h3>
          
          <div className="form-group">
            <label className="form-label">Subject Line</label>
            <input 
              type="text" 
              className="form-input" 
              value={subject} 
              onChange={(e) => setSubject(e.target.value)} 
              placeholder="Enter your email subject..."
            />
          </div>
          
          <div className="form-group">
            <label className="form-label">Email Content (HTML supported)</label>
            <textarea 
              className="form-textarea" 
              value={content} 
              onChange={(e) => setContent(e.target.value)} 
              placeholder="<h1>Hello {{firstName}}!</h1>&#10;<p>Your email content here...</p>"
              rows={14}
              style={{ fontFamily: 'monospace', fontSize: '13px' }}
            />
          </div>
          
          <button 
            className="btn btn-primary" 
            onClick={analyzeContent} 
            disabled={isChecking}
            style={{ width: '100%' }}
          >
            <Search size={16} /> {isChecking ? 'Analyzing...' : 'Check for Spam Triggers'}
          </button>
        </div>

        {/* Right: Preview */}
        <div className="card">
          <div className="flex justify-between items-center mb-4">
            <h3 className="card-title" style={{ margin: 0 }}><Eye size={18} /> Preview</h3>
            <div className="flex gap-2">
              <button 
                className={`btn btn-sm ${showPreview ? 'btn-primary' : 'btn-outline'}`} 
                onClick={() => setShowPreview(true)}
              >
                Rendered
              </button>
              <button 
                className={`btn btn-sm ${!showPreview ? 'btn-primary' : 'btn-outline'}`} 
                onClick={() => setShowPreview(false)}
              >
                Source
              </button>
            </div>
          </div>

          {/* Subject Preview */}
          {subject && (
            <div style={{ 
              padding: '10px 14px', 
              background: 'var(--bg-secondary)', 
              borderRadius: '6px', 
              marginBottom: '12px',
              borderLeft: '3px solid var(--accent)'
            }}>
              <span className="text-sm text-muted">Subject: </span>
              <strong>{subject}</strong>
            </div>
          )}

          {/* Content Preview */}
          <div style={{ 
            border: '1px solid var(--border)', 
            borderRadius: '8px', 
            minHeight: '320px',
            maxHeight: '400px',
            overflow: 'hidden',
            background: '#fff'
          }}>
            {content ? (
              showPreview ? (
                <iframe
                  srcDoc={`
                    <!DOCTYPE html>
                    <html>
                    <head>
                      <style>
                        body { font-family: Arial, sans-serif; padding: 16px; margin: 0; color: #333; line-height: 1.6; }
                        img { max-width: 100%; }
                      </style>
                    </head>
                    <body>${content}</body>
                    </html>
                  `}
                  style={{ width: '100%', height: '320px', border: 'none' }}
                  title="Email Preview"
                />
              ) : (
                <pre style={{ 
                  margin: 0, 
                  padding: '16px', 
                  whiteSpace: 'pre-wrap', 
                  fontFamily: 'monospace', 
                  fontSize: '12px',
                  background: 'var(--bg-secondary)',
                  color: 'var(--text)',
                  height: '320px',
                  overflow: 'auto'
                }}>
                  {content}
                </pre>
              )
            ) : (
              <div style={{ 
                display: 'flex', 
                flexDirection: 'column',
                alignItems: 'center', 
                justifyContent: 'center', 
                height: '320px',
                color: 'var(--text-muted)'
              }}>
                <Eye size={48} style={{ opacity: 0.3, marginBottom: '12px' }} />
                <p>Enter content to see preview</p>
              </div>
            )}
          </div>
        </div>
      </div>


      {/* Results Section */}
      {result && (
        <div className="card mt-4">
          <div className="flex justify-between items-center mb-4">
            <h3 className="card-title" style={{ margin: 0 }}>
              <ShieldCheck size={18} /> Analysis Results
            </h3>
            {fixableCount > 0 && (
              <button className="btn btn-success" onClick={() => setShowFixModal(true)}>
                <Wand2 size={16} /> Auto-Fix {fixableCount} Issue(s)
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: '24px' }}>
            {/* Score */}
            <div style={{ textAlign: 'center', minWidth: '140px' }}>
              <div style={{ 
                width: '120px', 
                height: '120px', 
                borderRadius: '50%', 
                border: `6px solid ${getScoreColor(result.score)}`,
                display: 'flex', 
                flexDirection: 'column', 
                alignItems: 'center', 
                justifyContent: 'center',
                margin: '0 auto',
                background: `${getScoreColor(result.score)}20`
              }}>
                <span style={{ fontSize: '32px', fontWeight: 'bold', color: getScoreColor(result.score) }}>
                  {result.score}
                </span>
                <span style={{ fontSize: '12px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                  {result.rating}
                </span>
              </div>
              <p style={{ marginTop: '8px', fontSize: '13px', color: getScoreColor(result.score), fontWeight: 500 }}>
                {result.score >= 80 ? '✓ Ready to send' : result.score >= 50 ? '⚠ Needs work' : '✗ High spam risk'}
              </p>
            </div>

            {/* Issues List */}
            <div style={{ flex: 1 }}>
              {result.issues && result.issues.length > 0 ? (
                <div style={{ maxHeight: '280px', overflowY: 'auto' }}>
                  <div className="text-sm text-muted mb-2">{result.issues.length} issue(s) found:</div>
                  {result.issues.map((issue, idx) => {
                    const style = getSeverityStyle(issue.severity);
                    const snippet = getContextSnippet(issue);
                    return (
                      <div key={idx} style={{ 
                        padding: '12px',
                        marginBottom: '8px',
                        background: style.bg,
                        borderLeft: `4px solid ${style.border}`,
                        borderRadius: '0 6px 6px 0'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600, color: style.text, marginBottom: '4px' }}>
                              <AlertTriangle size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                              {issue.text}
                            </div>
                            {snippet && (
                              <div style={{ 
                                fontSize: '12px', 
                                color: '#666', 
                                background: 'rgba(255,255,255,0.7)', 
                                padding: '6px 10px', 
                                borderRadius: '4px',
                                marginTop: '6px',
                                fontFamily: 'monospace'
                              }}>
                                {snippet.split('【').map((part, i) => {
                                  if (i === 0) return part;
                                  const [highlighted, rest] = part.split('】');
                                  return (
                                    <React.Fragment key={i}>
                                      <span style={{ 
                                        background: style.border, 
                                        color: '#fff', 
                                        padding: '1px 6px', 
                                        borderRadius: '3px',
                                        fontWeight: 'bold'
                                      }}>
                                        {highlighted}
                                      </span>
                                      {rest}
                                    </React.Fragment>
                                  );
                                })}
                              </div>
                            )}
                            {issue.replacement && (
                              <div style={{ fontSize: '12px', marginTop: '6px', color: '#666' }}>
                                Suggested fix: <span style={{ color: '#16a34a', fontWeight: 600 }}>"{issue.replacement}"</span>
                              </div>
                            )}
                          </div>
                          <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                            <span style={{ 
                              padding: '3px 8px', 
                              borderRadius: '4px', 
                              fontSize: '10px', 
                              fontWeight: 700,
                              background: style.border, 
                              color: '#fff',
                              textTransform: 'uppercase'
                            }}>
                              {issue.severity}
                            </span>
                            {issue.canAutoFix && (
                              <span style={{ 
                                padding: '3px 8px', 
                                borderRadius: '4px', 
                                fontSize: '10px', 
                                fontWeight: 700,
                                background: '#22c55e', 
                                color: '#fff'
                              }}>
                                FIXABLE
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '12px', 
                  padding: '24px', 
                  background: 'rgba(34,197,94,0.1)', 
                  borderRadius: '8px' 
                }}>
                  <CheckCircle size={32} color="#22c55e" />
                  <div>
                    <div style={{ fontWeight: 600, color: '#22c55e' }}>Excellent! No issues found.</div>
                    <div className="text-sm text-muted">Your email content looks clean and ready to send.</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}


      {/* Tips Section */}
      <div className="card mt-4">
        <div 
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} 
          onClick={() => setShowTips(!showTips)}
        >
          <h3 className="card-title" style={{ margin: 0 }}>
            <Lightbulb size={18} color="#f59e0b" style={{ marginRight: '8px' }} /> 
            Deliverability Tips
          </h3>
          {showTips ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </div>
        {showTips && (
          <div style={{ marginTop: '16px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
            <div>
              <h4 style={{ color: 'var(--accent)', fontSize: '13px', marginBottom: '8px' }}>Authentication</h4>
              <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                <li>Set up SPF records</li>
                <li>Configure DKIM</li>
                <li>Implement DMARC</li>
              </ul>
            </div>
            <div>
              <h4 style={{ color: 'var(--accent)', fontSize: '13px', marginBottom: '8px' }}>Reputation</h4>
              <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                <li>Warm up new accounts</li>
                <li>Keep bounces under 2%</li>
                <li>Consistent sending volume</li>
              </ul>
            </div>
            <div>
              <h4 style={{ color: 'var(--accent)', fontSize: '13px', marginBottom: '8px' }}>Content</h4>
              <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                <li>Avoid spam triggers</li>
                <li>Subject under 50 chars</li>
                <li>Include unsubscribe link</li>
              </ul>
            </div>
          </div>
        )}
      </div>

      {/* Auto-Fix Modal */}
      <Modal
        isOpen={showFixModal}
        onClose={() => setShowFixModal(false)}
        title="Review & Apply Fixes"
        size="large"
        footer={
          <div className="flex justify-between" style={{ width: '100%' }}>
            <button className="btn btn-outline" onClick={() => setShowFixModal(false)}>Cancel</button>
            <button 
              className="btn btn-success" 
              onClick={applyFixes}
              disabled={Object.values(selectedFixes).filter(Boolean).length === 0}
            >
              <Wand2 size={16} /> Apply {Object.values(selectedFixes).filter(Boolean).length} Fix(es)
            </button>
          </div>
        }
      >
        <p className="text-muted mb-4">
          Select the fixes you want to apply. Click on each item to toggle selection.
        </p>

        <div style={{ maxHeight: '450px', overflowY: 'auto' }}>
          {result?.issues?.filter(i => i.canAutoFix).map((issue, idx) => {
            const actualIdx = result.issues.indexOf(issue);
            const isSelected = selectedFixes[actualIdx];
            const style = getSeverityStyle(issue.severity);
            
            return (
              <div
                key={idx}
                onClick={() => toggleFix(actualIdx)}
                style={{
                  padding: '16px',
                  marginBottom: '12px',
                  background: isSelected ? 'rgba(34,197,94,0.1)' : 'var(--bg-secondary)',
                  border: isSelected ? '2px solid #22c55e' : '2px solid var(--border)',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleFix(actualIdx)}
                    style={{ width: '18px', height: '18px' }}
                  />
                  <div style={{ flex: 1 }}>
                    <div className="flex items-center gap-2 mb-2">
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '10px',
                        fontWeight: 700,
                        background: style.border,
                        color: '#fff',
                        textTransform: 'uppercase'
                      }}>
                        {issue.severity}
                      </span>
                      <span style={{ fontWeight: 500 }}>{issue.text}</span>
                    </div>

                    {/* Before/After visualization */}
                    {issue.type === 'spam_word' && issue.word && issue.replacement && (
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '12px',
                        padding: '12px',
                        background: 'var(--bg-tertiary)',
                        borderRadius: '6px',
                        marginTop: '8px'
                      }}>
                        <div style={{ textAlign: 'center' }}>
                          <div className="text-xs text-muted mb-1">Current</div>
                          <span style={{
                            display: 'inline-block',
                            padding: '6px 12px',
                            background: '#fee2e2',
                            color: '#991b1b',
                            borderRadius: '4px',
                            fontWeight: 600,
                            textDecoration: 'line-through'
                          }}>
                            {issue.word}
                          </span>
                        </div>
                        <div style={{ fontSize: '20px', color: 'var(--text-muted)' }}>→</div>
                        <div style={{ textAlign: 'center' }}>
                          <div className="text-xs text-muted mb-1">Replacement</div>
                          <span style={{
                            display: 'inline-block',
                            padding: '6px 12px',
                            background: '#dcfce7',
                            color: '#166534',
                            borderRadius: '4px',
                            fontWeight: 600
                          }}>
                            {issue.replacement}
                          </span>
                        </div>
                      </div>
                    )}

                    {issue.type === 'caps_subject' && (
                      <div style={{ padding: '8px 12px', background: 'var(--bg-tertiary)', borderRadius: '6px', marginTop: '8px', fontSize: '13px' }}>
                        Convert subject to <span style={{ color: '#22c55e', fontWeight: 500 }}>Title Case</span>
                      </div>
                    )}

                    {issue.type === 'caps_content' && (
                      <div style={{ padding: '8px 12px', background: 'var(--bg-tertiary)', borderRadius: '6px', marginTop: '8px', fontSize: '13px' }}>
                        Fix <span style={{ color: '#22c55e', fontWeight: 500 }}>EXCESSIVE CAPS</span> → <span style={{ color: '#22c55e', fontWeight: 500 }}>Excessive Caps</span>
                      </div>
                    )}

                    {issue.type === 'exclamation' && (
                      <div style={{ padding: '8px 12px', background: 'var(--bg-tertiary)', borderRadius: '6px', marginTop: '8px', fontSize: '13px' }}>
                        Reduce <span style={{ color: '#ef4444' }}>!!!</span> → <span style={{ color: '#22c55e', fontWeight: 500 }}>!</span>
                      </div>
                    )}

                    {issue.type === 'no_unsubscribe' && (
                      <div style={{ padding: '8px 12px', background: 'var(--bg-tertiary)', borderRadius: '6px', marginTop: '8px', fontSize: '13px' }}>
                        Add <span style={{ color: '#22c55e', fontWeight: 500 }}>unsubscribe link</span> at the bottom
                      </div>
                    )}

                    {issue.type === 'suspicious' && (
                      <div style={{ padding: '8px 12px', background: 'var(--bg-tertiary)', borderRadius: '6px', marginTop: '8px', fontSize: '13px' }}>
                        Remove suspicious <span style={{ color: '#ef4444' }}>$$$</span> patterns
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {result?.issues?.filter(i => i.canAutoFix).length === 0 && (
          <div className="text-center text-muted" style={{ padding: '40px' }}>
            No automatic fixes available for the detected issues.
          </div>
        )}
      </Modal>
    </div>
  );
}

export default SpamChecker;
