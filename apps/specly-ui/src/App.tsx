import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Activity, Box, Zap } from "lucide-react"

function App() {
  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-4">
      <Card className="w-full max-w-md glass-card border-white/10">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto bg-primary/20 p-3 rounded-full w-fit mb-2">
            <Box className="w-8 h-8 text-primary" />
          </div>
          <CardTitle className="text-3xl font-bold tracking-tight">
            <span className="text-gradient">Specly UI</span>
          </CardTitle>
          <CardDescription className="text-base">
            Premium Frontend Foundation Ready
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex justify-center gap-2">
            <Badge variant="glass" className="px-3 py-1">
              <Zap className="w-3 h-3 mr-1 text-yellow-400" />
              React 19
            </Badge>
            <Badge variant="glass" className="px-3 py-1">
              <Activity className="w-3 h-3 mr-1 text-green-400" />
              Tailwind v4
            </Badge>
          </div>

          <div className="grid gap-3">
            <Button className="w-full" size="lg">
              Enter Workspace
            </Button>
            <Button variant="glass" className="w-full" size="lg">
              View Documentation
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default App
