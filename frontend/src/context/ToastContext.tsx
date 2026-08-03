import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { Toasts } from '../components/Toasts'

export type ToastKind = 'success' | 'error'

export interface Toast {
  id: number
  message: string
  kind: ToastKind
}

interface ToastContextValue {
  notify: (message: string, kind?: ToastKind) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id))
  }, [])

  const notify = useCallback(
    (message: string, kind: ToastKind = 'success') => {
      const id = nextId.current++
      setToasts((current) => [...current, { id, message, kind }])
      window.setTimeout(() => dismiss(id), 2600)
    },
    [dismiss],
  )

  return (
    <ToastContext.Provider value={{ notify }}>
      {children}
      <Toasts toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue['notify'] {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context.notify
}
