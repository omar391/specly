import React, { useState } from 'react'
import { ContentContainer } from '@/components/ui/content-container'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { WorkspaceRulesDisplay } from '@/components/workspace-rules-display'
import { RuleInputForm } from '@/components/rule-input-form'

export default function RulesPage() {
  const [showNew, setShowNew] = useState(false)
  const [refreshKey, setRefreshKey] = useState<number>(0)

  const handleRulesChanged = (_rules: any[]) => {
    // bump key to trigger any child refreshes if needed
    setRefreshKey(k => k + 1)
  }

  return (
    <ContentContainer>
      <PageHeader title="Rules" description="Manage workspace and custom rules" />
      <div className="flex items-center justify-end mb-4">
        <Button onClick={() => setShowNew(true)}>New Rule</Button>
      </div>

      <div key={refreshKey}>
        <WorkspaceRulesDisplay onRulesChanged={handleRulesChanged} />
      </div>

      <RuleInputForm
        open={showNew}
        onClose={() => setShowNew(false)}
      />
    </ContentContainer>
  )
}