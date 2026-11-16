import { useEffect, useRef, useState } from 'react'
import { FaceLandmarker, FilesetResolver, HandLandmarker, DrawingUtils } from '@mediapipe/tasks-vision'
import { flattenHands } from '../lib/landmarks'
import { frameFeatures, readFace, slotHands } from '../lib/features'
import { loadSignModel, SignRecognizer } from '../lib/recognizer'
import { SIGNS } from '../lib/bimSentence'

const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'
const FACE_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'

// Messages under the camera. Pass lang="ms" for Bahasa Malaysia (default is English).
const TEXT = {
  en: {
    loading: 'Loading hand detector...',
    camera: 'Starting camera...',
    show: 'Show your hand(s) to the camera',
    off: 'Camera is off',
    noModel: 'Sign model not trained yet',
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
    noModel: 'Model isyarat belum dilatih',
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
 * recognize (optional, default false): also track the face and run the trained sign model.
 *   The word being signed is then shown on the camera picture. Needs public/models/signova/ (see ml/README.md).
 * onSign(id, confidence) (optional): called once each time a sign is accepted, id is a sign id like "pain".
 */
export default function HandCamera({ onLandmarks, lang = 'en', deviceId, onStream, enabled = true, recognize = false, onSign }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const landmarkerRef = useRef(null)
  const onLandmarksRef = useRef(onLandmarks)
  const onStreamRef = useRef(onStream)
  const onSignRef = useRef(onSign)
  const faceRef = useRef(null)
  const recognizerRef = useRef(null)
  const t = TEXT[lang] ?? TEXT.en
  const [status, setStatus] = useState('loading') // a key of TEXT, translated when shown
  const [error, setError] = useState(null) // { key } or { detail }
  const [ready, setReady] = useState(false) // hand detector loaded
  const [modelState, setModelState] = useState('loading') // sign model: loading | ready | none
  const [caption, setCaption] = useState(null) // { guess, confidence, accepted } shown on the picture

  // keep latest callbacks without restarting the camera loop
  useEffect(() => {
    onLandmarksRef.current = onLandmarks
    onStreamRef.current = onStream
    onSignRef.current = onSign
  }, [onLandmarks, onStream, onSign])

  // 1b. Sign model + face tracking (only when recognize is on). Missing model files are fine, the camera still works.
  useEffect(() => {
    if (!recognize) return
    let cancelled = false
    let face
    ;(async () => {
      try {
        const model = await loadSignModel()
        if (cancelled) return
        if (!model) {
          setModelState('none')
          return
        }
        recognizerRef.current = new SignRecognizer(model, {
          onState: setCaption,
          onSign: (id, confidence) => onSignRef.current?.(id, confidence),
        })
        setModelState('ready')
        const vision = await FilesetResolver.forVisionTasks(WASM_URL)
        face = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: FACE_MODEL_URL, delegate: 'GPU' },
          runningMode: 'VIDEO',
          numFaces: 1,
          outputFaceBlendshapes: true,
        })
        if (cancelled) face.close()
        else faceRef.current = face
      } catch (err) {
        // no face tracking: the hands still work, the model just gets zeros for the face
        console.warn('Face tracking not available', err)
      }
    })()
    return () => {
      cancelled = true
      recognizerRef.current = null
      faceRef.current = null
      face?.close()
    }
  }, [recognize])

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
        const ts = performance.now()
        const result = handLandmarker.detectForVideo(video, ts)

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

        // the sign model reads every frame, also the ones without hands (the pause ends a sign)
        const recognizer = recognizerRef.current
        if (recognizer) {
          const faceResult = faceRef.current?.detectForVideo(video, ts)
          const features = frameFeatures(slotHands(result), readFace(faceResult), video.videoWidth / video.videoHeight)
          recognizer.push(features, result.landmarks.length > 0, ts)
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
      recognizerRef.current?.reset()
      setCaption(null)
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
        {recognize && enabled && modelState === 'none' && (
          <div className="absolute left-2 top-2 rounded-md bg-slate-900/80 px-2 py-1 text-xs font-medium text-amber-300">
            {t.noModel}
          </div>
        )}
        {recognize && enabled && caption?.guess && SIGNS[caption.guess] && (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center px-3" aria-live="polite">
            <div
              className={`flex items-baseline gap-2 rounded-xl px-4 py-2 shadow-lg backdrop-blur-sm ${
                caption.accepted ? 'bg-emerald-600/95 text-white' : 'bg-slate-900/80 text-slate-100'
              }`}
            >
              <span className="text-2xl font-bold leading-none">
                {caption.accepted && '✓ '}
                {lang === 'ms' ? SIGNS[caption.guess].bm : SIGNS[caption.guess].en}
              </span>
              <span className="text-xs font-semibold opacity-80">{Math.round(caption.confidence * 100)}%</span>
            </div>
          </div>
        )}
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
