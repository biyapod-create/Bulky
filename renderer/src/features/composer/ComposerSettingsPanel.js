import React from 'react';
import {
  Beaker,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FolderOpen,
  Monitor,
  Search,
  ShieldCheck,
  Sparkles,
  Tag,
  Users,
  Wand2,
  X
} from 'lucide-react';

export default function ComposerSettingsPanel({
  settingsCollapsed,
  setSettingsCollapsed,
  campaign,
  setCampaign,
  recipientMode,
  setRecipientMode,
  individualSearch,
  setIndividualSearch,
  selectedManualEmails,
  filteredIndividualContacts,
  toggleIndividualRecipient,
  removeIndividualRecipient,
  manualEmails,
  setManualEmails,
  lists,
  tags,
  toggleTag,
  recipientCount,
  recipientBreakdown,
  contentReadiness,
  templateCategories,
  selectedTemplateId,
  handleLoadTemplate,
  templates,
  isABTest,
  setIsABTest,
  showTokenPicker,
  setShowTokenPicker,
  tokenPickerRef,
  personalizationTokens,
  insertToken,
  spamScore,
  getScoreColor,
  getScoreBarColor,
  aiLoading,
  handleAiImproveSubject,
  showAiGenerate,
  setShowAiGenerate,
  aiInsights,
  aiBrief,
  setAiBrief,
  handleAiGenerate,
  handleOpenInBuilder,
  aiSubjectSuggestions,
  applySuggestedSubject,
  campaignSubjectOrContentExists
}) {
  return (
    <div className="card composer-settings-card" style={{ overflow: 'hidden auto', transition: 'all 0.3s', position: 'relative', minWidth: 0 }}>
      <button
        onClick={() => setSettingsCollapsed(!settingsCollapsed)}
        style={{
          position: 'absolute',
          top: '12px',
          right: '12px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--text-muted)',
          padding: '4px',
          zIndex: 1
        }}
        title={settingsCollapsed ? 'Expand settings' : 'Collapse settings'}
      >
        {settingsCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
      </button>

      {settingsCollapsed ? (
        <div
          style={{ writingMode: 'vertical-rl', textOrientation: 'mixed', padding: '16px 8px', color: 'var(--text-muted)', fontSize: '12px', cursor: 'pointer' }}
          onClick={() => setSettingsCollapsed(false)}
        >
          Campaign Settings
        </div>
      ) : (
        <>
          <h3 className="card-title mb-4">Campaign Settings</h3>

          <div className="form-group">
            <label className="form-label">Campaign Name *</label>
            <input
              type="text"
              className="form-input"
              placeholder="Auto-generated from subject"
              value={campaign.name}
              onChange={(e) => setCampaign({ ...campaign, name: e.target.value })}
            />
            {!campaign.name && campaign.subject && (
              <small className="text-muted">Will auto-generate from subject line</small>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">Recipients</label>
            <div className="recipient-mode-grid" style={{ marginBottom: '12px' }}>
              <button
                type="button"
                className={`btn recipient-mode-btn ${recipientMode === 'all' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setRecipientMode('all')}
                title="All Contacts"
              >
                <Users size={14} />
                <span>All Contacts</span>
              </button>
              <button
                type="button"
                className={`btn recipient-mode-btn ${recipientMode === 'list' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setRecipientMode('list')}
                title="By List"
              >
                <FolderOpen size={14} />
                <span>By List</span>
              </button>
              <button
                type="button"
                className={`btn recipient-mode-btn ${recipientMode === 'manual' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setRecipientMode('manual')}
                title="Individual"
              >
                <Monitor size={14} />
                <span>Individual</span>
              </button>
            </div>

            {recipientMode === 'all' && (
              <div style={{ padding: '12px 14px', borderRadius: '10px', background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', fontSize: '13px', lineHeight: 1.6 }}>
                This campaign will target every active contact in Bulky. List and tag filters are ignored in this mode.
              </div>
            )}

            {recipientMode === 'manual' ? (
              <>
                <div style={{ padding: '14px', borderRadius: '12px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', marginBottom: '10px' }}>
                  <label className="form-label" style={{ marginBottom: '8px' }}>Find Individual Contacts</label>
                  <div style={{ position: 'relative', marginBottom: '10px' }}>
                    <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input
                      type="text"
                      className="form-input"
                      style={{ paddingLeft: '34px' }}
                      placeholder="Search contacts by email, name, or company"
                      value={individualSearch}
                      onChange={(e) => setIndividualSearch(e.target.value)}
                    />
                  </div>
                  {selectedManualEmails.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
                      {selectedManualEmails.map((email) => (
                        <button
                          key={email}
                          type="button"
                          className="btn btn-outline btn-sm"
                          onClick={() => removeIndividualRecipient(email)}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', maxWidth: '100%' }}
                        >
                          <span style={{ maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{email}</span>
                          <X size={12} />
                        </button>
                      ))}
                    </div>
                  )}
                  <div style={{ display: 'grid', gap: '8px' }}>
                    {filteredIndividualContacts.length > 0 ? filteredIndividualContacts.map((contact) => {
                      const displayName = `${contact.firstName || ''} ${contact.lastName || ''}`.trim();
                      return (
                        <button
                          key={contact.id}
                          type="button"
                          className="btn btn-outline"
                          onClick={() => toggleIndividualRecipient(contact.email)}
                          style={{ justifyContent: 'space-between', textAlign: 'left' }}
                        >
                          <span style={{ display: 'grid', gap: '2px' }}>
                            <span>{displayName || contact.email}</span>
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{contact.email}{contact.company ? ` - ${contact.company}` : ''}</span>
                          </span>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Add</span>
                        </button>
                      );
                    }) : (
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        {individualSearch.trim() ? 'No matching contacts found.' : 'Search to add specific contacts to this campaign.'}
                      </div>
                    )}
                  </div>
                </div>
                <textarea
                  className="form-textarea"
                  rows={4}
                  placeholder="You can also paste email addresses separated by commas or new lines"
                  value={manualEmails}
                  onChange={(e) => setManualEmails(e.target.value)}
                />
                <small className="text-muted">
                  Individual mode stores the exact recipients for this campaign, so it can be saved and sent later without rebuilding the audience.
                </small>
              </>
            ) : recipientMode === 'list' ? (
              <select
                className="form-select"
                value={campaign.listId}
                onChange={(e) => setCampaign({ ...campaign, listId: e.target.value })}
              >
                <option value="">All Lists</option>
                {lists.map((list) => (
                  <option key={list.id} value={list.id}>{list.name}</option>
                ))}
              </select>
            ) : null}
          </div>

          {recipientMode === 'list' && tags.length > 0 && (
            <div className="form-group">
              <label className="form-label"><Tag size={14} style={{ marginRight: '4px' }} /> Filter by Tags</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                {tags.map((tag) => (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => toggleTag(tag.id)}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '12px',
                      border: campaign.selectedTags?.includes(tag.id) ? 'none' : '1px solid var(--border)',
                      background: campaign.selectedTags?.includes(tag.id) ? tag.color : 'var(--bg-secondary)',
                      color: campaign.selectedTags?.includes(tag.id) ? '#fff' : 'var(--text)',
                      fontSize: '12px',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    {tag.name}
                  </button>
                ))}
              </div>
              {campaign.selectedTags?.length > 0 && (
                <button
                  type="button"
                  className="btn btn-outline btn-sm mt-2"
                  onClick={() => setCampaign({ ...campaign, selectedTags: [] })}
                  style={{ fontSize: '11px' }}
                >
                  Clear Tags
                </button>
              )}
            </div>
          )}

          <div style={{ background: 'var(--bg-tertiary)', borderRadius: '8px', padding: '12px', marginBottom: '16px' }}>
            <div className="flex items-center gap-2 mb-2">
              <Users size={18} style={{ color: 'var(--accent)' }} />
              <div style={{ fontSize: '20px', fontWeight: '600' }}>{recipientCount.toLocaleString()}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                {recipientMode === 'manual'
                  ? 'individual recipients locked for this campaign'
                  : recipientMode === 'all'
                    ? 'all available contacts'
                    : campaign.selectedTags?.length > 0
                      ? `recipients (${campaign.selectedTags.length} tag${campaign.selectedTags.length > 1 ? 's' : ''} applied)`
                      : 'total recipients'}
              </div>
            </div>
            {(recipientBreakdown.blacklisted > 0 || recipientBreakdown.unsubscribed > 0) && (
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', borderTop: '1px solid var(--border)', paddingTop: '8px', marginTop: '4px' }}>
                <div className="flex justify-between">
                  <span style={{ color: '#22c55e' }}>Valid: {recipientBreakdown.valid}</span>
                  <span style={{ color: '#f59e0b' }}>Blacklisted: {recipientBreakdown.blacklisted}</span>
                  <span style={{ color: '#ef4444' }}>Unsub: {recipientBreakdown.unsubscribed}</span>
                </div>
              </div>
            )}
            {recipientCount > 0 && campaign.batchSize > 0 && (
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
                ~{Math.ceil(recipientCount / campaign.batchSize)} batches, ~{Math.ceil(recipientCount / campaign.batchSize) * campaign.delayMinutes} min total
              </div>
            )}
          </div>

          {(contentReadiness.blockers.length > 0 || contentReadiness.warnings.length > 0) && (
            <div
              style={{
                background: contentReadiness.blockers.length > 0 ? 'rgba(239, 68, 68, 0.08)' : 'rgba(245, 158, 11, 0.08)',
                border: `1px solid ${contentReadiness.blockers.length > 0 ? 'rgba(239, 68, 68, 0.24)' : 'rgba(245, 158, 11, 0.24)'}`,
                borderRadius: '10px',
                padding: '12px',
                marginBottom: '16px'
              }}
            >
              <div style={{ fontSize: '12px', fontWeight: 700, marginBottom: '8px', color: contentReadiness.blockers.length > 0 ? 'var(--error)' : 'var(--warning)' }}>
                Composer Readiness
              </div>
              {contentReadiness.blockers.slice(0, 3).map((item) => (
                <div key={item} style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  {item}
                </div>
              ))}
              {contentReadiness.warnings.slice(0, 2).map((item) => (
                <div key={item} style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  {item}
                </div>
              ))}
            </div>
          )}

          <div className="form-group">
            <label className="form-label"><FolderOpen size={14} style={{ marginRight: '4px' }} /> Load Template</label>
            {Object.keys(templateCategories).length > 0 ? (
              <select
                className="form-select"
                onChange={(e) => handleLoadTemplate(e.target.value)}
                value={selectedTemplateId}
              >
                <option value="">Select template...</option>
                {Object.entries(templateCategories).map(([category, categoryTemplates]) => (
                  <optgroup key={category} label={category}>
                    {categoryTemplates.map((template) => (
                      <option key={template.id} value={template.id}>{template.name}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            ) : (
              <select
                className="form-select"
                onChange={(e) => handleLoadTemplate(e.target.value)}
                value={selectedTemplateId}
              >
                <option value="">Select template...</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>{template.name}</option>
                ))}
              </select>
            )}
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '20px 0' }} />

          <div className="form-group">
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={isABTest}
                onChange={(e) => {
                  setIsABTest(e.target.checked);
                  setCampaign({ ...campaign, isABTest: e.target.checked });
                }}
              />
              <Beaker size={14} /> Enable A/B Testing
            </label>
            {isABTest && (
              <div style={{ marginTop: '8px' }}>
                <label className="form-label" style={{ fontSize: '12px' }}>
                  Test Split: {campaign.abTestPercent}% / {100 - campaign.abTestPercent}%
                </label>
                <input
                  type="range"
                  min="10"
                  max="90"
                  step="5"
                  value={campaign.abTestPercent}
                  onChange={(e) => setCampaign({ ...campaign, abTestPercent: parseInt(e.target.value, 10) })}
                  style={{ width: '100%' }}
                />
                <div className="flex justify-between text-sm text-muted">
                  <span>Variant A ({campaign.abTestPercent}%)</span>
                  <span>Variant B ({100 - campaign.abTestPercent}%)</span>
                </div>
              </div>
            )}
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '20px 0' }} />

          <h4 style={{ fontSize: '14px', marginBottom: '12px' }}>Throttle Settings</h4>

          <div className="form-group">
            <label className="form-label">Batch Size</label>
            <input
              type="number"
              className="form-input"
              value={campaign.batchSize}
              onChange={(e) => setCampaign({ ...campaign, batchSize: parseInt(e.target.value, 10) })}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Delay (minutes)</label>
            <input
              type="number"
              className="form-input"
              value={campaign.delayMinutes}
              onChange={(e) => setCampaign({ ...campaign, delayMinutes: parseInt(e.target.value, 10) })}
            />
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '20px 0' }} />

          <h4 style={{ fontSize: '14px', marginBottom: '12px' }}>
            <Sparkles size={14} style={{ marginRight: '4px' }} /> Personalization
          </h4>
          <div style={{ position: 'relative' }} ref={tokenPickerRef}>
            <button
              className="btn btn-outline btn-sm"
              onClick={() => setShowTokenPicker(!showTokenPicker)}
              style={{ width: '100%', justifyContent: 'space-between', display: 'flex' }}
            >
              <span>Insert Token...</span>
              <ChevronDown size={14} />
            </button>
            {showTokenPicker && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  zIndex: 10,
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                  maxHeight: '280px',
                  overflow: 'auto'
                }}
              >
                {['Contact', 'Dynamic', 'System'].map((group) => (
                  <div key={group}>
                    <div style={{ padding: '8px 12px', fontSize: '10px', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', background: 'var(--bg-tertiary)' }}>
                      {group}
                    </div>
                    {personalizationTokens.filter((tokenItem) => tokenItem.group === group).map(({ token, label }) => (
                      <div key={token} style={{ display: 'flex', gap: '8px' }}>
                        <button
                          style={{
                            flex: 1,
                            padding: '8px 12px',
                            background: 'none',
                            border: 'none',
                            textAlign: 'left',
                            cursor: 'pointer',
                            color: 'var(--text)',
                            fontSize: '13px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                          }}
                          onClick={() => insertToken(token)}
                          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-tertiary)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
                        >
                          <span>{label}</span>
                          <code style={{ fontSize: '10px', color: 'var(--text-muted)', background: 'var(--bg-tertiary)', padding: '2px 6px', borderRadius: '4px' }}>
                            {`{{${token}}}`}
                          </code>
                        </button>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>

          {spamScore && (
            <>
              <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '20px 0' }} />
              <h4 style={{ fontSize: '14px', marginBottom: '12px' }}>
                <ShieldCheck size={16} style={{ display: 'inline', marginRight: '6px' }} />
                Spam Score
              </h4>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                <div className={`score-circle ${getScoreColor()}`} style={{ width: '60px', height: '60px', flexShrink: 0 }}>
                  <span className="score-value" style={{ fontSize: '20px' }}>{spamScore.score}</span>
                </div>
                <div>
                  <div style={{ fontWeight: '600', fontSize: '14px' }}>{spamScore.rating}</div>
                  <div style={{ height: '6px', width: '120px', background: 'var(--bg-tertiary)', borderRadius: '3px', overflow: 'hidden', marginTop: '4px' }}>
                    <div style={{ height: '100%', width: `${spamScore.score}%`, background: getScoreBarColor(), transition: 'width 0.5s' }} />
                  </div>
                </div>
              </div>
              {spamScore.issues && spamScore.issues.length > 0 && (
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px' }}>
                  {spamScore.issues.slice(0, 3).map((issue, index) => (
                    <div key={index} style={{ padding: '3px 0', display: 'flex', alignItems: 'flex-start', gap: '4px' }}>
                      <span style={{ color: '#f59e0b' }}>!</span> {typeof issue === 'string' ? issue : issue.text || 'Issue detected'}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {campaignSubjectOrContentExists && (
            <div style={{ display: 'flex', gap: '6px', marginTop: '12px' }}>
              <button className="btn btn-outline btn-sm" onClick={handleAiImproveSubject} disabled={aiLoading} style={{ fontSize: '11px' }}>
                <Wand2 size={12} /> {aiLoading ? '...' : 'AI Subjects'}
              </button>
              <button className="btn btn-outline btn-sm" onClick={() => setShowAiGenerate(!showAiGenerate)} style={{ fontSize: '11px' }}>
                <Sparkles size={12} /> Generate
              </button>
            </div>
          )}

          {campaignSubjectOrContentExists && aiInsights && (
            <>
              <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '20px 0' }} />
              <h4 style={{ fontSize: '14px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Sparkles size={14} style={{ color: 'var(--accent)' }} /> AI Insights
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '8px', marginBottom: '12px', overflow: 'hidden' }}>
                <div style={{ padding: '10px', borderRadius: '10px', background: 'var(--bg-tertiary)', minWidth: 0 }}>
                  <div style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '4px' }}>Recipients</div>
                  <div style={{ fontSize: '16px', fontWeight: 700 }}>{recipientCount.toLocaleString()}</div>
                </div>
                <div style={{ padding: '10px', borderRadius: '10px', background: 'var(--bg-tertiary)', minWidth: 0 }}>
                  <div style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '4px' }}>Tone</div>
                  <div style={{ fontSize: '16px', fontWeight: 700, textTransform: 'capitalize', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{aiBrief.tone}</div>
                </div>
                <div style={{ padding: '10px', borderRadius: '10px', background: 'var(--bg-tertiary)', minWidth: 0 }}>
                  <div style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '4px' }}>Goal</div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{aiBrief.objective || 'Not set'}</div>
                </div>
              </div>

              {aiInsights.subject && (
                <div style={{ marginBottom: '10px' }}>
                  <div style={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>Subject</div>
                  {aiInsights.subject.map((insight, index) => (
                    <div key={index} style={{ fontSize: '11px', marginBottom: '3px', color: insight.type === 'success' ? 'var(--success)' : insight.type === 'warning' ? 'var(--warning)' : insight.type === 'tip' ? 'var(--accent)' : 'var(--text-secondary)', display: 'flex', gap: '4px' }}>
                      <span>{insight.type === 'success' ? 'OK' : insight.type === 'warning' ? '!' : '->'}</span>
                      <span>{insight.text}</span>
                    </div>
                  ))}
                </div>
              )}

              {aiInsights.content && (
                <div style={{ marginBottom: '10px' }}>
                  <div style={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>Content</div>
                  {aiInsights.content.map((insight, index) => (
                    <div key={index} style={{ fontSize: '11px', marginBottom: '3px', color: insight.type === 'success' ? 'var(--success)' : insight.type === 'warning' ? 'var(--warning)' : insight.type === 'tip' ? 'var(--accent)' : 'var(--text-secondary)', display: 'flex', gap: '4px' }}>
                      <span>{insight.type === 'success' ? 'OK' : insight.type === 'warning' ? '!' : insight.type === 'info' ? '-' : '->'}</span>
                      <span>{insight.text}</span>
                    </div>
                  ))}
                </div>
              )}

              {aiInsights.sendTime && (
                <div style={{ marginBottom: '10px' }}>
                  <div style={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>Send Time</div>
                  {aiInsights.sendTime.map((tip, index) => (
                    <div key={index} style={{ fontSize: '11px', marginBottom: '3px', color: 'var(--text-secondary)', display: 'flex', gap: '4px' }}>
                      <span>Time</span><span>{tip}</span>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                <button className="btn btn-outline btn-sm" onClick={handleAiImproveSubject} disabled={aiLoading} style={{ fontSize: '11px' }}>
                  <Wand2 size={12} /> {aiLoading ? '...' : 'AI Subjects'}
                </button>
              </div>

              {aiSubjectSuggestions.length > 0 && (
                <div style={{ marginTop: '8px', padding: '8px', background: 'var(--bg-tertiary)', borderRadius: '6px', fontSize: '12px' }}>
                  <div style={{ fontWeight: 600, marginBottom: '6px', color: 'var(--text)' }}>Suggested Subjects:</div>
                  {aiSubjectSuggestions.map((subject, index) => (
                    <button
                      key={index}
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={() => applySuggestedSubject(subject)}
                      style={{ width: '100%', justifyContent: 'space-between', marginBottom: '6px', textAlign: 'left' }}
                    >
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subject}</span>
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Apply</span>
                    </button>
                  ))}
                </div>
              )}

              {showAiGenerate && (
                <div style={{ marginTop: '8px', padding: '12px', background: 'var(--bg-tertiary)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '10px' }}>
                    Give AI a real brief so it can generate something closer to send-ready copy.
                  </div>
                  <textarea
                    className="form-textarea"
                    placeholder="Describe the email you want... e.g. Welcome email for new customers with a 20% discount code"
                    value={aiBrief.prompt}
                    onChange={(e) => setAiBrief((prev) => ({ ...prev, prompt: e.target.value }))}
                    rows={3}
                    style={{ fontSize: '12px', marginBottom: '8px' }}
                  />
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Tone</label>
                      <select className="form-select" value={aiBrief.tone} onChange={(e) => setAiBrief((prev) => ({ ...prev, tone: e.target.value }))}>
                        <option value="professional">Professional</option>
                        <option value="friendly">Friendly</option>
                        <option value="urgent">Urgent</option>
                        <option value="confident">Confident</option>
                        <option value="warm">Warm</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Audience</label>
                      <input className="form-input" value={aiBrief.audience} onChange={(e) => setAiBrief((prev) => ({ ...prev, audience: e.target.value }))} placeholder="New leads, customers, subscribers..." />
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Objective</label>
                    <input className="form-input" value={aiBrief.objective} onChange={(e) => setAiBrief((prev) => ({ ...prev, objective: e.target.value }))} placeholder="Drive signups, announce a launch, recover carts..." />
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Offer / Hook</label>
                      <input className="form-input" value={aiBrief.offer} onChange={(e) => setAiBrief((prev) => ({ ...prev, offer: e.target.value }))} placeholder="20% off, early access, free audit..." />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Primary CTA</label>
                      <input className="form-input" value={aiBrief.cta} onChange={(e) => setAiBrief((prev) => ({ ...prev, cta: e.target.value }))} placeholder="Book demo, claim discount, reply now..." />
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Brand Voice</label>
                    <input className="form-input" value={aiBrief.brandVoice} onChange={(e) => setAiBrief((prev) => ({ ...prev, brandVoice: e.target.value }))} placeholder="Clear, premium, playful, straight-talking..." />
                  </div>
                  <label className="flex items-center gap-2 text-sm" style={{ marginBottom: '10px', color: 'var(--text-secondary)' }}>
                    <input type="checkbox" checked={aiBrief.includePersonalization} onChange={(e) => setAiBrief((prev) => ({ ...prev, includePersonalization: e.target.checked }))} />
                    Include personalization placeholders when they fit the message
                  </label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="btn btn-primary btn-sm" onClick={handleAiGenerate} disabled={aiLoading} style={{ flex: 1 }}>
                      {aiLoading ? 'Generating...' : 'Generate Email'}
                    </button>
                    <button className="btn btn-outline btn-sm" type="button" onClick={handleOpenInBuilder} style={{ flex: 1 }}>
                      <ExternalLink size={12} /> Send to Builder
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
