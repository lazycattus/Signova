import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

export const title = 'Nurse login'
export const order = 40

async function authRequest(path, options = {}) {
  const response = await fetch(`/api/auth/${path}`, {
    credentials: 'same-origin',
    ...options,
  })

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    const error = new Error(data.error || 'Request failed. Please try again.')
    error.status = response.status
    throw error
  }

  return data
}

async function submitAuth(path, body = {}) {
  const { csrf_token } = await authRequest('csrf')

  return authRequest(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRFToken': csrf_token,
    },
    body: JSON.stringify(body),
  })
}

export default function NurseLoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [account, setAccount] = useState(null)
  const [checking, setChecking] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true

    authRequest('me')
      .then((data) => {
        if (active) setAccount(data.user)
      })
      .catch((err) => {
        if (active && err.status !== 401) {
          setError('Cannot connect to the backend. Check that Flask is running.')
        }
      })
      .finally(() => {
        if (active) setChecking(false)
      })

    return () => {
      active = false
    }
  }, [])

  async function handleLogin(event) {
    event.preventDefault()
    if (busy) return

    setBusy(true)
    setError('')

    try {
      const data = await submitAuth('login', {
        username: username.trim(),
        password,
      })
      setAccount(data.user)
    } catch (err) {
      setAccount(null)
      setError(err.message)
    } finally {
      setPassword('')
      setBusy(false)
    }
  }

  async function handleLogout() {
    if (busy) return

    setBusy(true)
    setError('')

    try {
      await submitAuth('logout')
      setAccount(null)
      if (typeof BroadcastChannel !== 'undefined') {
        const channel = new BroadcastChannel('signova-nurse-session')
        channel.postMessage('logout')
        channel.close()
      }
      setUsername('')
      setPassword('')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (checking) {
    return <p role="status">Checking login… / Menyemak log masuk…</p>
  }

  const inputClass = 'w-full rounded-lg border border-slate-300 p-3'
  const buttonClass =
    'w-full rounded-lg bg-blue-700 px-5 py-3 font-semibold text-white disabled:opacity-50'

  return (
    <section className="mx-auto max-w-md space-y-5 rounded-xl border border-slate-200 bg-white p-6">
      <div>
        <h1 className="text-2xl font-bold">Nurse / Admin login</h1>
        <p className="mt-1 text-slate-600">
          Log masuk jururawat / pentadbir
        </p>
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-700">
          {error}
        </p>
      )}

      {account ? (
        <div className="space-y-4">
          <p role="status" className="rounded-lg bg-green-50 p-3 text-green-800">
            Login successful / Berjaya log masuk
          </p>

          <dl className="space-y-2">
            <div>
              <dt className="text-sm text-slate-600">Name / Nama</dt>
              <dd className="font-semibold">{account.display_name}</dd>
            </div>
            <div>
              <dt className="text-sm text-slate-600">Role / Peranan</dt>
              <dd>
                {account.role === 'admin'
                  ? 'Administrator / Pentadbir'
                  : 'Nurse / Jururawat'}
              </dd>
            </div>
          </dl>

          <Link to="/nurse-dashboard" className="block rounded-lg bg-teal-700 px-5 py-3 text-center font-semibold text-white">Open patient dashboard</Link>

          <button
            type="button"
            onClick={handleLogout}
            disabled={busy}
            className={buttonClass}
          >
            {busy ? 'Please wait…' : 'Sign out / Log keluar'}
          </button>
        </div>
      ) : (
        <form onSubmit={handleLogin}>
          <fieldset disabled={busy} className="space-y-4">
            <div className="space-y-1">
              <label htmlFor="nurse-username" className="block font-medium">
                Username / Nama pengguna
              </label>
              <input
                id="nurse-username"
                autoComplete="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                maxLength={80}
                required
                className={inputClass}
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="nurse-password" className="block font-medium">
                Password / Kata laluan
              </label>
              <input
                id="nurse-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                maxLength={1024}
                required
                className={inputClass}
              />
            </div>

            <button type="submit" disabled={busy} className={buttonClass}>
              {busy ? 'Signing in…' : 'Log in / Log masuk'}
            </button>
          </fieldset>
        </form>
      )}
    </section>
  )
}