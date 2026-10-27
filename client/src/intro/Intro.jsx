import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Download, RotateCcw } from 'lucide-react'
import { createPixiScene, loadSceneFonts, LOOP_SECONDS } from './pixiScene.js'
import './intro.css'

const RATIOS = { '16:9': [16, 9], '9:16': [9, 16], '1:1': [1, 1] }
const QUALITY = { '1080p': 1080, '4k': 2160 }

function renderSize(ratio, quality) {
  const [w, h] = RATIOS[ratio]
  const short = QUALITY[quality]
  return w >= h ? [Math.round((short * w) / h), short] : [short, Math.round((short * h) / w)]
}

// The Pixi intro animation. ?ratio=16:9|9:16|1:1 and ?res=1080p|4k pick the
// frame; ?ui=0 hides the controls; ?at=6.8 freezes on one moment. "Save video" records one loop as WebM.
export default function Intro() {
  const [params, setParams] = useSearchParams()
  const ratio = RATIOS[params.get('ratio')] ? params.get('ratio') : '16:9'
  const quality = QUALITY[params.get('res')] ? params.get('res') : '1080p'
  const showUi = params.get('ui') !== '0'
  const at = params.get('at')
  const hostRef = useRef(null)
  const sceneRef = useRef(null)
  const [recording, setRecording] = useState(false)
  const [idle, setIdle] = useState(false)

  useEffect(() => {
    let cancelled = false
    let scene = null
    const [width, height] = renderSize(ratio, quality)
    loadSceneFonts().then(() => {
      if (cancelled) return
      scene = createPixiScene({ width, height })
      hostRef.current.appendChild(scene.canvas)
      scene.start()
      sceneRef.current = scene
      if (at != null) scene.hold(Number(at))
    })
    return () => {
      cancelled = true
      scene?.dispose()
      sceneRef.current = null
    }
  }, [ratio, quality]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { sceneRef.current?.hold(at == null ? null : Number(at)) }, [at])

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

  function saveVideo() {
    const scene = sceneRef.current
    if (!scene || recording) return
    const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m))
    const recorder = new MediaRecorder(scene.canvas.captureStream(60), { mimeType, videoBitsPerSecond: quality === '4k' ? 40e6 : 16e6 })
    const chunks = []
    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data) }
    recorder.onstop = () => {
      const url = URL.createObjectURL(new Blob(chunks, { type: 'video/webm' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `wishpix-pixi-${ratio.replace(':', 'x')}-${quality}.webm`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      setRecording(false)
    }
    scene.restart()
    recorder.start()
    setRecording(true)
    setTimeout(() => recorder.stop(), LOOP_SECONDS * 1000)
  }

  const [w, h] = RATIOS[ratio]
  return (
    <div className="intro">
      <div className="intro__stage" ref={hostRef} style={{ '--ar': w / h }} />
      {showUi && (
        <div className={`intro__bar${idle && !recording ? ' is-idle' : ''}`}>
          <div className="intro__group">
            {Object.keys(RATIOS).map((r) => (
              <button key={r} className={r === ratio ? 'is-on' : ''} onClick={() => choose('ratio', r)} disabled={recording}>{r}</button>
            ))}
          </div>
          <div className="intro__group">
            {Object.keys(QUALITY).map((q) => (
              <button key={q} className={q === quality ? 'is-on' : ''} onClick={() => choose('res', q)} disabled={recording}>{q === '4k' ? '4K' : q}</button>
            ))}
          </div>
          <button className="intro__btn" onClick={() => sceneRef.current?.restart()} disabled={recording}><RotateCcw size={16} /> Replay</button>
          <button className="intro__btn intro__btn--main" onClick={saveVideo} disabled={recording}>
            <Download size={16} /> {recording ? `Recording ${LOOP_SECONDS}s…` : 'Save video'}
          </button>
        </div>
      )}
    </div>
  )
}
