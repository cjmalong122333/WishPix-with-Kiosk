import { Link } from 'react-router-dom'
import { Hammer } from 'lucide-react'

// Placeholder for Teacher App pages that later build steps add.
export default function ComingSoon({ title, step }) {
  return (
    <div className="t-soon">
      <i className="t-tint t-tint--blue t-tint--lg"><Hammer size={22} /></i>
      <h1 className="t-h1 t-h1--sm">{title}</h1>
      <p className="t-lead">This page is coming in build step {step}.</p>
      <Link className="t-btn" to="/teacher/dashboard">Back to Dashboard</Link>
    </div>
  )
}
