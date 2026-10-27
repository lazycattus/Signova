// Web Speech API helper. Works in all modern browsers, no install needed.
// lang: "en-US" for English, "ms-MY" for Bahasa Malaysia.
export function speak(text, lang = 'en-US') {
  if (!('speechSynthesis' in window) || !text) return
  window.speechSynthesis.cancel() // stop anything still speaking
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = lang
  window.speechSynthesis.speak(utterance)
}
