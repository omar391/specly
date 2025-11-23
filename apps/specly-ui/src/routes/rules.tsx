import { createFileRoute } from '@tanstack/react-router'
import { useRules, useCreateRule } from '@/hooks/useRules'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Shield, Plus, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { FadeIn } from '@/components/ui/fade-in'

export const Route = createFileRoute('/rules')({
    component: Rules,
})

function Rules() {
    const { data: rules, isLoading, error } = useRules()
    const createRule = useCreateRule()
    const [newRule, setNewRule] = useState('')

    const handleAddRule = (e: React.FormEvent) => {
        e.preventDefault()
        if (!newRule.trim()) return

        createRule.mutate({ content: newRule }, {
            onSuccess: () => setNewRule('')
        })
    }

    if (isLoading) return <div>Loading rules...</div>
    if (error) return <div>Error loading rules</div>

    return (
        <FadeIn className="space-y-6">
            <div>
                <h2 className="text-3xl font-bold tracking-tight">Rules</h2>
                <p className="text-muted-foreground">Global automation rules and guidelines</p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Add New Rule</CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleAddRule} className="flex gap-4">
                        <Input
                            placeholder="e.g., Always use TypeScript for new files..."
                            value={newRule}
                            onChange={(e) => setNewRule(e.target.value)}
                            className="flex-1"
                        />
                        <Button type="submit" disabled={createRule.isPending}>
                            {createRule.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                            Add Rule
                        </Button>
                    </form>
                </CardContent>
            </Card>

            <div className="grid gap-4">
                {rules?.map((rule) => (
                    <Card key={rule.id} className="hover:bg-white/5 transition-colors">
                        <CardContent className="p-6 flex items-start gap-4">
                            <div className="bg-primary/10 p-2 rounded-lg mt-0.5">
                                <Shield className="w-5 h-5 text-primary" />
                            </div>
                            <div className="flex-1">
                                <p className="text-lg font-medium leading-relaxed">{rule.content}</p>
                                <p className="text-xs text-muted-foreground mt-2">
                                    Added {new Date(rule.created_at).toLocaleDateString()}
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                ))}
                {rules?.length === 0 && (
                    <div className="text-center py-12 text-muted-foreground border border-dashed border-white/10 rounded-lg">
                        No rules defined yet.
                    </div>
                )}
            </div>
        </FadeIn>
    )
}
