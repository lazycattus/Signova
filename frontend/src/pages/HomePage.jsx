import { Link } from 'react-router-dom'

export const title = 'Home'
export const order = 0

// Landing / mode selector. Replace with the Stitch home design.
export default function HomePage() {
  return (
    <section className="text-center">
      <h1 className="text-3xl font-bold">Signova</h1>
      <p className="mt-2 text-slate-500">
        Real-time Bahasa Isyarat Malaysia (BIM) communication for healthcare.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link to="/recognition" className="rounded-lg bg-blue-600 px-5 py-2 font-medium text-white hover:bg-blue-700">
          Deaf user: sign to speech
        </Link>
        <Link to="/aac" className="rounded-lg border border-slate-300 bg-white px-5 py-2 font-medium hover:bg-slate-100">
          Speech-impaired user: communicate
        </Link>
      </div>
    </section>
  )
}
