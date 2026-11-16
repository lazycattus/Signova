// Supervisor rule: every communication is at least one simple sentence.
import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSentence, SIGNS } from './bimSentence.js'

const ids = Object.keys(SIGNS)
const isSentence = (s) => typeof s === 'string' && s.length > 3 && /[.?!]$/.test(s) && /^[A-Z]/.test(s)

test('there are 40 signs', () => assert.equal(ids.length, 40))

test('every sign alone gives a sentence in English and Malay', () => {
  for (const id of ids) {
    const s = buildSentence([id])
    assert.ok(s && isSentence(s.en) && isSentence(s.bm), `${id}: ${JSON.stringify(s)}`)
  }
})

test('every pair of signs gives a sentence in English and Malay', () => {
  for (const a of ids) for (const b of ids) {
    if (a === b) continue
    const s = buildSentence([a, b])
    assert.ok(s && isSentence(s.en) && isSentence(s.bm), `${a}+${b}: ${JSON.stringify(s)}`)
  }
})

test('yes / no answers read correctly', () => {
  assert.equal(buildSentence(['yes', 'doctor']).en, 'Yes, I need the doctor.')
  assert.equal(buildSentence(['yes', 'doctor']).bm, 'Ya, saya perlukan doktor.')
  assert.equal(buildSentence(['no', 'medicine']).en, 'I do not need medicine.')
  assert.equal(buildSentence(['yes', 'fever']).en, 'Yes, I have a fever.')
  assert.equal(buildSentence(['no', 'fever']).en, 'I do not have a fever.')
  assert.equal(buildSentence(['no', 'head']).en, 'No, it hurts in my head.')
})

test('sign order does not matter', () => {
  assert.deepEqual(buildSentence(['last_night', 'head', 'pain']), buildSentence(['pain', 'head', 'last_night']))
  assert.equal(buildSentence(['pain', 'head', 'last_night']).en, 'I have pain in my head since last night.')
})

test('a time or intensity sign alone is a full sentence', () => {
  assert.equal(buildSentence(['today']).en, 'It is happening today.')
  assert.equal(buildSentence(['very']).en, 'It is very bad.')
})

test('saya / awak / dia change who the sentence is about', () => {
  assert.equal(buildSentence(['saya', 'pain']).en, 'I am in pain.') // saya is not said twice
  assert.equal(buildSentence(['saya', 'fever']).bm, 'Saya demam.')
  assert.equal(buildSentence(['dia', 'fever']).en, 'He or she has a fever.')
  assert.equal(buildSentence(['dia', 'fever']).bm, 'Dia demam.')
  assert.equal(buildSentence(['awak', 'fever']).en, 'You have a fever.')
  assert.equal(buildSentence(['dia', 'pain', 'leg']).en, 'He or she has pain in his or her leg.')
  assert.equal(buildSentence(['dia', 'dizzy']).en, 'He or she feels dizzy.')
  assert.equal(buildSentence(['dia', 'doctor']).en, 'He or she needs the doctor.')
  assert.equal(buildSentence(['dia', 'no', 'medicine']).en, 'He or she does not need medicine.')
  assert.equal(buildSentence(['dia', 'no', 'fever']).en, 'He or she does not have a fever.')
  assert.equal(buildSentence(['dia', 'help']).en, 'Help him or her!')
})

test('a person sign alone, or with a sentence that does not use it, still says something', () => {
  assert.equal(buildSentence(['saya']).en, 'This is about me.')
  assert.equal(buildSentence(['dia', 'today']).en, 'This is about him or her. It is happening today.')
})
