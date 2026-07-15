import { NavLink, useLocation } from 'react-router-dom'
import { Check } from 'lucide-react'
import { useRole, ROLE_PATHS } from '../../contexts/RoleContext'

const STEPS = [
  { num: '1', label: 'Orders',         path: '/orders'         },
  { num: '2', label: 'RM Requirement', path: '/rm-requirement' },
  { num: '3', label: 'RM Lot',         path: '/rm-lot'         },
  { num: '4', label: 'Production',     path: '/production'     },
  { num: '5', label: 'Plating',        path: '/plating'        },
  { num: '6', label: 'Dispatch',       path: '/dispatch'       },
]

export default function StageNav() {
  const { pathname } = useLocation()
  const { role } = useRole()
  const allowedPaths = ROLE_PATHS[role]
  const visSteps = STEPS.filter(s => allowedPaths == null || allowedPaths.has(s.path))

  const currentIdx = visSteps.findIndex(s => pathname.startsWith(s.path))

  return (
    <nav className="stage-nav">
      {visSteps.map((step, i) => {
        const isDone   = currentIdx > -1 && i < currentIdx
        const isActive = pathname.startsWith(step.path)

        return (
          <span key={step.path} style={{ display: 'contents' }}>
            <NavLink
              to={step.path}
              className={`pstep${isActive ? ' active' : isDone ? ' done' : ''}`}
            >
              <span className="pstep-num">
                {isDone ? <Check size={11} strokeWidth={3} /> : step.num}
              </span>
              {step.label}
            </NavLink>
            {i < visSteps.length - 1 && <span className="psep">›</span>}
          </span>
        )
      })}
    </nav>
  )
}
