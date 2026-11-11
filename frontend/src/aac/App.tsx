import { useEffect } from 'react'
import { useBoard } from './store.ts'
import { cancelSpeech } from './lib/speech.ts'
import { preloadBody } from './lib/preload.ts'
import { Board } from './components/Board.tsx'
import { Composer } from './components/Composer.tsx'
import { IconSprite } from './components/Icon.tsx'
import { FlowModal, PainModal } from './components/Modals.tsx'
import { Alarm, BigDrawing, ClerkView, Footer, NotesDrawer, Toast } from './components/Overlays.tsx'
import { GuideDrawer, IdleGuard } from './components/Guide.tsx'
import { StaffView } from './components/StaffView.tsx'
import { TopBar } from './components/TopBar.tsx'

// Layout idea: fixed zones that never move (message on top, quick replies on the left,
// Emergency bottom-right); only the card area changes.
export function App() {
  const notes = useBoard(s => s.notes)
  const modal = useBoard(s => s.modal)
  const staffOpen = useBoard(s => s.staffOpen)
  const alarm = useBoard(s => s.alarm)
  const clerk = useBoard(s => s.clerk)
  const guide = useBoard(s => s.guide)
  const bigImage = useBoard(s => s.bigImage)

  // Warm the 3D pain map while the board is idle.
  useEffect(() => {
    if (!('requestIdleCallback' in window)) { const t = setTimeout(preloadBody, 2000); return () => clearTimeout(t) } // older Safari
    const id = requestIdleCallback(preloadBody, { timeout: 4000 })
    return () => cancelIdleCallback(id)
  }, [])


  useEffect(() => {
    window.addEventListener('pagehide', cancelSpeech)
    return () => window.removeEventListener('pagehide', cancelSpeech)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const s = useBoard.getState()
      if (s.modal) s.setModal(null)
      else if (s.staffOpen) s.setStaffOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  return (
    <>
      <div className="grid h-full min-w-0 grid-rows-[auto_auto_1fr_auto] max-md:h-auto max-md:min-h-full">
        <TopBar />
        <Composer />
        <Board />
        <Footer />
      </div>
      {modal === 'pain' && <PainModal />}
      {modal && modal !== 'pain' && <FlowModal key={modal} k={modal} />}
      {clerk && <ClerkView />}
      {guide && <GuideDrawer />}
      <IdleGuard />
      {staffOpen && <StaffView />}
      {bigImage && <BigDrawing src={bigImage} />}
      {alarm && <Alarm />}
      {notes && <NotesDrawer />}
      <Toast />
      <IconSprite />
    </>
  )
}
