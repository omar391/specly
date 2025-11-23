import { Link } from "@tanstack/react-router"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
    LayoutDashboard,
    ListTodo,
    Settings,
    Activity,
    Shield,
    Box,
    ChevronRight
} from "lucide-react"

export function Sidebar() {
    const navItems = [
        {
            title: "Overview",
            icon: LayoutDashboard,
            to: "/",
        },
        {
            title: "Tasks",
            icon: ListTodo,
            to: "/tasks",
        },
        {
            title: "Sessions",
            icon: Activity,
            to: "/sessions",
        },
        {
            title: "Rules",
            icon: Shield,
            to: "/rules",
        },
        {
            title: "Settings",
            icon: Settings,
            to: "/settings",
        },
    ]

    return (
        <nav className="w-64 border-r border-white/10 bg-card/50 backdrop-blur-xl flex flex-col h-screen sticky top-0">
            <div className="p-6 flex items-center gap-3 border-b border-white/5">
                <div className="bg-primary/20 p-2 rounded-lg">
                    <Box className="w-5 h-5 text-primary" />
                </div>
                <div>
                    <h1 className="font-bold text-lg tracking-tight">Specly</h1>
                    <p className="text-xs text-muted-foreground">Workspace Alpha</p>
                </div>
            </div>

            <div className="flex-1 py-6 px-3 space-y-1">
                {navItems.map((item) => (
                    <Button
                        key={item.to}
                        variant="ghost"
                        className={cn(
                            "w-full justify-start gap-3 text-muted-foreground hover:text-foreground hover:bg-white/5",
                            // Active state logic would go here with router
                        )}
                        asChild
                    >
                        <Link to={item.to} className="[&.active]:bg-primary/10 [&.active]:text-primary">
                            <item.icon className="w-4 h-4" />
                            {item.title}
                            {/* Active indicator */}
                            <ChevronRight className="w-3 h-3 ml-auto opacity-0 [&.active]:opacity-100" />
                        </Link>
                    </Button>
                ))}
            </div>

            <div className="p-4 border-t border-white/5">
                <div className="bg-white/5 rounded-lg p-3 text-xs space-y-2">
                    <div className="flex justify-between items-center text-muted-foreground">
                        <span>System Status</span>
                        <span className="flex items-center gap-1.5 text-green-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                            Online
                        </span>
                    </div>
                    <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                        <div className="h-full w-full bg-green-400/50" />
                    </div>
                </div>
            </div>
        </nav>
    )
}
