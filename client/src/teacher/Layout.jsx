import { useEffect, useState } from 'react'
import { Link, Navigate, NavLink, Outlet } from 'react-router-dom'
import {
  BarChart3, Bell, Clock, FileText, LayoutGrid, LogOut, Menu, Monitor, Printer, Server, Settings, ShieldCheck,
  SlidersHorizontal, X, Zap,
} from 'lucide-react'
import { LogoMark } from '../ui/Logo.jsx'
import { useT } from '../i18n/index.jsx'
import { useAuth } from './auth.jsx'

const NAV = [
  {
    section: 'Teach',
    items: [
      { to: 'dashboard', label: 'Dashboard', icon: LayoutGrid },
      { to: 'setup', label: 'Session Setup', icon: Settings },
      { to: 'live', label: 'Live Session', icon: Zap },
      { to: 'moderation', label: 'Moderation', icon: ShieldCheck, badge: (s) => s?.pendingModeration || null },
    ],
  },
  {
    section: 'Hardware',
    items: [
      { to: 'print', label: 'Print Management', icon: Printer, badge: (s) => (s?.printer?.problem ? '!' : null) },
      { to: 'kiosk', label: 'Kiosk Management', icon: Server, badge: (s) => (s && !s.kioskOnline ? '!' : null) },
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
  { section: 'System', items: [{ to: 'settings', label: 'Settings', icon: SlidersHorizontal }] },
]

// Header + side menu around every signed-in page. On phones the menu is a
// drawer; on wide screens it stays open on the left.
export default function Layout() {
  const { token, teacher, signOut, live } = useAuth()
  const t = useT()
  const [open, setOpen] = useState(false)

  // The live connection is refused once the login expires.
  useEffect(() => { if (live.error === 'Not allowed') signOut() }, [live.error, signOut])

  if (!token) return <Navigate to="/teacher/login" replace />

  // Menu items that need the teacher's attention, e.g. blocked requests or a printer problem.
  const items = NAV.flatMap((g) => g.items)
  const badges = Object.fromEntries(items.filter((i) => i.badge).map((i) => [i.to, i.badge(live.state)]))
  const firstAlert = items.find((i) => badges[i.to])
  const initials = (teacher?.displayName ?? 'T').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()

  return (
    <div className={`t-app ${open ? 'is-menu-open' : ''}`}>
      <aside className="t-side" aria-label={t('Main menu')}>
        <div className="t-side__head">
          <span className="t-side__logo"><LogoMark size={34} /> WishPix</span>
          <button className="t-side__close" onClick={() => setOpen(false)} aria-label={t('Close menu')}><X size={20} /></button>
        </div>
        <KioskCard live={live} />
        <nav>
          {NAV.map((group) => (
            <div key={group.section} className="t-side__group">
              <p>{t(group.section)}</p>
              {group.items.map(({ to, label, icon: Icon }) => (
                <NavLink key={to} to={`/teacher/${to}`} onClick={() => setOpen(false)} className={({ isActive }) => `t-side__link ${isActive ? 'is-active' : ''}`}>
                  <Icon size={18} /> {t(label)}
                  {badges[to] && (
                    <em className="t-side__badge" aria-label={badges[to] === '!' ? t('Needs attention') : t('{n} waiting', { n: badges[to] })}>{badges[to]}</em>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="t-side__foot">
          <span className="t-avatar t-avatar--soft">WP</span>
          <div><b>{t('WishPix Teacher')}</b><small>{t('System v{v}', { v: '2.4.1' })}</small></div>
          <button className="t-side__logout" onClick={signOut} aria-label={t('Sign out')} title={t('Sign out')}><LogOut size={18} /></button>
        </div>
      </aside>
      <div className="t-scrim" onClick={() => setOpen(false)} />

      <div className="t-main">
        <header className="t-top">
          <button className="t-top__menu" onClick={() => setOpen(true)} aria-label={firstAlert ? t('Open menu, some items need attention') : t('Open menu')}>
            <Menu size={24} />{firstAlert && <i />}
          </button>
          <span className="t-top__brand">WishPix<i /></span>
          <Link
            className="t-top__bell"
            to={`/teacher/${firstAlert?.to ?? 'dashboard'}`}
            aria-label={firstAlert ? t('Alerts: {page} needs attention', { page: t(firstAlert.label) }) : t('No alerts')}
            title={firstAlert ? t(firstAlert.label) : t('No alerts')}
          >
            <Bell size={22} />{firstAlert && <i />}
          </Link>
          <Link className="t-avatar" to="/teacher/settings" title={teacher?.displayName} aria-label={t('Settings')}>{initials}</Link>
        </header>
        <main className="t-page">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

function KioskCard({ live }) {
  const t = useT()
  const online = live.state?.kioskOnline
  return (
    <div className="t-side__kiosk">
      <Monitor size={20} />
      <div>
        <small>{t('Connected kiosk')}</small>
        <b>{live.state?.kioskName ?? t('Kiosk')}</b>
        <span>{online ? t('Online') : t('Offline')}</span>
      </div>
      <i className={online ? 'is-on' : ''} />
    </div>
  )
}
