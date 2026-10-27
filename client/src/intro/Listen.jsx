import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Download, Mic, MicOff, Play } from 'lucide-react'
import { createListenScene, LISTEN_STATES, LOOP_SECONDS, DONE_SECONDS, WISH_SHAPES } from './listenScene.js'
import './intro.css'

const RATIOS = { '9:16': [9, 16], '1:1': [1, 1], '16:9': [16, 9] }
const QUALITY = { '1080p': 1080, '4k': 2160 }
const STATE_LABELS = { idle: 'Ready', listening: 'Listening', thinking: 'Thinking', done: 'Got it!' }
const SHAPE_LABELS = { heart: '♥', star: '★', cat: 'Cat', flower: 'Flower', rainbow: 'Rainbow' }
// "Play story" walks through the states like a real wish.
const STORY = [['idle', 4], ['listening', 8], ['thinking', 6], ['done', 7]]

function renderSize(ratio, quality) {
  const [w, h] = RATIOS[ratio]
  const short = QUALITY[quality]
  return w >= h ? [Math.round((short * w) / h), short] : [short, Math.round((short * h) / w)]
}

// The Pixi "listening to your wish" animation. ?state=idle|listening|thinking|done,
// ?shape=heart|star|cat|flower|rainbow, ?ratio=9:16|1:1|16:9, ?res=1080p|4k,
// ?bg=0 for a transparent background, ?ui=0 hides the controls; ?at=6.5 freezes
// that many seconds into the state.
// "Save video" records one loop of the current state (the whole "Got it!" moment for done).
export default function Listen() {
  const [params, setParams] = useSearchParams()
  const ratio = RATIOS[params.get('ratio')] ? params.get('ratio') : '9:16'
  const quality = QUALITY[params.get('res')] ? params.get('res') : '1080p'
  const state = LISTEN_STATES.includes(params.get('state')) ? params.get('state') : 'idle'
  const shape = WISH_SHAPES.includes(params.get('shape')) ? params.get('shape') : 'heart'
  const background = params.get('bg') !== '0'
  const showUi = params.get('ui') !== '0'
  const at = params.get('at')
  const hostRef = useRef(null)
  const sceneRef = useRef(null)
  const [recording, setRecording] = useState(null)
  const [story, setStory] = useState(false)
  const [mic, setMic] = useState(null) // null | 'on' | error text
  const [idle, setIdle] = useState(false)

  useEffect(() => {
    const [width, height] = renderSize(ratio, quality)
    const scene = createListenScene({ width, height, background })
    hostRef.current.appendChild(scene.canvas)
    scene.setWishShape(shape)
    scene.setState(state)
    if (at != null) scene.freezeAfter(Number(at))
    else scene.start()
    sceneRef.current = scene
    return () => { scene.dispose(); sceneRef.current = null }
  }, [ratio, quality, background, at]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (!story) sceneRef.current?.setState(state, { restart: state === 'done' }) }, [state, story])
  useEffect(() => { sceneRef.current?.setWishShape(shape) }, [shape])

  // Story mode: step through the states on a timer.
  useEffect(() => {
    if (!story) return
    let i = 0
    let timer
    const step = () => {
      const [name, seconds] = STORY[i]
      sceneRef.current?.setState(name, { restart: true })
      i += 1
      timer = setTimeout(i < STORY.length ? step : () => setStory(false), seconds * 1000)
    }
    step()
    return () => clearTimeout(timer)
  }, [story])

  // The real microphone: its loudness drives the bubbles while listening.
  useEffect(() => {
    sceneRef.current?.setSimulated(mic !== 'on')
    if (mic !== 'on') return
    let stream, ctx, raf
    let stopped = false
    navigator.mediaDevices.getUserMedia({ audio: true }).then((s) => {
      if (stopped) { s.getTracks().forEach((t) => t.stop()); return }
      stream = s
      ctx = new AudioContext()
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 1024
      ctx.createMediaStreamSource(s).connect(analyser)
      const data = new Float32Array(analyser.fftSize)
      const tick = () => {
        analyser.getFloatTimeDomainData(data)
        let sum = 0
        for (const v of data) sum += v * v
        sceneRef.current?.setLevel((Math.sqrt(sum / data.length) - 0.01) * 9)
        raf = requestAnimationFrame(tick)
      }
      tick()
    }).catch(() => setMic('Microphone not allowed'))
    return () => {
      stopped = true
      cancelAnimationFrame(raf)
      stream?.getTracks().forEach((t) => t.stop())
      ctx?.close()
    }
  }, [mic, ratio, quality, background])

  // Hide the controls while the mouse is still.
  useEffect(() => {
    let timer = setTimeout(() => setIdle(true), 2500)
    const wake = () => {
      setIdle(false)
      clearTimeout(timer)
      timer = setTimeout(() => setIdle(true), 2500)
    }
    window.addEventListener('pointermove', wake)
    return () => { clearTimeout(timer); window.removeEventListener('pointermove', wake) }
  }, [])

  const choose = (key, value) => setParams((p) => { p.set(key, value); return p }, { replace: true })

  async function saveVideo() {
    const scene = sceneRef.current
    if (!scene || recording) return
    setStory(false)
    const isDone = state === 'done'
    setRecording('Getting ready…')
    if (isDone) scene.setState('done', { restart: true })
    else {
      scene.setState(state)
      // Let the state settle (blends finished, bubbles in flight) so the clip loops cleanly.
      const wait = Math.max(0, LOOP_SECONDS - scene.stateTime)
      await new Promise((r) => setTimeout(r, wait * 1000))
    }
    const seconds = isDone ? DONE_SECONDS : LOOP_SECONDS
    const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m))
    const recorder = new MediaRecorder(scene.canvas.captureStream(60), { mimeType, videoBitsPerSecond: quality === '4k' ? 40e6 : 16e6 })
    const chunks = []
    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data) }
    recorder.onstop = () => {
      const url = URL.createObjectURL(new Blob(chunks, { type: 'video/webm' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `wishpix-pixi-${state}-${ratio.replace(':', 'x')}-${quality}${background ? '' : '-clear'}.webm`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      setRecording(null)
    }
    recorder.start()
    setRecording(`Recording ${seconds}s…`)
    setTimeout(() => recorder.stop(), seconds * 1000)
  }

  const [w, h] = RATIOS[ratio]
  const busy = !!recording
  return (
    <div className={`intro${background ? '' : ' intro--clear'}`}>
      <div className="intro__stage" ref={hostRef} style={{ '--ar': w / h }} />
      {showUi && (
        <div className={`intro__bar${idle && !busy ? ' is-idle' : ''}`}>
          <div className="intro__group">
            {LISTEN_STATES.map((s) => (
              <button key={s} className={s === state && !story ? 'is-on' : ''} onClick={() => { setStory(false); choose('state', s) }} disabled={busy}>{STATE_LABELS[s]}</button>
            ))}
          </div>
          <div className="intro__group" aria-label="Wish picture">
            {WISH_SHAPES.map((s) => (
              <button key={s} className={s === shape ? 'is-on' : ''} onClick={() => choose('shape', s)} disabled={busy}>{SHAPE_LABELS[s]}</button>
            ))}
          </div>
          <div className="intro__group">
            {Object.keys(RATIOS).map((r) => (
              <button key={r} className={r === ratio ? 'is-on' : ''} onClick={() => choose('ratio', r)} disabled={busy}>{r}</button>
            ))}
          </div>
          <div className="intro__group">
            {Object.keys(QUALITY).map((q) => (
              <button key={q} className={q === quality ? 'is-on' : ''} onClick={() => choose('res', q)} disabled={busy}>{q === '4k' ? '4K' : q}</button>
            ))}
            <button className={background ? '' : 'is-on'} onClick={() => choose('bg', background ? '0' : '1')} disabled={busy}>Clear bg</button>
          </div>
          <button className="intro__btn" onClick={() => setMic(mic === 'on' ? null : 'on')} disabled={busy} title={typeof mic === 'string' && mic !== 'on' ? mic : 'Bubbles follow your voice while Listening'}>
            {mic === 'on' ? <Mic size={16} /> : <MicOff size={16} />} {mic === 'on' ? 'My voice' : mic ? mic : 'Pretend voice'}
          </button>
          <button className="intro__btn" onClick={() => setStory(true)} disabled={busy || story}><Play size={16} /> {story ? 'Playing…' : 'Play story'}</button>
          <button className="intro__btn intro__btn--main" onClick={saveVideo} disabled={busy}>
            <Download size={16} /> {recording ?? 'Save video'}
          </button>
        </div>
      )}
    </div>
  )
}
