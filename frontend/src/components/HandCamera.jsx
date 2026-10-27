import { useEffect, useRef, useState } from 'react'
import { FilesetResolver, HandLandmarker, DrawingUtils } from '@mediapipe/tasks-vision'
import { flattenHands } from '../lib/landmarks'

const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'

/**
 * Shows the webcam, runs MediaPipe hand detection on every frame,
 * and draws the 21 landmark dots on each hand (up to 2 hands).
 *
 * onLandmarks(features, handCount) is called each frame at least one hand is seen.
 * `features` is 126 numbers (left hand 63 + right hand 63, zeros if a hand is
 * missing). This is what we send to the classifier later.
 */
export default function HandCamera({ onLandmarks }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const onLandmarksRef = useRef(onLandmarks)
  const [status, setStatus] = useState('Loading hand detector...')
  const [error, setError] = useState('')

  // keep latest callback without restarting the camera loop
  useEffect(() => {
    onLandmarksRef.current = onLandmarks
  }, [onLandmarks])

  useEffect(() => {
    let handLandmarker
    let stream
    let rafId
    let cancelled = false

    async function start() {
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

        setStatus('Starting camera...')
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: 'user' },
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }

        const video = videoRef.current
        video.srcObject = stream
        await video.play()
        setStatus('Show your hand(s) to the camera')
        loop()
      } catch (err) {
        console.error(err)
        setError(
          err.name === 'NotAllowedError'
            ? 'Camera permission was blocked. Allow camera access and refresh.'
            : `Could not start: ${err.message}`,
        )
      }
    }

    let lastVideoTime = -1
    function loop() {
      const video = videoRef.current
      const canvas = canvasRef.current
      if (!video || !canvas) return

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
          setStatus(result.landmarks.length === 2 ? 'Both hands detected' : 'One hand detected')
        } else {
          setStatus('Show your hand(s) to the camera')
        }
      }
      rafId = requestAnimationFrame(loop)
    }

    start()

    // cleanup when the component is removed
    return () => {
      cancelled = true
      cancelAnimationFrame(rafId)
      stream?.getTracks().forEach((t) => t.stop())
      handLandmarker?.close()
    }
  }, [])

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
      </div>
      <p className={`mt-3 text-center text-sm ${error ? 'text-red-600' : 'text-slate-600'}`}>
        {error || status}
      </p>
    </div>
  )
}
