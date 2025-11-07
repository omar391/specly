import React from 'react'

interface SectionHeaderProps {
  icon: React.ReactNode
  title: string
  description: string
  iconBgColor?: string
  iconTextColor?: string
  actions?: React.ReactNode
  className?: string
}

export function SectionHeader({
  icon,
  title,
  description,
  iconBgColor = "bg-blue-100 dark:bg-blue-900",
  iconTextColor = "text-blue-600 dark:text-blue-400",
  actions,
  className = ""
}: SectionHeaderProps) {
  return (
    <div className={`flex items-center ${actions ? 'justify-between' : 'gap-3'} px-2 ${className}`}>
      <div className="flex items-center gap-3">
        <div className={`h-10 w-10 rounded-xl ${iconBgColor} flex items-center justify-center`}>
          <div className={iconTextColor}>
            {icon}
          </div>
        </div>
        <div>
          <h3 className="font-semibold text-lg text-gray-900 dark:text-white">
            {title}
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {description}
          </p>
        </div>
      </div>
      {actions && (
        <div className="flex items-center gap-2">
          {actions}
        </div>
      )}
    </div>
  )
}
