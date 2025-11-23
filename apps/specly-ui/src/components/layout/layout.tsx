import { Outlet } from "@tanstack/react-router"
import { Sidebar } from "./sidebar"

export function Layout() {
    return (
        <div className="flex min-h-screen bg-background text-foreground font-sans antialiased selection:bg-primary/20 selection:text-primary">
            <Sidebar />
            <main className="flex-1 overflow-y-auto h-screen">
                <div className="container mx-auto p-8 max-w-7xl space-y-8">
                    <Outlet />
                </div>
            </main>
        </div>
    )
}
