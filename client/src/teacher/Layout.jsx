import { useEffect, useState } from 'react'
import { Navigate, NavLink, Outlet } from 'react-router-dom'
import {
  BarChart3, Bell, Clock, FileText, LayoutGrid, LogOut, Menu, Monitor, Printer, Server, Settings, ShieldCheck, X, Zap,
} from 'lucide-react'
import { LogoMark } from '../ui/Logo.jsx'
import { useAuth } from './auth.jsx'

const NAV = [
  {
    section: 'Teach',
    items: [
      { to: 'dashboard', label: 'Dashboard', icon: LayoutGrid },
      { to: 'setup', label: 'Session Setup', icon: Settings },
      { to: 'live', label: 'Live Session', icon: Zap },
      { to: 'moderation', label: 'Moderation', icon: ShieldCheck },
    ],
  },
  {
    section: 'Hardware',
    items: [
      { to: 'print', label: 'Print Management', icon: Printer },
      { to: 'kiosk', label: 'Kiosk Management', icon: Server },
    ],
  },
  {
    section: 'Insights',
    items: [
      { to: 'logs', label: 'Activity Logs', icon: Clock },
      { to: 'analytics', label: 'Analytics', icon: BarChart3 },
      { to: 'reports', label: 'Reports', icon: FileText },
    ],
  },
  { section: 'System', items: [{ to: 'settings', label: 'Settings', icon: Settings }] },
]

// Header + side menu around every signed-in page. On phones the menu is a
// drawer; on wide screens it stays open on the left.
export default function Layout() {
  const { token, teacher, signOut, live } = useAuth()
  const [open, setOpen] = useState(false)

  // The live connection is refused once the login expires.
  useEffect(() => { if (live.error === 'Not allowed') signOut() }, [live.error, signOut])

  if (!token) return <Navigate to="/teacher/login" replace />

  const initials = (teacher?.displayName ?? 'T').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()

  return (
    <div className={`t-app ${open ? 'is-menu-open' : ''}`}>
      <aside className="t-side" aria-label="Main menu">
        <div className="t-side__head">
          <span className="t-side__logo"><LogoMark size={34} /> WishPix</span>
          <button className="t-side__close" onClick={() => setOpen(false)} aria-label="Close menu"><X size={20} /></button>
        </div>
        <KioskCard live={live} />
        <nav>
          {NAV.map((group) => (
            <div key={group.section} className="t-side__group">
              <p>{group.section}</p>
              {group.items.map(({ to, label, icon: Icon }) => (
                <NavLink key={to} to={`/teacher/${to}`} onClick={() => setOpen(false)} className={({ isActive }) => `t-side__link ${isActive ? 'is-active' : ''}`}>
                  <Icon size={18} /> {label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="t-side__foot">
          <span className="t-avatar t-avatar--soft">WP</span>
          <div><b>WishPix Teacher</b><small>System v2.4.1</small></div>
          <button className="t-side__logout" onClick={signOut} aria-label="Sign out" title="Sign out"><LogOut size={18} /></button>
        </div>
      </aside>
      <div className="t-scrim" onClick={() => setOpen(false)} />

      <div className="t-main">
        <header className="t-top">
          <button className="t-top__menu" onClick={() => setOpen(true)} aria-label="Open menu"><Menu size={24} /></button>
          <span className="t-top__brand">WishPix<i /></span>
          <button className="t-top__bell" aria-label="Notifications"><Bell size={22} /><i /></button>
          <span className="t-avatar" title={teacher?.displayName}>{initials}</span>
        </header>
        <main className="t-page">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

function KioskCard({ live }) {
  const online = live.state?.kioskOnline
  return (
    <div className="t-side__kiosk">
      <Monitor size={20} />
      <div>
        <small>Connected kiosk</small>
        <b>{live.state?.kioskName ?? 'Kiosk'}</b>
        <span>{online ? 'Online' : 'Offline'}</span>
      </div>
      <i className={online ? 'is-on' : ''} />
    </div>
  )
}
