import React from 'react';
import {
  AlertTriangle,
  BadgeCheck,
  CheckCircle,
  Download,
  FileDown,
  Loader2,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Search,
  Square,
  Tag,
  Trash2,
  Upload,
  Users,
  X,
  XCircle
} from 'lucide-react';

export function ContactsDropOverlay({ isDragging }) {
  if (!isDragging) return null;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 100,
        background: 'rgba(91,180,212,0.1)',
        border: '3px dashed var(--accent)',
        borderRadius: '12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none'
      }}
    >
      <div style={{ textAlign: 'center', color: 'var(--accent)' }}>
        <Download size={48} style={{ margin: '0 auto 8px' }} />
        <p style={{ fontSize: '18px', fontWeight: 600 }}>Drop file to import contacts</p>
        <p style={{ fontSize: '13px', opacity: 0.7 }}>CSV, Excel, JSON, or TXT</p>
      </div>
    </div>
  );
}

export function ContactsPageHeader({ onImport, onExport, onAddContact }) {
  return (
    <div className="page-header bulky-page-header">
      <div>
        <h1 className="page-title">Contacts</h1>
        <p className="page-subtitle">Manage your email contacts and lists.</p>
      </div>
      <div className="page-header-actions">
        <button className="btn btn-outline" onClick={onImport} title="Import contacts from CSV, TXT, Excel, or JSON">
          <Download size={16} /> Import
        </button>
        <span className="text-xs text-muted" style={{ alignSelf: 'center', marginLeft: '-8px', marginRight: '8px' }}>
          CSV, XLSX, JSON, TXT
        </span>
        <button className="btn btn-outline" onClick={onExport} title="Export contacts to CSV">
          <Upload size={16} /> Export
        </button>
        <button className="btn btn-primary" onClick={onAddContact}>
          <Plus size={16} /> Add Contact
        </button>
      </div>
    </div>
  );
}

export function ContactsSummaryStats({ contactStats }) {
  const cards = [
    { label: 'Total', value: contactStats.total || 0, color: 'var(--accent)', tone: 'tone-accent' },
    { label: 'Valid', value: contactStats.verified || 0, color: 'var(--success)', tone: 'tone-success' },
    { label: 'Risky', value: contactStats.risky || 0, color: 'var(--warning)', tone: 'tone-warning' },
    { label: 'Invalid', value: contactStats.invalid || 0, color: 'var(--error)', tone: 'tone-error' },
    { label: 'Unverified', value: contactStats.unverified || 0, color: 'var(--text-muted)', tone: 'tone-muted' }
  ];

  return (
    <div className="stats-grid operator-kpi-grid mb-4" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
      {cards.map((card) => (
        <div key={card.label} className={`stat-card operator-kpi-card ${card.tone}`} style={{ padding: '14px 16px' }}>
          <div className="stat-content" style={{ textAlign: 'center' }}>
            <div className="stat-value" style={{ fontSize: '22px', color: card.color }}>
              {card.value.toLocaleString()}
            </div>
            <div className="stat-label">{card.label}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function ContactsInsightsGrid({
  contactsCount,
  pagination,
  verificationCoverage,
  classifiedCount,
  selectedContactsCount,
  selectedVerificationBreakdown,
  activeFilterCount
}) {
  return (
    <div className="panel-grid mb-4">
      <div className="insight-card">
        <div className="insight-value">{contactsCount}</div>
        <div className="insight-label">Visible On This Page</div>
        <div className="insight-meta">
          Page {pagination.page} of {Math.max(pagination.totalPages || 1, 1)} with {(pagination.totalCount || 0).toLocaleString()} matching contacts
        </div>
      </div>
      <div className="insight-card">
        <div className="insight-value">{verificationCoverage}%</div>
        <div className="insight-label">Verification Coverage</div>
        <div className="insight-meta">
          {classifiedCount.toLocaleString()} contacts already classified into valid, risky, or invalid states
        </div>
        <div className="meter">
          <div
            className="meter-fill"
            style={{
              width: `${verificationCoverage}%`,
              background: verificationCoverage >= 75 ? 'var(--success)' : verificationCoverage >= 40 ? 'var(--warning)' : 'var(--error)'
            }}
          />
        </div>
      </div>
      <div className="insight-card">
        <div className="insight-value">{selectedContactsCount}</div>
        <div className="insight-label">Selection Ready</div>
        <div className="insight-meta">
          {selectedContactsCount > 0
            ? `${selectedVerificationBreakdown.valid} valid, ${selectedVerificationBreakdown.risky} risky, ${selectedVerificationBreakdown.invalid} invalid, ${selectedVerificationBreakdown.unverified} unverified on this page`
            : 'Select contacts to unlock bulk verify, export, tag, and delete actions'}
        </div>
      </div>
      <div className="insight-card">
        <div className="insight-value">{activeFilterCount}</div>
        <div className="insight-label">Active Filters</div>
        <div className="insight-meta">
          {activeFilterCount > 0
            ? 'Filters are actively narrowing the visible contact set'
            : 'No filters applied; you are viewing the broadest contact surface'}
        </div>
      </div>
    </div>
  );
}

export function ContactsFiltersToolbar({
  filters,
  setFilters,
  setPagination,
  lists,
  tags,
  resetFilters,
  refreshContactsSurface,
  onOpenLists,
  onOpenTags
}) {
  return (
    <div className="card filter-toolbar-card mb-4">
      <div className="flex gap-3 items-center flex-wrap">
        <div className="toolbar-search">
          <Search size={18} />
          <input
            type="text"
            className="form-input"
            placeholder="Search contacts..."
            style={{ paddingLeft: '40px' }}
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          />
        </div>

        <select className="form-select" style={{ width: '150px' }} value={filters.listId} onChange={(e) => { setFilters({ ...filters, listId: e.target.value }); setPagination((prev) => ({ ...prev, page: 1 })); }}>
          <option value="">All Lists</option>
          {lists.map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}
        </select>

        <select className="form-select" style={{ width: '130px' }} value={filters.status} onChange={(e) => { setFilters({ ...filters, status: e.target.value }); setPagination((prev) => ({ ...prev, page: 1 })); }}>
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="bounced">Bounced</option>
        </select>

        <select className="form-select" style={{ width: '140px' }} value={filters.verified} onChange={(e) => { setFilters({ ...filters, verified: e.target.value }); setPagination((prev) => ({ ...prev, page: 1 })); }}>
          <option value="">Verification</option>
          <option value="valid">Valid</option>
          <option value="risky">Risky</option>
          <option value="invalid">Invalid</option>
          <option value="unverified">Unverified</option>
        </select>

        {tags.length > 0 && (
          <select className="form-select" style={{ width: '120px' }} value={filters.tag} onChange={(e) => { setFilters({ ...filters, tag: e.target.value }); setPagination((prev) => ({ ...prev, page: 1 })); }}>
            <option value="">All Tags</option>
            {tags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
          </select>
        )}

        <button className="btn btn-outline btn-sm" onClick={resetFilters}>
          <RefreshCw size={14} /> Reset
        </button>

        <button className="btn btn-outline btn-sm" onClick={refreshContactsSurface}>
          <RefreshCw size={14} /> Refresh
        </button>

        <button className="btn btn-outline btn-sm" onClick={onOpenLists}>
          <Users size={14} /> Lists
        </button>

        <button className="btn btn-outline btn-sm" onClick={onOpenTags}>
          <Tag size={14} /> Tags
        </button>
      </div>
    </div>
  );
}

export function ContactsBulkActionsBar({
  selectedContactsCount,
  selectedVerificationBreakdown,
  handleDelete,
  handleExport,
  onOpenBulkTag,
  onOpenBulkList,
  handleBulkVerify,
  isBulkVerifying,
  clearSelection
}) {
  if (selectedContactsCount <= 0) return null;

  return (
    <div className="card selection-toolbar-card mb-4">
      <div className="flex justify-between items-center" style={{ gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 500 }}>{selectedContactsCount} contact(s) selected</div>
          <div className="text-sm text-muted" style={{ marginTop: '4px' }}>
            {selectedVerificationBreakdown.valid} valid, {selectedVerificationBreakdown.risky} risky, {selectedVerificationBreakdown.invalid} invalid, {selectedVerificationBreakdown.unverified} unverified on this page
          </div>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-danger btn-sm" onClick={handleDelete}>
            <Trash2 size={14} /> Delete
          </button>
          <button className="btn btn-outline btn-sm" onClick={handleExport}>
            <FileDown size={14} /> Export
          </button>
          <button className="btn btn-outline btn-sm" onClick={onOpenBulkTag}>
            <Tag size={14} /> Tag
          </button>
          <button className="btn btn-outline btn-sm" onClick={onOpenBulkList}>
            <Users size={14} /> Add to List
          </button>
          <button className="btn btn-outline btn-sm" onClick={handleBulkVerify} disabled={isBulkVerifying}>
            {isBulkVerifying ? <Loader2 size={14} className="animate-spin" /> : <BadgeCheck size={14} />}
            {isBulkVerifying ? ' Verifying...' : ' Verify'}
          </button>
          <button className="btn btn-outline btn-sm" onClick={clearSelection}>
            <X size={14} /> Clear
          </button>
        </div>
      </div>
    </div>
  );
}

export function ContactsVerificationProgressCard({
  isBulkVerifying,
  verifyProgress,
  verifyLiveResults,
  isVerifyPaused,
  handlePauseVerify,
  handleResumeVerify,
  handleStopVerify
}) {
  if (!isBulkVerifying && !verifyProgress && verifyLiveResults.length === 0) {
    return null;
  }

  const progressValue = verifyProgress
    ? Math.round(((verifyProgress.current || 0) / Math.max(verifyProgress.total || 1, 1)) * 100)
    : 0;

  return (
    <div className="card selection-toolbar-card mb-4" style={{ background: isBulkVerifying ? 'var(--accent-dim)' : 'var(--bg-secondary)' }}>
      <div className="flex justify-between items-start" style={{ gap: '16px', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '240px' }}>
          <div className="flex items-center gap-2 mb-2">
            <BadgeCheck size={16} style={{ color: 'var(--accent)' }} />
            <strong>Verification Progress</strong>
            {isVerifyPaused && <span className="badge badge-warning">Paused</span>}
            {!isBulkVerifying && verifyProgress && <span className="badge badge-success">Last run complete</span>}
          </div>
          <div className="progress-bar" style={{ marginBottom: '8px' }}>
            <div
              className="progress-fill"
              style={{
                width: `${progressValue}%`,
                background: isVerifyPaused ? 'var(--warning)' : undefined
              }}
            />
          </div>
          <div className="flex justify-between text-sm text-muted">
            <span>{verifyProgress ? `${verifyProgress.current || 0} of ${verifyProgress.total || 0} checked` : 'Ready for verification'}</span>
            <span>{progressValue}%</span>
          </div>
          {verifyProgress?.email && (
            <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-muted)' }}>
              Checking <strong style={{ color: 'var(--text)' }}>{verifyProgress.email}</strong>
            </div>
          )}
        </div>

        {isBulkVerifying && (
          <div className="flex gap-2">
            {!isVerifyPaused ? (
              <button className="btn btn-outline btn-sm" onClick={handlePauseVerify}>
                <Pause size={14} /> Pause
              </button>
            ) : (
              <button className="btn btn-outline btn-sm" onClick={handleResumeVerify}>
                <Play size={14} /> Resume
              </button>
            )}
            <button className="btn btn-danger btn-sm" onClick={handleStopVerify}>
              <Square size={14} /> Stop
            </button>
          </div>
        )}
      </div>

      {verifyLiveResults.length > 0 && (
        <div style={{ marginTop: '14px', borderTop: '1px solid var(--border)', paddingTop: '14px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '8px', color: 'var(--text-secondary)' }}>Live Results</div>
          <div style={{ display: 'grid', gap: '6px' }}>
            {verifyLiveResults.slice(0, 8).map((result, index) => (
              <div
                key={`${result.email}-${index}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 10px',
                  borderRadius: '8px',
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border)',
                  fontSize: '12px'
                }}
              >
                {result.status === 'valid' ? <CheckCircle size={12} style={{ color: 'var(--success)' }} /> :
                  result.status === 'invalid' ? <XCircle size={12} style={{ color: 'var(--error)' }} /> :
                    <AlertTriangle size={12} style={{ color: 'var(--warning)' }} />}
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{result.email}</span>
                <span className={`badge badge-${result.status === 'valid' ? 'success' : result.status === 'invalid' ? 'error' : 'warning'}`}>
                  {result.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
