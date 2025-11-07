import { createRouter, createRoute, createRootRoute, Outlet } from '@tanstack/react-router'
import { HomePage } from './pages/home'
import { TasksPage } from './pages/tasks'
import { SpecsPage } from './pages/specs'
import { ToolsPage } from './pages/tools'
import { FloatingNav } from './components/floating-nav'

// Root route
const rootRoute = createRootRoute({
  component: () => (
    <div className="min-h-screen bg-gray-50">
      <Outlet />
    </div>
  ),
})

// Home route (keeps the original header styling)
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: () => (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="space-y-8">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Specly</h1>
          <p className="text-gray-600">Model Context Protocol Task Manager</p>
        </div>
        
        {/* Content */}
        <HomePage />
      </div>
    </div>
  ),
})

const specsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/specs',
  component: SpecsPage,
})

const toolsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/tools',
  component: ToolsPage,
})

// Workspace routes
const workspaceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/workspace/$workspaceId',
  component: () => (
    <div className="relative min-h-screen">
      <div className="main-content">
        <Outlet />
      </div>
      <FloatingNav />
    </div>
  ),
})

const tasksRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: '/tasks',
  component: TasksPage,
})

// Legacy routes removed: tool-flows and feedback-steps

// Create the route tree
const routeTree = rootRoute.addChildren([
  indexRoute,
  specsRoute,
  toolsRoute,
  workspaceRoute.addChildren([
    tasksRoute,
  ]),
])

// Create router
export const router = createRouter({ routeTree })