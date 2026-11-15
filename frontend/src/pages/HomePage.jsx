import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

export const title = 'Home'
export const order = 0

// Landing / mode selector, converted from the Stitch design.
// Header, footer and the EN/BM + emergency bar belong to Layout.jsx (shared), not this page.

// Demo values shown in the patient badge. Replace with real data later.
const PATIENT = { name: 'Farhan', bed: 'Bed 12', ward: 'Wad 5B' }

// Small picture tokens shown on the AAC card.
const AAC_TOKENS = [
  { icon: 'healing', color: 'text-emergency-red', label: 'Sakit / Pain' },
  { icon: 'water_drop', color: 'text-on-tertiary-container', label: 'Air / Water', delay: 'delay-75' },
  { icon: 'wc', color: 'text-secondary', label: 'Tandas', delay: 'delay-100' },
  { icon: 'stethoscope', color: 'text-primary', label: 'Doktor', delay: 'delay-150' },
  { icon: 'bed', color: 'text-text-muted', label: 'Baring' },
  { icon: 'ac_unit', color: 'text-tertiary-fixed-dim', label: 'Sejuk', delay: 'delay-75' },
  { icon: 'check_circle', color: 'text-success-green', label: 'Ya / Yes', delay: 'delay-100' },
  { icon: 'cancel', color: 'text-error', label: 'Tidak / No', delay: 'delay-150' },
]

// Quick help buttons. `toast` is the message shown after pressing one.
const QUICK_ACTIONS = [
  {
    id: 'nurse',
    icon: 'notifications_active',
    en: 'Call Nurse',
    bm: 'Panggil Jururawat',
    box: 'bg-emergency-red-bg text-emergency-red',
    toast: `Jururawat telah dimaklumkan (${PATIENT.ward}) / Nurse notified for ${PATIENT.bed}`,
  },
  {
    id: 'pen',
    icon: 'edit_note',
    en: 'Need Pen & Paper',
    bm: 'Perlu Pen & Kertas',
    box: 'bg-surface-container text-primary',
    toast: 'Permintaan alat tulis dihantar / Writing board request sent',
  },
  {
    id: 'interpreter',
    icon: 'support_agent',
    en: 'BIM Interpreter',
    bm: 'Jurubahasa Isyarat',
    box: 'bg-accent-teal-soft text-accent-teal-dark',
    toast: 'Jurubahasa BIM hospital dihubungi / On-call BIM interpreter summoned',
  },
]

function Icon({ name, className = '' }) {
  return <span className={`material-symbols-outlined ${className}`}>{name}</span>
}

// Decorative hand-landmark drawing for the sign language card.
function HandLandmarks() {
  const dots = [
    [180, 115, 4.5], [160, 95, 3.5], [170, 72, 3.5], [178, 50, 3.5], [184, 34, 3],
    [190, 70, 3.5], [196, 48, 3.5], [200, 32, 3], [206, 75, 3.5], [214, 55, 3.5],
    [218, 42, 3], [145, 96, 3.5], [132, 85, 3],
  ]
  const lines = [
    'M180 115L160 95L170 72L178 50L184 34',
    'M180 115L190 70L196 48L200 32',
    'M180 115L206 75L214 55L218 42',
    'M160 95L145 96L132 85',
  ]
  return (
    <svg
      className="h-full w-full text-secondary opacity-80 transition-opacity group-hover:opacity-100"
      fill="none"
      viewBox="0 0 360 160"
      aria-hidden="true"
    >
      {/* viewfinder corners */}
      <path d="M24 36H44V24H24V36Z" fill="currentColor" fillOpacity="0.3" />
      <path d="M24 124H44V136H24V124Z" fill="currentColor" fillOpacity="0.3" />
      <path d="M336 36H316V24H336V36Z" fill="currentColor" fillOpacity="0.3" />
      <path d="M336 124H316V136H336V124Z" fill="currentColor" fillOpacity="0.3" />
      {dots.map(([cx, cy, r]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} fill="currentColor" />
      ))}
      {lines.map((d) => (
        <path key={d} d={d} stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      ))}
      <circle cx="180" cy="80" r="54" stroke="currentColor" strokeDasharray="4 6" strokeOpacity="0.4" strokeWidth="1.5" />
    </svg>
  )
}

export default function HomePage() {
  // Which quick action message is showing (null = hidden).
  const [toast, setToast] = useState(null)
  const timer = useRef(null)

  function showToast(action) {
    clearTimeout(timer.current)
    setToast(action)
    timer.current = setTimeout(() => setToast(null), 3800)
  }

  // Stop the timer if the user leaves the page.
  useEffect(() => () => clearTimeout(timer.current), [])

  return (
    <div className="font-jakarta text-on-surface relative w-full overflow-hidden pb-12 pt-4">
      {/* Soft background glows */}
      <div className="pointer-events-none absolute -top-16 left-1/4 -z-10 h-96 w-96 rounded-full bg-accent-teal-soft opacity-60 blur-3xl" />
      <div className="pointer-events-none absolute right-1/4 top-20 -z-10 h-80 w-80 rounded-full bg-surface-container opacity-40 blur-3xl" />

      {/* Patient badge */}
      <div className="mb-3 flex items-center justify-center">
        <div className="inline-flex items-center gap-space-xs rounded-full bg-surface-container-low px-space-md py-1.5 shadow-sm">
          <span className="h-2 w-2 rounded-full bg-secondary" />
          <span className="text-label-sm uppercase tracking-wide text-secondary">Pesakit Aktif / Patient Active</span>
          <span className="text-label-sm text-text-muted">•</span>
          <span className="text-label-md font-semibold text-primary">
            Hello, {PATIENT.name} ({PATIENT.bed})
          </span>
        </div>
      </div>

      {/* Heading */}
      <div className="mx-auto mb-10 max-w-3xl px-gutter-mobile text-center">
        <h1 className="mb-2 text-display-lg tracking-tight text-primary">How would you like to communicate today?</h1>
        <p className="text-bilingual-primary font-normal text-text-muted">
          Bagaimana anda ingin berkomunikasi hari ini?
        </p>
      </div>

      {/* Two mode cards */}
      <div className="mx-auto mb-12 grid max-w-5xl grid-cols-1 gap-space-lg md:grid-cols-2">
        {/* Sign language (BIM) */}
        <div className="group relative flex flex-col justify-between rounded-xl bg-surface-card p-space-xl shadow-sm transition-all duration-300 hover:shadow-md">
          <div className="mb-6 flex items-start justify-between">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-accent-teal-soft text-secondary shadow-sm transition-colors duration-300 group-hover:bg-secondary group-hover:text-on-secondary">
              <Icon name="sign_language" className="text-[32px]" />
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-surface-container px-3 py-1 text-label-sm text-primary">
              <Icon name="videocam" className="text-[14px]" /> BIM AI
            </span>
          </div>

          <div className="relative mb-6 flex h-44 w-full items-center justify-center overflow-hidden rounded-xl bg-canvas-base">
            <HandLandmarks />
            <div className="absolute bottom-3 left-4 flex items-center gap-1.5 rounded-lg bg-surface-card/90 px-2.5 py-1 shadow-sm backdrop-blur-sm">
              <span className="h-2 w-2 animate-ping rounded-full bg-success-green" />
              <span className="text-label-sm text-on-surface">Bed Camera Ready</span>
            </div>
          </div>

          <div className="mb-6">
            <h2 className="mb-1 text-headline-md text-primary">Sign Language (BIM)</h2>
            <p className="mb-2 text-bilingual-primary text-secondary">Bahasa Isyarat Malaysia</p>
            <p className="text-body-md text-text-muted">
              Real-time gesture recognition using bedside camera. Translates hand signs instantly to spoken English and Malay.
            </p>
          </div>

          <Link
            to="/recognition"
            className="flex h-14 w-full items-center justify-between rounded-xl bg-primary px-space-lg text-label-lg text-on-primary shadow-sm transition-all duration-200 hover:bg-primary-container group-hover:shadow-md"
          >
            <span className="flex items-center gap-space-sm">
              <Icon name="photo_camera" className="text-[24px]" />
              <span>Open Camera / Buka Kamera</span>
            </span>
            <Icon name="arrow_forward" className="text-[20px] transition-transform duration-200 group-hover:translate-x-1" />
          </Link>
        </div>

        {/* Picture board (AAC) */}
        <div className="group relative flex flex-col justify-between rounded-xl bg-surface-card p-space-xl shadow-sm transition-all duration-300 hover:shadow-md">
          <div className="mb-6 flex items-start justify-between">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-secondary-container/40 text-secondary shadow-sm transition-colors duration-300 group-hover:bg-secondary group-hover:text-on-secondary">
              <Icon name="grid_view" className="text-[32px]" />
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-accent-teal-light px-3 py-1 text-label-sm text-accent-teal-dark">
              <Icon name="volume_up" className="text-[14px]" /> Audio AAC
            </span>
          </div>

          <div className="relative mb-6 flex h-44 w-full items-center justify-center overflow-hidden rounded-xl bg-canvas-base p-4">
            <div className="grid w-full max-w-xs grid-cols-4 gap-2.5">
              {AAC_TOKENS.map((t) => (
                <div
                  key={t.label}
                  className={`flex h-16 flex-col items-center justify-center rounded-lg bg-surface-card p-1.5 shadow-sm transition-transform group-hover:scale-105 ${t.delay ?? ''}`}
                >
                  <Icon name={t.icon} className={`text-[22px] ${t.color}`} />
                  <span className="mt-1 text-[10px] font-semibold leading-none text-text-muted">{t.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="mb-6">
            <h2 className="mb-1 text-headline-md text-primary">Picture Board (AAC)</h2>
            <p className="mb-2 text-bilingual-primary text-secondary">Papan Simbol Komunikasi</p>
            <p className="text-body-md text-text-muted">
              Tap pictures, clinical signs, and custom phrases to speak aloud immediately through synthetic voice output.
            </p>
          </div>

          <Link
            to="/aac"
            className="flex h-14 w-full items-center justify-between rounded-xl bg-secondary px-space-lg text-label-lg text-on-secondary shadow-sm transition-all duration-200 hover:bg-accent-teal-dark group-hover:shadow-md"
          >
            <span className="flex items-center gap-space-sm">
              <Icon name="touch_app" className="text-[24px]" />
              <span>Open AAC Board / Buka Papan AAC</span>
            </span>
            <Icon name="arrow_forward" className="text-[20px] transition-transform duration-200 group-hover:translate-x-1" />
          </Link>
        </div>
      </div>

      {/* Quick help */}
      <div className="mx-auto w-full max-w-4xl">
        <div className="mb-4 text-center">
          <span className="text-label-sm uppercase tracking-wider text-text-muted">
            Alternative &amp; Immediate Hospital Support / Bantuan Pantas
          </span>
        </div>
        <div className="grid grid-cols-1 gap-space-md sm:grid-cols-3">
          {QUICK_ACTIONS.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => showToast(a)}
              className="group flex items-center gap-space-md rounded-xl bg-surface-card p-space-md text-left shadow-sm transition-all duration-200 hover:bg-canvas-subtle active:scale-[0.98]"
            >
              <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg transition-transform group-hover:scale-105 ${a.box}`}>
                <Icon name={a.icon} className="text-[24px]" />
              </div>
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-label-md text-on-surface">{a.en}</span>
                <span className="truncate text-label-sm text-text-muted">{a.bm}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Toast message */}
      <div
        role="status"
        aria-live="polite"
        className={`pointer-events-none fixed left-1/2 top-24 z-50 -translate-x-1/2 transition-all duration-300 ${
          toast ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
        }`}
      >
        <div className="flex items-center gap-space-sm rounded-xl bg-inverse-surface px-space-lg py-3 text-inverse-on-surface shadow-xl">
          <Icon name={toast?.icon ?? 'check_circle'} className="text-[22px] text-secondary-fixed" />
          <span className="text-label-md">{toast?.toast ?? 'Permintaan dihantar / Request dispatched to ward desk'}</span>
        </div>
      </div>
    </div>
  )
}
