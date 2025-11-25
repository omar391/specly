import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useState, useEffect } from 'react'
import { Box, Server, CheckCircle2, XCircle } from 'lucide-react'
import { FadeIn } from '@/components/ui/fade-in'

export const Route = createFileRoute('/connect')({
    component: Connect,
})

function Connect() {
    const navigate = useNavigate()
    const [status, setStatus] = useState<'idle' | 'checking' | 'connected' | 'error'>('idle')
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        checkConnection()
    }, [])

    const checkConnection = async () => {
        setStatus('checking')
        setError(null)
        try {
            const res = await fetch('/api/workspaces')
            if (res.ok) {
                setStatus('connected')
                setTimeout(() => {
                    navigate({ to: '/' })
                }, 1000)
            } else {
                setStatus('error')
                setError('Server returned an error')
            }
        } catch (err) {
            setStatus('error')
            setError('Could not connect to server')
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-background">
            <FadeIn>
                <Card className="w-full max-w-md glass-card border-white/10">
                    <CardHeader className="text-center space-y-2">
                        <div className="mx-auto bg-primary/20 p-3 rounded-full w-fit mb-2">
                            <Box className="w-8 h-8 text-primary" />
                        </div>
                        <CardTitle className="text-2xl font-bold">Connect to Specly</CardTitle>
                        <CardDescription>
                            Connecting to local MCP server...
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="flex flex-col items-center gap-4 py-4">
                            {status === 'checking' && (
                                <div className="w-12 h-12 rounded-full border-4 border-primary/30 border-t-primary animate-spin" />
                            )}

                            {status === 'connected' && (
                                <div className="flex flex-col items-center gap-2 text-green-400">
                                    <CheckCircle2 className="w-12 h-12" />
                                    <span className="font-medium">Connected!</span>
                                </div>
                            )}

                            {status === 'error' && (
                                <div className="flex flex-col items-center gap-2 text-destructive">
                                    <XCircle className="w-12 h-12" />
                                    <span className="font-medium">Connection Failed</span>
                                    <p className="text-sm text-muted-foreground text-center">
                                        Ensure the Specly server is running on port 8989.
                                    </p>
                                    <Button variant="outline" onClick={checkConnection} className="mt-2">
                                        Retry Connection
                                    </Button>
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </FadeIn>
        </div>
    )
}
