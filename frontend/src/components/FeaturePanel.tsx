import { useEffect, useState, type ComponentType } from 'react'

export interface Feature {
  id: string
  label: string
  icon: ComponentType<{ size?: number }>
  headline: string
  points: string[]
}

interface FeaturePanelProps {
  feature: Feature | null
}

type Phase = 'idle' | 'exiting' | 'entering'

/**
 * Inline feature showcase.
 *
 * Lifecycle is split so the DOM never unmounts before a transition completes:
 *   - The outer grid (open/collapse) is driven purely by the `feature` prop.
 *     When it becomes null the panel collapses; the content stays mounted.
 *   - Content swaps have their own phase machine: the current content is kept
 *     mounted and animated out (100ms), the swap runs from the exit's
 *     `animationend` (no timers), then the keyed replacement animates in
 *     (120ms). Reduced-motion is handled by the global guard, which collapses
 *     both durations to ~0ms and lets the same animationend flow finish
 *     instantly.
 */
export function FeaturePanel({ feature }: FeaturePanelProps) {
  const [display, setDisplay] = useState<Feature | null>(feature)
  const [phase, setPhase] = useState<Phase>('idle')

  useEffect(() => {
    if (!feature) return
    if (display?.id === feature.id) return
    if (!display) {
      // Nothing on screen yet — swap immediately, don't animate on open.
      setDisplay(feature)
      return
    }
    setPhase('exiting')
  }, [feature, display])

  function handleAnimationEnd() {
    if (phase === 'exiting') {
      // Exit finished: replace content, then play the enter animation.
      setPhase(feature ? 'entering' : 'idle')
      if (feature) setDisplay(feature)
    } else if (phase === 'entering') {
      // Enter finished: clear the class so the next exit restarts cleanly.
      setPhase('idle')
    }
  }

  const Icon = display?.icon
  const phaseClass = phase === 'exiting' ? ' is-exiting' : phase === 'entering' ? ' is-entering' : ''

  return (
    <div
      className={`feature-panel${feature ? ' is-open' : ''}`}
      id="feature-panel"
      role="region"
      aria-label={feature?.label}
    >
      <div className="feature-panel-inner">
        {Icon && display && (
          <div
            key={display.id}
            className={`feature-panel-swap${phaseClass}`}
            onAnimationEnd={handleAnimationEnd}
          >
            <span className="feature-panel-icon" aria-hidden="true">
              <Icon size={20} />
            </span>
            <div className="feature-panel-body">
              <strong className="feature-panel-title">{display.label}</strong>
              <p className="feature-panel-headline">{display.headline}</p>
              <ul className="feature-panel-points">
                {display.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
