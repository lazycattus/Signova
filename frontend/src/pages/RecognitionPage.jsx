import { useState } from 'react'
import HandCamera from '../components/HandCamera'
import { speak } from '../lib/speak'

export const title = 'Recognition'
export const order = 10

// Module A page. This is the working camera demo moved here from App.jsx.
// Replace the layout with the Stitch design, but keep <HandCamera /> and the speak() call.
export default function RecognitionPage() {
  const [lang, setLang] = useState('en-US')
  const [handCount, setHandCount] = useState(0)
  const [featureCount, setFeatureCount] = useState(0)

  return (
    <div className="flex flex-col items-center gap-6">
      <header className="text-center">
        <h1 className="text-3xl font-bold">Recognition</h1>
        <p className="text-slate-500">Real-time BIM sign language recognition</p>
      </header>

      <HandCamera
        onLandmarks={(features, hands) => {
          setFeatureCount(features.length)
          setHandCount(hands)
        }}
      />

      <p className="text-sm text-slate-500">
        Hands: <strong>{handCount}</strong> · Numbers for classifier: <strong>{featureCount}</strong>
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
          onClick={() => speak(lang === 'ms-MY' ? 'Saya perlukan bantuan' : 'I need help', lang)}
          className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700"
        >
          Test speech
        </button>
      </div>
    </div>
  )
}
