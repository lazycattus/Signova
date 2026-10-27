// Turns MediaPipe's hand result into ONE fixed-length list of numbers
// that the classifier (and the data collection script) can use.
//
// Layout: 126 numbers = [ Left hand: 21 points x (x,y,z) = 63 ] + [ Right hand: 63 ]
// If a hand is not in view, its 63 numbers are all 0.
// So one-handed signs still work: the unused hand is just zeros.
//
// NOTE: MediaPipe's "Left"/"Right" label is from the camera's point of view
// (not mirrored). That's fine, as long as data collection and live
// recognition both use this same function.

export const POINTS_PER_HAND = 21
export const NUMBERS_PER_HAND = POINTS_PER_HAND * 3 // 63
export const TOTAL_FEATURES = NUMBERS_PER_HAND * 2 // 126

function flattenOneHand(landmarks) {
  const out = []
  for (const p of landmarks) out.push(p.x, p.y, p.z)
  return out
}

export function flattenHands(result) {
  const slots = { Left: null, Right: null }

  result.landmarks.forEach((hand, i) => {
    let label = result.handedness?.[i]?.[0]?.categoryName // "Left" or "Right"
    // If two hands got the same label, put the second one in the empty slot
    if (!label || slots[label]) label = slots.Left ? 'Right' : 'Left'
    slots[label] = hand
  })

  const zeros = new Array(NUMBERS_PER_HAND).fill(0)
  const left = slots.Left ? flattenOneHand(slots.Left) : zeros
  const right = slots.Right ? flattenOneHand(slots.Right) : zeros
  return [...left, ...right]
}
