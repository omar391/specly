import { createRootRoute } from '@tanstack/react-router'
import { Layout } from '@/components/layout/layout'

export const Route = createRootRoute({
    component: () => (
        <Layout />
    ),
})
