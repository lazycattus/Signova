import { test } from 'node:test'
import assert from 'node:assert/strict'
import { patientAnswers } from './patientReview.ts'
import { painItem } from './text.ts'
import type { Item } from './types.ts'

const makePain = (type: 'sharp' | null = null, onset?: string): Item => ({
  ...painItem({ part: 'head', sub: null, side: null, score: 0, type, structure: null, onset }), uid: 1, src: 'Body map',
})

test('review keeps zero pain and missing values without inventing negative answers', () => {
  assert.deepEqual(patientAnswers([makePain()])[0].pain, { score: 0, site: 'Head', side: null, type: null, onset: null, region: { model_version: 'signova-body-v1', part: 'head', sub: null, side: null } })
})

test('review takes the patient source, not staff replies or spoken/AI sentence logs', () => {
  const original = makePain('sharp', 'Since this morning')
  const staff: Item = { uid: 2, kind: 'staff', say: { en: 'A staff inference.', bm: 'Staf' }, short: { en: 'Staff', bm: 'Staf' }, src: 'Staff' }
  const ai = { ...staff, uid: 3, kind: 'message' as const, say: { en: 'Invented since yesterday.', bm: 'Semalam' } }
  const result = patientAnswers([original, staff, ai])
  assert.equal(result.length, 1)
  assert.deepEqual(result[0].say, original.say)
  assert.equal(result[0].pain?.type, 'Sharp')
  assert.equal(result[0].pain?.onset, 'Since this morning')
})

test('a changed source changes the review fingerprint', () => {
  const before = JSON.stringify(patientAnswers([makePain()]))
  const corrected = makePain()
  corrected.meta!.score = 4
  corrected.say.en = 'Corrected pain report.'
  assert.notEqual(JSON.stringify(patientAnswers([corrected])), before)
})


test('report regions keep the patient selection, never guessed from location text', () => {
  const item: Item = { ...painItem({ part: 'leg', sub: 'knee', side: 'l', score: 6, type: null, structure: null }), uid: 7, src: 'Body map' }
  assert.deepEqual(patientAnswers([item])[0].pain?.region, { model_version: 'signova-body-v1', part: 'leg', sub: 'knee', side: 'l' })
  delete item.reportedPain
  assert.equal(patientAnswers([item])[0].pain?.region, undefined)
})
