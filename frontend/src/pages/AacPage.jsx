import { useEffect, useRef, useState } from 'react'

export const title = 'AAC'
export const order = 20

// Module B communication board. Owner: Yee Han
// A separate document preserves this board's design without changing Module A styles.
//
// The board is a full-screen app, so the frame is made exactly as tall as the room left under the menu.
// That way the page itself never scrolls (no double scrollbar) and the board gets every pixel.
const BOTTOM_GAP = 8

export default function AacPage() {
  const frame = useRef(null)
  const [height, setHeight] = useState(null)

  useEffect(() => {
    function fit() {
      if (!frame.current) return
      const top = frame.current.getBoundingClientRect().top + window.scrollY
      setHeight(Math.max(360, Math.floor(window.innerHeight - top - BOTTOM_GAP)))
    }
    const first = requestAnimationFrame(fit) // after the menu has been laid out
    window.addEventListener('resize', fit)
    return () => {
      cancelAnimationFrame(first)
      window.removeEventListener('resize', fit)
    }
  }, [])

  return (
    <iframe
      ref={frame}
      title="Signova AAC communication board"
      src={`${import.meta.env.BASE_URL}aac-board.html`}
      className="relative block w-full rounded-xl border border-slate-200 bg-white"
      style={{
        width: 'calc(100vw - 32px)',
        left: '50%',
        transform: 'translateX(-50%)',
        // -16px / -24px: use the space the page padding wastes above and below the board
        marginTop: -16,
        marginBottom: -24,
        height: height ?? 'calc(100dvh - 110px)',
        minHeight: 360,
      }}
    />
  )
}
