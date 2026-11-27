import { useState } from 'react'
import { useBoard } from '../store.ts'
import { useVisit } from '../visitStore.ts'
import { patientAnswers } from '../lib/patientReview.ts'
import { visitApi } from '../lib/visitApi.ts'
import { CloseButton, Sheet, SheetTitle, btnAlt, btnPrimary, sheetFoot, sheetHead, useT } from './ui.tsx'

export function PatientSummary() {
  const t = useT()
  const lang = useBoard(s => s.lang)
  const items = useBoard(s => s.items).filter(i => i.kind !== 'staff' && i.kind !== 'message')
  const current = useVisit(s => s.current)
  const confirmation = useVisit(s => s.confirmation)
  const answers = patientAnswers(items)
  const fingerprint = `${current?.id ?? 'temporary'}:${JSON.stringify(answers)}`
  const [accepted, setAccepted] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<number | null>(null)
  const [text, setText] = useState('')
  const confirmed = confirmation?.fingerprint === fingerprint
  const missing = t('Not answered', 'Belum dijawab')
  const close = () => { if (!busy) useVisit.getState().set({ summaryOpen: false }) }

  async function confirm() {
    if (accepted !== fingerprint || !items.length || editing !== null || busy) return
    setBusy(true); setError('')
    const state = useVisit.getState()
    const requestId = state.summaryRequest?.fingerprint === fingerprint ? state.summaryRequest.id : crypto.randomUUID()
    state.set({ summaryRequest: { fingerprint, id: requestId } })
    try {
      let version: number | null = null
      if (current) {
        const result = await visitApi<{ version: number }>('/visits/current/summaries', {
          request_id: requestId, answers, patient_confirmed: true,
        })
        version = result.version
      }
      useVisit.getState().set({ confirmation: { fingerprint, version, requestId } })
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save. Try again.') }
    finally { setBusy(false) }
  }

  return (
    <Sheet labelledBy="patientReviewTitle" wide cat="base">
      <div className={sheetHead}>
        <SheetTitle id="patientReviewTitle" title={t('Review my summary', 'Semak ringkasan saya')}
          sub={t('Patient-reported information. Check and correct your own answers before confirming.', 'Maklumat dilaporkan pesakit. Semak dan betulkan jawapan anda sebelum mengesahkan.')} />
        <CloseButton label={t('Close review', 'Tutup semakan')} onClick={close} />
      </div>
      <div className="min-h-0 space-y-5 overflow-auto p-5">
        {current ? <p className="rounded-[12px] bg-brand-soft p-3"><b>{current.patient_name} · {current.queue_number}</b> · {current.visit_date}</p>
          : <p className="rounded-[12px] bg-brand-soft p-3">{t('Temporary, unregistered summary. Nothing is saved to a patient record. A nurse must confirm which visit these answers belong to.', 'Ringkasan sementara, belum berdaftar. Tiada yang disimpan ke rekod pesakit. Jururawat mesti mengesahkan lawatan untuk jawapan ini.')}</p>}
        {error && <p role="alert" className="rounded-[12px] bg-no-soft p-3 text-no">{error}</p>}
        {confirmation && !confirmed && <p role="status" className="rounded-[12px] bg-brand-soft p-3 font-bold">{t('Your answers changed. Review and confirm this version again.', 'Jawapan anda berubah. Semak dan sahkan versi ini semula.')}</p>}
        {confirmed && <p role="status" className="rounded-[12px] bg-yes-soft p-3 font-bold text-yes">{confirmation?.version
          ? t(`Saved to this visit · version ${confirmation.version}`, `Disimpan untuk lawatan ini · versi ${confirmation.version}`)
          : t('Confirmed on this screen only. Not saved to a visit.', 'Disahkan pada skrin ini sahaja. Belum disimpan ke lawatan.')}</p>}
        <section className="space-y-3">
          <h3 className="text-xl">{t('Pain reports', 'Laporan sakit')}</h3>
          {!items.some(i => i.kind === 'pain') && <p className="rounded-[12px] border border-line p-3">{missing}</p>}
          {items.filter(i => i.kind === 'pain').map(item => (
            <article key={item.uid} className="space-y-3 rounded-[16px] border border-line bg-surface-2 p-4">
              <p className="text-lg font-bold">{item.say[lang]}</p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-2">
                <dt>{t('Location', 'Lokasi')}</dt><dd>{item.meta?.site ?? missing}</dd>
                <dt>{t('Side', 'Sisi')}</dt><dd>{item.meta?.side ? (lang === 'bm' ? item.meta.side === 'Left' ? 'Kiri' : 'Kanan' : item.meta.side) : missing}</dd>
                <dt>{t('Score', 'Tahap')}</dt><dd>{item.meta?.score !== undefined ? `${item.meta.score}/10` : missing}</dd>
                <dt>{t('Pain type', 'Jenis sakit')}</dt><dd>{item.meta?.type ?? missing}</dd>
                <dt>{t('Started', 'Bermula')}</dt><dd>{item.meta?.onset ?? missing}</dd>
              </dl>
              <div className="flex flex-wrap gap-2">
                {item.reportedPain && <button className={btnAlt} disabled={busy} onClick={() => { useVisit.getState().set({ summaryOpen: false, editPainUid: item.uid }); useBoard.getState().setModal('pain') }}>{t('Edit pain report', 'Ubah laporan sakit')}</button>}
                <button className={btnAlt} disabled={busy} onClick={() => useBoard.getState().removeItem(item.uid)}>{t('Remove this report', 'Buang laporan ini')}</button>
              </div>
            </article>
          ))}
        </section>
        <section className="space-y-3">
          <h3 className="text-xl">{t('Symptoms reported', 'Simptom dilaporkan')}</h3>
          {items.some(i => i.kind === 'symptom') ? items.filter(i => i.kind === 'symptom').map(i => <p className="rounded-[12px] border border-line p-3" key={i.uid}>{i.say[lang]}</p>) : <p>{missing}</p>}
        </section>
        <section className="space-y-3">
          <h3 className="text-xl">{t('Your other messages and answers', 'Mesej dan jawapan lain anda')}</h3>
          {!items.some(i => i.kind !== 'pain') && <p>{missing}</p>}
          {items.filter(i => i.kind !== 'pain').map(item => (
            <article key={item.uid} className="space-y-3 rounded-[14px] border border-line p-4">
              {editing === item.uid ? <>
                <label className="block space-y-1"><b>{t('Your corrected message (kept as typed, without translation)', 'Mesej dibetulkan (dikekalkan seperti ditaip, tanpa terjemahan)')}</b>
                  <textarea autoFocus className="w-full rounded-[12px] border border-line-2 bg-surface p-3" rows={3} maxLength={2000} value={text} onChange={e => setText(e.target.value)} />
                </label>
                <button className={btnPrimary} disabled={!text.trim()} onClick={() => { const value = text.trim(); useBoard.getState().replaceItem(item.uid, { kind: 'typed', say: { en: value, bm: value }, short: { en: value.slice(0, 40), bm: value.slice(0, 40) } }); setEditing(null) }}>{t('Apply correction', 'Guna pembetulan')}</button>
                <button className={btnAlt} onClick={() => setEditing(null)}>{t('Cancel edit', 'Batal perubahan')}</button>
              </> : <>
                <p className="text-lg">{item.say[lang]}</p>
                <button className={btnAlt} disabled={busy} onClick={() => { setEditing(item.uid); setText(item.say[lang]) }}>{t('Edit message', 'Ubah mesej')}</button>
                <button className={`${btnAlt} ml-2`} disabled={busy} onClick={() => useBoard.getState().removeItem(item.uid)}>{t('Remove message', 'Buang mesej')}</button>
              </>}
            </article>
          ))}
        </section>
        <p className="text-muted">{t('A blank answer means “Not answered”. This summary does not diagnose or add information you did not choose.', 'Jawapan kosong bermaksud “Belum dijawab”. Ringkasan ini tidak mendiagnosis atau menambah maklumat yang tidak anda pilih.')}</p>
        <label className="flex min-h-12 items-start gap-3 rounded-[12px] bg-brand-soft p-3">
          <input type="checkbox" className="mt-1" checked={accepted === fingerprint} disabled={!items.length || busy || editing !== null || confirmed} onChange={e => setAccepted(e.target.checked ? fingerprint : null)} />
          {t('I checked this summary. These are my answers.', 'Saya telah menyemak ringkasan ini. Ini jawapan saya.')}
        </label>
      </div>
      <div className={sheetFoot}>
        <button className={btnAlt} disabled={busy} onClick={close}>{t('Back to AAC / Add answers', 'Kembali ke AAC / Tambah jawapan')}</button>
        {!current && <button className={btnAlt} disabled={busy} onClick={() => useVisit.getState().set({ summaryOpen: false, registrationOpen: true })}>{t('Register / Ask nurse to link visit', 'Daftar / Minta jururawat pautkan lawatan')}</button>}
        <button className={btnPrimary} disabled={busy || confirmed || !items.length || accepted !== fingerprint || editing !== null} onClick={() => void confirm()}>
          {busy ? t('Saving…', 'Menyimpan…') : confirmed ? t('Confirmed', 'Disahkan') : current ? t('Confirm and save this summary', 'Sahkan dan simpan ringkasan ini') : t('Confirm temporary summary', 'Sahkan ringkasan sementara')}
        </button>
      </div>
    </Sheet>
  )
}
