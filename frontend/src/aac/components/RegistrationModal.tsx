import { useState, type FormEvent } from 'react'
import { useBoard } from '../store.ts'
import { useVisit, type CurrentVisit } from '../visitStore.ts'
import { ApiError, visitApi } from '../lib/visitApi.ts'
import { CloseButton, Sheet, SheetTitle, btnAlt, btnPrimary, sheetFoot, sheetHead, useT } from './ui.tsx'

const input = 'min-h-12 w-full rounded-[12px] border border-line-2 bg-surface px-3 py-2 text-[17px]'
type Match = { id: string; full_name: string; preferred_language: string; active_visit: CurrentVisit | null } | null

export function RegistrationModal() {
  const t = useT()
  const draft = useVisit(s => s.draft)
  const phase = useVisit(s => s.registrationPhase)
  const current = useVisit(s => s.current)
  const set = useVisit(s => s.set)
  const items = useBoard(s => s.items)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [nurse, setNurse] = useState(false)
  const [match, setMatch] = useState<Match>(null)
  const [lookedUp, setLookedUp] = useState(false)
  const [identity, setIdentity] = useState(false)
  const [linkDrafts, setLinkDrafts] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [room, setRoom] = useState('')
  const [ending, setEnding] = useState(false)
  const [handoffPending, setHandoffPending] = useState(false)
  const close = () => {
    if (busy) return
    if (!nurse) { set({ registrationOpen: false }); return }
    setBusy(true)
    void visitApi('/auth/logout', {}).then(() => {
      setNurse(false)
      set({ registrationOpen: false, registrationPhase: current ? 'registered' : 'waiting' })
    }).catch(fail).finally(() => setBusy(false))
  }
  const edit = () => {
    setError(''); setIdentity(false); setLookedUp(false); setMatch(null)
    set({ registrationPhase: 'edit', registrationRequestId: crypto.randomUUID() })
  }
  const patch = (value: Partial<typeof draft>) => set({ draft: { ...draft, ...value } })
  const fail = (e: unknown) => {
    if (e instanceof ApiError && e.status === 401) { setNurse(false); setIdentity(false); setLinkDrafts(false); setLookedUp(false) }
    setError(e instanceof Error ? e.message : 'Could not complete this step.')
  }

  function review(event: FormEvent) {
    event.preventDefault(); setError('')
    if (!draft.full_name.trim()) return setError(t('Enter a name or ask the nurse to help.', 'Masukkan nama atau minta bantuan jururawat.'))
    const id = draft.ic_number.replace(/[\s-]/g, '')
    if (!draft.needs_help && !/^\d{12}$/.test(id) && !/^TEST-[A-Z0-9]{3,24}$/i.test(draft.ic_number.trim())) {
      return setError(t('Enter a 12-digit IC, a TEST- demo ID, or choose nurse help.', 'Masukkan IC 12 digit, ID demo TEST-, atau pilih bantuan jururawat.'))
    }
    set({ draft: { ...draft, full_name: draft.full_name.trim(), ic_number: draft.needs_help ? '' : draft.ic_number.trim() }, registrationPhase: 'review' })
  }

  async function lookup() {
    const result = await visitApi<{ patient: Match }>('/patients/lookup', { ic_number: draft.needs_help ? null : draft.ic_number })
    setMatch(result.patient); setLookedUp(true)
  }

  async function openNurse(end = false) {
    setError(''); setBusy(true); setEnding(end); setIdentity(false); setLinkDrafts(false)
    set({ registrationPhase: 'nurse' })
    try {
      await visitApi('/auth/nurse-access'); setNurse(true)
      if (!end) await lookup()
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) { setNurse(false); setIdentity(false); setLinkDrafts(false); setLookedUp(false) }
      else fail(e)
    } finally { setBusy(false) }
  }

  async function signIn(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      await visitApi('/auth/login', { username, password }); setNurse(true)
      if (!ending) await lookup()
    } catch (e) { fail(e) }
    finally { setPassword(''); setBusy(false) }
  }

  async function handBack() {
    await visitApi('/auth/logout', {})
    setNurse(false); setHandoffPending(false)
    set({ registrationPhase: 'registered' })
  }

  async function confirm() {
    if (!identity || (items.length > 0 && !linkDrafts) || !lookedUp || busy) return
    setBusy(true); setError('')
    try {
      const response = await visitApi<{ visit: CurrentVisit; reused: boolean }>('/visits/register', {
        request_id: useVisit.getState().registrationRequestId,
        full_name: draft.full_name, ic_number: draft.needs_help ? null : draft.ic_number,
        preferred_language: draft.preferred_language, consultation_room: room || null,
        expected_patient_id: match?.id ?? null, identity_confirmed: true,
      })
      set({ current: response.visit, confirmation: null }); setHandoffPending(true)
      useBoard.getState().setLang(draft.preferred_language)
      await handBack()
    } catch (e) { fail(e) }
    finally { setBusy(false) }
  }

  async function finish() {
    setBusy(true); setError('')
    try {
      await visitApi('/visits/current/end', {})
      await visitApi('/auth/logout', {})
      useBoard.getState().newVisit()
    } catch (e) { fail(e) }
    finally { setBusy(false) }
  }

  return (
    <Sheet labelledBy="registrationTitle" cat="desk">
      <div className={sheetHead}>
        <SheetTitle id="registrationTitle" title={t('Register / Today’s visit', 'Daftar / Lawatan hari ini')}
          sub={t('One front-desk device. A nurse verifies identity before registration is saved.', 'Satu peranti kaunter. Jururawat mengesahkan identiti sebelum pendaftaran disimpan.')} />
        <CloseButton label={t('Close registration', 'Tutup pendaftaran')} onClick={close} />
      </div>
      <div className="min-h-0 space-y-5 overflow-auto p-5">
        {error && <p role="alert" className="rounded-[12px] bg-no-soft p-3 font-semibold text-no">{error}</p>}
        {phase === 'edit' && !current && (
          <form id="registrationForm" onSubmit={review} className="space-y-4">
            <p className="text-muted">{t('Your details stay on this screen until the nurse confirms. Reloading clears an unsubmitted draft.', 'Butiran kekal pada skrin sehingga jururawat mengesahkan. Muat semula memadam draf yang belum diserahkan.')}</p>
            <label className="block space-y-1"><b>{t('Full name', 'Nama penuh')}</b>
              <input className={input} autoComplete="off" name="patient-name" value={draft.full_name} required maxLength={150} onChange={e => patch({ full_name: e.target.value })} />
            </label>
            <label className="flex min-h-12 items-center gap-3 rounded-[12px] border border-line p-3">
              <input type="checkbox" checked={draft.needs_help} onChange={e => patch({ needs_help: e.target.checked, ic_number: e.target.checked ? '' : draft.ic_number })} />
              {t('I don’t have an IC / Need nurse help', 'Tiada IC / Perlu bantuan jururawat')}
            </label>
            {!draft.needs_help && <label className="block space-y-1"><b>{t('IC number', 'Nombor IC')}</b>
              <input className={input} autoComplete="off" name="patient-ic" value={draft.ic_number} required maxLength={32} onChange={e => patch({ ic_number: e.target.value })} aria-describedby="ic-help" />
              <small id="ic-help" className="block text-muted">{t('12 digits. For development, use a fictional ID such as TEST-PATIENT01.', '12 digit. Untuk pembangunan, guna ID rekaan seperti TEST-PATIENT01.')}</small>
            </label>}
            <label className="block space-y-1"><b>{t('Preferred language', 'Bahasa pilihan')}</b>
              <select className={input} value={draft.preferred_language} onChange={e => patch({ preferred_language: e.target.value as 'en' | 'bm' })}>
                <option value="en">English</option><option value="bm">Bahasa Malaysia</option>
              </select>
            </label>
          </form>
        )}
        {(phase === 'review' || phase === 'waiting') && !current && (
          <section className="space-y-4">
            <h3 className="text-xl">{t('Check your registration details', 'Semak butiran pendaftaran')}</h3>
            <dl className="grid grid-cols-[auto_1fr] gap-3 rounded-[16px] bg-surface-2 p-4">
              <dt>{t('Name', 'Nama')}</dt><dd className="font-bold">{draft.full_name}</dd>
              <dt>IC</dt><dd>{draft.needs_help ? t('Nurse help requested', 'Bantuan jururawat diminta') : draft.ic_number}</dd>
              <dt>{t('Language', 'Bahasa')}</dt><dd>{draft.preferred_language === 'en' ? 'English' : 'Bahasa Malaysia'}</dd>
            </dl>
            {phase === 'waiting' && <p role="status" className="rounded-[12px] bg-brand-soft p-4 font-bold">{t('Ready for nurse confirmation. You are not registered yet. Please ask the nurse at this desk.', 'Sedia untuk pengesahan jururawat. Pendaftaran belum disahkan. Sila minta jururawat di kaunter ini.')}</p>}
          </section>
        )}
        {phase === 'nurse' && (
          <section className="space-y-4">
            <h3 className="text-xl">{ending ? t('Nurse: finish this device session', 'Jururawat: tamatkan sesi peranti') : t('Nurse: verify identity', 'Jururawat: sahkan identiti')}</h3>
            {!nurse && !busy && <form id="registrationLogin" onSubmit={signIn} className="space-y-3">
              <p>{t('Sign in here so the patient’s temporary answers stay on this screen.', 'Log masuk di sini supaya jawapan sementara pesakit kekal pada skrin ini.')}</p>
              <label className="block space-y-1"><b>{t('Nurse / admin username', 'Nama pengguna jururawat / pentadbir')}</b><input className={input} autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} required maxLength={80} /></label>
              <label className="block space-y-1"><b>{t('Password', 'Kata laluan')}</b><input type="password" className={input} autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required maxLength={1024} /></label>
            </form>}
            {busy && <p role="status">{t('Please wait…', 'Sila tunggu…')}</p>}
            {nurse && !ending && !handoffPending && <>
              <p><b>{t('Entered name:', 'Nama dimasukkan:')}</b> {draft.full_name}</p>
              {lookedUp ? <div className="space-y-2 rounded-[14px] bg-brand-soft p-4">
                {match ? <><p>{t('Existing record (nurse only):', 'Rekod sedia ada (jururawat sahaja):')} <b>{match.full_name}</b></p>
                  {match.active_visit && <p>{t('An active visit already exists today. Reuse queue:', 'Lawatan aktif sudah wujud hari ini. Guna semula giliran:')} <b>{match.active_visit.queue_number}</b></p>}</>
                  : <p>{t('New patient record. Confirm their identity before creating it.', 'Rekod pesakit baharu. Sahkan identiti sebelum menciptanya.')}</p>}
              </div> : <button className={btnAlt} disabled={busy} onClick={() => { setBusy(true); lookup().catch(fail).finally(() => setBusy(false)) }}>{t('Retry patient lookup', 'Cuba semula carian pesakit')}</button>}
              <label className="block space-y-1"><b>{t('Consultation room (optional)', 'Bilik konsultasi (pilihan)')}</b><input className={input} value={room} maxLength={50} onChange={e => setRoom(e.target.value)} /></label>
              <label className="flex min-h-12 items-start gap-3"><input type="checkbox" className="mt-1" checked={identity} onChange={e => setIdentity(e.target.checked)} />{t('I verified the patient’s identity and the selected record.', 'Saya mengesahkan identiti pesakit dan rekod yang dipilih.')}</label>
              {items.length > 0 && <label className="flex min-h-12 items-start gap-3"><input type="checkbox" className="mt-1" checked={linkDrafts} onChange={e => setLinkDrafts(e.target.checked)} />{t('The temporary pain reports and messages on this device belong to this patient. They may be reviewed for this visit.', 'Laporan sakit dan mesej sementara pada peranti ini milik pesakit ini. Ia boleh disemak untuk lawatan ini.')}</label>}
            </>}
            {handoffPending && <p role="status">{t('Visit saved. Sign out to return the device to the patient.', 'Lawatan disimpan. Log keluar untuk mengembalikan peranti kepada pesakit.')}</p>}
            {nurse && ending && <p>{t('This clears the device and signs you out. Saved records remain, and the consultation status does not change.', 'Ini mengosongkan peranti dan melog keluar. Rekod tersimpan kekal dan status konsultasi tidak berubah.')}</p>}
          </section>
        )}
        {(phase === 'registered' || (current && phase !== 'nurse')) && current && (
          <section className="space-y-4 text-center">
            <p className="text-xl font-bold text-yes">{t('Registration confirmed', 'Pendaftaran disahkan')}</p>
            <p>{current.patient_name}</p>
            <p className="text-5xl font-extrabold text-brand-ink">{current.queue_number}</p>
            <p>{current.visit_date}{current.consultation_room && ` · ${t('Room', 'Bilik')} ${current.consultation_room}`}</p>
            <p>{t('Use the separate Pain button whenever needed, then review your summary.', 'Guna butang Sakit bila diperlukan, kemudian semak ringkasan anda.')}</p>
            <div className="flex flex-wrap justify-center gap-3">
              <button className={btnPrimary} onClick={() => { close(); useBoard.getState().setModal('pain') }}>{t('Report pain', 'Lapor sakit')}</button>
              <button className={btnAlt} onClick={() => set({ registrationOpen: false, summaryOpen: true })}>{t('Review my summary', 'Semak ringkasan saya')}</button>
              <button className={btnAlt} onClick={close}>{t('Use AAC / Skip for now', 'Guna AAC / Langkau dahulu')}</button>
            </div>
            <button className="min-h-12 underline text-muted" onClick={() => void openNurse(true)}>{t('Nurse: finish patient session', 'Jururawat: tamatkan sesi pesakit')}</button>
          </section>
        )}
      </div>
      <div className={sheetFoot}>
        {!current && phase === 'edit' && <button className={btnPrimary} type="submit" form="registrationForm">{t('Continue to review', 'Teruskan untuk semakan')}</button>}
        {!current && (phase === 'review' || phase === 'waiting') && <button className={btnAlt} onClick={edit}>{t('Edit details', 'Ubah butiran')}</button>}
        {!current && phase === 'review' && <button className={btnPrimary} onClick={() => set({ registrationPhase: 'waiting' })}>{t('Submit to nurse', 'Serah kepada jururawat')}</button>}
        {!current && phase === 'waiting' && <button className={btnPrimary} disabled={busy} onClick={() => void openNurse()}>{t('Nurse: confirm registration', 'Jururawat: sahkan pendaftaran')}</button>}
        {phase === 'nurse' && !current && !handoffPending && <button className={btnAlt} disabled={busy} onClick={() => { setBusy(true); visitApi('/auth/logout', {}).then(() => { setNurse(false); edit() }).catch(fail).finally(() => setBusy(false)) }}>{t('Back to registration details', 'Kembali ke butiran pendaftaran')}</button>}
        {phase === 'nurse' && !nurse && <button className={btnPrimary} disabled={busy} type="submit" form="registrationLogin">{t('Nurse sign in', 'Log masuk jururawat')}</button>}
        {phase === 'nurse' && nurse && !ending && !handoffPending && <button className={btnPrimary} disabled={busy || !identity || !lookedUp || (items.length > 0 && !linkDrafts)} onClick={() => void confirm()}>{t('Confirm registration and return to patient', 'Sahkan pendaftaran dan kembali kepada pesakit')}</button>}
        {phase === 'nurse' && nurse && handoffPending && <button className={btnPrimary} disabled={busy} onClick={() => { setBusy(true); handBack().catch(fail).finally(() => setBusy(false)) }}>{t('Sign out and return to patient', 'Log keluar dan kembali kepada pesakit')}</button>}
        {phase === 'nurse' && nurse && ending && <button className={btnPrimary} disabled={busy} onClick={() => void finish()}>{t('Finish and clear device', 'Tamat dan kosongkan peranti')}</button>}
      </div>
    </Sheet>
  )
}
