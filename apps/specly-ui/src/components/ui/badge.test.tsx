import { render, screen } from '@testing-library/react'
import { Badge } from '@/components/ui/badge'
import { describe, it, expect } from 'vitest'

describe('Badge', () => {
    it('renders the badge with default variant', () => {
        render(<Badge>Default Badge</Badge>)
        const badge = screen.getByText('Default Badge')
        expect(badge).toBeInTheDocument()
        expect(badge).toHaveClass('bg-primary')
    })

    it('renders the badge with secondary variant', () => {
        render(<Badge variant="secondary">Secondary Badge</Badge>)
        const badge = screen.getByText('Secondary Badge')
        expect(badge).toBeInTheDocument()
        expect(badge).toHaveClass('bg-secondary')
    })

    it('renders the badge with destructive variant', () => {
        render(<Badge variant="destructive">Destructive Badge</Badge>)
        const badge = screen.getByText('Destructive Badge')
        expect(badge).toBeInTheDocument()
        expect(badge).toHaveClass('bg-destructive')
    })

    it('renders the badge with outline variant', () => {
        render(<Badge variant="outline">Outline Badge</Badge>)
        const badge = screen.getByText('Outline Badge')
        expect(badge).toBeInTheDocument()
        expect(badge).toHaveClass('text-foreground')
    })
})
