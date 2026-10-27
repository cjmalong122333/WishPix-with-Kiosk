// Summary card used on the Dashboard and the management pages.
export default function Stat({ label, value, note, icon, tone, small }) {
  return (
    <div className="t-stat">
      <div className="t-stat__head"><span>{label}</span><i className={`t-tint t-tint--${tone}`}>{icon}</i></div>
      <b className={small ? 't-stat__value--sm' : ''}>{value ?? '–'}</b>
      {note && <small>{note}</small>}
    </div>
  )
}
