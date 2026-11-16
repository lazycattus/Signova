// Checks that features.js gives the SAME numbers as ml/features.py.
// The fixture is made by Python: cd ml && python make_fixture.py   (only needed if you change the maths)
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { frameFeatures, FEATURE_COUNT } from './features.js'

const cases = JSON.parse(readFileSync(new URL('../../../ml/fixtures/frame_fixture.json', import.meta.url), 'utf8'))

for (const c of cases) {
  test(`same numbers as Python: ${c.name}`, () => {
    const face = c.face && { points: Object.fromEntries(Object.entries(c.face.points)), blend: c.face.blend }
    const got = frameFeatures(c.hands, face, c.aspect)
    assert.equal(got.length, FEATURE_COUNT)
    got.forEach((v, i) => assert.ok(Math.abs(v - c.expected[i]) < 1e-9, `number ${i}: ${v} vs ${c.expected[i]}`))
  })
}
