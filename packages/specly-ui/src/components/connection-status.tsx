import { Wifi, WifiOff, AlertCircle, CheckCircle2 } from 'lucide-react'

interface ConnectionStatusProps {
  status: 'connected' | 'disconnected' | 'error' | 'connecting'
  message?: string
  showIcon?: boolean
  className?: string
}

export function ConnectionStatus({ 
  status, 
  message, 
  showIcon = true, 
  className 
}: ConnectionStatusProps) {
  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'connected':
        return {
          icon: CheckCircle2,
          label: 'Connected',
          className: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800/50'
        }
      case 'connecting':
        return {
          icon: Wifi,
          label: 'Connecting...',
          className: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800/50'
        }
      case 'error':
        return {
          icon: AlertCircle,
          label: 'Error',
          className: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800/50'
        }
      case 'disconnected':
      default:
        return {
          icon: WifiOff,
          label: 'Disconnected',
          className: 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-900/30 dark:text-gray-400 dark:border-gray-800/50'
        }
    }
  }

  const config = getStatusConfig(status)
  const Icon = config.icon

  return (
    <div className={`status-indicator ${config.className} ${className || ''}`}>
      {showIcon && <Icon size={12} />}
      {message || config.label}
    </div>
  )
}
