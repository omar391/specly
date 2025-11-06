import React from 'react'

interface EmptyStateProps {
  icon: React.ReactNode
  title: string
  description: string
  actions?: React.ReactNode
  className?: string
}

export function EmptyState({
  icon,
  title,
  description,
  actions,
  className = ""
}: EmptyStateProps) {
  return (
    <div className={`text-center py-12 bg-gray-50 dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 ${className}`}>
      <div className="h-16 w-16 mx-auto rounded-2xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center mb-4">
        <div className="text-gray-500 dark:text-gray-400">
          {icon}
        </div>
      </div>
      <h3 className="font-medium mb-2 text-gray-900 dark:text-white">
        {title}
      </h3>
      <p className="text-gray-600 dark:text-gray-400 text-sm mb-4">
        {description}
      </p>
      {actions && (
        <div className="flex justify-center">
          {actions}
        </div>
      )}
    </div>
  )
}
