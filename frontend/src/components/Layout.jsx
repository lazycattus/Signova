import { NavLink, Outlet } from 'react-router-dom'
import { pages } from '../lib/pages'

// Shared frame around every page: top bar + the page itself.
export default function Layout() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <header className="border-b border-slate-200 bg-white">
        <nav className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <span className="text-lg font-bold">Signova</span>
          {pages.map((p) => (
            <NavLink
              key={p.path}
              to={p.path}
              end
              className={({ isActive }) =>
                `text-sm ${isActive ? 'font-semibold text-blue-600' : 'text-slate-600 hover:text-slate-900'}`
              }
            >
              {p.title}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
