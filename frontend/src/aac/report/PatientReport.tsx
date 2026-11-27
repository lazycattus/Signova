import { useEffect, useRef, useState } from 'react'
import { visitApi, ApiError } from '../lib/visitApi.ts'
import type { PatientAnswer } from '../lib/patientReview.ts'
import type { MapFrame } from './renderBodyMap.ts'

type Pain = NonNullable<PatientAnswer['pain']>
type Report = {
  report_id: string; generated_at: string; model_version: string
  visit: { id: string; patient_name: string; masked_ic: string | null; visit_date: string; queue_number: string; consultation_room: string | null; registered_at: string; confirmed_at: string; summary_version: number; symptoms: { en: string; bm: string }[]; pain: Pain[]; answers: PatientAnswer[] }
}
const missing = 'Not answered'
const formatTime = (value: string) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kuala_Lumpur', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) + ' MYT'

export function PatientReport() {
  const [data, setData] = useState<Report | null>(null)
  const [error, setError] = useState('')
  const [frames, setFrames] = useState<MapFrame[]>([])
  const [mapError, setMapError] = useState('')
  const [mapBusy, setMapBusy] = useState(false)
  const [imagesReady, setImagesReady] = useState(false)
  const [retry, setRetry] = useState(0)
  const [textOnly, setTextOnly] = useState(false)
  const revoked = useRef(false)
  const epoch = useRef(0)

  useEffect(() => {
    let active = true
    const query = new URLSearchParams(window.location.search), id = query.get('visit'), version = query.get('version')
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) { queueMicrotask(() => setError('A valid visit is required. Open the report through Patient Details.')); return }
    visitApi<Report>(`/dashboard/visits/${encodeURIComponent(id)}/report${version ? `?version=${encodeURIComponent(version)}` : ''}`)
      .then(result => { if (active && !revoked.current) setData(result) })
      .catch(err => { if (active) setError(err instanceof Error ? err.message : 'Could not load the report.') })
    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true
    const clear = () => {
      revoked.current = true; epoch.current += 1
      setData(null); setFrames([]); setImagesReady(false); setMapBusy(false)
      setError('Report locked. Sign in and reopen it from Patient Details.')
    }
    const check = () => visitApi('/auth/nurse-access').catch(() => { if (active) clear() })
    const timer = window.setInterval(check, 30000)
    const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('signova-nurse-session') : null
    if (channel) channel.onmessage = event => { if (event.data === 'logout') clear() }
    window.addEventListener('focus', check)
    return () => { active = false; window.clearInterval(timer); window.removeEventListener('focus', check); channel?.close() }
  }, [])

  useEffect(() => {
    if (!data) return
    const controller = new AbortController(), generation = epoch.current
    const entries = data.visit.pain.flatMap((pain, i) => pain.region?.model_version === 'signova-body-v1' ? [{ number: i + 1, region: pain.region }] : [])
    if (!entries.length) return
    queueMicrotask(() => { if (!controller.signal.aborted) { setMapBusy(true); setMapError(''); setFrames([]); setImagesReady(false); setTextOnly(false) } })
    import('./renderBodyMap.ts').then(module => module.renderBodyMap(entries, controller.signal))
      .then(result => { if (!controller.signal.aborted && epoch.current === generation && !revoked.current) setFrames(result) })
      .catch(err => { if (!controller.signal.aborted) setMapError(err instanceof Error ? err.message : 'Body-map images could not load.') })
      .finally(() => { if (!controller.signal.aborted) setMapBusy(false) })
    return () => controller.abort()
  }, [data, retry])

  async function printReport() {
    try {
      await visitApi('/auth/nurse-access')
      if (!revoked.current) window.print()
    } catch (err) {
      revoked.current = true; epoch.current += 1; setData(null); setFrames([])
      setError(err instanceof ApiError ? err.message : 'Cannot verify nurse access. Please reopen the report.')
    }
  }

  const hasRegion = data?.visit.pain.some(p => p.region?.model_version === 'signova-body-v1') ?? false
  const mapReady = !hasRegion || (!mapBusy && frames.length > 0 && imagesReady) || textOnly
  const visit = data?.visit
  return <>
    <div className="report-toolbar"><a href="/nurse-dashboard">← Patient dashboard</a><span>Individual report preview</span><button disabled={!data || !mapReady} onClick={() => void printReport()}>Print / Save as PDF</button><p>Choose “Save as PDF” in the print dialog. Enable browser headers/footers for page numbers. Close this tab before handing the device back.</p></div>
    {error ? <div role="alert" className="report-error">{error} <a href="/nurse-login">Nurse login</a></div> : !data || !visit ? <p role="status" className="report-loading">Loading confirmed patient report…</p> : <article className="report-paper">
      <header className="document-header"><div><div className="brand">SIGNOVA <span>PROTOTYPE</span></div><h1>Patient Communication Report</h1><p className="subtitle">Patient-reported information · Module B AAC</p></div><div className="report-reference"><b>CONFIRMED · V{visit.summary_version}</b><span>Report ID</span><code>{data.report_id}</code></div></header>
      <section className="report-section identity"><h2>01 <span>Patient & visit details</span></h2><dl><div><dt>Patient name</dt><dd>{visit.patient_name}</dd></div><div><dt>Identification (masked)</dt><dd>{visit.masked_ic ?? missing}</dd></div><div><dt>Visit date</dt><dd>{visit.visit_date}</dd></div><div><dt>Queue number</dt><dd>{visit.queue_number}</dd></div><div><dt>Consultation room</dt><dd>{visit.consultation_room ?? missing}</dd></div><div><dt>Registration time</dt><dd>{formatTime(visit.registered_at)}</dd></div></dl></section>
      <section className="report-section"><h2>02 <span>Symptoms reported</span></h2>{visit.symptoms.length ? <ul className="patient-messages">{visit.symptoms.map((symptom, i) => <li key={i}>{symptom.en}<small lang="ms">{symptom.bm}</small></li>)}</ul> : <p>{missing}</p>}</section>
      <section className="report-section"><h2>03 <span>Reported pain · body map</span></h2>
        {!visit.pain.length ? <p>Pain not reported in this confirmed summary.</p> : <>
          <p className="map-explainer">Highlighted regions match saved selections. P1, P2… refer to the pain table. Markers identify approximate regions, not exact tap positions. Left/right refer to the patient.</p>
          {mapBusy && <p role="status" className="map-warning">Body-map images are still rendering. Wait for the images before printing this report.</p>}
          {mapError && <div className="report-error no-print"><p>Body map unavailable: {mapError}</p><button onClick={() => setRetry(n => n + 1)}>Retry body map</button><label><input type="checkbox" checked={textOnly} onChange={e => setTextOnly(e.target.checked)} /> Print text-only report with an explicit missing-image note</label></div>}
          {textOnly && <p className="map-warning">Body-map images unavailable. Refer to the patient-reported location table below.</p>}
          {!textOnly && frames.map((frame, i) => <figure className="body-map-pair" key={i}><div className="body-map-images"><img src={frame.front} alt={`Front body regions for ${frame.numbers.map(n => 'P' + n).join(', ')}`} onLoad={() => { void Promise.all(Array.from(document.querySelectorAll<HTMLImageElement>('.body-map-images img')).map(img => img.decode())).then(() => setImagesReady(true)).catch(() => setMapError('Body-map image could not be decoded.')) }} /><img src={frame.back} alt="Back body regions with matching numbered markers" onLoad={() => { void Promise.all(Array.from(document.querySelectorAll<HTMLImageElement>('.body-map-images img')).map(img => img.decode())).then(() => setImagesReady(true)).catch(() => setMapError('Body-map image could not be decoded.')) }} /></div><figcaption>Selected regions: {frame.numbers.map(n => `P${n}`).join(', ')}. Highlighting is a region guide, not a severity heatmap.{frame.unmapped.length > 0 && ` Geometry unavailable for ${frame.unmapped.map(n => 'P' + n).join(', ')}; refer to the table.`}</figcaption></figure>)}
          {visit.pain.some(p => !p.region) && <p className="map-warning">{visit.pain.flatMap((p, i) => !p.region ? [`P${i + 1}`] : []).join(', ')}: body-map location data was not saved in this older summary. Locations are shown as text without inferred markers.</p>}
        </>}
      </section>
      <section className="report-section"><h2>04 <span>Pain details</span></h2>{visit.pain.length ? <div className="pain-table-wrap"><table className="pain-table"><thead><tr>{['Marker', 'Location', 'Side', 'Score', 'Type', 'Started'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead><tbody>{visit.pain.map((pain, i) => <tr key={i}><th scope="row">P{i + 1}</th><td>{pain.site}</td><td>{pain.side ?? missing}</td><td className="score">{pain.score}/10</td><td>{pain.type ?? missing}</td><td>{pain.onset ?? missing}</td></tr>)}</tbody></table></div> : <p>{missing}</p>}</section>
      <section className="report-section"><h2>05 <span>Other patient communication</span></h2>{visit.answers.some(a => !['pain', 'symptom'].includes(a.kind)) ? <ul className="patient-messages">{visit.answers.filter(a => !['pain', 'symptom'].includes(a.kind)).map((answer, i) => <li key={i}>{answer.say.en}<small lang="ms">{answer.say.bm}</small></li>)}</ul> : <p>{missing}</p>}</section>
      <footer className="document-footer"><div><b>Patient-confirmed summary</b><p>Version {visit.summary_version} · Confirmed {formatTime(visit.confirmed_at)}</p><p>Report generated {formatTime(data.generated_at)}</p></div><p>This report reproduces confirmed patient answers and does not provide a diagnosis. Missing answers mean “Not answered”, not “No”.</p><small>Body-map model: {data.model_version} · Z-Anatomy (CC BY-SA 4.0) / BodyParts3D © DBCLS (CC BY-SA 2.1 JP). Model source and notices: /aac-models/README.md.</small></footer>
    </article>}
  </>
}
