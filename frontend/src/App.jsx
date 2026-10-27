import { useState } from 'react'
import HandCamera from './components/HandCamera'
import { speak } from './lib/speak'

function App() {
  const [lang, setLang] = useState('en-US')
  const [landmarkCount, setLandmarkCount] = useState(0)

  return (
    <main className="flex min-h-screen flex-col items-center gap-6 bg-slate-50 p-6">
      <header className="text-center">
        <h1 className="text-3xl font-bold text-slate-800">Signova</h1>
        <p className="text-slate-500">Real-time BIM sign language recognition</p>
      </header>

      <HandCamera onLandmarks={(hand) => setLandmarkCount(hand.length)} />

      <p className="text-sm text-slate-500">
        Landmarks tracked: <strong>{landmarkCount}</strong> / 21
      </p>

      <div className="flex items-center gap-3">
        <select
          value={lang}
          onChange={(e) => setLang(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2"
        >
          <option value="en-US">English</option>
          <option value="ms-MY">Bahasa Malaysia</option>
        </select>
        <button
          type="button"
          onClick={() =>
            speak(lang === 'ms-MY' ? 'Saya perlukan bantuan' : 'I need help', lang)
          }
          className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700"
        >
          Test speech
        </button>
      </div>
    </main>
  )
}

export default App
