import React from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  CheckCircle,
  Clock,
  Pause,
  Play,
  Square,
  Users,
  XCircle
} from 'lucide-react';
import Modal from '../../components/Modal';

export function CreateCampaignModal({
  isOpen,
  onClose,
  newCampaign,
  setNewCampaign,
  lists,
  onContinue
}) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="New Campaign"
      footer={(
        <>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={onContinue}>
            <ArrowRight size={16} /> Continue to Composer
          </button>
        </>
      )}
    >
      <div className="form-group">
        <label className="form-label">Campaign Name *</label>
        <input
          type="text"
          className="form-input"
          placeholder="e.g., Summer Newsletter"
          value={newCampaign.name}
          onChange={(event) => setNewCampaign({ ...newCampaign, name: event.target.value })}
        />
      </div>
      <div className="form-group">
        <label className="form-label">Select List</label>
        <select
          className="form-select"
          value={newCampaign.listId}
          onChange={(event) => setNewCampaign({ ...newCampaign, listId: event.target.value })}
        >
          <option value="">All Contacts</option>
          {lists.map((list) => (
            <option key={list.id} value={list.id}>{list.name} ({list.contactCount})</option>
          ))}
        </select>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Batch Size</label>
          <input
            type="number"
            className="form-input"
            value={newCampaign.batchSize}
            onChange={(event) => setNewCampaign({ ...newCampaign, batchSize: parseInt(event.target.value) })}
          />
          <small className="text-muted">Emails per batch</small>
        </div>
        <div className="form-group">
          <label className="form-label">Delay (minutes)</label>
          <input
            type="number"
            className="form-input"
            value={newCampaign.delayMinutes}
            onChange={(event) => setNewCampaign({ ...newCampaign, delayMinutes: parseInt(event.target.value) })}
          />
          <small className="text-muted">Between batches</small>
        </div>
      </div>
    </Modal>
  );
}

export function CampaignProgressModal({
  isOpen,
  progress,
  deliveryLog,
  elapsedSecs,
  getProgressPercent,
  onPause,
  onResume,
  onStop,
  onClose
}) {
  const formatDuration = (seconds) => seconds >= 60 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${seconds}s`;

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {}}
      title="Sending Campaign"
      size="lg"
    >
      {progress && (
        <div>
          <div className="text-center mb-4">
            <div style={{
              width: '100px', height: '100px', borderRadius: '50%', margin: '0 auto 12px',
              background: `conic-gradient(var(--accent) ${getProgressPercent() * 3.6}deg, var(--bg-tertiary) 0deg)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <div style={{
                width: '80px', height: '80px', borderRadius: '50%', background: 'var(--bg-primary)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '22px', fontWeight: 'bold'
              }}>
                {getProgressPercent()}%
              </div>
            </div>
            <div className="text-muted">
              {progress.status === 'waiting'
                ? `Waiting ${progress.nextBatchIn} minutes before next batch...`
                : progress.status === 'running'
                  ? `Sending to ${progress.currentEmail || '...'}`
                  : progress.status}
            </div>
            {progress.status === 'running' && elapsedSecs > 0 && (() => {
              const done = (progress.sent || 0) + (progress.failed || 0) + (progress.bounced || 0);
              const remaining = (progress.total || 0) - done;
              const rate = done > 0 ? done / elapsedSecs : 0;
              const etaSecs = rate > 0 ? Math.ceil(remaining / rate) : 0;
              return (
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  Elapsed: {formatDuration(elapsedSecs)}
                  {etaSecs > 0 && ` · ETA: ~${formatDuration(etaSecs)}`}
                  {rate > 0 && ` · ${rate.toFixed(1)}/s`}
                </div>
              );
            })()}
          </div>

          <div className="progress-bar mb-4">
            <div
              className={`progress-fill ${progress.status === 'completed' ? 'success' : ''}`}
              style={{ width: `${getProgressPercent()}%` }}
            />
          </div>

          <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
            <div className="stat-card">
              <div className="stat-value" style={{ color: '#22c55e' }}>{progress.sent}</div>
              <div className="stat-label">Delivered</div>
            </div>
            <div className="stat-card">
              <div className="stat-value" style={{ color: '#f59e0b' }}>{progress.bounced || 0}</div>
              <div className="stat-label">Bounced</div>
            </div>
            <div className="stat-card">
              <div className="stat-value" style={{ color: '#ef4444' }}>{progress.failed}</div>
              <div className="stat-label">Failed</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{progress.total - progress.sent - progress.failed - (progress.bounced || 0)}</div>
              <div className="stat-label">Remaining</div>
            </div>
            <div className="stat-card">
              <div className="stat-value" style={{ color: '#6b7280' }}>{progress.skipped || 0}</div>
              <div className="stat-label">Skipped</div>
            </div>
          </div>

          {(progress.status === 'completed' || progress.status === 'stopped') && (
            <div style={{ marginTop: 16, padding: 12, background: 'var(--bg-tertiary)', borderRadius: 8, border: '1px solid var(--border)' }}>
              <h4 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 600 }}>Delivery Summary</h4>
              <div style={{ fontSize: 13, lineHeight: 1.8, color: 'var(--text-secondary)' }}>
                <div><CheckCircle size={13} style={{ color: '#22c55e', marginRight: 6, verticalAlign: 'middle' }} /><strong>{progress.sent}</strong> delivered successfully</div>
                {(progress.bounced || 0) > 0 && <div><AlertTriangle size={13} style={{ color: '#f59e0b', marginRight: 6, verticalAlign: 'middle' }} /><strong>{progress.bounced}</strong> bounced (auto-blacklisted after 2 hard bounces)</div>}
                {progress.failed > 0 && <div><XCircle size={13} style={{ color: '#ef4444', marginRight: 6, verticalAlign: 'middle' }} /><strong>{progress.failed}</strong> failed</div>}
                {(progress.skipped || 0) > 0 && (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                    Skipped: {progress.skippedReasons?.blacklisted || 0} blacklisted, {progress.skippedReasons?.unsubscribed || 0} unsubscribed, {progress.skippedReasons?.bounced || 0} previously bounced
                  </div>
                )}
              </div>
            </div>
          )}

          {deliveryLog.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <h4 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>Live Activity</h4>
              <div style={{ maxHeight: 180, overflowY: 'auto', fontSize: 12, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg-primary)' }}>
                {deliveryLog.slice(0, 20).map((entry, index) => (
                  <div
                    key={index}
                    style={{
                      padding: '6px 10px',
                      borderBottom: '1px solid var(--border)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8
                    }}
                  >
                    {entry.status === 'sent' && <CheckCircle size={12} style={{ color: '#22c55e', flexShrink: 0 }} />}
                    {entry.status === 'bounced' && <AlertTriangle size={12} style={{ color: '#f59e0b', flexShrink: 0 }} />}
                    {entry.status === 'soft_bounce' && <AlertTriangle size={12} style={{ color: '#f97316', flexShrink: 0 }} />}
                    {(entry.status === 'failed' || !['sent', 'bounced', 'soft_bounce'].includes(entry.status)) && <XCircle size={12} style={{ color: '#ef4444', flexShrink: 0 }} />}
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.email}</span>
                    <span
                      style={{
                        padding: '1px 6px',
                        borderRadius: 3,
                        fontSize: 11,
                        fontWeight: 500,
                        background: entry.status === 'sent' ? '#dcfce7' : entry.status === 'bounced' ? '#fef3c7' : '#fee2e2',
                        color: entry.status === 'sent' ? '#166534' : entry.status === 'bounced' ? '#92400e' : '#991b1b'
                      }}
                    >
                      {entry.status === 'sent' ? 'Delivered' : entry.status === 'bounced' ? 'Bounced' : entry.status === 'soft_bounce' ? 'Soft Bounce' : 'Failed'}
                    </span>
                    <span style={{ color: 'var(--text-muted)', fontSize: 11, flexShrink: 0 }}>{entry.time}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-center gap-3 mt-4">
            {progress.status === 'running' && (
              <button className="btn btn-warning" onClick={onPause}>
                <Pause size={16} /> Pause
              </button>
            )}
            {progress.status === 'paused' && (
              <button className="btn btn-success" onClick={onResume}>
                <Play size={16} /> Resume
              </button>
            )}
            {(progress.status === 'running' || progress.status === 'paused' || progress.status === 'waiting') && (
              <button className="btn btn-danger" onClick={onStop}>
                <Square size={16} /> Stop
              </button>
            )}
            {(progress.status === 'running' || progress.status === 'paused' || progress.status === 'waiting') && (
              <button className="btn btn-outline" onClick={onClose}>
                Minimize to Sidebar
              </button>
            )}
            {(progress.status === 'completed' || progress.status === 'stopped') && (
              <button className="btn btn-primary" onClick={onClose}>
                Close
              </button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

export function CampaignLogsModal({
  isOpen,
  onClose,
  selectedCampaign,
  logFilter,
  setLogFilter,
  campaignLogs,
  logCounts,
  filteredLogs
}) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Campaign Logs: ${selectedCampaign?.name}`}
      size="xl"
      footer={<button className="btn btn-secondary" onClick={onClose}>Close</button>}
    >
      <div className="flex gap-2 mb-4" style={{ flexWrap: 'wrap' }}>
        <button
          className={`btn btn-sm ${logFilter === 'all' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setLogFilter('all')}
        >
          All ({campaignLogs.length})
        </button>
        <button
          className={`btn btn-sm ${logFilter === 'sent' ? 'btn-success' : 'btn-outline'}`}
          onClick={() => setLogFilter('sent')}
        >
          <CheckCircle size={12} /> Sent ({logCounts.sent})
        </button>
        <button
          className={`btn btn-sm ${logFilter === 'bounced' ? 'btn-warning' : 'btn-outline'}`}
          onClick={() => setLogFilter('bounced')}
        >
          <AlertTriangle size={12} /> Bounced ({logCounts.bounced})
        </button>
        <button
          className={`btn btn-sm ${logFilter === 'failed' ? 'btn-danger' : 'btn-outline'}`}
          onClick={() => setLogFilter('failed')}
        >
          <XCircle size={12} /> Failed ({logCounts.failed})
        </button>
      </div>

      {filteredLogs.length === 0 ? (
        <div className="text-center text-muted" style={{ padding: '40px' }}>
          {campaignLogs.length === 0 ? 'No logs available yet.' : `No ${logFilter} logs found.`}
        </div>
      ) : (
        <div className="table-container" style={{ maxHeight: '400px', overflow: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Status</th>
                <th>Type</th>
                <th>Time</th>
                <th>Error</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.map((log) => (
                <tr key={log.id}>
                  <td style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{log.email}</td>
                  <td>
                    <span className={`badge ${log.status === 'sent' ? 'badge-success' : log.status === 'bounced' ? 'badge-warning' : 'badge-error'}`}>
                      {log.status}
                    </span>
                  </td>
                  <td className="text-sm text-muted">{log.failureType || '-'}</td>
                  <td className="text-sm text-muted">
                    {log.createdAt ? new Date(log.createdAt).toLocaleString() : '-'}
                  </td>
                  <td className="text-sm text-muted" style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {log.error || log.failureReason || '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

export function CampaignScheduleModal({
  isOpen,
  onClose,
  selectedCampaign,
  scheduleDate,
  setScheduleDate,
  scheduleTime,
  setScheduleTime,
  onSchedule
}) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Schedule Campaign: ${selectedCampaign?.name}`}
    >
      <div style={{ background: 'var(--bg-tertiary)', borderRadius: '8px', padding: '12px', marginBottom: '20px' }}>
        <div className="flex items-center gap-2 text-sm">
          <Users size={16} style={{ color: 'var(--accent)' }} />
          <span>
            <strong>{selectedCampaign?.totalEmails || 0}</strong> recipients will receive this campaign
          </span>
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Date</label>
          <input
            type="date"
            className="form-input"
            value={scheduleDate}
            onChange={(event) => setScheduleDate(event.target.value)}
            min={new Date().toISOString().split('T')[0]}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Time</label>
          <input
            type="time"
            className="form-input"
            value={scheduleTime}
            onChange={(event) => setScheduleTime(event.target.value)}
          />
        </div>
      </div>

      {scheduleDate && scheduleTime && (
        <div style={{ background: 'var(--bg-tertiary)', borderRadius: '8px', padding: '16px', marginTop: '16px' }}>
          <div className="flex items-center gap-2 mb-2">
            <Calendar size={18} style={{ color: 'var(--accent)' }} />
            <span>Campaign will start at:</span>
          </div>
          <div style={{ fontSize: '18px', fontWeight: '600', marginLeft: '28px' }}>
            {new Date(`${scheduleDate}T${scheduleTime}`).toLocaleString(undefined, {
              weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
              hour: '2-digit', minute: '2-digit'
            })}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: '28px', marginTop: '4px' }}>
            Timezone: {Intl.DateTimeFormat().resolvedOptions().timeZone} ({new Date().toLocaleTimeString('en-US', { timeZoneName: 'short' }).split(' ').pop()})
          </div>
        </div>
      )}

      <div style={{ marginTop: '16px' }}>
        <div className="text-sm text-muted mb-2">Quick schedule:</div>
        <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
          {[
            { label: 'In 1 hour', hours: 1 },
            { label: 'Tomorrow 9 AM', preset: 'tomorrow9' },
            { label: 'Tomorrow 2 PM', preset: 'tomorrow14' },
            { label: 'Next Monday 10 AM', preset: 'nextMonday' }
          ].map(({ label, hours, preset }) => (
            <button
              key={label}
              className="btn btn-outline btn-sm"
              onClick={() => {
                let nextDate;
                if (hours) {
                  nextDate = new Date();
                  nextDate.setHours(nextDate.getHours() + hours);
                } else if (preset === 'tomorrow9') {
                  nextDate = new Date();
                  nextDate.setDate(nextDate.getDate() + 1);
                  nextDate.setHours(9, 0, 0, 0);
                } else if (preset === 'tomorrow14') {
                  nextDate = new Date();
                  nextDate.setDate(nextDate.getDate() + 1);
                  nextDate.setHours(14, 0, 0, 0);
                } else if (preset === 'nextMonday') {
                  nextDate = new Date();
                  const daysUntilMonday = (8 - nextDate.getDay()) % 7 || 7;
                  nextDate.setDate(nextDate.getDate() + daysUntilMonday);
                  nextDate.setHours(10, 0, 0, 0);
                }
                setScheduleDate(nextDate.toISOString().split('T')[0]);
                setScheduleTime(nextDate.toTimeString().slice(0, 5));
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex justify-end gap-2 mt-4">
        <button className="btn btn-outline" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={onSchedule}><Clock size={16} /> Schedule</button>
      </div>
    </Modal>
  );
}

export function CampaignPreviewModal({
  isOpen,
  onClose,
  previewSubject,
  previewUrl
}) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Preview: ${previewSubject}`}
      size="lg"
    >
      <div style={{ padding: '12px 0' }}>
        <div style={{ padding: '8px 12px', background: 'var(--bg-tertiary)', borderRadius: 6, marginBottom: 12, fontSize: 13 }}>
          <strong>Subject:</strong> {previewSubject}
        </div>
        <div style={{
          border: '1px solid var(--border)',
          borderRadius: 6,
          background: '#fff',
          maxHeight: 500,
          overflow: 'auto'
        }}>
          <iframe
            src={previewUrl}
            title="Email Preview"
            style={{ width: '100%', minHeight: 400, border: 'none' }}
            sandbox=""
          />
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
          Preview uses data from the first contact in the selected list.
        </p>
      </div>
    </Modal>
  );
}
