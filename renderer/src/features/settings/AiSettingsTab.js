import React from 'react';
import { RefreshCw, Save, Sparkles, TestTube } from 'lucide-react';

export default function AiSettingsTab({
  aiSettings,
  setAiSettings,
  aiDiagnostics,
  openRouterModels,
  lmStudioModels,
  lmStudioLoading,
  aiTesting,
  loadLmStudioModels,
  handleSaveAiSettings,
  handleTestAi,
  handleToggleAiEnabled
}) {
  return (
    <div className="card">
      <h3 className="card-title mb-4">
        <Sparkles size={20} style={{ marginRight: '8px', color: 'var(--accent)' }} />
        AI Intelligence
      </h3>
      <p className="text-muted mb-4" style={{ fontSize: '13px' }}>
        Use OpenRouter for hosted models or LM Studio for local models running on your machine.
      </p>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px',
          background: aiSettings.enabled ? 'rgba(34, 197, 94, 0.1)' : 'rgba(107, 114, 128, 0.1)',
          borderRadius: '8px',
          marginBottom: '20px',
          border: `1px solid ${aiSettings.enabled ? 'rgba(34, 197, 94, 0.3)' : 'rgba(107, 114, 128, 0.3)'}`
        }}
      >
        <div>
          <div style={{ fontWeight: 600, fontSize: '14px' }}>
            {aiSettings.enabled ? 'AI Enabled' : 'AI Disabled'}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
            {aiSettings.enabled
              ? 'AI features are active and ready to use'
              : 'Enable AI to use subject optimization, content analysis, and email generation'}
          </div>
        </div>
        <label style={{ position: 'relative', display: 'inline-block', width: '48px', height: '26px' }}>
          <input
            type="checkbox"
            checked={!!aiSettings.enabled && aiSettings.enabled !== 'false'}
            onChange={(e) => handleToggleAiEnabled(e.target.checked)}
            style={{ opacity: 0, width: 0, height: 0 }}
          />
          <span
            style={{
              position: 'absolute',
              cursor: 'pointer',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: aiSettings.enabled !== false ? '#22c55e' : '#6b7280',
              borderRadius: '26px',
              transition: '0.3s'
            }}
          >
            <span
              style={{
                position: 'absolute',
                content: '""',
                height: '20px',
                width: '20px',
                left: aiSettings.enabled !== false ? '26px' : '3px',
                bottom: '3px',
                backgroundColor: 'white',
                borderRadius: '50%',
                transition: '0.3s',
                boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
              }}
            />
          </span>
        </label>
      </div>

      {aiDiagnostics && (
        <div
          style={{
            padding: '14px',
            borderRadius: '12px',
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--border)',
            marginBottom: '20px'
          }}
        >
          <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '8px' }}>AI Diagnostics</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px' }}>
            <div>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Provider</div>
              <div style={{ fontSize: '13px', fontWeight: 600 }}>{aiDiagnostics.provider || aiSettings.provider || 'openrouter'}</div>
            </div>
            <div>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Model</div>
              <div style={{ fontSize: '13px', fontWeight: 600, wordBreak: 'break-word' }}>{aiDiagnostics.model || 'Not selected'}</div>
            </div>
            <div>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Credential State</div>
              <div style={{ fontSize: '13px', fontWeight: 600 }}>
                {aiDiagnostics.provider === 'openrouter'
                  ? (aiDiagnostics.hasApiKey ? 'API key configured' : 'API key missing')
                  : (aiDiagnostics.lmstudioBaseUrl || 'Local URL not set')}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Connection</div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: aiDiagnostics.connection?.ok ? 'var(--success)' : 'var(--warning)' }}>
                {aiDiagnostics.connection?.ok ? 'Ready' : 'Needs attention'}
              </div>
            </div>
          </div>
          <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--text-secondary)' }}>
            {aiDiagnostics.connection?.message || 'Run Test Connection for a live provider check.'}
          </div>
        </div>
      )}

      {!!aiSettings.enabled && aiSettings.enabled !== 'false' && (
        <>
          <div className="form-group">
            <label className="form-label">Provider</label>
            <select
              className="form-select"
              value={aiSettings.provider || 'openrouter'}
              onChange={(e) => setAiSettings({ ...aiSettings, provider: e.target.value })}
            >
              <option value="openrouter">OpenRouter (hosted)</option>
              <option value="lmstudio">LM Studio (local)</option>
            </select>
          </div>

          {aiSettings.provider === 'openrouter' ? (
            <>
              <div className="form-group">
                <label className="form-label">API Key</label>
                <input
                  type="password"
                  className="form-input"
                  placeholder={aiSettings.hasApiKey && !aiSettings.clearApiKey ? 'Leave blank to keep the saved key' : 'sk-or-v1-...'}
                  value={aiSettings.apiKey}
                  onChange={(e) => setAiSettings({
                    ...aiSettings,
                    apiKey: e.target.value,
                    clearApiKey: false
                  })}
                />
                <small className="text-muted">
                  {aiSettings.hasApiKey && !aiSettings.clearApiKey
                    ? 'A key is already saved locally. Enter a new one only if you want to replace it.'
                    : 'Your API key is stored locally and not sent back into the renderer after it is saved.'}
                </small>
              </div>

              {aiSettings.hasApiKey && (
                <div className="form-group">
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                    <input
                      type="checkbox"
                      checked={!!aiSettings.clearApiKey}
                      onChange={(e) => setAiSettings({
                        ...aiSettings,
                        clearApiKey: e.target.checked,
                        apiKey: e.target.checked ? '' : aiSettings.apiKey
                      })}
                    />
                    Clear the saved API key on next save
                  </label>
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Model</label>
                <select
                  className="form-select"
                  value={aiSettings.model}
                  onChange={(e) => setAiSettings({ ...aiSettings, model: e.target.value })}
                >
                  <optgroup label="Free Models">
                    {openRouterModels.filter((model) => model.tier === 'free').map((model) => (
                      <option key={model.id} value={model.id}>{model.label}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Paid Models">
                    {openRouterModels.filter((model) => model.tier === 'paid').map((model) => (
                      <option key={model.id} value={model.id}>{model.label}</option>
                    ))}
                  </optgroup>
                </select>
                <small className="text-muted">Select a model - free models don&apos;t require credits</small>
              </div>
            </>
          ) : (
            <>
              <div className="form-group">
                <label className="form-label">LM Studio Base URL</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="http://localhost:1234/v1"
                  value={aiSettings.lmstudioBaseUrl || ''}
                  onChange={(e) => setAiSettings({ ...aiSettings, lmstudioBaseUrl: e.target.value })}
                />
                <small className="text-muted">Bulky talks to the local OpenAI-compatible LM Studio server on this URL.</small>
              </div>

              <div className="form-group">
                <label className="form-label">Local Model</label>
                <div className="flex gap-2">
                  <select
                    className="form-select"
                    value={aiSettings.model}
                    onChange={(e) => setAiSettings({ ...aiSettings, model: e.target.value })}
                  >
                    {lmStudioModels.length === 0 && <option value={aiSettings.model}>{aiSettings.model || 'Enter or load a model'}</option>}
                    {lmStudioModels.map((model) => (
                      <option key={model.id} value={model.id}>{model.label || model.id}</option>
                    ))}
                  </select>
                  <button className="btn btn-outline" onClick={loadLmStudioModels} disabled={lmStudioLoading}>
                    <RefreshCw size={16} /> {lmStudioLoading ? 'Loading...' : 'Load Models'}
                  </button>
                </div>
                <input
                  type="text"
                  className="form-input mt-2"
                  placeholder="Or type a local model id manually"
                  value={aiSettings.model}
                  onChange={(e) => setAiSettings({ ...aiSettings, model: e.target.value })}
                />
                <small className="text-muted">Load models from LM Studio or type the exact model id that is already running locally.</small>
              </div>
            </>
          )}

          <div className="flex gap-2">
            <button className="btn btn-primary" onClick={handleSaveAiSettings}>
              <Save size={16} /> Save Settings
            </button>
            <button className="btn btn-outline" onClick={handleTestAi} disabled={aiTesting}>
              <TestTube size={16} /> {aiTesting ? 'Testing...' : 'Test Connection'}
            </button>
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '24px 0' }} />

          <h4 style={{ fontSize: '14px', marginBottom: '12px' }}>What AI Can Do in Bulky</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
            {[
              { title: 'Subject Line Optimizer', desc: 'Generate 5 high-performing subject line variations' },
              { title: 'Content Analysis', desc: 'Score your email content and get improvement tips' },
              { title: 'Email Generator', desc: 'Generate full email content from a simple prompt' },
              { title: 'Local Model Support', desc: 'Run AI tasks through LM Studio on your own machine when you want private local generation.' },
              { title: 'Local Insights', desc: 'Offline analysis of length, personalization, CTA, and spam risk' },
              { title: 'Provider Choice', desc: 'Switch between hosted OpenRouter models and local LM Studio models without changing the rest of Bulky.' }
            ].map((feature, index) => (
              <div key={index} style={{ padding: '14px', background: 'var(--bg-tertiary)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', marginBottom: '4px' }}>{feature.title}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{feature.desc}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
