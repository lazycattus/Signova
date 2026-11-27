import { useBoard } from '../store.ts'
import { useVisit } from '../visitStore.ts'
import { useT } from './ui.tsx'

/** Always reachable without requiring registration or staff login. */
export function VisitTools() {
  const t = useT()
  const current = useVisit(s => s.current)
  const items = useBoard(s => s.items)
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface px-5 py-2 max-sm:px-3">
      <span className="mr-auto text-sm text-muted">{current ? `${current.patient_name} · ${current.queue_number}` : t('Temporary answers · not linked to a visit', 'Jawapan sementara · belum dipautkan ke lawatan')}</span>
      <button className="min-h-11 rounded-[10px] border border-line px-3 font-bold" onClick={() => useVisit.getState().set({ registrationOpen: true })}>{current ? t('Today’s visit', 'Lawatan hari ini') : t('Register', 'Daftar')}</button>
      <button className="min-h-11 rounded-[10px] bg-brand px-3 font-bold text-on-brand" onClick={() => useVisit.getState().set({ summaryOpen: true })}>{t('Review my summary', 'Semak ringkasan saya')} ({items.filter(i => i.kind !== 'staff' && i.kind !== 'message').length})</button>
    </div>
  )
}
