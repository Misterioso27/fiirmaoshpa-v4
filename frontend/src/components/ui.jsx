import { X, Loader2, AlertCircle, CheckCircle, Info, AlertTriangle } from 'lucide-react'
import { clsx } from 'clsx'

// ─── SPINNER ────────────────────────────────────────────────
export function Spinner({ size = 16, className }) {
  return <Loader2 size={size} className={clsx('animate-spin text-hpa-slate-5', className)} />
}

// ─── MODAL ──────────────────────────────────────────────────
export function Modal({ open, onClose, title, children, footer, size = 'md' }) {
  if (!open) return null
  const sizes = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={clsx('modal', sizes[size])}>
        <div className="modal-header">
          <h3 className="text-base font-semibold text-hpa-slate-9">{title}</h3>
          <button onClick={onClose} className="btn-icon btn-ghost text-hpa-slate-5 hover:text-hpa-slate-8">
            <X size={16} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  )
}

// ─── CONFIRM MODAL ──────────────────────────────────────────
export function Confirm({ open, onClose, onConfirm, title, message, loading, danger }) {
  return (
    <Modal open={open} onClose={onClose} title={title}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={loading}>Cancelar</button>
          <button className={clsx('btn', danger ? 'btn-danger' : 'btn-primary')}
            onClick={onConfirm} disabled={loading}>
            {loading ? <Spinner size={14} /> : 'Confirmar'}
          </button>
        </>
      }>
      <p className="text-sm text-hpa-slate-7">{message}</p>
    </Modal>
  )
}

// ─── BADGE STATUS ────────────────────────────────────────────
const statusMap = {
  active: 'badge-green', inactive: 'badge-gray', suspended: 'badge-red',
  active_loan: 'badge-blue', overdue: 'badge-red', defaulted: 'badge-red',
  paid: 'badge-green', pending: 'badge-amber', approved: 'badge-green',
  rejected: 'badge-red', in_review: 'badge-blue', draft: 'badge-gray',
  open: 'badge-blue', closed: 'badge-gray', resolved: 'badge-green',
  prospect: 'badge-amber', blacklist: 'badge-red',
}
const statusLabel = {
  active: 'Activo', inactive: 'Inactivo', suspended: 'Suspendido',
  overdue: 'En mora', defaulted: 'Incumplido', paid: 'Pagado',
  pending: 'Pendiente', approved: 'Aprobado', rejected: 'Rechazado',
  in_review: 'En revisión', draft: 'Borrador', open: 'Abierto',
  closed: 'Cerrado', resolved: 'Resuelto', prospect: 'Prospecto',
  blacklist: 'Lista negra', liquidated: 'Liquidado', paused: 'Pausado',
  restructured: 'Reestructurado', written_off: 'Castigado',
}
export function StatusBadge({ status }) {
  return (
    <span className={clsx('badge', statusMap[status] || 'badge-gray')}>
      {statusLabel[status] || status}
    </span>
  )
}

// ─── ALERT ──────────────────────────────────────────────────
const alertIcons = {
  info: <Info size={16} />, success: <CheckCircle size={16} />,
  warning: <AlertTriangle size={16} />, error: <AlertCircle size={16} />
}
export function Alert({ type = 'info', children }) {
  return (
    <div className={`alert-${type}`}>
      {alertIcons[type]}
      <div>{children}</div>
    </div>
  )
}

// ─── EMPTY STATE ─────────────────────────────────────────────
export function Empty({ icon: Icon, title, desc, action }) {
  return (
    <div className="empty-state">
      {Icon && <Icon className="empty-state-icon" />}
      <p className="empty-state-title">{title}</p>
      {desc && <p className="empty-state-desc">{desc}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

// ─── PAGINATION ──────────────────────────────────────────────
export function Pagination({ page, pages, total, limit, onChange }) {
  if (pages <= 1) return null
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-hpa-slate-2">
      <span className="text-xs text-hpa-slate-5">
        {((page - 1) * limit) + 1}–{Math.min(page * limit, total)} de {total}
      </span>
      <div className="flex gap-1">
        <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          ←
        </button>
        {Array.from({ length: Math.min(pages, 5) }, (_, i) => {
          const p = i + 1
          return (
            <button key={p}
              className={clsx('btn btn-sm', p === page ? 'btn-primary' : 'btn-ghost')}
              onClick={() => onChange(p)}>
              {p}
            </button>
          )
        })}
        <button className="btn btn-ghost btn-sm" disabled={page >= pages} onClick={() => onChange(page + 1)}>
          →
        </button>
      </div>
    </div>
  )
}

// ─── FORM FIELD ──────────────────────────────────────────────
export function Field({ label, required, error, children, hint }) {
  return (
    <div className="form-group">
      {label && (
        <label className="label">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      {children}
      {hint && <p className="text-2xs text-hpa-slate-5 mt-0.5">{hint}</p>}
      {error && <p className="text-2xs text-red-500 mt-0.5">{error}</p>}
    </div>
  )
}

// ─── SKELETON ────────────────────────────────────────────────
export function Skeleton({ className }) {
  return <div className={clsx('bg-hpa-slate-3 rounded animate-pulse', className)} />
}

export function SkeletonCard() {
  return (
    <div className="card space-y-3">
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-8 w-1/2" />
      <Skeleton className="h-3 w-2/3" />
    </div>
  )
}

// ─── TABS ────────────────────────────────────────────────────
export function Tabs({ tabs, active, onChange }) {
  return (
    <div className="tabs">
      {tabs.map(t => (
        <button key={t.id} className={clsx('tab', active === t.id && 'active')}
          onClick={() => onChange(t.id)}>
          {t.label}
          {t.count !== undefined && (
            <span className={clsx('ml-1.5 px-1.5 py-0.5 rounded-full text-2xs font-semibold',
              active === t.id ? 'bg-hpa-700 text-white' : 'bg-hpa-slate-2 text-hpa-slate-6')}>
              {t.count}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}
