import { useEffect, useRef, useState } from 'react'
import { useBoard } from '../store.ts'
import { Icon } from './Icon.tsx'
import { CloseButton, SheetTitle, btnAlt, btnPrimary, elapsed, sheetHead, useNow } from './ui.tsx'

/** Short, task-based staff guide. Searchable, opened from the Staff menu. */
const GUIDE: [title: string, steps: string[]][] = [
  [
    "Start or end a visit",
    [
      "Tap cards or use guided steps for Register, Appointment, Directions and Pharmacy.",
      "Staff menu → Start new visit clears the message and visit log. Undo is offered.",
      "After 10 minutes of inactivity, the board asks whether to keep this visit before clearing it."
    ]
  ],
  [
    "Read and reply",
    [
      "The large message shows what the patient chose, with the translation underneath.",
      "Tap Show for the counter view and reply buttons.",
      "Visit summary lets staff mark messages Seen or Done and send a reply."
    ]
  ],
  [
    "Pain and symptoms",
    [
      "Pain opens a 3D body map with location, side, a 0–10 score and pain type.",
      "Use the body-part buttons if 3D is unavailable. Confirm before adding a report.",
      "Symptoms and Allergy open guided steps."
    ]
  ],
  [
    "Type, draw and feelings",
    [
      "Type a custom message or use word suggestions.",
      "Draw on the canvas and show it to staff.",
      "Feelings and Ask staff provide additional communication cards."
    ]
  ],
  [
    "Emergency",
    [
      "Emergency fills the screen and sounds on this device to attract nearby staff.",
      "Staff can acknowledge it on this screen. Hold Cancel for 2 seconds if pressed by mistake.",
      "This local alert does not contact a nurse station or ambulance."
    ]
  ],
  [
    "Demo features",
    [
      "Ask by voice cycles through sample questions; it does not record the microphone.",
      "AI wording and summaries use local rules; no AI service is connected.",
      "Speech output depends on installed English and Malay voices. If unavailable, use Show."
    ]
  ],
  [
    "Saving",
    [
      "The board saves visits in this browser on this device.",
      "If saving is blocked or the device is full, the board still works, but refreshing may lose the message."
    ]
  ]
]

export function GuideDrawer() {
  const setGuide = useBoard(s => s.setGuide)
  const [q, setQ] = useState('')
  const needle = q.trim().toLowerCase()
  const shown = GUIDE.filter(([title, steps]) => !needle || [title, ...steps].some(x => x.toLowerCase().includes(needle)))
  return (
    <aside role="dialog" aria-modal="false" aria-labelledby="guideT" className="fixed top-0 right-0 bottom-(--foot) z-80 flex w-[min(440px,94vw)] animate-drawer-in flex-col border-l border-line bg-surface shadow-[-10px_0_30px_rgba(14,18,40,.12)]">
      <div className={`${sheetHead} items-start`}>
        <SheetTitle id="guideT" title="Staff guide" sub="How to use Signova with a patient." />
        <CloseButton label="Close guide" onClick={() => setGuide(false)} />
      </div>
      <div className="grid content-start gap-4 overflow-auto px-5 py-4">
        <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search the guide, e.g. reply, emergency" aria-label="Search the guide"
          className="min-h-11 w-full rounded-[12px] border border-line-2 bg-surface-2 px-3.5 text-[15px] focus:border-brand-ink focus:outline-none" />
        {shown.length ? shown.map(([title, steps]) => (
          <section key={title}>
            <h3 className="mb-1.5 text-[16px]">{title}</h3>
            <ul className="m-0 grid list-disc gap-1 pl-[18px] text-[14.5px] marker:text-brand-ink">{steps.map(x => <li key={x}>{x}</li>)}</ul>
          </section>
        )) : <p className="text-[14.5px] text-muted">Nothing matches "{q}". Try "reply", "seen", "typing" or "pain".</p>}
      </div>
    </aside>
  )
}

/** Front-desk boards are shared: after a quiet spell, check before the next patient sees the last one's message. */
const IDLE_MS = (Number(new URLSearchParams(location.search).get('idle')) || 600) * 1000 // ?idle=seconds, for demos
const GRACE_MS = 30_000

export function IdleGuard() {
  const busy = useBoard(s => s.profile === 'fd' && !s.alarm && (s.items.length > 0 || s.events.fd.length > 0))
  const newVisit = useBoard(s => s.newVisit)
  const last = useRef(Date.now())
  const [deadline, setDeadline] = useState<number | null>(null)
  const t = useNow(1000)
  useEffect(() => {
    const mark = () => { last.current = Date.now() }
    document.addEventListener('pointerdown', mark)
    document.addEventListener('keydown', mark)
    return () => { document.removeEventListener('pointerdown', mark); document.removeEventListener('keydown', mark) }
  }, [])
  useEffect(() => {
    if (!busy) return setDeadline(null)
    if (deadline === null && t - last.current > IDLE_MS) setDeadline(t + GRACE_MS)
    if (deadline !== null && t >= deadline) { setDeadline(null); last.current = Date.now(); newVisit() }
  }, [t, busy, deadline, newVisit])
  if (deadline === null) return null
  const keep = () => { last.current = Date.now(); setDeadline(null) }
  return (
    <div className="fixed inset-x-0 top-0 bottom-(--foot) z-90 grid animate-fade place-items-center bg-[rgba(14,18,40,.42)] p-4">
      <div role="alertdialog" aria-labelledby="idleT" className="w-[min(520px,100%)] animate-sheet-in rounded-[24px] bg-surface p-6 text-center shadow-[0_24px_60px_rgba(14,18,40,.28)]">
        <Icon name="clock" className="mx-auto size-10 text-brand-ink" />
        <h2 id="idleT" className="mt-2 text-[24px]">Still with this patient?</h2>
        <p className="mt-1 text-[17px] text-ink-2">Masih dengan pesakit ini?</p>
        <p className="mt-3 text-[15px] text-muted">The message clears for the next patient in <b className="text-ink tabular-nums">{elapsed(deadline - t)}</b>.</p>
        <div className="mt-5 flex flex-wrap justify-center gap-2.5">
          <button className={btnPrimary} onClick={keep}><Icon name="check" className="size-[19px]" />Keep · Teruskan</button>
          <button className={btnAlt} onClick={() => { setDeadline(null); newVisit() }}><Icon name="trash" className="size-[19px]" />New visit · Lawatan baru</button>
        </div>
      </div>
    </div>
  )
}
