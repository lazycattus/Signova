export const title = 'AAC'
export const order = 20

// Module B communication board. Owner: Yee Han
// A separate document preserves this board's design without changing Module A styles.
export default function AacPage() {
  return (
    <iframe
      title="Signova AAC communication board"
      src={`${import.meta.env.BASE_URL}aac-board.html`}
      className="relative block w-full rounded-xl border border-slate-200 bg-white"
      style={{ width: 'calc(100vw - 32px)', left: '50%', transform: 'translateX(-50%)', height: 'calc(100dvh - 110px)', minHeight: 360 }}
    />
  )
}
