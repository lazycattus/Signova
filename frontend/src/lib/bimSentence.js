// The 37 healthcare BIM signs (SRS v2) and a simple sentence builder.
// ids and slots match SIGNS_BY_SLOT in ml/collect_data.py, so the classifier output
// (a sign id) can be passed straight into buildSentence() later.

// [id, Malay label, English label]
const RAW = {
  symptom: [
    ['pain', 'sakit', 'pain'], ['dizzy', 'pening', 'dizzy'], ['breathe', 'bernafas', 'breathe'],
    ['headache', 'sakit kepala', 'headache'], ['fever', 'demam', 'fever'], ['allergy', 'alahan', 'allergy'],
    ['hungry', 'lapar', 'hungry'], ['vomit', 'muntah', 'vomit'], ['cough', 'batuk', 'cough'], ['cold', 'selesema', 'cold'],
  ],
  body: [
    ['head', 'kepala', 'head'], ['chest', 'dada', 'chest'], ['stomach', 'perut', 'stomach'],
    ['back', 'belakang', 'back'], ['leg', 'kaki', 'leg'], ['hand', 'tangan', 'hand'],
  ],
  time: [
    ['today', 'hari ini', 'today'], ['last_night', 'semalam', 'last night'],
    ['morning', 'pagi', 'morning'], ['night', 'malam', 'night'],
  ],
  intensity: [['a_little', 'sedikit', 'a little'], ['very', 'sangat', 'very']],
  need: [
    ['doctor', 'doktor', 'doctor'], ['nurse', 'jururawat', 'nurse'], ['medicine', 'ubat', 'medicine'],
    ['water', 'air', 'water'], ['toilet', 'tandas', 'toilet'],
  ],
  question: [['what', 'apa', 'what'], ['when', 'bila', 'when']],
  reply: [['yes', 'ya', 'yes'], ['no', 'tidak', 'no'], ['repeat', 'ulang', 'repeat'], ['thank_you', 'terima kasih', 'thank you']],
  emergency: [['emergency', 'kecemasan', 'emergency'], ['help', 'tolong', 'help'], ['ambulance', 'ambulans', 'ambulance'], ['stop', 'berhenti', 'stop']],
}

export const SIGNS = {}
for (const [slot, list] of Object.entries(RAW)) {
  for (const [id, bm, en] of list) SIGNS[id] = { id, slot, bm, en }
}

// Chip colours per slot (full class names so Tailwind can see them).
export const SLOT_STYLE = {
  symptom: { label: 'Symptom', ms: 'Gejala', box: 'border-red-400 bg-red-50', tag: 'text-red-600' },
  body: { label: 'Body', ms: 'Badan', box: 'border-purple-400 bg-purple-50', tag: 'text-purple-700' },
  time: { label: 'Time', ms: 'Masa', box: 'border-blue-400 bg-blue-50', tag: 'text-blue-700' },
  intensity: { label: 'Intensity', ms: 'Tahap', box: 'border-orange-400 bg-orange-50', tag: 'text-orange-700' },
  need: { label: 'Need', ms: 'Keperluan', box: 'border-teal-500 bg-teal-50', tag: 'text-teal-700' },
  question: { label: 'Question', ms: 'Soalan', box: 'border-amber-400 bg-amber-50', tag: 'text-amber-700' },
  reply: { label: 'Reply', ms: 'Jawapan', box: 'border-slate-400 bg-slate-50', tag: 'text-slate-600' },
  emergency: { label: 'Emergency', ms: 'Kecemasan', box: 'border-red-600 bg-red-100', tag: 'text-red-700' },
}

// How each symptom reads in a sentence: Malay after "Saya", English after "I",
// plus the negative form (used when the patient also signs NO).
const SYMPTOM = {
  pain: { bm: 'sakit', en: 'am in pain', nbm: 'tidak sakit', nen: 'am not in pain' },
  dizzy: { bm: 'pening', en: 'feel dizzy', nbm: 'tidak pening', nen: 'do not feel dizzy' },
  breathe: { bm: 'sukar bernafas', en: 'have difficulty breathing', nbm: 'tidak sukar bernafas', nen: 'have no difficulty breathing' },
  headache: { bm: 'sakit kepala', en: 'have a headache', nbm: 'tidak sakit kepala', nen: 'do not have a headache' },
  fever: { bm: 'demam', en: 'have a fever', nbm: 'tidak demam', nen: 'do not have a fever' },
  allergy: { bm: 'ada alahan', en: 'have an allergy', nbm: 'tiada alahan', nen: 'have no allergy' },
  hungry: { bm: 'lapar', en: 'am hungry', nbm: 'tidak lapar', nen: 'am not hungry' },
  vomit: { bm: 'muntah', en: 'am vomiting', nbm: 'tidak muntah', nen: 'am not vomiting' },
  cough: { bm: 'batuk', en: 'have a cough', nbm: 'tidak batuk', nen: 'do not have a cough' },
  cold: { bm: 'selesema', en: 'have a cold', nbm: 'tidak selesema', nen: 'do not have a cold' },
}

const TIME = {
  today: ['hari ini', 'today'],
  last_night: ['sejak semalam', 'since last night'],
  morning: ['pagi tadi', 'this morning'],
  night: ['pada waktu malam', 'at night'],
}

const NEED = {
  doctor: ['doktor', 'the doctor'], nurse: ['jururawat', 'the nurse'], medicine: ['ubat', 'medicine'],
  water: ['air', 'water'], toilet: ['tandas', 'the toilet'],
}

const REPLY = {
  yes: ['Ya.', 'Yes.'], no: ['Tidak.', 'No.'], repeat: ['Sila ulang.', 'Please repeat.'], thank_you: ['Terima kasih.', 'Thank you.'],
}

const EMERGENCY = {
  emergency: ['Kecemasan!', 'Emergency!'], help: ['Tolong saya!', 'Help me!'],
  ambulance: ['Panggil ambulans!', 'Call an ambulance!'], stop: ['Berhenti.', 'Stop.'],
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1)

// ids: the signed word ids in any order. Returns { bm, en } or null if nothing signed.
export function buildSentence(ids) {
  const signs = ids.map((id) => SIGNS[id]).filter(Boolean)
  if (signs.length === 0) return null
  const of = (slot) => signs.filter((s) => s.slot === slot)

  const emergency = of('emergency')
  if (emergency.length) {
    return {
      bm: emergency.map((s) => EMERGENCY[s.id][0]).join(' '),
      en: emergency.map((s) => EMERGENCY[s.id][1]).join(' '),
    }
  }

  const negated = ids.includes('no') && of('symptom').length > 0
  const body = of('body')[0]
  const time = TIME[of('time')[0]?.id]
  const intensity = of('intensity')[0]
  const bm = []
  const en = []

  for (const sym of of('symptom')) {
    const t = SYMPTOM[sym.id]
    let b = negated ? t.nbm : t.bm
    let e = negated ? t.nen : t.en
    if (sym.id === 'pain' && body) {
      b = `${negated ? 'tidak ' : ''}sakit ${body.bm}`
      e = negated ? `have no pain in my ${body.en}` : `have pain in my ${body.en}`
    }
    if (time) { b += ` ${time[0]}`; e += ` ${time[1]}` }
    if (intensity) { b += ` ${intensity.bm}`; e += intensity.id === 'very' ? ' very much' : ' a little' }
    bm.push(`Saya ${b}.`)
    en.push(`I ${e}.`)
  }

  // body part alone (no symptom): just point at it
  if (!of('symptom').length && body) {
    bm.push(`Di bahagian ${body.bm}.`)
    en.push(`In my ${body.en}.`)
  }

  const needs = of('need')
  const question = of('question')[0]
  for (const n of needs) {
    const [nb, ne] = NEED[n.id]
    if (question) {
      bm.push(`${cap(nb)} ${question.bm}?`)
      en.push(question.id === 'when' ? `When is ${ne} coming?` : `What about ${ne}?`)
    } else if (n.id === 'toilet') {
      bm.push('Saya perlu ke tandas.')
      en.push('I need the toilet.')
    } else {
      bm.push(`Saya perlukan ${nb}.`)
      en.push(`I need ${ne}.`)
    }
  }
  if (question && !needs.length) {
    bm.push(`${cap(question.bm)}?`)
    en.push(`${cap(question.en)}?`)
  }

  for (const r of of('reply')) {
    if (r.id === 'no' && negated) continue
    bm.push(REPLY[r.id][0])
    en.push(REPLY[r.id][1])
  }

  return { bm: bm.join(' '), en: en.join(' ') }
}
