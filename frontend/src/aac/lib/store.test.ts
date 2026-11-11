import { test } from 'node:test'
import assert from 'node:assert/strict'
import { useBoard } from '../store.ts'

test('a request goes new → asked again → due → done', () => {
  const s = useBoard.getState
  s().newVisit()
  s().addCard('water')
  const first = s().events.fd.at(-1)!
  assert.equal(first.en, 'I need water.')

  // Asking again before it is done bumps the same row instead of adding a new one.
  s().addCard('water')
  const again = s().events.fd.at(-1)!
  assert.equal(again.n, first.n)
  assert.equal(again.asks, 2)

  // A reply with a time marks it seen and due; Done clears the due time.
  s().sendReply('fd', { en: 'I will come in 10 minutes.', bm: '' }, 'clock', first.n, 10)
  const due = s().events.fd.find(e => e.n === first.n)!
  assert.ok(due.seen && due.due && due.due > Date.now())
  s().markDone(first.n)
  const done = s().events.fd.find(e => e.n === first.n)!
  assert.ok(done.doneAt && !done.due)

  // Once done, asking again is a fresh request.
  s().addCard('water')
  assert.notEqual(s().events.fd.findLast(e => e.en === 'I need water.')!.n, first.n)
})
