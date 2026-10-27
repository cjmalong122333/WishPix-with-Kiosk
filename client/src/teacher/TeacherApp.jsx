import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth.jsx'
import { Loader, Login, SystemCheck } from './Welcome.jsx'
import Layout from './Layout.jsx'
import Dashboard from './Dashboard.jsx'
import SessionSetup from './SessionSetup.jsx'
import Moderation from './Moderation.jsx'
import LiveSession from './LiveSession.jsx'
import PrintManagement from './PrintManagement.jsx'
import KioskManagement from './KioskManagement.jsx'
import ActivityLogs from './ActivityLogs.jsx'
import Analytics from './Analytics.jsx'
import Reports from './Reports.jsx'
import ReportView from './ReportView.jsx'
import Settings from './Settings.jsx'
import DevPanel from './DevPanel.jsx'
import './teacher.css'

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
          <Route path="live" element={<LiveSession />} />
          <Route path="moderation" element={<Moderation />} />
          <Route path="print" element={<PrintManagement />} />
          <Route path="kiosk" element={<KioskManagement />} />
          <Route path="logs" element={<ActivityLogs />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="reports" element={<Reports />} />
          <Route path="reports/:id" element={<ReportView />} />
          <Route path="settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<Navigate to="/teacher" replace />} />
      </Routes>
    </AuthProvider>
  )
}
