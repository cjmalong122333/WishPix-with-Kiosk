import './sheet.css'

// The "printed" page shown in the print preview. Layout depends on the
// activity; Trace & Learn sheets draw their dotted letters, numbers, shapes
// and lines here, on top of the AI picture.
export function Sheet({ current, session, compact }) {
  const sheet = current?.sheet
  const type = session?.activity_type
  const date = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

  return (
    <div className="sheet-wrap">
    <article className={`sheet sheet--${type} ${compact ? 'sheet--compact' : ''}`}>
      <header className="sheet__head">
        <span>WishPix</span>
        <span>{session?.theme} · {date}</span>
      </header>

      {type === 'color_create' && <h2 className="sheet__title">Color me!</h2>}
      {type === 'trace_learn' && <h2 className="sheet__title">{traceTitle(sheet)}</h2>}

      <div className="sheet__body">
        {type === 'trace_learn' && sheet ? (
          <TraceLayout sheet={sheet} imageUrl={current.imageUrl} />
        ) : (
          <img className="sheet__img" src={current?.imageUrl} alt={current?.recognizedText} />
        )}
      </div>

      {type === 'free_play' && <p className="sheet__caption">{current?.recognizedText}</p>}

      <footer className="sheet__name">
        <span>Name:</span><i />
      </footer>
    </article>
    </div>
  )
}

function traceTitle(sheet) {
  switch (sheet?.kind) {
    case 'letter': return `${sheet.letter} is for ${sheet.word}`
    case 'number': return 'Count and trace'
    case 'shape': return `Trace the ${sheet.shape}s`
    case 'prewriting': return 'Follow the dotted line'
    case 'word': return 'Trace the word'
    default: return 'Trace & Learn'
  }
}

function TraceLayout({ sheet, imageUrl }) {
  switch (sheet.kind) {
    case 'letter':
      return (
        <div className="trace trace--split">
          <img className="trace__pic" src={imageUrl} alt={sheet.word} />
          <DottedText text={`${sheet.letter}${sheet.letter.toLowerCase()}`} size={150} />
          <DottedRow text={`${sheet.letter} ${sheet.letter.toLowerCase()} `.repeat(4).trim()} />
        </div>
      )
    case 'number':
      return (
        <div className="trace trace--split">
          <img className="trace__pic trace__pic--wide" src={imageUrl} alt={sheet.word} />
          <DottedText text={String(sheet.count)} size={150} />
          <DottedRow text={`${sheet.count} `.repeat(6).trim()} />
        </div>
      )
    case 'shape':
      return (
        <div className="trace trace--split">
          <img className="trace__pic" src={imageUrl} alt={sheet.word} />
          <div className="trace__shapes">
            {[0, 1, 2, 3].map((i) => <DottedShape key={i} shape={sheet.shape} />)}
          </div>
        </div>
      )
    case 'prewriting':
      return (
        <div className="trace">
          <img className="trace__pic trace__pic--small" src={imageUrl} alt={sheet.word} />
          {[0, 1, 2].map((i) => <DottedPath key={i} kind={sheet.path} />)}
        </div>
      )
    case 'word':
      return (
        <div className="trace trace--split">
          <img className="trace__pic" src={imageUrl} alt={sheet.word} />
          <DottedText text={sheet.word.toLowerCase()} size={sheet.word.length > 5 ? 80 : 110} />
          <DottedText text={sheet.word.toLowerCase()} size={sheet.word.length > 5 ? 56 : 72} />
        </div>
      )
    default:
      return <img className="sheet__img" src={imageUrl} alt="" />
  }
}

// Outline letters drawn with dots, plus a writing baseline.
function DottedText({ text, size }) {
  const w = Math.max(text.length * size * 0.62, size)
  return (
    <svg className="dotted" viewBox={`0 0 ${w} ${size * 1.15}`} role="img" aria-label={`Trace ${text}`}>
      <line x1="0" x2={w} y1={size * 0.98} y2={size * 0.98} className="dotted__base" />
      <line x1="0" x2={w} y1={size * 0.5} y2={size * 0.5} className="dotted__mid" />
      <text x={w / 2} y={size * 0.96} fontSize={size} textAnchor="middle" className="dotted__text">{text}</text>
    </svg>
  )
}

function DottedRow({ text }) {
  return <DottedText text={text} size={60} />
}

function DottedShape({ shape }) {
  const shapes = {
    circle: <circle cx="50" cy="50" r="40" />,
    square: <rect x="12" y="12" width="76" height="76" />,
    triangle: <path d="M50 10 90 88H10z" />,
    star: <path d="M50 8l12 28 30 3-23 20 7 30-26-16-26 16 7-30L8 39l30-3z" />,
    heart: <path d="M50 88S10 62 10 36a20 20 0 0 1 40-6 20 20 0 0 1 40 6c0 26-40 52-40 52z" />,
  }
  return <svg className="dotted dotted--shape" viewBox="0 0 100 100">{shapes[shape] ?? shapes.circle}</svg>
}

function DottedPath({ kind }) {
  const paths = {
    zigzag: 'M10 60 L50 15 L90 60 L130 15 L170 60 L210 15 L250 60 L290 15 L330 60 L370 15 L410 60',
    wave: 'M10 40 Q50 0 90 40 T170 40 T250 40 T330 40 T410 40',
    loops: 'M10 50 C40 50 50 10 70 10 S90 50 70 50 S90 10 130 10 S150 50 130 50 S150 10 190 10 S210 50 190 50 S210 10 250 10 S270 50 250 50 S270 10 310 10 S330 50 310 50 S330 10 370 10 S410 50 410 50',
    bumps: 'M10 60 Q50 0 90 60 Q130 0 170 60 Q210 0 250 60 Q290 0 330 60 Q370 0 410 60',
  }
  return (
    <svg className="dotted dotted--path" viewBox="0 0 420 70">
      <circle cx="10" cy={kind === 'wave' ? 40 : kind === 'loops' ? 50 : 60} r="6" className="dotted__start" />
      <path d={paths[kind] ?? paths.wave} />
    </svg>
  )
}
