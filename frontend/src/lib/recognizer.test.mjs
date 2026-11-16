// Checks the "when is a word accepted" rules, with a fake model (no TensorFlow needed).
import test from 'node:test'
import assert from 'node:assert/strict'
import { SignRecognizer } from './recognizer.js'
import { FEATURE_COUNT } from './features.js'

const hand = new Array(FEATURE_COUNT).fill(0).map((_, i) => (i < 126 ? 0.5 : 0)) // hands visible
const nohand = new Array(FEATURE_COUNT).fill(0)

// the fake model says whatever `say` is set to
function setup() {
  const say = { label: 'pain', p: 0.95 }
  const model = {
    labels: ['pain', 'fever'],
    predict: () => (say.label === 'pain' ? [say.p, 1 - say.p] : [1 - say.p, say.p]),
  }
  const signs = []
  const states = []
  const rec = new SignRecognizer(model, { onSign: (id) => signs.push(id), onState: (s) => states.push(s) })
  let now = 0
  const run = (frame, hands, n) => { for (let i = 0; i < n; i++) { now += 50; rec.push(frame, hands, now) } }
  return { say, signs, states, run }
}

test('a confident, steady sign is accepted once', () => {
  const { signs, run } = setup()
  run(hand, true, 3)
  assert.deepEqual(signs, [])
  run(hand, true, 20)
  assert.deepEqual(signs, ['pain'])
})

test('a low-confidence guess is never accepted', () => {
  const { say, signs, states, run } = setup()
  say.p = 0.6
  run(hand, true, 30)
  assert.deepEqual(signs, [])
  assert.equal(states.at(-1).guess, 'pain') // still shown on the camera as a guess
  assert.equal(states.at(-1).accepted, false)
})

test('the same sign can be signed again after the hands went down', () => {
  const { signs, run } = setup()
  run(hand, true, 10)
  run(nohand, false, 12)
  run(hand, true, 10)
  assert.deepEqual(signs, ['pain', 'pain'])
})

test('a different sign while the hands stay up needs to be extra sure and steady', () => {
  const { say, signs, run } = setup()
  run(hand, true, 10)
  say.label = 'fever'
  say.p = 0.85 // sure enough for a first sign, not enough to switch
  run(hand, true, 20)
  assert.deepEqual(signs, ['pain'])
  say.p = 0.95
  run(hand, true, 12)
  assert.deepEqual(signs, ['pain', 'fever'])
})

test('hands down clears the caption', () => {
  const { states, run } = setup()
  run(hand, true, 10)
  run(nohand, false, 12)
  assert.equal(states.at(-1).guess, null)
})

// ---- headshake = no ----
import { isHeadshake } from './recognizer.js'

const withTurn = (yaw) => { const f = hand.slice(); f[134] = yaw; f[135] = 0.01; return f } // hands + a face turned by yaw
const shake = Array.from({ length: 24 }, (_, i) => 0.12 * Math.sin((i / 24) * 2 * Math.PI * 3)) // 3 swings left-right
const still = Array.from({ length: 24 }, () => 0.01)
const oneTurn = Array.from({ length: 24 }, (_, i) => 0.003 * i) // slowly looks away once

test('isHeadshake: swings yes, still or one slow turn no', () => {
  assert.equal(isHeadshake(shake), true)
  assert.equal(isHeadshake(still), false)
  assert.equal(isHeadshake(oneTurn), false)
  assert.equal(isHeadshake([null, null, null, null, null, null, null, null, null]), false)
})

function setupShake(label, on = true) {
  const signs = []
  const model = { labels: [label, 'fever'], predict: () => [0.95, 0.05] }
  const options = { onSign: (id) => signs.push(id) }
  if (on !== 'default') options.headshakeMeansNo = on
  const rec = new SignRecognizer(model, options)
  let now = 0
  const run = (frames) => { for (const f of frames) { now += 50; rec.push(f, true, now) } }
  return { signs, run }
}

test('pain + headshake adds "no" once', () => {
  const { signs, run } = setupShake('pain')
  run(Array.from({ length: 10 }, () => withTurn(0.01)))
  run(shake.map(withTurn))
  run(shake.map(withTurn))
  assert.deepEqual(signs, ['pain', 'no'])
})

test('pain without a headshake stays pain', () => {
  const { signs, run } = setupShake('pain')
  run(Array.from({ length: 40 }, () => withTurn(0.01)))
  assert.deepEqual(signs, ['pain'])
})

test('dizzy is not negated by a headshake (the sign itself moves the head)', () => {
  const { signs, run } = setupShake('dizzy')
  run(Array.from({ length: 10 }, () => withTurn(0.01)))
  run(shake.map(withTurn))
  assert.deepEqual(signs, ['dizzy'])
})

test('a headshake after a reply sign (yes) does nothing', () => {
  const { signs, run } = setupShake('yes')
  run(Array.from({ length: 10 }, () => withTurn(0.01)))
  run(shake.map(withTurn))
  assert.deepEqual(signs, ['yes'])
})

test('headshake rule is OFF by default (BIM has its own NO sign)', () => {
  const { signs, run } = setupShake('pain', 'default')
  run(Array.from({ length: 10 }, () => withTurn(0.01)))
  run(shake.map(withTurn))
  run(shake.map(withTurn))
  assert.deepEqual(signs, ['pain']) // no "no" is added
})
