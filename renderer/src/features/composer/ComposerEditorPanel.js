import React from 'react';
import { Beaker, Code, Edit3, Eye, Layers, Wand2 } from 'lucide-react';
import EmailEditor from '../../components/EmailEditor';
import { buildEmailPreviewDocument } from '../../utils/emailPreview';
const { applyPreviewPersonalization } = require('../../utils/contentReadiness');

export default function ComposerEditorPanel({
  viewMode,
  setViewMode,
  isABTest,
  campaign,
  setCampaign,
  setActiveSubjectField,
  setShowTokenPicker,
  handlePreviewIframeLoad
}) {
  return (
    <div className="card composer-editor-card" style={{ overflow: 'hidden' }}>
      <div className="flex justify-between items-center mb-4">
        <div className="tabs" style={{ marginBottom: 0, borderBottom: 'none', display: 'flex', gap: '4px' }}>
          <button
            className={`tab ${viewMode === 'visual' ? 'active' : ''}`}
            onClick={() => setViewMode('visual')}
            style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Edit3 size={14} /> Visual
          </button>
          <button
            className={`tab ${viewMode === 'code' ? 'active' : ''}`}
            onClick={() => setViewMode('code')}
            style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Code size={14} /> HTML
          </button>
          <button
            className={`tab ${viewMode === 'preview' ? 'active' : ''}`}
            onClick={() => setViewMode('preview')}
            style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Eye size={14} /> Preview
          </button>
        </div>
        {isABTest && (
          <span className="badge badge-info" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Beaker size={12} /> A/B Test Mode
          </span>
        )}
      </div>

      <div className="form-group">
        <label className="form-label">Subject Line {isABTest ? '(Variant A)' : ''} *</label>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            type="text"
            className="form-input"
            placeholder="Enter email subject..."
            value={campaign.subject}
            onChange={(e) => setCampaign({ ...campaign, subject: e.target.value })}
            onFocus={() => setActiveSubjectField('A')}
            style={{ flex: 1 }}
          />
          <button
            className="btn btn-outline btn-sm"
            onClick={() => {
              setActiveSubjectField('A');
              setShowTokenPicker(true);
            }}
            title="Insert personalization token"
          >
            <Wand2 size={14} />
          </button>
        </div>
      </div>

      {isABTest && (
        <div className="form-group" style={{ background: 'rgba(91, 180, 212, 0.08)', padding: '12px', borderRadius: '8px', border: '1px dashed rgba(91, 180, 212, 0.3)' }}>
          <label className="form-label" style={{ color: 'var(--accent)' }}>Subject Line (Variant B) *</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              className="form-input"
              placeholder="Enter variant B subject..."
              value={campaign.subjectB}
              onChange={(e) => setCampaign({ ...campaign, subjectB: e.target.value })}
              onFocus={() => setActiveSubjectField('B')}
              style={{ flex: 1 }}
            />
            <button
              className="btn btn-outline btn-sm"
              onClick={() => {
                setActiveSubjectField('B');
                setShowTokenPicker(true);
              }}
              title="Insert personalization token"
            >
              <Wand2 size={14} />
            </button>
          </div>
        </div>
      )}

      {viewMode === 'visual' && (
        <div className="form-group">
          <label className="form-label">Email Content {isABTest ? '(Variant A)' : ''}</label>
          <EmailEditor
            value={campaign.content}
            onChange={(html) => setCampaign({ ...campaign, content: html })}
            placeholder="Start typing your email content..."
          />
        </div>
      )}

      {viewMode === 'code' && (
        <div className="form-group">
          <label className="form-label">HTML Source Code {isABTest ? '(Variant A)' : ''}</label>
          <textarea
            className="form-textarea"
            style={{ minHeight: '400px', fontFamily: 'monospace', fontSize: '13px', lineHeight: '1.6' }}
            value={campaign.content}
            onChange={(e) => setCampaign({ ...campaign, content: e.target.value })}
            placeholder="<html>&#10;<body>&#10;  <h1>Hello {{firstName}}!</h1>&#10;</body>&#10;</html>"
          />
        </div>
      )}

      {viewMode === 'preview' && (
        <div className="form-group">
          <label className="form-label">Email Preview {isABTest ? '(Variant A)' : ''}</label>
          <iframe
            key={campaign.subject + campaign.content.length}
            srcDoc={buildEmailPreviewDocument({
              subject: campaign.subject || '(No Subject)',
              content: applyPreviewPersonalization(campaign.content),
              clientLabel: 'Preview',
              clientStyle: { fontFamily: 'Arial, sans-serif', background: '#f5f5f5', accent: '#1a73e8' }
            })}
            onLoad={handlePreviewIframeLoad}
            style={{
              width: '100%',
              minHeight: '300px',
              height: '300px',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              display: 'block',
              transition: 'height 0.2s'
            }}
            sandbox="allow-same-origin"
            title="Email Preview"
          />
        </div>
      )}

      {isABTest && (
        <>
          <hr style={{ border: 'none', borderTop: '2px dashed rgba(91, 180, 212, 0.3)', margin: '24px 0' }} />
          <div style={{ background: 'rgba(91, 180, 212, 0.08)', padding: '16px', borderRadius: '8px', border: '1px dashed rgba(91, 180, 212, 0.3)' }}>
            <h4 style={{ color: 'var(--accent)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Layers size={16} /> Variant B Content
            </h4>

            {viewMode === 'visual' && (
              <div className="form-group">
                <EmailEditor
                  value={campaign.contentB || campaign.content}
                  onChange={(html) => setCampaign({ ...campaign, contentB: html })}
                  placeholder="Variant B content (leave empty to use same content with different subject)"
                />
              </div>
            )}

            {viewMode === 'code' && (
              <div className="form-group">
                <textarea
                  className="form-textarea"
                  style={{ minHeight: '250px', fontFamily: 'monospace', fontSize: '13px' }}
                  value={campaign.contentB || ''}
                  onChange={(e) => setCampaign({ ...campaign, contentB: e.target.value })}
                  placeholder="Leave empty to use same content as Variant A with different subject"
                />
              </div>
            )}

            {viewMode === 'preview' && (
              <iframe
                key={`b-${campaign.subjectB + (campaign.contentB || campaign.content).length}`}
                srcDoc={buildEmailPreviewDocument({
                  subject: campaign.subjectB || '(No Subject - Variant B)',
                  content: applyPreviewPersonalization(campaign.contentB || campaign.content),
                  clientLabel: 'Variant B Preview',
                  clientStyle: { fontFamily: 'Arial, sans-serif', background: '#eef8fc', accent: '#5bb4d4' }
                })}
                onLoad={handlePreviewIframeLoad}
                style={{
                  width: '100%',
                  minHeight: '250px',
                  height: '300px',
                  border: '1px dashed rgba(91,180,212,0.4)',
                  borderRadius: '8px',
                  display: 'block'
                }}
                sandbox="allow-same-origin"
                title="Variant B Preview"
              />
            )}

            <div className="text-sm text-muted mt-2">
              Leave variant B content empty to test only different subject lines with the same email body.
            </div>
          </div>
        </>
      )}
    </div>
  );
}
