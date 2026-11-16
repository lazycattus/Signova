// The 40 healthcare BIM signs (the 37 of SRS v2 + saya, awak, dia) and a simple sentence builder.
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
  subject: [['saya', 'saya', 'I'], ['awak', 'awak', 'you'], ['dia', 'dia', 'he or she']], // BIM points to the person
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
  subject: { label: 'Who', ms: 'Siapa', box: 'border-sky-400 bg-sky-50', tag: 'text-sky-700' },
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

// Who the sentence is about. Saya is the default (and is not repeated if signed).
const PERSON = {
  saya: { bm: 'Saya', en: 'I', poss: 'my', about: ['Ini tentang saya.', 'This is about me.'] },
  awak: { bm: 'Awak', en: 'You', poss: 'your', about: ['Ini tentang awak.', 'This is about you.'] },
  dia: { bm: 'Dia', en: 'He or she', poss: 'his or her', about: ['Ini tentang dia.', 'This is about him or her.'] },
}

// The English verbs above are written for "I". This changes them for "you" and "he or she".
function agree(text, who) {
  const third = who === 'dia'
  let out = text.replace(/\bmy\b/g, PERSON[who].poss)
  if (who === 'saya') return out
  out = out
    .replace(/^am not /, third ? 'is not ' : 'are not ')
    .replace(/^am /, third ? 'is ' : 'are ')
    .replace(/^do not /, third ? 'does not ' : 'do not ')
    .replace(/^have /, third ? 'has ' : 'have ')
    .replace(/^feel /, third ? 'feels ' : 'feel ')
  return out
}

// One line for a need. negative = the person signed NO ("Do you need medicine?" "No.")
function needLine(id, who, negative) {
  const [nb, ne] = NEED[id]
  const P = PERSON[who]
  const verb = who === 'dia' ? (negative ? 'does not need' : 'needs') : negative ? 'do not need' : 'need'
  const bm = id === 'toilet' ? `${P.bm} ${negative ? 'tidak ' : ''}perlu ke tandas.` : `${P.bm} ${negative ? 'tidak ' : ''}perlukan ${nb}.`
  return [bm, `${P.en} ${verb} ${ne}.`]
}

// A sign alone still has to make a full sentence (supervisor rule: every communication is at least
// one simple sentence). These are used only when nothing else in the message gives the sentence.
const TIME_ALONE = {
  today: ['Ia berlaku hari ini.', 'It is happening today.'],
  last_night: ['Ia bermula sejak semalam.', 'It started last night.'],
  morning: ['Ia bermula pagi tadi.', 'It started this morning.'],
  night: ['Ia berlaku pada waktu malam.', 'It happens at night.'],
}
const INTENSITY_ALONE = {
  very: ['Ia sangat teruk.', 'It is very bad.'],
  a_little: ['Ia sedikit sahaja.', 'It is only a little.'],
}
const QUESTION_ALONE = {
  what: ['Apa maksudnya?', 'What do you mean?'],
  when: ['Bila ia akan berlaku?', 'When will it happen?'],
}
const REPLY_ALONE = {
  yes: ['Ya, betul.', 'Yes, that is right.'],
  no: ['Tidak, bukan begitu.', 'No, that is not right.'],
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1)
// "Saya demam." -> "saya demam." so it can follow "Ya, " ("I ..." keeps its capital)
const lowerFirst = (s) => (/^I[ '’]/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1))

// ids: the signed word ids in any order. Returns { bm, en } or null if nothing signed.
export function buildSentence(ids) {
  const signs = ids.map((id) => SIGNS[id]).filter(Boolean)
  if (signs.length === 0) return null
  const of = (slot) => signs.filter((s) => s.slot === slot)

  const subjectSign = of('subject')[0]
  const who = subjectSign?.id ?? 'saya'
  const P = PERSON[who]

  const emergency = of('emergency')
  if (emergency.length) {
    const lines = emergency.map((s) => EMERGENCY[s.id])
    if (who === 'dia' && emergency.some((s) => s.id === 'help')) {
      return { bm: 'Tolong dia!', en: 'Help him or her!' } // a carer calling for help for someone else
    }
    return { bm: lines.map((l) => l[0]).join(' '), en: lines.map((l) => l[1]).join(' ') }
  }

  const symptoms = of('symptom')
  const needs = of('need')
  const question = of('question')[0]
  const body = of('body')[0]
  const timeSign = of('time')[0]
  const time = TIME[timeSign?.id]
  const intensity = of('intensity')[0]
  const saidYes = ids.includes('yes')
  const saidNo = ids.includes('no')
  const negated = saidNo && symptoms.length > 0
  const bm = []
  const en = []
  let usedPerson = false // did a sentence use the person (I / you / he or she)?

  for (const sym of symptoms) {
    const t = SYMPTOM[sym.id]
    let b = negated ? t.nbm : t.bm
    let e = negated ? t.nen : t.en
    if (sym.id === 'pain' && body) {
      b = `${negated ? 'tidak ' : ''}sakit ${body.bm}`
      e = negated ? `have no pain in my ${body.en}` : `have pain in my ${body.en}`
    }
    if (time) { b += ` ${time[0]}`; e += ` ${time[1]}` }
    if (intensity) { b += ` ${intensity.bm}`; e += intensity.id === 'very' ? ' very much' : ' a little' }
    bm.push(`${P.bm} ${b}.`)
    en.push(`${P.en} ${agree(e, who)}.`)
    usedPerson = true
  }

  // body part alone (no symptom): "It hurts in my head."
  if (!symptoms.length && body) {
    let b = `Sakit di bahagian ${body.bm}`
    let e = `It hurts in ${P.poss} ${body.en}`
    if (time) { b += ` ${time[0]}`; e += ` ${time[1]}` }
    if (intensity) { b += ` ${intensity.bm}`; e += intensity.id === 'very' ? ' very much' : ' a little' }
    bm.push(`${b}.`)
    en.push(`${e}.`)
    usedPerson = true
  }

  const negNeeds = saidNo && !question // "no" + a need = "I do not need ..."
  for (const n of needs) {
    const [nb, ne] = NEED[n.id]
    if (question) {
      bm.push(`${cap(nb)} ${question.bm}?`)
      en.push(question.id === 'when' ? `When is ${ne} coming?` : `What about ${ne}?`)
    } else {
      const [lb, le] = needLine(n.id, who, negNeeds)
      bm.push(lb)
      en.push(le)
      usedPerson = true
    }
  }
  if (question && !needs.length && !bm.length) {
    bm.push(QUESTION_ALONE[question.id][0])
    en.push(QUESTION_ALONE[question.id][1])
  } else if (question && !needs.length) {
    bm.push(`${cap(question.bm)}?`)
    en.push(`${cap(question.en)}?`)
  }

  // time / intensity with nothing to attach to: still say a full sentence
  if (!symptoms.length && !body) {
    if (timeSign && !bm.length) { bm.push(TIME_ALONE[timeSign.id][0]); en.push(TIME_ALONE[timeSign.id][1]) }
    if (intensity) {
      if (!timeSign || bm.length) { bm.push(INTENSITY_ALONE[intensity.id][0]); en.push(INTENSITY_ALONE[intensity.id][1]) }
    }
  }

  // yes / no: an answer in front of the sentence ("Yes, I have a fever."), a full sentence if alone
  const answer = saidYes ? 'yes' : saidNo && !negated && !(negNeeds && needs.length) ? 'no' : null
  if (answer) {
    if (bm.length) {
      bm[0] = `${answer === 'yes' ? 'Ya' : 'Tidak'}, ${lowerFirst(bm[0])}`
      en[0] = `${answer === 'yes' ? 'Yes' : 'No'}, ${lowerFirst(en[0])}`
    } else {
      bm.push(REPLY_ALONE[answer][0])
      en.push(REPLY_ALONE[answer][1])
    }
  } else if (saidNo && !bm.length) {
    bm.push(REPLY_ALONE.no[0]) // "no" alone after the rules above
    en.push(REPLY_ALONE.no[1])
  }

  for (const r of of('reply')) {
    if (r.id === 'yes' || r.id === 'no') continue // handled above
    bm.push(REPLY[r.id][0])
    en.push(REPLY[r.id][1])
  }

  // The person was signed but no sentence used it: say who it is about (nothing to add for "saya" with other words)
  if (subjectSign && !usedPerson && (!bm.length || who !== 'saya')) {
    bm.unshift(P.about[0])
    en.unshift(P.about[1])
  }

  return { bm: bm.join(' '), en: en.join(' ') }
}
