import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import HandCamera from '../components/HandCamera'
import { speak } from '../lib/speak'
import { SIGNS, SLOT_STYLE, buildSentence } from '../lib/bimSentence'

export const title = 'Recognition'
export const order = 10

// Module A (deaf user). Converted from the Stitch design.
// The camera is the real <HandCamera />. The classifier is not trained yet, so the signed
// words come from the shortcut / demo buttons (same ids the classifier will output later).
// Header bar is part of this page. The hospital footer + emergency bar belong in Layout.jsx.

// Words the patient can tap while the classifier is not ready.
const SHORTCUTS = ['head', 'chest', 'stomach', 'back', 'hand', 'leg', 'repeat']

// Demo scripts: pressing "Sign next word" adds these one by one.
const DEMOS = [
  { label: 'Pain + head + last night', words: ['pain', 'head', 'last_night'] },
  { label: 'Need water', words: ['water'] },
  { label: 'Mixed order', words: ['last_night', 'head', 'pain'] },
  { label: 'Not dizzy', words: ['no', 'dizzy'] },
]

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

function SignChip({ id }) {
  const s = SIGNS[id]
  const style = SLOT_STYLE[s.slot]
  return (
    <div className={`flex flex-col items-center rounded-xl border-2 px-3.5 py-1.5 ${style.box}`}>
      <span className="text-sm font-extrabold tracking-wide text-slate-900">{s.bm.toUpperCase()}</span>
      <span className={`text-[10px] font-bold uppercase tracking-wider ${style.tag}`}>{style.label}</span>
    </div>
  )
}

function SignClipCard({ gloss, index }) {
  return (
    <div className="flex flex-1 flex-col items-center rounded-xl border border-amber-200 bg-white p-3 shadow-2xs">
      <svg className="mb-1.5 h-8 w-8 text-teal-800" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" aria-hidden="true">
        <path d={HAND_ICON_PATHS[index % 2]} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="text-xs font-extrabold tracking-wide text-slate-900">{gloss}</span>
      <span className="text-[10px] font-medium text-slate-400">sign clip</span>
    </div>
  )
}

export default function RecognitionPage() {
  const [lang, setLang] = useState('en-US') // speech language
  const [handCount, setHandCount] = useState(0)
  const [featureCount, setFeatureCount] = useState(0)
  const lastSeen = useRef(0)

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

  function addWord(id) {
    setWords((w) => (w.includes(id) ? w : [...w, id]))
  }

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
    speak(lang === 'ms-MY' ? sentence.bm : sentence.en, lang)
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

  const handStatus =
    handCount > 0
      ? `Signing • ${handCount} hand${handCount > 1 ? 's' : ''} detected`
      : words.length
        ? 'Hands lowered • sentence complete'
        : 'Show your hands to start signing'

  return (
    <div className="flex flex-col gap-4">
      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 shadow-xs">
        <div className="flex items-center gap-3">
          <Link to="/" className="text-sm font-semibold text-teal-800 underline underline-offset-2 hover:text-teal-900">
            Back
          </Link>
          <span className="rounded-full bg-[#0D625B] px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-white">
            Module A • Deaf user
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Not built yet: other use cases of the system */}
          <button type="button" disabled title="Not built yet" className="rounded-lg bg-[#E6F4F2] px-3 py-1.5 text-xs font-semibold text-teal-800 opacity-80">
            Ask the patient
          </button>
          <button type="button" disabled title="Not built yet" className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 opacity-80">
            Queue calling
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
            <span>Show signs • Papar isyarat</span>
          </button>

          <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs font-semibold" role="group" aria-label="Speech language">
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

      <div className="grid w-full grid-cols-1 items-start gap-5 lg:grid-cols-12">
        {/* LEFT: patient side */}
        <div className="flex flex-col gap-3.5 lg:col-span-7">
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-600">
            <span>Patient signs response • Sila jawab dengan isyarat</span>
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">BIM AI Active</span>
          </div>

          {/* What the nurse asked */}
          <div className="flex items-center justify-between gap-3 rounded-xl border-2 border-amber-200 bg-amber-50 p-3 shadow-xs">
            <div className="flex items-center gap-2.5">
              <span className="text-base leading-none">💬</span>
              <div>
                <span className="block text-[10px] font-bold uppercase tracking-wider text-amber-800">Responding to Nurse / Menjawab Jururawat</span>
                <span className="block text-sm font-extrabold leading-tight text-slate-900">
                  “{nurseMsg.en}{nurseMsg.bm ? ` / ${nurseMsg.bm}` : ''}”
                </span>
              </div>
            </div>
            <span className="shrink-0 rounded-lg bg-amber-200/80 px-2.5 py-1 text-xs font-bold text-amber-900">BIM Mode</span>
          </div>

          {/* Camera */}
          <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-md">
            <div className="absolute left-3 top-3 z-20">
              <span className="inline-flex items-center rounded-full border border-teal-400/40 bg-teal-900/90 px-3 py-1 text-xs font-semibold text-teal-200 shadow backdrop-blur-sm">
                {handStatus}
              </span>
            </div>
            {/* HandCamera is used as it is. These classes only make it fill this dark box. */}
            <div className="[&>div]:max-w-none [&_p]:pb-3 [&_p]:text-slate-300">
              <HandCamera onLandmarks={onLandmarks} />
            </div>
            <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-t border-slate-800 bg-slate-900/80 px-4 py-2 text-xs font-medium text-slate-300">
              <span>📹 Camera tracking hands in real-time</span>
              <span className="hidden text-slate-500 sm:inline">•</span>
              <span>Signs detected sequentially to form answer</span>
              <span className="hidden text-slate-500 sm:inline">•</span>
              <span className="font-semibold text-teal-300">Lower hands to finish</span>
              {featureCount > 0 && (
                <>
                  <span className="hidden text-slate-500 sm:inline">•</span>
                  <span className="text-slate-400">{featureCount} numbers per frame for the classifier</span>
                </>
              )}
            </div>
          </div>

          {/* Signed words + sentence */}
          <div className="space-y-3 rounded-2xl border-2 border-teal-800/40 bg-white p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wide text-teal-900">Signed Words</span>
              <span className="text-xs font-medium text-slate-400">Any order works</span>
            </div>
            <div className="flex min-h-12 flex-wrap items-center gap-2">
              {words.length === 0 && <span className="text-sm text-slate-400">No signs yet. Sign to the camera, or tap a shortcut below.</span>}
              {words.map((id) => <SignChip key={id} id={id} />)}
            </div>

            <div className="space-y-0.5 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Sentence Preview</p>
              {sentence ? (
                <>
                  <h4 className="text-lg font-extrabold text-slate-900 sm:text-xl">{sentence.bm}</h4>
                  <p className="text-xs font-medium text-slate-600 sm:text-sm">{sentence.en}</p>
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
                Delete last word
              </button>
              <button
                type="button"
                onClick={sendToNurse}
                disabled={!sentence}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#0D625B] px-5 py-2.5 text-xs font-bold text-white shadow-md transition hover:bg-teal-900 active:scale-95 disabled:opacity-40 sm:text-sm"
              >
                <span>🔊</span>
                <span>Sign &amp; Send to Nurse / Hantar Jawapan</span>
              </button>
            </div>
          </div>

          {/* Shortcuts */}
          <div className="space-y-2 rounded-2xl border border-dashed border-teal-700/50 bg-white p-3.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-teal-950">Quick Sign Shortcuts / Pintasan Jawapan Isyarat • Tap to add sign</span>
              <span className="text-[11px] text-slate-400">Prototype mock tap</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {SHORTCUTS.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => addWord(id)}
                  className="rounded-xl border border-teal-700 bg-[#E6F4F2] px-3 py-1.5 text-left transition hover:bg-teal-100"
                >
                  <span className="block text-xs font-extrabold text-slate-900">{SIGNS[id].bm.toUpperCase()}</span>
                  <span className="block text-[10px] text-slate-500">{SIGNS[id].en}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Demo */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-[11px] font-bold uppercase text-slate-400">Demo</span>
              {DEMOS.map((d, i) => (
                <button
                  key={d.label}
                  type="button"
                  onClick={() => pickDemo(i)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${
                    demo === i ? 'bg-[#0D625B] text-white shadow-xs' : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={signNextWord}
              disabled={demoStep >= DEMOS[demo].words.length}
              className="rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-slate-800 disabled:opacity-40"
            >
              Sign next word
            </button>
          </div>
        </div>

        {/* RIGHT: staff side */}
        <div className="flex flex-col gap-4 lg:col-span-5">
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-600">
            <span>Staff Reply • Live Captions for Patient</span>
            <span className="text-[11px] font-semibold text-teal-800">Malay &amp; BIM Flashcards</span>
          </div>

          <div className="space-y-3 rounded-2xl border-2 border-[#EAB308]/60 bg-[#FFFDF4] p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wider text-amber-700">Nurse says</p>
            <div className="space-y-0.5">
              <h3 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">{nurseMsg.en}</h3>
              {nurseMsg.bm && <p className="text-sm font-semibold text-slate-600 sm:text-base">{nurseMsg.bm}</p>}
            </div>
            {showSigns && nurseMsg.signs.length > 0 && (
              <div className="space-y-2 border-t border-amber-200/70 pt-2">
                <p className="text-[11px] font-bold uppercase tracking-wide text-amber-900/70">Signs in this message</p>
                <div className="flex items-center gap-3">
                  {nurseMsg.signs.map((g, i) => <SignClipCard key={g} gloss={g} index={i} />)}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-1 rounded-2xl bg-[#0D625B] p-4 text-white shadow-md">
            <p className="text-[10px] font-bold uppercase tracking-wider text-teal-200">Patient Signed • Spoken to Nurse</p>
            {lastReply ? (
              <>
                <h4 className="text-2xl font-extrabold tracking-tight">{lastReply.bm}</h4>
                <p className="text-sm text-teal-100">{lastReply.en}</p>
              </>
            ) : (
              <h4 className="text-lg font-bold text-teal-100/80">Waiting for the patient’s answer…</h4>
            )}
          </div>

          <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
            <p className="text-xs font-bold text-slate-600">Staff: speak or type</p>
            <form onSubmit={sendNurseText} className="flex items-center gap-2">
              <button
                type="button"
                disabled
                title="Voice input not built yet"
                aria-label="Microphone voice input"
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#E6F4F2] text-teal-800 opacity-80"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder="Type here"
                className="flex-1 rounded-xl border border-slate-300 px-3.5 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
              <button type="submit" className="rounded-xl bg-[#0D625B] px-4 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-teal-900 sm:text-sm">
                Send
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
                  {p.en}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
