import { useEffect, useState, type ReactNode } from 'react'
import { useBoard } from '../store.ts'

type Access = 'checking' | 'allowed' | 'blocked'

export function NurseGate({ children }: { children: ReactNode }) {
  const [access, setAccess] = useState<Access>('checking')
  const [message, setMessage] = useState('')

  useEffect(() => {
    let active = true
    let controller: AbortController | null = null

    async function checkAccess() {
      controller?.abort()
      const current = new AbortController()
      controller = current

      try {
        const response = await fetch('/api/auth/nurse-access', {
          credentials: 'same-origin',
          cache: 'no-store',
          signal: current.signal,
        })

        const data = await response.json()

        if (!active || current.signal.aborted) return

        if (
          response.ok &&
          ['admin', 'staff'].includes(data.user?.role)
        ) {
          setAccess('allowed')
        } else {
          setMessage(
            response.status === 401
              ? 'Please sign in / Sila log masuk.'
              : 'Nurse access could not be confirmed.',
          )
          setAccess('blocked')
        }
      } catch {
        if (!active || current.signal.aborted) return
        setMessage('Cannot check access. Check that Flask is running.')
        setAccess('blocked')
      }
    }

    void checkAccess()
    const timer = window.setInterval(() => void checkAccess(), 30000)
    const onFocus = () => void checkAccess()
    window.addEventListener('focus', onFocus)

    return () => {
      active = false
      controller?.abort()
      window.clearInterval(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  if (access === 'allowed') return <>{children}</>

  function openLogin() {
    const target = window.top ?? window
    target.location.assign(`${import.meta.env.BASE_URL}nurse-login`)
  }

  return (
    <section className="fixed inset-0 z-55 grid place-items-center bg-bg p-5">
      <div className="w-full max-w-md space-y-4 rounded-xl border border-line bg-surface p-6">
        <h2 className="text-xl font-bold">
          Nurse access / Akses jururawat
        </h2>

        <p role="status">
          {access === 'checking' ? 'Checking login…' : message}
        </p>

        {access === 'blocked' && (
          <button
            type="button"
            onClick={openLogin}
            className="w-full rounded-lg bg-brand px-4 py-3 font-bold text-on-brand"
          >
            Open login / Buka log masuk
          </button>
        )}

        <button
          type="button"
          onClick={() => useBoard.getState().setStaffOpen(false)}
          className="w-full rounded-lg border border-line px-4 py-3"
        >
          Back to AAC / Kembali ke AAC
        </button>
      </div>
    </section>
  )
}