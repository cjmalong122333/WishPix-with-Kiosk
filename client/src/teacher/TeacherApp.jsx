import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth.jsx'
import { Loader, Login, SystemCheck } from './Welcome.jsx'
import Layout from './Layout.jsx'
import Dashboard from './Dashboard.jsx'
import SessionSetup from './SessionSetup.jsx'
import ComingSoon from './ComingSoon.jsx'
import DevPanel from './DevPanel.jsx'
import './teacher.css'

// Pages still to come, with the build step that adds them.
const LATER = [
  ['live', 'Live Session', 5],
  ['moderation', 'Moderation Center', 4],
  ['print', 'Print Management', 5],
  ['kiosk', 'Kiosk Management', 5],
  ['logs', 'Activity Logs', 6],
  ['analytics', 'Analytics', 6],
  ['reports', 'Reports', 6],
  ['settings', 'Settings', 6],
]

export default function TeacherApp() {
  return (
    <AuthProvider>
      <Routes>
        <Route index element={<Loader />} />
        <Route path="login" element={<Login />} />
        <Route path="check" element={<SystemCheck />} />
        <Route path="dev" element={<DevPanel />} />
        <Route element={<Layout />}>
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="setup" element={<SessionSetup />} />
          {LATER.map(([path, title, step]) => (
            <Route key={path} path={path} element={<ComingSoon title={title} step={step} />} />
          ))}
        </Route>
        <Route path="*" element={<Navigate to="/teacher" replace />} />
      </Routes>
    </AuthProvider>
  )
}
