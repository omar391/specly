import { ChevronRight } from 'lucide-react'
import { tailwindClasses, designSystem } from '@/lib/design-system'

interface MembershipItemProps {
  title: string
  subtitle: string
  accentColor: 'green' | 'orange' | 'yellow' | 'purple' | 'blue'
  onClick?: () => void
}

export function MembershipItem({ title, subtitle, accentColor, onClick }: MembershipItemProps) {
  const accentColorValue = designSystem.colors.accent[accentColor]
  
  return (
    <div 
      className={`${tailwindClasses.listItem.base} ${tailwindClasses.listItem.hover} cursor-pointer`}
      onClick={onClick}
    >
      {/* Accent Bar */}
      <div 
        className="w-1 h-full rounded-sm mr-4"
        style={{ backgroundColor: accentColorValue }}
      />
      
      {/* Content */}
      <div className="flex items-center justify-between flex-1">
        <div className="min-w-0 flex-1">
          <h3 className={tailwindClasses.typography.title}>
            {title}
          </h3>
          <p 
            className={tailwindClasses.typography.subtitle}
            style={{ color: designSystem.colors.neutral[500] }}
          >
            {subtitle}
          </p>
        </div>
        
        {/* Action Icon */}
        <div className="ml-4">
          <ChevronRight 
            size={20} 
            style={{ color: designSystem.colors.neutral[400] }} 
          />
        </div>
      </div>
    </div>
  )
}

// Example usage component
export function MembershipList() {
  const memberships = [
    {
      id: 'youth',
      title: 'Monthly Youth',
      subtitle: '$200 per month, unlimited',
      accentColor: 'green' as const
    },
    {
      id: 'audit',
      title: 'Monthly Audit', 
      subtitle: '$200 per month, unlimited 18+',
      accentColor: 'orange' as const
    },
    {
      id: 'trial',
      title: 'Trial',
      subtitle: '$25 one-time',
      accentColor: 'yellow' as const
    },
    {
      id: 'summer',
      title: 'Summer Camps',
      subtitle: '$499 per year, unlimited 18+',
      accentColor: 'purple' as const
    }
  ]

  return (
    <div className={tailwindClasses.card.base}>
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div 
            className="h-12 w-12 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: designSystem.colors.accent.blue }}
          >
            <span className="text-xl text-white">🏷️</span>
          </div>
          <div>
            <h2 
              className={tailwindClasses.typography.title}
              style={{ fontSize: '1.5rem', fontWeight: '700' }}
            >
              Memberships
            </h2>
            <p className={tailwindClasses.typography.subtitle}>
              Generate Lorem Ipsum placeholder text. Select the number of characters, words, sentences or paragraphs.
            </p>
          </div>
        </div>
      </div>
      
      <div className="space-y-2">
        {memberships.map((membership) => (
          <MembershipItem
            key={membership.id}
            title={membership.title}
            subtitle={membership.subtitle}
            accentColor={membership.accentColor}
            onClick={() => console.log(`Selected ${membership.title}`)}
          />
        ))}
      </div>
    </div>
  )
}
