import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

export const title = 'Patient dashboard'
export const order = 45
export const path = '/nurse-dashboard'

const panel = 'rounded-2xl border border-slate-200 bg-white p-5 shadow-sm'
const button = 'inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50'
const empty = 'Not answered'
const myt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kuala_Lumpur', hour: '2-digit', minute: '2-digit' })
function today() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const value = type => parts.find(p => p.type === type).value
  return `${value('year')}-${value('month')}-${value('day')}`
}
function time(value) { return value ? myt.format(new Date(value)) : empty }

async function api(url, options = {}) {
  const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store', ...options })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(body.error || 'Cannot load records. Check that the backend is running on port 5002.')
    error.status = response.status
    throw error
  }
  return body
}

export default function NurseDashboardPage() {
  const authEpoch = useRef(0)
  const [date, setDate] = useState(today)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [unauthorized, setUnauthorized] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const [selected, setSelected] = useState(null)
  const [search, setSearch] = useState('')
  const [summaryFilter, setSummaryFilter] = useState('all')
  const [loggingOut, setLoggingOut] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    const epoch = authEpoch.current
    api(`/api/dashboard/daily?date=${encodeURIComponent(date)}`, { signal: controller.signal })
      .then(result => { if (epoch === authEpoch.current) { setData(result); setUnauthorized(false) } })
      .catch(err => {
        if (err.name === 'AbortError' || epoch !== authEpoch.current) return
        setData(null)
        setUnauthorized(err.status === 401 || err.status === 403)
        setError(err.message)
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [date, refresh])

  useEffect(() => {
    // Recheck access while open, after returning to the tab, or after logout in
    // another same-origin tab. No patient records are stored in browser storage.
    const check = () => {
      api('/api/auth/nurse-access').catch(err => {
        authEpoch.current += 1
        setData(null); setSelected(null)
        setUnauthorized(err.status === 401 || err.status === 403)
        setError(err.message)
      })
    }
    const timer = window.setInterval(check, 30000)
    const clear = () => { authEpoch.current += 1; setData(null); setSelected(null); setUnauthorized(true) }
    const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('signova-nurse-session') : null
    if (channel) channel.onmessage = event => { if (event.data === 'logout') clear() }
    window.addEventListener('focus', check)
    return () => { window.clearInterval(timer); window.removeEventListener('focus', check); channel?.close() }
  }, [])

  function reload() { setLoading(true); setError(''); setData(null); setSelected(null); setRefresh(n => n + 1) }
  function changeDate(value) { if (!value) return; setDate(value); setData(null); setSelected(null); setError(''); setLoading(true) }
  async function logout() {
    authEpoch.current += 1
    setLoggingOut(true)
    try {
      const { csrf_token } = await api('/api/auth/csrf')
      await api('/api/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf_token }, body: '{}' })
      setData(null); setSelected(null); setUnauthorized(true); setError('')
      if (typeof BroadcastChannel !== 'undefined') {
        const channel = new BroadcastChannel('signova-nurse-session'); channel.postMessage('logout'); channel.close()
      }
    } catch (err) { setData(null); setSelected(null); setError(err.message) }
    finally { setLoggingOut(false) }
  }

  const rows = data?.visits.filter(row => {
    const match = `${row.patient_name} ${row.queue_number}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())
    return match && (summaryFilter === 'all' || (summaryFilter === 'confirmed' ? row.summary_version !== null : row.summary_version === null))
  }) ?? []
  const current = data?.visits.find(row => row.id === selected)
  const hours = data?.registrations_by_hour.filter(row => row.visits > 0) ?? []
  const maxHour = Math.max(1, ...hours.map(row => row.visits))
  const maxSymptom = Math.max(1, ...(data?.common_symptoms.map(row => row.visits) ?? []))

  return <section className="mx-auto max-w-7xl space-y-6 p-2 text-slate-800 sm:p-4">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-sm font-bold uppercase tracking-widest text-teal-700">Module B · Nurse workspace</p>
        <h1 className="mt-2 text-3xl font-bold">Daily patient dashboard</h1>
        <p className="mt-2 text-slate-600">Saved visits and patient-confirmed summaries · Malaysia time (MYT)</p></div>
      {data && <button className={button} disabled={loggingOut} onClick={logout}>{loggingOut ? 'Signing out…' : 'Sign out'}</button>}
    </header>
    {unauthorized ? <div className={panel}><h2 className="text-xl font-bold">Nurse sign-in required</h2><p className="my-3">Sign in with your nurse or administrator account to view patient records.</p><Link className={button} to="/nurse-login">Go to nurse login</Link><button className={`${button} ml-2`} onClick={reload}>Check access again</button></div> : <>
      <div className={`${panel} flex flex-wrap items-end gap-4`}>
        <label className="space-y-1"><span className="block text-sm font-semibold">Visit date (MYT)</span><input type="date" className="min-h-11 rounded-lg border border-slate-300 px-3" value={date} onChange={event => changeDate(event.target.value)} /></label>
        <button className={button} disabled={loading} onClick={reload}>Refresh saved records</button>
        {data && <a className={`${button} sm:ml-auto`} href={`/api/dashboard/daily/print?date=${encodeURIComponent(data.date)}`} target="_blank" rel="noopener noreferrer">Daily report · Print / PDF</a>}
      </div>
      {loading && <p role="status" className={panel}>Loading saved records…</p>}
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">{error}</p>}
      {data && <>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{[
          ['Total visits', data.metrics.visits], ['Unique patients', data.metrics.unique_patients], ['Confirmed summaries', data.metrics.confirmed], ['Awaiting summary', data.metrics.pending], ['Visits with pain reported', data.metrics.with_pain],
        ].map(([label, value]) => <div key={label} className={panel}><p className="text-sm font-medium text-slate-600">{label}</p><p className="mt-3 text-4xl font-bold text-teal-800">{value}</p></div>)}</div>
        <div className="grid gap-5 lg:grid-cols-2">
          <section className={panel}><h2 className="text-lg font-bold">Registrations by hour</h2><p className="mb-4 text-sm text-slate-500">Registration timestamps shown in MYT.</p>
            {hours.length ? <ul className="space-y-2">{hours.map(row => <li key={row.hour} className="grid grid-cols-[3.5rem_1fr_2rem] items-center gap-3 text-sm"><span>{row.hour}</span><div className="h-3 overflow-hidden rounded-full bg-slate-100" aria-hidden="true"><div className="h-full rounded-full bg-teal-600" style={{ width: `${row.visits / maxHour * 100}%` }} /></div><b>{row.visits}</b></li>)}</ul> : <p>No visits on this date.</p>}
          </section>
          <section className={panel}><h2 className="text-lg font-bold">Commonly reported symptoms</h2><p className="mb-4 text-sm text-slate-500">Top 8 exact reported labels · counted once per visit · latest confirmed summaries.</p>
            {data.common_symptoms.length ? <ul className="space-y-3">{data.common_symptoms.map(row => <li key={row.label}><div className="mb-1 flex justify-between gap-4 text-sm"><span className="break-words">{row.label}</span><b>{row.visits}</b></div><div className="h-2 rounded-full bg-slate-100" aria-hidden="true"><div className="h-full rounded-full bg-blue-600" style={{ width: `${row.visits / maxSymptom * 100}%` }} /></div></li>)}</ul> : <p>No symptoms confirmed for this date.</p>}
          </section>
        </div>
        <section className={panel}>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-4"><div><h2 className="text-xl font-bold">Patient visits</h2><p className="mt-1 text-sm text-slate-500">All registered visit statuses included. Unconfirmed drafts are excluded.</p></div>
            <div className="flex flex-wrap gap-3"><label className="text-sm font-medium">Search name or queue<input className="mt-1 block min-h-11 rounded-lg border border-slate-300 px-3" value={search} onChange={e => setSearch(e.target.value)} /></label>
              <label className="text-sm font-medium">Summary status<select className="mt-1 block min-h-11 rounded-lg border border-slate-300 px-3" value={summaryFilter} onChange={e => setSummaryFilter(e.target.value)}><option value="all">All summaries</option><option value="confirmed">Confirmed</option><option value="pending">Not submitted</option></select></label></div>
          </div>
          <p className="mb-2 text-sm text-slate-600">Showing {rows.length} of {data.metrics.visits} visits. Cards, charts and daily PDF use the full selected day.</p>
          <div className="overflow-x-auto"><table className="w-full text-left text-sm"><caption className="sr-only">Saved visits for {data.date}</caption><thead className="border-b border-slate-200 bg-slate-50"><tr>{['Queue / Patient', 'Registered', 'Symptoms reported', 'Pain reported', 'Summary', 'Details'].map(label => <th scope="col" key={label} className="px-3 py-3">{label}</th>)}</tr></thead>
            <tbody>{rows.map(row => <tr key={row.id} className="border-b border-slate-100 align-top"><td className="px-3 py-4"><b className="text-teal-800">{row.queue_number}</b><p className="mt-1 font-semibold">{row.patient_name}</p><p className="mt-1 text-xs text-slate-500">IC: {row.masked_ic ?? empty} · {row.status}</p></td><td className="whitespace-nowrap px-3 py-4">{time(row.registered_at)}</td><td className="max-w-xs px-3 py-4">{row.symptoms.map(s => s.en).join('; ') || empty}</td><td className="max-w-xs px-3 py-4">{row.pain.map(p => `${p.site}: ${p.score}/10`).join('; ') || empty}</td><td className="px-3 py-4">{row.summary_version ? <span className="rounded-full bg-teal-50 px-2 py-1 text-teal-800">Confirmed · v{row.summary_version}</span> : <span className="text-amber-800">Not submitted</span>}</td><td className="px-3 py-4"><button aria-expanded={selected === row.id} className={button} onClick={() => setSelected(selected === row.id ? null : row.id)}>{selected === row.id ? 'Hide' : 'View'}<span className="sr-only"> {row.queue_number}</span></button></td></tr>)}</tbody></table></div>
          {!rows.length && <p className="py-10 text-center text-slate-500">{data.visits.length ? 'No visits match your filters.' : 'No visits registered for this date.'}</p>}
        </section>
        {current && <section className={`${panel} border-teal-300`} aria-labelledby="visit-detail-title"><div className="flex flex-wrap justify-between gap-4"><h2 id="visit-detail-title" className="text-xl font-bold">{current.queue_number} · {current.patient_name}</h2>{current.summary_version ? <a className={button} href={`/patient-report.html?visit=${encodeURIComponent(current.id)}&version=${current.summary_version}`} target="_blank" rel="noopener noreferrer">View Individual Report</a> : <button className={button} disabled title="The patient must confirm a summary first">Summary not submitted</button>}</div>
          <p className="my-3 text-sm text-slate-600">Room: {current.consultation_room ?? empty} · {current.summary_version ? `Confirmed version ${current.summary_version} at ${time(current.confirmed_at)} MYT` : 'Summary not submitted'}</p>
          <h3 className="mt-5 font-bold">Symptoms reported</h3><p>{current.symptoms.map(s => s.en).join('; ') || empty}</p>
          <h3 className="mt-5 font-bold">Pain reported</h3>{current.pain.length ? current.pain.map((pain, index) => <dl key={index} className="my-3 grid grid-cols-[7rem_1fr] gap-2 rounded-xl bg-slate-50 p-4">{['site', 'side', 'score', 'type', 'onset'].map(key => <div className="contents" key={key}><dt className="capitalize text-slate-600">{key}</dt><dd>{pain[key] ?? empty}{key === 'score' ? '/10' : ''}</dd></div>)}</dl>) : <p>{empty}</p>}
          <h3 className="mt-5 font-bold">Other patient messages</h3>{current.answers.some(a => !['pain', 'symptom'].includes(a.kind)) ? <ul className="list-disc space-y-2 pl-5">{current.answers.filter(a => !['pain', 'symptom'].includes(a.kind)).map((a, i) => <li key={i}>{a.say.en}<span className="block text-sm text-slate-500">{a.say.bm}</span></li>)}</ul> : <p>{empty}</p>}
          <button className={`${button} mt-5`} onClick={() => setSelected(null)}>Close details</button>
        </section>}
        <footer className="text-sm text-slate-500">Snapshot updated at {time(data.generated_at)} MYT. Refresh to include newly saved answers. Blank answers mean “Not answered”; these reports do not generate diagnoses. PDF opens a printable saved-record report in a new tab; choose Save as PDF.</footer>
      </>}
    </>}
  </section>
}
