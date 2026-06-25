import { NavLink } from 'react-router-dom'

const STEPS = [
  { num: '1', label: 'ORDERS',         path: '/orders'         },
  { num: '2', label: 'RM REQUIREMENT', path: '/rm-requirement' },
  { num: '3', label: 'RM LOT',         path: '/rm-lot'         },
  { num: '4', label: 'PRODUCTION',     path: '/production'     },
  { num: '5', label: 'PLATING',        path: '/plating'        },
  { num: '6', label: 'DISPATCH',       path: '/dispatch'       },
  { num: '7', label: 'SUMMARY',        path: '/summary'        },
]

export default function StageNav() {
  return (
    <nav className="stage-nav">
      {STEPS.map((step, i) => (
        <>
          <NavLink
            key={step.path}
            to={step.path}
            className={({ isActive }) => `pstep${isActive ? ' active' : ''}`}
          >
            <span className="pstep-num">{step.num}</span>
            {step.label}
          </NavLink>
          {i < STEPS.length - 1 && <span key={`sep-${i}`} className="psep">›</span>}
        </>
      ))}
    </nav>
  )
}
