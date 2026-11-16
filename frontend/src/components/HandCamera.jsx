import { useEffect, useRef, useState } from 'react'
import { FilesetResolver, HandLandmarker, DrawingUtils } from '@mediapipe/tasks-vision'
import { flattenHands } from '../lib/landmarks'

const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'

// Messages under the camera. Pass lang="ms" for Bahasa Malaysia (default is English).
const TEXT = {
  en: {
    loading: 'Loading hand detector...',
    camera: 'Starting camera...',
    show: 'Show your hand(s) to the camera',
    off: 'Camera is off',
    one: 'One hand detected',
    both: 'Both hands detected',
    blocked: 'Camera permission was blocked. Allow camera access and refresh.',
    noCamera: 'No camera found. Connect a camera and refresh.',
    busy: 'The camera is being used by another app. Close that app, then pick the camera again.',
    offline: 'Could not load the hand detector. Check your internet connection and refresh.',
    failed: (m) => `Could not start: ${m}`,
  },
  ms: {
    loading: 'Memuatkan pengesan tangan...',
    camera: 'Memulakan kamera...',
    show: 'Tunjukkan tangan anda ke kamera',
    off: 'Kamera dimatikan',
    one: 'Satu tangan dikesan',
    both: 'Kedua-dua tangan dikesan',
    blocked: 'Kebenaran kamera disekat. Benarkan akses kamera dan muat semula.',
    noCamera: 'Tiada kamera dijumpai. Sambungkan kamera dan muat semula.',
    busy: 'Kamera sedang digunakan oleh aplikasi lain. Tutup aplikasi itu, kemudian pilih kamera semula.',
    offline: 'Tidak dapat memuatkan pengesan tangan. Semak sambungan internet dan muat semula.',
    failed: (m) => `Tidak dapat dimulakan: ${m}`,
  },
}

// Turn a thrown error into a key of TEXT (or a raw message) so it can be translated when shown.
function toError(err) {
  if (err?.name === 'NotAllowedError') return { key: 'blocked' }
  if (err?.name === 'NotFoundError') return { key: 'noCamera' }
  if (err?.name === 'NotReadableError') return { key: 'busy' }
  if (err instanceof Error) return { detail: err.message }
  return { key: 'offline' } // the model files are downloaded online, a network failure is not an Error
}

// Open the chosen camera. If it is gone (unplugged) fall back to the default one.
async function openStream(deviceId) {
  const size = { width: 640, height: 480 }
  if (deviceId) {
    try {
      return await navigator.mediaDevices.getUserMedia({ video: { ...size, deviceId: { exact: deviceId } } })
    } catch (err) {
      if (err.name !== 'OverconstrainedError' && err.name !== 'NotFoundError') throw err
    }
  }
  return navigator.mediaDevices.getUserMedia({ video: { ...size, facingMode: 'user' } })
}

/**
 * Shows the webcam, runs MediaPipe hand detection on every frame,
 * and draws the 21 landmark dots on each hand (up to 2 hands).
 *
 * onLandmarks(features, handCount) is called each frame at least one hand is seen.
 * `features` is 126 numbers (left hand 63 + right hand 63, zeros if a hand is
 * missing). This is what we send to the classifier later.
 *
 * deviceId (optional): which camera to use. Changing it switches camera without reloading the detector.
 * onStream(deviceId) (optional): called when a camera has started, with the id that is really in use.
 * enabled (optional, default true): false turns the camera off (the light goes off). The detector stays loaded.
 * lang (optional): "en" or "ms" for the messages.
 */
export default function HandCamera({ onLandmarks, lang = 'en', deviceId, onStream, enabled = true }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const landmarkerRef = useRef(null)
  const onLandmarksRef = useRef(onLandmarks)
  const onStreamRef = useRef(onStream)
  const t = TEXT[lang] ?? TEXT.en
  const [status, setStatus] = useState('loading') // a key of TEXT, translated when shown
  const [error, setError] = useState(null) // { key } or { detail }
  const [ready, setReady] = useState(false) // hand detector loaded

  // keep latest callbacks without restarting the camera loop
  useEffect(() => {
    onLandmarksRef.current = onLandmarks
    onStreamRef.current = onStream
  }, [onLandmarks, onStream])

  // 1. Load the hand detector once.
  useEffect(() => {
    let cancelled = false
    let handLandmarker
    async function load() {
      try {
        const vision = await FilesetResolver.forVisionTasks(WASM_URL)
        handLandmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
          runningMode: 'VIDEO',
          numHands: 2,
        })
        if (cancelled) {
          handLandmarker.close()
          return
        }
        landmarkerRef.current = handLandmarker
        setReady(true)
      } catch (err) {
        console.error(err)
        setError(toError(err))
      }
    }
    load()
    return () => {
      cancelled = true
      landmarkerRef.current = null
      handLandmarker?.close()
    }
  }, [])

  // 2. Start the camera and the detection loop. Runs again when the camera choice or on/off changes.
  useEffect(() => {
    if (!ready || !enabled) return
    const video = videoRef.current
    const canvas = canvasRef.current
    let cancelled = false
    let stream
    let rafId
    let lastVideoTime = -1

    async function start() {
      try {
        setError(null)
        setStatus('camera')
        stream = await openStream(deviceId)
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        video.srcObject = stream
        await video.play()
        setStatus('show')
        onStreamRef.current?.(stream.getVideoTracks()[0]?.getSettings().deviceId ?? '')
        loop()
      } catch (err) {
        if (cancelled) return
        console.error(err)
        setError(toError(err))
      }
    }

    function loop() {
      const handLandmarker = landmarkerRef.current
      if (cancelled || !handLandmarker) return

      if (video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime
        const result = handLandmarker.detectForVideo(video, performance.now())

        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        const ctx = canvas.getContext('2d')
        ctx.clearRect(0, 0, canvas.width, canvas.height)

        if (result.landmarks.length > 0) {
          const drawing = new DrawingUtils(ctx)
          for (const hand of result.landmarks) {
            drawing.drawConnectors(hand, HandLandmarker.HAND_CONNECTIONS, {
              color: '#22c55e',
              lineWidth: 3,
            })
            drawing.drawLandmarks(hand, { color: '#ef4444', radius: 4 })
          }
          onLandmarksRef.current?.(flattenHands(result), result.landmarks.length)
          setStatus(result.landmarks.length === 2 ? 'both' : 'one')
        } else {
          setStatus('show')
        }
      }
      rafId = requestAnimationFrame(loop)
    }

    start()

    // cleanup when the component is removed or the camera changes
    return () => {
      cancelled = true
      cancelAnimationFrame(rafId)
      stream?.getTracks().forEach((track) => track.stop())
      video.srcObject = null // drop the frozen last picture
      canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height)
    }
  }, [ready, deviceId, enabled])

  return (
    <div className="w-full max-w-xl">
      <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-slate-900 shadow-lg">
        {/* mirrored so it feels like a mirror */}
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full -scale-x-100 object-cover"
          playsInline
          muted
        />
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full -scale-x-100 object-cover"
        />
        {!enabled && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-400">
            <span className="text-4xl" aria-hidden="true">📷</span>
            <span className="text-sm font-semibold">{t.off}</span>
          </div>
        )}
      </div>
      <p className={`mt-3 text-center text-sm ${error && enabled ? 'text-red-600' : 'text-slate-600'}`}>
        {!enabled ? '\u00A0' : error ? (error.detail ? t.failed(error.detail) : t[error.key]) : t[status]}
      </p>
    </div>
  )
}
