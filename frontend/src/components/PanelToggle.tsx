import { ChevronDownIcon, ChevronUpIcon } from './icons'

interface PanelToggleProps {
  open: boolean
  onToggle: () => void
  label: string
  controlsId: string
}

export function PanelToggle({ open, onToggle, label, controlsId }: PanelToggleProps) {
  return (
    <button
      type="button"
      className="panel-toggle"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={controlsId}
    >
      {open ? <ChevronUpIcon /> : <ChevronDownIcon />}
      {label}
    </button>
  )
}
