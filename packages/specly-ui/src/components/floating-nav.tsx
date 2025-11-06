import { Link, useLocation, useParams } from '@tanstack/react-router'
import { CheckSquare, Home, Wrench, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'

export function FloatingNav() {
  const location = useLocation()
  const params = useParams({ strict: false })
  const workspaceId = params?.workspaceId

  // If we're in a workspace context, show workspace-scoped navigation
  if (workspaceId) {
    const navItems = [
      { label: 'Home', path: '/', icon: Home },
      { label: 'Tasks', path: `/workspace/${workspaceId}/tasks`, icon: CheckSquare },
      { label: 'Specs', path: `/specs`, icon: FileText },
      { label: 'Tools', path: `/tools`, icon: Wrench },
    ]

    return (
      <nav className="floating-nav">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = location.pathname === item.path
          
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn('nav-item', isActive && 'active')}
            >
              <Icon size={20} />
              <span className="text-xs mt-1 font-medium">{item.label}</span>
            </Link>
          )
        })}
      </nav>
    )
  }

  // Default navigation for home page (no floating nav shown)
  return null
}
