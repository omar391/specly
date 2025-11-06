import React from 'react'
import { SectionHeader } from './section-header'
import { ContentContainer } from './content-container'
import { EmptyState } from './empty-state'

interface SectionWithContentProps {
  // Section header props
  icon: React.ReactNode
  title: string
  description: string
  iconBgColor?: string
  iconTextColor?: string
  actions?: React.ReactNode
  
  // Content props
  children?: React.ReactNode
  hasContent: boolean
  
  // Empty state props (when hasContent is false)
  emptyStateIcon?: React.ReactNode
  emptyStateTitle?: string
  emptyStateDescription?: string
  emptyStateActions?: React.ReactNode
  
  // Container props
  className?: string
  contentPadding?: boolean
}

export function SectionWithContent({
  // Header props
  icon,
  title,
  description,
  iconBgColor,
  iconTextColor,
  actions,
  
  // Content props
  children,
  hasContent,
  
  // Empty state props
  emptyStateIcon,
  emptyStateTitle,
  emptyStateDescription,
  emptyStateActions,
  
  // Container props
  className = "",
  contentPadding = true
}: SectionWithContentProps) {
  return (
    <div className={`space-y-6 ${className}`}>
      <SectionHeader
        icon={icon}
        title={title}
        description={description}
        iconBgColor={iconBgColor}
        iconTextColor={iconTextColor}
        actions={actions}
      />
      
      {hasContent ? (
        <ContentContainer padding={contentPadding}>
          {children}
        </ContentContainer>
      ) : (
        <EmptyState
          icon={emptyStateIcon || icon}
          title={emptyStateTitle || `No ${title.toLowerCase()}`}
          description={emptyStateDescription || `${title} will appear here when available.`}
          actions={emptyStateActions}
        />
      )}
    </div>
  )
}

// Export individual components for flexibility
export { SectionHeader, ContentContainer, EmptyState }
