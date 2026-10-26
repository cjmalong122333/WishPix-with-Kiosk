import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import './index.css'
import Kiosk from './kiosk/Kiosk.jsx'
import Play from './play/Play.jsx'
import TeacherApp from './teacher/TeacherApp.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/kiosk" element={<Kiosk />} />
        <Route path="/play" element={<Play />} />
        <Route path="/teacher/*" element={<TeacherApp />} />
        <Route path="*" element={<Navigate to="/teacher" replace />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
