// A row of choices where exactly one is picked (date range, filters).
export default function Chips({ label, options, value, onChange }) {
  return (
    <div className="t-chips" role="radiogroup" aria-label={label}>
      {options.map(([id, text]) => (
        <button key={id} role="radio" aria-checked={value === id} className={value === id ? 'is-on' : ''} onClick={() => onChange(id)}>
          {text}
        </button>
      ))}
    </div>
  )
}
