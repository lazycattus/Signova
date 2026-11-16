import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import HandCamera from '../components/HandCamera'
import { speak } from '../lib/speak'
import { useCameras } from '../lib/cameras'
import { SIGNS, SLOT_STYLE, buildSentence } from '../lib/bimSentence'

export const title = 'Recognition'
export const order = 10

// Module A (deaf user). Converted from the Stitch design.
// The camera is the real <HandCamera recognize />. When a trained model is in public/models/signova/
// the signed words come from it (and the word is drawn on the camera picture). Until then, and as a
// backup, the shortcut / demo buttons add the same word ids.
// Header bar is part of this page. The hospital footer + emergency bar belong in Layout.jsx.

// Words the patient can tap while the classifier is not ready.
const SHORTCUTS = ['head', 'chest', 'stomach', 'back', 'hand', 'leg', 'repeat']

// Demo scripts: pressing "Sign next word" adds these one by one.
const DEMOS = [
  { en: 'Pain + head + last night', ms: 'Sakit + kepala + semalam', words: ['pain', 'head', 'last_night'] },
  { en: 'Need water', ms: 'Perlu air', words: ['water'] },
  { en: 'Mixed order', ms: 'Susunan bercampur', words: ['last_night', 'head', 'pain'] },
  { en: 'Not dizzy', ms: 'Tidak pening', words: ['no', 'dizzy'] },
]

// Page text in both languages. The EN | BM switch in the top bar picks one.
const TEXT = {
  en: {
    back: 'Back', module: 'Module A • Deaf user', ask: 'Ask the patient', queue: 'Queue calling', showSigns: 'Show signs',
    patientHeader: 'Patient signs response', staffHeader: 'Staff reply • live captions for patient', flashcards: 'Malay & BIM flashcards',
    responding: 'Responding to nurse', signing: (n) => `Signing • ${n} hand${n > 1 ? 's' : ''} detected`,
    lowered: 'Hands lowered • sentence complete', idle: 'Show your hands to start signing',
    camera1: 'Camera tracking hands in real-time', camera2: 'Signs detected sequentially to form answer',
    camera3: 'Lower hands to finish', numbers: 'numbers per frame for the classifier',
    signedWords: 'Signed words', anyOrder: 'Any order works', noSigns: 'No signs yet. Sign to the camera, or tap a shortcut below.',
    preview: 'Sentence preview', del: 'Delete last word', send: 'Sign & send to nurse',
    shortcuts: 'Quick sign shortcuts • tap to add sign', mock: 'Prototype mock tap', demo: 'Demo', next: 'Sign next word',
    nurseSays: 'Nurse says', signsIn: 'Signs in this message', clip: 'sign clip',
    patientSigned: 'Patient signed • spoken to nurse', waiting: 'Waiting for the patient’s answer…',
    staffType: 'Staff: speak or type', placeholder: 'Type here', sendBtn: 'Send',
    aiActive: 'BIM AI Active', bimMode: 'BIM Mode', soon: 'Not built yet', mic: 'Microphone voice input',
    micSoon: 'Voice input not built yet', speechLang: 'Speech language', camera: 'Camera',
    camOff: 'Turn camera off', camOn: 'Turn camera on', cameraOff: 'Camera is off • you can still tap the shortcuts',
  },
  ms: {
    back: 'Kembali', module: 'Modul A • Pengguna pekak', ask: 'Tanya pesakit', queue: 'Panggil giliran', showSigns: 'Papar isyarat',
    patientHeader: 'Jawapan isyarat pesakit', staffHeader: 'Balasan kakitangan • sari kata langsung untuk pesakit', flashcards: 'Kad isyarat BM & BIM',
    responding: 'Menjawab jururawat', signing: (n) => `Berisyarat • ${n} tangan dikesan`,
    lowered: 'Tangan diturunkan • ayat selesai', idle: 'Tunjukkan tangan anda untuk mula berisyarat',
    camera1: 'Kamera menjejak tangan serta-merta', camera2: 'Isyarat dikesan satu demi satu untuk membentuk jawapan',
    camera3: 'Turunkan tangan untuk selesai', numbers: 'nombor setiap bingkai untuk pengelas',
    signedWords: 'Perkataan isyarat', anyOrder: 'Susunan bebas', noSigns: 'Belum ada isyarat. Berisyarat ke kamera, atau tekan pintasan di bawah.',
    preview: 'Pratonton ayat', del: 'Padam perkataan terakhir', send: 'Hantar jawapan kepada jururawat',
    shortcuts: 'Pintasan isyarat pantas • tekan untuk tambah', mock: 'Sentuhan prototaip', demo: 'Demo', next: 'Isyarat perkataan seterusnya',
    nurseSays: 'Jururawat berkata', signsIn: 'Isyarat dalam mesej ini', clip: 'klip isyarat',
    patientSigned: 'Pesakit berisyarat • dibacakan kepada jururawat', waiting: 'Menunggu jawapan pesakit…',
    staffType: 'Kakitangan: cakap atau taip', placeholder: 'Taip di sini', sendBtn: 'Hantar',
    aiActive: 'AI BIM Aktif', bimMode: 'Mod BIM', soon: 'Belum dibina', mic: 'Input suara mikrofon',
    micSoon: 'Input suara belum dibina', speechLang: 'Bahasa pertuturan', camera: 'Kamera',
    camOff: 'Matikan kamera', camOn: 'Hidupkan kamera', cameraOff: 'Kamera dimatikan • anda masih boleh guna pintasan',
  },
}

// What the nurse can say. `signs` are placeholder glosses for the flashcards.
const NURSE_PHRASES = [
  { en: 'Where is the pain?', bm: 'Di mana sakit?', signs: ['SAKIT', 'MANA'] },
  { en: 'Since when?', bm: 'Sejak bila?', signs: ['SEJAK', 'BILA'] },
  { en: 'Do you have any allergies?', bm: 'Adakah anda mempunyai alahan?', signs: ['ADA', 'ALAHAN'] },
  { en: 'The doctor will see you now', bm: 'Doktor akan berjumpa anda sekarang.', signs: ['DOKTOR', 'SEKARANG'] },
  { en: 'Take this medicine after food', bm: 'Ambil ubat ini selepas makan.', signs: ['UBAT', 'MAKAN'] },
]

const HAND_ICON_PATHS = [
  'M7 11V7a2 2 0 012-2 2 2 0 012 2v4m0 0V5a2 2 0 012-2 2 2 0 012 2v6m0 0V7a2 2 0 012-2 2 2 0 012 2v6m-6 3a4 4 0 004 4h2a4 4 0 004-4V9a2 2 0 00-2-2 2 2 0 00-2 2v4',
  'M7 11.5V14m0-2.5V7a2 2 0 012-2 2 2 0 012 2v5m0-5V5a2 2 0 012-2 2 2 0 012 2v5m0-5V7a2 2 0 012-2 2 2 0 012 2v7',
]

function SignChip({ id, ms }) {
  const s = SIGNS[id]
  const style = SLOT_STYLE[s.slot]
  return (
    <div className={`flex flex-col items-center rounded-xl border-2 px-3.5 py-1.5 ${style.box}`}>
      <span className="text-sm font-extrabold tracking-wide text-slate-900">{(ms ? s.bm : s.en).toUpperCase()}</span>
      <span className={`text-[10px] font-bold uppercase tracking-wider ${style.tag}`}>{ms ? style.ms : style.label}</span>
    </div>
  )
}

function SignClipCard({ gloss, index, label }) {
  return (
    <div className="flex flex-1 flex-col items-center rounded-xl border border-amber-200 bg-white p-3 shadow-2xs">
      <svg className="mb-1.5 h-8 w-8 text-teal-800" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" aria-hidden="true">
        <path d={HAND_ICON_PATHS[index % 2]} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="text-xs font-extrabold tracking-wide text-slate-900">{gloss}</span>
      <span className="text-[10px] font-medium text-slate-400">{label}</span>
    </div>
  )
}

const LANG_KEY = 'signova.recognition.lang'
function loadLang() {
  try {
    return localStorage.getItem(LANG_KEY) === 'ms-MY' ? 'ms-MY' : 'en-US'
  } catch {
    return 'en-US'
  }
}

const CAMERA_KEY = 'signova.recognition.camera'
function loadCamera() {
  try {
    return localStorage.getItem(CAMERA_KEY) || ''
  } catch {
    return ''
  }
}

export default function RecognitionPage() {
  const [lang, setLangState] = useState(loadLang) // page + speech language, remembered after refresh
  function setLang(code) {
    setLangState(code)
    try {
      localStorage.setItem(LANG_KEY, code)
    } catch {
      /* private window or blocked storage: it just won't be remembered */
    }
  }
  const [handCount, setHandCount] = useState(0)
  const [featureCount, setFeatureCount] = useState(0)
  const lastSeen = useRef(0)
  // Camera choice, remembered after refresh. '' = the browser's default camera.
  const { cameras, refresh: refreshCameras } = useCameras()
  const [cameraId, setCameraId] = useState(loadCamera)
  const [cameraOn, setCameraOn] = useState(true) // on every time the page opens
  const [activeCameraId, setActiveCameraId] = useState('') // the camera really in use
  function chooseCamera(id) {
    setCameraId(id)
    try {
      localStorage.setItem(CAMERA_KEY, id)
    } catch {
      /* not remembered */
    }
  }
  const onStream = useCallback(
    (id) => {
      setActiveCameraId(id)
      refreshCameras() // camera names are only available after permission is given
    },
    [refreshCameras],
  )
  const selectedCamera = cameras.some((c) => c.id === cameraId) ? cameraId : activeCameraId

  const isMs = lang === 'ms-MY'
  const t = TEXT[isMs ? 'ms' : 'en']

  // Which voices this device has. Many PCs have no Malay voice; Indonesian is close enough to read Malay.
  const [voices, setVoices] = useState({ ms: true, id: false })
  useEffect(() => {
    if (!('speechSynthesis' in window)) return
    const check = () => {
      const langs = window.speechSynthesis.getVoices().map((v) => v.lang.toLowerCase())
      setVoices({ ms: langs.some((l) => l.startsWith('ms')), id: langs.some((l) => l.startsWith('id')) })
    }
    check()
    window.speechSynthesis.addEventListener('voiceschanged', check)
    return () => window.speechSynthesis.removeEventListener('voiceschanged', check)
  }, [])
  const speakLang = isMs && !voices.ms && voices.id ? 'id-ID' : lang

  const [words, setWords] = useState([]) // signed word ids, in the order signed
  const [demo, setDemo] = useState(0) // which demo script is selected
  const [demoStep, setDemoStep] = useState(0) // next word in that script

  const [nurseMsg, setNurseMsg] = useState(NURSE_PHRASES[0])
  const [showSigns, setShowSigns] = useState(true)
  const [typed, setTyped] = useState('')
  const [lastReply, setLastReply] = useState(null) // what was spoken to the nurse

  const sentence = useMemo(() => buildSentence(words), [words])

  // The camera only reports frames when a hand is visible, so treat "no frame for a moment" as hands lowered.
  const onLandmarks = useCallback((features, hands) => {
    lastSeen.current = Date.now()
    setFeatureCount(features.length)
    setHandCount(hands)
  }, [])
  useEffect(() => {
    const t = setInterval(() => {
      if (Date.now() - lastSeen.current > 800) setHandCount(0)
    }, 400)
    return () => clearInterval(t)
  }, [])

  const addWord = useCallback((id) => {
    setWords((w) => (w.includes(id) ? w : [...w, id]))
  }, [])

  function pickDemo(i) {
    setDemo(i)
    setDemoStep(0)
    setWords([])
  }

  function signNextWord() {
    const script = DEMOS[demo].words
    if (demoStep >= script.length) return
    addWord(script[demoStep])
    setDemoStep(demoStep + 1)
  }

  function sendToNurse() {
    if (!sentence) return
    speak(isMs ? sentence.bm : sentence.en, speakLang)
    setLastReply(sentence)
    setWords([])
    setDemoStep(0)
  }

  function sendNurseText(e) {
    e.preventDefault()
    const text = typed.trim()
    if (!text) return
    setNurseMsg({ en: text, bm: '', signs: [] })
    setTyped('')
  }

  const handStatus = !cameraOn ? t.cameraOff : handCount > 0 ? t.signing(handCount) : words.length ? t.lowered : t.idle

  // Main line follows the chosen language, the other language goes underneath.
  const main = (m) => (m ? (isMs ? m.bm : m.en) : '')
  const second = (m) => (m ? (isMs ? m.en : m.bm) : '')
  const voiceNote =
    isMs && !voices.ms
      ? voices.id
        ? 'Tiada suara Melayu pada peranti ini, jadi suara Indonesia digunakan (sangat hampir dengan Bahasa Melayu).'
        : 'Tiada suara Melayu pada peranti ini, jadi suara lalai digunakan. Tambah di Windows: Tetapan > Masa & bahasa > Pertuturan.'
      : ''

  return (
    // Breaks out of the centred menu column so the page uses the whole screen width (same idea as the AAC page).
    <div className="relative left-1/2 flex w-[calc(100vw-2rem)] -translate-x-1/2 flex-col gap-4">
      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 shadow-xs">
        <div className="flex items-center gap-3">
          <Link to="/" className="text-sm font-semibold text-teal-800 underline underline-offset-2 hover:text-teal-900">
            {t.back}
          </Link>
          <span className="rounded-full bg-[#0D625B] px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-white">
            {t.module}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Not built yet: other use cases of the system */}
          <button type="button" disabled title={t.soon} className="rounded-lg bg-[#E6F4F2] px-3 py-1.5 text-xs font-semibold text-teal-800 opacity-80">
            {t.ask}
          </button>
          <button type="button" disabled title={t.soon} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 opacity-80">
            {t.queue}
          </button>

          <button
            type="button"
            role="switch"
            aria-checked={showSigns}
            onClick={() => setShowSigns((v) => !v)}
            className="inline-flex items-center gap-2 rounded-full border-2 border-teal-800 bg-[#E6F4F2] px-3 py-1 text-xs font-semibold text-teal-900 shadow-xs"
          >
            <span className={`relative inline-flex h-4 w-7 rounded-full transition ${showSigns ? 'bg-teal-800' : 'bg-slate-300'}`}>
              <span className={`inline-block h-3 w-3 translate-y-0.5 rounded-full bg-white transition ${showSigns ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
            </span>
            <span>{t.showSigns}</span>
          </button>

          <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs font-semibold" role="group" aria-label={t.speechLang}>
            {[['en-US', 'EN'], ['ms-MY', 'BM']].map(([code, label]) => (
              <button
                key={code}
                type="button"
                onClick={() => setLang(code)}
                aria-pressed={lang === code}
                className={`rounded-md px-2.5 py-1 transition ${lang === code ? 'bg-white text-teal-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {voiceNote && (
        <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-medium text-amber-900">
          {voiceNote}
        </p>
      )}

      <div className="grid w-full grid-cols-1 items-start gap-5 lg:grid-cols-12">
        {/* CAMERA zone */}
        <div className="flex flex-col gap-3.5 lg:col-span-7 lg:col-start-1 lg:row-start-1 2xl:col-span-5">
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-600">
            <span>{t.patientHeader}</span>
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">{t.aiActive}</span>
          </div>

          {/* What the nurse asked */}
          <div className="flex items-center justify-between gap-3 rounded-xl border-2 border-amber-200 bg-amber-50 p-3 shadow-xs">
            <div className="flex items-center gap-2.5">
              <span className="text-base leading-none">💬</span>
              <div>
                <span className="block text-[10px] font-bold uppercase tracking-wider text-amber-800">{t.responding}</span>
                <span className="block text-sm font-extrabold leading-tight text-slate-900">
                  “{main(nurseMsg) || nurseMsg.en}”
                </span>
              </div>
            </div>
            <span className="shrink-0 rounded-lg bg-amber-200/80 px-2.5 py-1 text-xs font-bold text-amber-900">{t.bimMode}</span>
          </div>

          {/* Camera */}
          <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-md">
            <div className="pointer-events-none absolute inset-x-3 top-3 z-20 flex flex-wrap items-start justify-between gap-2">
              <span className="pointer-events-auto inline-flex items-center rounded-full border border-teal-400/40 bg-teal-900/90 px-3 py-1 text-xs font-semibold text-teal-200 shadow backdrop-blur-sm">
                {handStatus}
              </span>
              <div className="pointer-events-auto flex flex-wrap items-center gap-2">
                {cameras.length > 1 && (
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
                    <span>📷 {t.camera}</span>
                    <select
                      value={selectedCamera}
                      onChange={(e) => chooseCamera(e.target.value)}
                      className="max-w-56 truncate rounded-lg border border-slate-600 bg-slate-900/90 px-2 py-1 text-xs font-semibold text-slate-100 shadow backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                    >
                      {cameras.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <button
                  type="button"
                  onClick={() => setCameraOn((on) => !on)}
                  aria-pressed={cameraOn}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold shadow backdrop-blur-sm transition focus:outline-none focus:ring-2 focus:ring-teal-400 ${
                    cameraOn
                      ? 'border-slate-600 bg-slate-900/90 text-slate-100 hover:bg-slate-800'
                      : 'border-teal-300 bg-teal-600 text-white hover:bg-teal-500'
                  }`}
                >
                  <span className={`h-2 w-2 rounded-full ${cameraOn ? 'bg-emerald-400' : 'bg-red-400'}`} />
                  {cameraOn ? t.camOff : t.camOn}
                </button>
              </div>
            </div>
            {/* HandCamera is used as it is. These classes only make it fill this dark box. */}
            <div className="[&>div]:max-w-none [&>div>div]:mx-auto [&>div>div]:w-[min(100%,calc(52dvh*1.3333))] [&_p]:pb-3 [&_p]:text-slate-300">
              <HandCamera onLandmarks={onLandmarks} lang={isMs ? 'ms' : 'en'} deviceId={cameraId || undefined} onStream={onStream} enabled={cameraOn} recognize onSign={addWord} />
            </div>
            <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-t border-slate-800 bg-slate-900/80 px-4 py-2 text-xs font-medium text-slate-300">
              <span>📹 {t.camera1}</span>
              <span className="hidden text-slate-500 sm:inline">•</span>
              <span>{t.camera2}</span>
              <span className="hidden text-slate-500 sm:inline">•</span>
              <span className="font-semibold text-teal-300">{t.camera3}</span>
              {featureCount > 0 && (
                <>
                  <span className="hidden text-slate-500 sm:inline">•</span>
                  <span className="text-slate-400">{featureCount} {t.numbers}</span>
                </>
              )}
            </div>
          </div>

        </div>

        {/* SIGNED WORDS zone: under the camera on laptops, its own column on very wide screens */}
        <div className="flex flex-col gap-3.5 lg:col-span-7 lg:col-start-1 lg:row-start-2 2xl:col-span-4 2xl:col-start-6 2xl:row-start-1">
          {/* Signed words + sentence */}
          <div className="space-y-3 rounded-2xl border-2 border-teal-800/40 bg-white p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wide text-teal-900">{t.signedWords}</span>
              <span className="text-xs font-medium text-slate-400">{t.anyOrder}</span>
            </div>
            <div className="flex min-h-12 flex-wrap items-center gap-2">
              {words.length === 0 && <span className="text-sm text-slate-400">{t.noSigns}</span>}
              {words.map((id) => <SignChip key={id} id={id} ms={isMs} />)}
            </div>

            <div className="space-y-0.5 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{t.preview}</p>
              {sentence ? (
                <>
                  <h4 className="text-lg font-extrabold text-slate-900 sm:text-xl">{main(sentence)}</h4>
                  <p className="text-xs font-medium text-slate-600 sm:text-sm">{second(sentence)}</p>
                </>
              ) : (
                <h4 className="text-lg font-extrabold text-slate-300 sm:text-xl">…</h4>
              )}
            </div>

            <div className="flex items-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => setWords((w) => w.slice(0, -1))}
                disabled={words.length === 0}
                className="rounded-xl border border-slate-300 px-4 py-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50 active:scale-95 disabled:opacity-40 sm:text-sm"
              >
                {t.del}
              </button>
              <button
                type="button"
                onClick={sendToNurse}
                disabled={!sentence}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#0D625B] px-5 py-2.5 text-xs font-bold text-white shadow-md transition hover:bg-teal-900 active:scale-95 disabled:opacity-40 sm:text-sm"
              >
                <span>🔊</span>
                <span>{t.send}</span>
              </button>
            </div>
          </div>

          {/* Shortcuts */}
          <div className="space-y-2 rounded-2xl border border-dashed border-teal-700/50 bg-white p-3.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-teal-950">{t.shortcuts}</span>
              <span className="text-[11px] text-slate-400">{t.mock}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {SHORTCUTS.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => addWord(id)}
                  className="rounded-xl border border-teal-700 bg-[#E6F4F2] px-3 py-1.5 text-left transition hover:bg-teal-100"
                >
                  <span className="block text-xs font-extrabold text-slate-900">{(isMs ? SIGNS[id].bm : SIGNS[id].en).toUpperCase()}</span>
                  <span className="block text-[10px] text-slate-500">{isMs ? SIGNS[id].en : SIGNS[id].bm}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Demo */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-[11px] font-bold uppercase text-slate-400">{t.demo}</span>
              {DEMOS.map((d, i) => (
                <button
                  key={d.en}
                  type="button"
                  onClick={() => pickDemo(i)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${
                    demo === i ? 'bg-[#0D625B] text-white shadow-xs' : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {d[isMs ? 'ms' : 'en']}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={signNextWord}
              disabled={demoStep >= DEMOS[demo].words.length}
              className="rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-slate-800 disabled:opacity-40"
            >
              {t.next}
            </button>
          </div>
        </div>

        {/* STAFF zone */}
        <div className="flex flex-col gap-4 lg:col-span-5 lg:col-start-8 lg:row-span-2 lg:row-start-1 2xl:col-span-3 2xl:col-start-10 2xl:row-span-1">
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-600">
            <span>{t.staffHeader}</span>
            <span className="text-[11px] font-semibold text-teal-800">{t.flashcards}</span>
          </div>

          <div className="space-y-3 rounded-2xl border-2 border-[#EAB308]/60 bg-[#FFFDF4] p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wider text-amber-700">{t.nurseSays}</p>
            <div className="space-y-0.5">
              <h3 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">{main(nurseMsg) || nurseMsg.en}</h3>
              {second(nurseMsg) && main(nurseMsg) && <p className="text-sm font-semibold text-slate-600 sm:text-base">{second(nurseMsg)}</p>}
            </div>
            {showSigns && nurseMsg.signs.length > 0 && (
              <div className="space-y-2 border-t border-amber-200/70 pt-2">
                <p className="text-[11px] font-bold uppercase tracking-wide text-amber-900/70">{t.signsIn}</p>
                <div className="flex items-center gap-3">
                  {nurseMsg.signs.map((g, i) => <SignClipCard key={g} gloss={g} index={i} label={t.clip} />)}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-1 rounded-2xl bg-[#0D625B] p-4 text-white shadow-md">
            <p className="text-[10px] font-bold uppercase tracking-wider text-teal-200">{t.patientSigned}</p>
            {lastReply ? (
              <>
                <h4 className="text-2xl font-extrabold tracking-tight">{main(lastReply)}</h4>
                <p className="text-sm text-teal-100">{second(lastReply)}</p>
              </>
            ) : (
              <h4 className="text-lg font-bold text-teal-100/80">{t.waiting}</h4>
            )}
          </div>

          <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
            <p className="text-xs font-bold text-slate-600">{t.staffType}</p>
            <form onSubmit={sendNurseText} className="flex items-center gap-2">
              <button
                type="button"
                disabled
                title={t.micSoon}
                aria-label={t.mic}
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#E6F4F2] text-teal-800 opacity-80"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={t.placeholder}
                className="flex-1 rounded-xl border border-slate-300 px-3.5 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
              <button type="submit" className="rounded-xl bg-[#0D625B] px-4 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-teal-900 sm:text-sm">
                {t.sendBtn}
              </button>
            </form>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {NURSE_PHRASES.map((p) => (
                <button
                  key={p.en}
                  type="button"
                  onClick={() => setNurseMsg(p)}
                  className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-200"
                >
                  {isMs ? p.bm : p.en}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
