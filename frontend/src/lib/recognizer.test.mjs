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
