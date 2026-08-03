import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronDownIcon } from './icons'

export interface DropdownItem {
  label: string
  hint?: string
  onSelect: () => void
}

interface DropdownMenuProps {
  label: string
  icon?: ReactNode
  items: DropdownItem[]
}

export function DropdownMenu({ label, icon, items }: DropdownMenuProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handlePointer(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', handlePointer)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('pointerdown', handlePointer)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  return (
    <div className="dropdown" ref={rootRef}>
      <button
        type="button"
        className="icon-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {icon}
        {label}
        <ChevronDownIcon size={14} />
      </button>
      {open && (
        <div className="dropdown-menu" role="menu">
          {items.map((item) => (
            <button
              type="button"
              className="dropdown-item"
              role="menuitem"
              key={item.label}
              onClick={() => {
                setOpen(false)
                item.onSelect()
              }}
            >
              <span className="dropdown-item-label">{item.label}</span>
              {item.hint && <span className="dropdown-item-hint">{item.hint}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
