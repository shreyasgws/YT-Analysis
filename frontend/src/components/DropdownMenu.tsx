import { useRef, useState, type ReactNode } from 'react'
import { ChevronDownIcon } from './icons'
import { useClickOutside } from '../hooks/useClickOutside'

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
  useClickOutside(rootRef, () => setOpen(false))

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
