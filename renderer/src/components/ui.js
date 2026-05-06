import React from 'react';
import { Mail } from 'lucide-react';

/**
 * EmptyState — consistent zero-data display across all pages
 *
 * Props:
 *   icon     — lucide icon component (default: Mail)
 *   title    — heading text
 *   message  — sub-text
 *   action   — { label, onClick } optional CTA button
 *   compact  — smaller padding variant
 */
export function EmptyState({ icon: Icon = Mail, title = 'Nothing here yet', message, action, compact = false }) {
  return (
    <div className={`ui-empty-state ${compact ? 'ui-empty-state--compact' : ''}`}>
      <div className="ui-empty-state__icon">
        <Icon size={compact ? 28 : 36} />
      </div>
      <p className="ui-empty-state__title">{title}</p>
      {message && <p className="ui-empty-state__message">{message}</p>}
      {action && (
        <button className="btn btn-primary btn-sm" onClick={action.onClick} style={{ marginTop: 16 }}>
          {action.label}
        </button>
      )}
    </div>
  );
}

/**
 * SkeletonLoader — shimmer placeholder blocks
 *
 * Props:
 *   lines  — number of shimmer rows (default 3)
 *   height — height of each row (default '16px')
 *   card   — wrap in a card surface
 */
export function SkeletonLoader({ lines = 3, height = '16px', gap = '10px', card = false, style = {} }) {
  const rows = Array.from({ length: lines });
  const inner = (
    <div className="ui-skeleton" style={{ display: 'flex', flexDirection: 'column', gap, ...style }}>
      {rows.map((_, i) => (
        <div
          key={i}
          className="ui-skeleton__row"
          style={{ height, width: i === rows.length - 1 ? '62%' : '100%' }}
        />
      ))}
    </div>
  );
  if (card) return <div className="card">{inner}</div>;
  return inner;
}

/**
 * PageHeader — consistent page title row
 *
 * Props:
 *   title    — string | ReactNode
 *   subtitle — string
 *   icon     — lucide icon
 *   actions  — ReactNode (buttons on the right)
 */
export function PageHeader({ title, subtitle, icon: Icon, actions }) {
  return (
    <div className="ui-page-header">
      <div className="ui-page-header__left">
        {Icon && <Icon size={22} className="ui-page-header__icon" />}
        <div>
          <h1 className="ui-page-header__title">{title}</h1>
          {subtitle && <p className="ui-page-header__subtitle">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="ui-page-header__actions">{actions}</div>}
    </div>
  );
}

/**
 * ConfirmDialog — modal for destructive actions
 *
 * Props:
 *   isOpen     — bool
 *   onClose    — fn
 *   onConfirm  — fn
 *   title      — string
 *   message    — string
 *   confirmLabel — string (default 'Confirm')
 *   danger       — bool (red confirm button)
 *   loading      — bool
 */
export function ConfirmDialog({ isOpen, onClose, onConfirm, title = 'Are you sure?', message, confirmLabel = 'Confirm', danger = true, loading = false }) {
  // Inline import avoids circular — Modal is always available
  const Modal = require('./Modal').default;
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="sm"
      danger={danger}
      footer={
        <>
          <button className="btn btn-outline" onClick={onClose} disabled={loading}>Cancel</button>
          <button
            className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? 'Processing…' : confirmLabel}
          </button>
        </>
      }
    >
      {message && <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-base)', lineHeight: 'var(--lh-base)' }}>{message}</p>}
    </Modal>
  );
}

/**
 * StatusBadge — consistent status pills
 */
const STATUS_MAP = {
  active:    { bg: 'var(--success-dim)',  color: 'var(--success)', label: 'Active'    },
  completed: { bg: 'var(--info-dim)',     color: 'var(--info)',    label: 'Completed' },
  sending:   { bg: 'var(--accent-dim)',   color: 'var(--accent)',  label: 'Sending'   },
  scheduled: { bg: 'var(--warning-dim)', color: 'var(--warning)', label: 'Scheduled' },
  failed:    { bg: 'var(--error-dim)',    color: 'var(--error)',   label: 'Failed'    },
  draft:     { bg: 'var(--bg-tertiary)', color: 'var(--text-muted)', label: 'Draft'  },
  paused:    { bg: 'var(--warning-dim)', color: 'var(--warning)', label: 'Paused'    },
  stopped:   { bg: 'var(--error-dim)',   color: 'var(--error)',   label: 'Stopped'   },
  inactive:  { bg: 'var(--bg-tertiary)', color: 'var(--text-muted)', label: 'Inactive' },
};

export function StatusBadge({ status = 'draft', label }) {
  const def = STATUS_MAP[status] ?? STATUS_MAP.draft;
  return (
    <span
      className="ui-status-badge"
      style={{ background: def.bg, color: def.color }}
    >
      {label ?? def.label}
    </span>
  );
}

/**
 * InlineError — form field error message
 */
export function InlineError({ message }) {
  if (!message) return null;
  return <span className="ui-inline-error">{message}</span>;
}

/**
 * FormField — label + input + error wrapper
 */
export function FormField({ label, required, error, hint, children }) {
  return (
    <div className={`ui-form-field ${error ? 'ui-form-field--error' : ''}`}>
      {label && (
        <label className="ui-form-field__label">
          {label}
          {required && <span className="ui-form-field__required">*</span>}
        </label>
      )}
      {children}
      {hint && !error && <span className="ui-form-field__hint">{hint}</span>}
      {error && <InlineError message={error} />}
    </div>
  );
}
