// What the sign model "sees" in ONE video frame: 145 numbers.
//   126  both hands (21 points x x,y,z each, zeros if a hand is missing)
//     8  where each hand is compared to the face (wrist + index fingertip, x and y)
//     3  head: turn left/right, nod up/down, tilt sideways
//     8  face expression: mouth open, smile, frown, pucker, brows down, brows up, eyes closed, cheeks puffed
//
// This is the SAME maths as ml/features.py. If you change one, change the other
// (ml/fixtures/frame_fixture.json + `npm run test:features` check that they agree).

export const WINDOW = 40 // frames the model looks at
export const FPS = 20 // frames per second (40 / 20 = 2 seconds)

export const HAND_NUMBERS = 126
export const FEATURE_COUNT = 145

// FaceLandmarker point numbers
const NOSE = 1
const LEFT_CHEEK = 234
const RIGHT_CHEEK = 454
const FOREHEAD = 10
const CHIN = 152
const WRIST = 0
const INDEX_TIP = 8

const zeros = (n) => new Array(n).fill(0)
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])

function expressionNumbers(blend) {
  const g = (name) => blend[name] ?? 0
  const avg = (l, r) => (g(l) + g(r)) / 2
  return [
    g('jawOpen'),
    avg('mouthSmileLeft', 'mouthSmileRight'),
    avg('mouthFrownLeft', 'mouthFrownRight'),
    g('mouthPucker'),
    avg('browDownLeft', 'browDownRight'),
    g('browInnerUp'),
    avg('eyeBlinkLeft', 'eyeBlinkRight'),
    g('cheekPuff'),
  ]
}

function handNumbers(hands) {
  const out = []
  for (const side of ['Left', 'Right']) {
    const hand = hands[side]
    if (!hand) out.push(...zeros(63))
    else for (const p of hand) out.push(p[0], p[1], p[2])
  }
  return out
}

// hands: { Left: [[x,y,z] x21] | null, Right: ... }
// face:  null, or { points: { 1: [x,y], 234: .., 454: .., 10: .., 152: .. }, blend: { name: score } }
// aspect: video width / height
function faceNumbers(hands, face, aspect) {
  const none = zeros(8 + 3 + 8)
  if (!face) return none
  const p = face.points
  const xy = (i) => [p[i][0] * aspect, p[i][1]]
  const nose = xy(NOSE)
  const lc = xy(LEFT_CHEEK)
  const rc = xy(RIGHT_CHEEK)
  const top = xy(FOREHEAD)
  const chin = xy(CHIN)
  const width = dist(lc, rc)
  const height = dist(top, chin)
  if (width < 1e-6 || height < 1e-6) return none

  const handFace = []
  for (const side of ['Left', 'Right']) {
    const hand = hands[side]
    if (!hand) {
      handFace.push(0, 0, 0, 0)
      continue
    }
    for (const idx of [WRIST, INDEX_TIP]) {
      handFace.push((hand[idx][0] * aspect - nose[0]) / width, (hand[idx][1] - nose[1]) / width)
    }
  }

  const yaw = (nose[0] - (lc[0] + rc[0]) / 2) / width
  const pitch = (nose[1] - (top[1] + chin[1]) / 2) / height
  let roll = Math.atan2(rc[1] - lc[1], rc[0] - lc[0])
  if (roll > Math.PI / 2) roll -= Math.PI
  else if (roll < -Math.PI / 2) roll += Math.PI

  return [...handFace, yaw, pitch, roll, ...expressionNumbers(face.blend ?? {})]
}

export function frameFeatures(hands, face, aspect) {
  const nums = [...handNumbers(hands), ...faceNumbers(hands, face, aspect)]
  if (nums.length !== FEATURE_COUNT) throw new Error(`expected ${FEATURE_COUNT} numbers, got ${nums.length}`)
  return nums
}

// ---- MediaPipe (JavaScript) results -> the plain inputs above ----

// HandLandmarker result -> { Left, Right } (same slot rule as landmarks.js flattenHands)
export function slotHands(result) {
  const slots = { Left: null, Right: null }
  result.landmarks.forEach((hand, i) => {
    let label = result.handedness?.[i]?.[0]?.categoryName
    if (!label || slots[label]) label = slots.Left ? 'Right' : 'Left'
    slots[label] = hand.map((q) => [q.x, q.y, q.z])
  })
  return slots
}

// FaceLandmarker result -> { points, blend } or null when no face is seen
export function readFace(result) {
  const lm = result?.faceLandmarks?.[0]
  if (!lm) return null
  const points = {}
  for (const i of [NOSE, LEFT_CHEEK, RIGHT_CHEEK, FOREHEAD, CHIN]) points[i] = [lm[i].x, lm[i].y]
  const blend = {}
  for (const c of result.faceBlendshapes?.[0]?.categories ?? []) blend[c.categoryName] = c.score
  return { points, blend }
}
