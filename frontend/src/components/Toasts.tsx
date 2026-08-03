import type { Toast } from '../context/ToastContext'
import { CheckIcon } from './icons'

interface ToastsProps {
  toasts: Toast[]
  onDismiss: (id: number) => void
}

export function Toasts({ toasts, onDismiss }: ToastsProps) {
  return (
    <div className="toasts" aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => (
        <button
          type="button"
          className={`toast toast-${toast.kind}`}
          key={toast.id}
          onClick={() => onDismiss(toast.id)}
        >
          {toast.kind === 'success' && <CheckIcon size={14} />}
          <span>{toast.message}</span>
        </button>
      ))}
    </div>
  )
}
