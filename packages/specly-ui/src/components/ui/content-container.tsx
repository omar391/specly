import React from 'react'

interface ContentContainerProps {
  children: React.ReactNode
  className?: string
  padding?: boolean
}

export function ContentContainer({ 
  children, 
  className = "",
  padding = true
}: ContentContainerProps) {
  const paddingClass = padding ? "p-6" : ""
  
  return (
    <div className={`bg-gray-50 dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 ${paddingClass} ${className}`}>
      {children}
    </div>
  )
}
