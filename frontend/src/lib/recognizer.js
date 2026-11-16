import { FEATURE_COUNT, FPS, WINDOW } from './features.js'

// ---------------------------------------------------------------------------------------------
// 1. Load the trained model (made by ml/train.py) and rebuild it with TensorFlow.js.
//    Files: public/models/signova/model.json + weights.bin. If they are not there yet, returns null.
// ---------------------------------------------------------------------------------------------

export async function loadSignModel(baseUrl = `${import.meta.env.BASE_URL}models/signova/`) {
  let meta
  try {
    const res = await fetch(`${baseUrl}model.json`)
    if (!res.ok) return null
    meta = await res.json() // the dev server answers 404 pages with HTML, which fails here: also "no model"
  } catch {
    return null
  }
  if (meta.features !== FEATURE_COUNT || meta.window !== WINDOW) {
    console.warn('The trained model does not match features.js (features/window). Train again.')
    return null
  }
  const weightsRes = await fetch(`${baseUrl}weights.bin`)
  if (!weightsRes.ok) return null
  const buffer = await weightsRes.arrayBuffer()

  const tf = await import('@tensorflow/tfjs') // big, so only loaded when a model exists
  const L = tf.layers
  // Must be the same layers as build_model() in ml/train.py
  const model = tf.sequential({
    layers: [
      L.conv1d({ inputShape: [WINDOW, FEATURE_COUNT], filters: 64, kernelSize: 5, padding: 'same', activation: 'relu' }),
      L.maxPooling1d({ poolSize: 2 }),
      L.conv1d({ filters: 96, kernelSize: 5, padding: 'same', activation: 'relu' }),
      L.maxPooling1d({ poolSize: 2 }),
      L.conv1d({ filters: 128, kernelSize: 3, padding: 'same', activation: 'relu' }),
      L.globalMaxPooling1d(),
      L.dense({ units: 128, activation: 'relu' }),
      L.dense({ units: meta.labels.length, activation: 'softmax' }),
    ],
  })
  let offset = 0
  const tensors = meta.weightShapes.map((shape) => {
    const size = shape.reduce((a, b) => a * b, 1)
    const t = tf.tensor(new Float32Array(buffer, offset * 4, size), shape)
    offset += size
    return t
  })
  model.setWeights(tensors)

  const mean = Float32Array.from(meta.mean)
  const std = Float32Array.from(meta.std)
  return {
    labels: meta.labels,
    // frames: array of WINDOW arrays with FEATURE_COUNT numbers -> probability for each label
    predict(frames) {
      const flat = new Float32Array(WINDOW * FEATURE_COUNT)
      for (let t = 0; t < WINDOW; t++) {
        for (let j = 0; j < FEATURE_COUNT; j++) flat[t * FEATURE_COUNT + j] = (frames[t][j] - mean[j]) / std[j]
      }
      return tf.tidy(() => model.predict(tf.tensor(flat, [1, WINDOW, FEATURE_COUNT])).dataSync().slice())
    },
  }
}

// ---------------------------------------------------------------------------------------------
// 2. Turn a stream of frames into signed words.
//    push() is called for every camera frame (also when no hand is visible).
// ---------------------------------------------------------------------------------------------

const MIN_CONFIDENCE = 0.8 // how sure the model must be before a word is accepted
const STABLE_SAMPLES = 4 // ...for this many checks in a row (4 checks = 0.2 second)
const CHANGE_CONFIDENCE = 0.9 // a different word while the hands stay up needs to be extra sure
const CHANGE_SAMPLES = 8
const SHOW_CONFIDENCE = 0.5 // below this the on-screen guess is hidden
const HANDS_DOWN_SAMPLES = 10 // 0.5 second without hands = the sign is finished

export class SignRecognizer {
  // model: { labels, predict(frames) }   onState(state)   onSign(id, confidence)
  constructor(model, { onState, onSign } = {}) {
    this.model = model
    this.onState = onState
    this.onSign = onSign
    this.frames = Array.from({ length: WINDOW }, () => new Array(FEATURE_COUNT).fill(0))
    this.lastSampleAt = -Infinity
    this.handsDown = HANDS_DOWN_SAMPLES
    this.reset()
  }

  reset() {
    this.streakLabel = null
    this.streak = 0
    this.latched = false // a word was accepted, wait until the hands go down (or clearly change)
    this.accepted = null
    this.acceptedConfidence = 0
    this.shown = ''
  }

  // features: the 145 numbers of this frame, hasHands: is at least one hand visible, now: ms
  push(features, hasHands, now) {
    if (now - this.lastSampleAt < 1000 / FPS - 2) return // keep FPS samples per second
    this.lastSampleAt = now
    this.frames.shift()
    this.frames.push(features)
    this.handsDown = hasHands ? 0 : this.handsDown + 1

    if (this.handsDown >= HANDS_DOWN_SAMPLES) {
      this.reset()
      this.emit(null, 0, false)
      return
    }
    const probs = this.model.predict(this.frames)
    let best = 0
    for (let i = 1; i < probs.length; i++) if (probs[i] > probs[best]) best = i
    const label = this.model.labels[best]
    const confidence = probs[best]

    if (label === this.streakLabel) this.streak++
    else {
      this.streakLabel = label
      this.streak = 1
    }

    let accepted = false
    if (!this.latched && confidence >= MIN_CONFIDENCE && this.streak >= STABLE_SAMPLES) {
      accepted = true
    } else if (this.latched && label !== this.accepted && confidence >= CHANGE_CONFIDENCE && this.streak >= CHANGE_SAMPLES) {
      accepted = true
    }
    if (accepted) {
      this.latched = true
      this.accepted = label
      this.acceptedConfidence = confidence
      this.onSign?.(label, confidence)
    }
    const guess = this.latched ? this.accepted : confidence >= SHOW_CONFIDENCE ? label : null
    this.emit(guess, this.latched ? this.acceptedConfidence : confidence, this.latched)
  }

  // only tell the screen when something visible changed
  emit(guess, confidence, accepted) {
    const key = `${guess}|${Math.round(confidence * 20)}|${accepted}`
    if (key === this.shown) return
    this.shown = key
    this.onState?.({ guess, confidence, accepted })
  }
}
