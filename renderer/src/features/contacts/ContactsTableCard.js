import React from 'react';
import {
  BadgeCheck,
  ChevronLeft,
  ChevronRight,
  Edit2,
  Eye,
  Loader2,
  Plus,
  Users
} from 'lucide-react';

export default function ContactsTableCard({
  loading,
  contacts,
  selectedContacts,
  toggleSelectAll,
  toggleSelect,
  handleSort,
  getSortIcon,
  getDisplayName,
  getListLabel,
  getVerificationBadge,
  getEngagementColor,
  handleVerifyContact,
  isBulkVerifying,
  verifyingContactId,
  handleViewDetail,
  handleOpenModal,
  pagination,
  setPagination
}) {
  return (
    <div className="card dense-data-card contacts-table-shell">
      {loading ? (
        <div className="text-center text-muted" style={{ padding: '40px' }}>
          <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', marginBottom: '8px' }} />
          <p>Loading contacts...</p>
        </div>
      ) : contacts.length === 0 ? (
        <div className="empty-state">
          <Users className="empty-state-icon" />
          <h3 className="empty-state-title">No contacts found</h3>
          <p className="empty-state-text">Import contacts or add them manually.</p>
          <button className="btn btn-primary" onClick={() => handleOpenModal()}>
            <Plus size={16} /> Add Contact
          </button>
        </div>
      ) : (
        <div className="table-container">
          <table className="table data-shell-table contacts-table">
            <thead>
              <tr>
                <th style={{ width: '40px' }}>
                  <input
                    type="checkbox"
                    checked={selectedContacts.length === contacts.length && contacts.length > 0}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th onClick={() => handleSort('email')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                  <span className="flex items-center gap-1">Email {getSortIcon('email')}</span>
                </th>
                <th onClick={() => handleSort('firstName')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                  <span className="flex items-center gap-1">Name {getSortIcon('firstName')}</span>
                </th>
                <th>Company</th>
                <th>List</th>
                <th>Status</th>
                <th onClick={() => handleSort('engagementScore')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                  <span className="flex items-center gap-1">Engagement {getSortIcon('engagementScore')}</span>
                </th>
                <th style={{ width: '80px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((contact) => {
                const displayName = getDisplayName(contact);
                const engagementScore = contact.engagementScore || 0;

                return (
                  <tr key={contact.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedContacts.includes(contact.id)}
                        onChange={() => toggleSelect(contact.id)}
                      />
                    </td>
                    <td>
                      <strong
                        style={{ cursor: 'pointer', color: 'var(--accent)' }}
                        onClick={() => handleViewDetail(contact)}
                      >
                        {contact.email}
                      </strong>
                    </td>
                    <td>{displayName || <span className="text-muted">-</span>}</td>
                    <td>{contact.company || '-'}</td>
                    <td>{getListLabel(contact) || <span className="text-muted">No list</span>}</td>
                    <td>{getVerificationBadge(contact)}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <div
                          style={{
                            width: '50px',
                            height: '6px',
                            background: 'var(--bg-tertiary)',
                            borderRadius: '3px',
                            overflow: 'hidden'
                          }}
                        >
                          <div
                            style={{
                              width: `${Math.min(engagementScore, 100)}%`,
                              height: '100%',
                              background: getEngagementColor(engagementScore),
                              borderRadius: '3px',
                              transition: 'width 0.3s'
                            }}
                          />
                        </div>
                        <span
                          style={{
                            fontSize: '12px',
                            fontWeight: 500,
                            color: getEngagementColor(engagementScore),
                            minWidth: '24px'
                          }}
                        >
                          {engagementScore}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="flex gap-1">
                        <button
                          className="btn btn-outline btn-icon btn-sm"
                          onClick={() => handleVerifyContact(contact)}
                          title="Verify"
                          disabled={isBulkVerifying || verifyingContactId === contact.id}
                        >
                          {verifyingContactId === contact.id ? <Loader2 size={14} className="animate-spin" /> : <BadgeCheck size={14} />}
                        </button>
                        <button
                          className="btn btn-outline btn-icon btn-sm"
                          onClick={() => handleViewDetail(contact)}
                          title="View"
                        >
                          <Eye size={14} />
                        </button>
                        <button
                          className="btn btn-outline btn-icon btn-sm"
                          onClick={() => handleOpenModal(contact)}
                          title="Edit"
                        >
                          <Edit2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex justify-between items-center mt-4" style={{ padding: '0 4px' }}>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted">
            Showing {contacts.length > 0 ? ((pagination.page - 1) * pagination.perPage + 1) : 0}-{Math.min(pagination.page * pagination.perPage, pagination.totalCount)} of {(pagination.totalCount || 0).toLocaleString()} contacts
          </span>
          <select
            className="form-select"
            style={{ width: '80px', padding: '4px 8px', fontSize: '12px' }}
            value={pagination.perPage}
            onChange={(e) => setPagination((prev) => ({ ...prev, perPage: parseInt(e.target.value, 10), page: 1 }))}
          >
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
          <span className="text-sm text-muted">per page</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            className="btn btn-outline btn-sm"
            disabled={pagination.page <= 1}
            onClick={() => setPagination((prev) => ({ ...prev, page: 1 }))}
            title="First page"
          >
            <ChevronLeft size={14} /><ChevronLeft size={14} style={{ marginLeft: '-8px' }} />
          </button>
          <button
            className="btn btn-outline btn-sm"
            disabled={pagination.page <= 1}
            onClick={() => setPagination((prev) => ({ ...prev, page: prev.page - 1 }))}
          >
            <ChevronLeft size={14} />
          </button>
          <span className="text-sm" style={{ padding: '0 8px', fontWeight: 500 }}>
            Page {pagination.page} of {pagination.totalPages}
          </span>
          <button
            className="btn btn-outline btn-sm"
            disabled={pagination.page >= pagination.totalPages}
            onClick={() => setPagination((prev) => ({ ...prev, page: prev.page + 1 }))}
          >
            <ChevronRight size={14} />
          </button>
          <button
            className="btn btn-outline btn-sm"
            disabled={pagination.page >= pagination.totalPages}
            onClick={() => setPagination((prev) => ({ ...prev, page: prev.totalPages }))}
            title="Last page"
          >
            <ChevronRight size={14} /><ChevronRight size={14} style={{ marginLeft: '-8px' }} />
          </button>
        </div>
      </div>
    </div>
  );
}
