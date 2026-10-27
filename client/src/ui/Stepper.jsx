import { useT } from '../i18n/index.jsx'
import './stepper.css'

// Same steps as the Live Session monitor in the Teacher App.
const FLOW_STEPS = [
  { id: 'listening', label: 'Listening' },
  { id: 'processing', label: 'Processing' },
  { id: 'generating', label: 'Generating' },
  { id: 'printing', label: 'Printing' },
]

const ORDER = { ready: -1, listening: 0, processing: 1, generating: 2, printing: 3, preview: 4 }

export function Stepper({ mode, size = 'md' }) {
  const t = useT()
  const at = ORDER[mode] ?? -1
  return (
    <ol className={`wp-stepper wp-stepper--${size}`}>
      {FLOW_STEPS.map((s, i) => {
        const state = i < at ? 'done' : i === at ? 'active' : 'todo'
        return (
          <li key={s.id} className={`is-${state}`}>
            <span className="wp-stepper__dot">{state === 'done' ? '✓' : i + 1}</span>
            <span className="wp-stepper__label">{t(s.label)}</span>
          </li>
        )
      })}
    </ol>
  )
}
