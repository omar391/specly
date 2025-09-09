// Design system constants based on the Specly design language
export const designSystem = {
    name: 'Specly Design System',
    version: '1.1.0',
    spacing: {
        xs: '0.25rem',
        sm: '0.5rem',
        md: '1rem',
        lg: '1.5rem',
        xl: '2rem',
        '2xl': '3rem',
        '3xl': '4rem',
        '4xl': '6rem',
        '5xl': '8rem'
    },
    borderRadius: {
        sm: '0.375rem',
        md: '0.5rem',
        lg: '0.75rem',
        xl: '1rem',
        '2xl': '1.5rem',
        '3xl': '2rem',
        full: '9999px'
    },
    colors: {
        primary: {
            blue: '#3b82f6',
            green: '#10b981',
            orange: '#f97316',
            yellow: '#eab308',
            purple: '#8b5cf6'
        },
        accent: {
            blue: '#3b82f6',
            green: '#10b981',
            orange: '#f97316',
            yellow: '#eab308',
            purple: '#8b5cf6',
            blueLight: '#3b82f620',
            greenLight: '#10b98120',
            blueGradient: 'linear-gradient(135deg, #3b82f615, #10b98115)',
            blueGreenGradient: 'linear-gradient(135deg, #3b82f6, #10b981)',
            gradientBlueGreen: 'linear-gradient(135deg, #3b82f6, #10b981)',
            gradientBlueGreenFaded: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(16, 185, 129, 0.1))'
        },
        neutral: {
            0: '#ffffff',
            50: '#f9fafb',
            100: '#f3f4f6',
            200: '#e5e7eb',
            250: '#e0e2e7',
            300: '#d1d5db',
            400: '#9ca3af',
            500: '#6b7280',
            600: '#4b5563',
            700: '#374151',
            800: '#1f2937',
            900: '#111827',
            950: '#0a0f1a'
        },
        background: {
            light: '#ffffff',
            dark: '#0f172a',
            subtle: '#f8fafc',
            muted: '#f1f5f9'
        },
        border: {
            light: '#e2e8f0',
            DEFAULT: '#cbd5e1',
            dark: '#94a3b8',
            accent: '#3b82f6',
            accentLight: '#3b82f620'
        }
    },
    typography: {
        h1: {
            fontSize: '2.5rem',
            fontWeight: '800',
            lineHeight: '1.2',
            letterSpacing: '-0.025em'
        },
        h2: {
            fontSize: '2rem',
            fontWeight: '700',
            lineHeight: '1.25',
            letterSpacing: '-0.02em'
        },
        h3: {
            fontSize: '1.5rem',
            fontWeight: '600',
            lineHeight: '1.333',
            letterSpacing: '-0.015em'
        },
        h4: {
            fontSize: '1.25rem',
            fontWeight: '600',
            lineHeight: '1.4',
            letterSpacing: '-0.01em'
        },
        title: {
            fontSize: '1.125rem',
            fontWeight: '600',
            lineHeight: '1.5'
        },
        subtitle: {
            fontSize: '1rem',
            fontWeight: '400',
            lineHeight: '1.5',
            color: 'var(--muted-foreground)'
        },
        body: {
            fontSize: '1rem',
            fontWeight: '400',
            lineHeight: '1.6'
        },
        caption: {
            fontSize: '0.875rem',
            fontWeight: '400',
            lineHeight: '1.4',
            color: 'var(--muted-foreground)'
        },
        small: {
            fontSize: '0.75rem',
            fontWeight: '400',
            lineHeight: '1.3'
        },
        code: {
            fontFamily: 'var(--font-mono)',
            fontSize: '0.9375em',
            fontWeight: '500',
            lineHeight: '1.5',
            backgroundColor: 'var(--code-bg)', // Updated to use CSS variable
            borderRadius: '0.25rem',
            padding: '0.2em 0.4em',
            color: 'var(--code-text)' // Updated to use CSS variable
        }
    },
    shadows: {
        xs: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        sm: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)',
        md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)',
        lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)',
        xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
        '2xl': '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        inner: 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.06)',
        none: 'none'
    },
    opacity: {
        0: '0',
        10: '0.1',
        20: '0.2',
        30: '0.3',
        40: '0.4',
        50: '0.5',
        60: '0.6',
        70: '0.7',
        80: '0.8',
        90: '0.9',
        100: '1'
    },
    zIndex: {
        hide: '-1',
        auto: 'auto',
        base: '0',
        docked: '10',
        dropdown: '1000',
        sticky: '1100',
        banner: '1200',
        overlay: '1300',
        modal: '1400',
        popover: '1500',
        skipLink: '1600',
        toast: '1700',
        tooltip: '1800'
    }
} as const

export const brandName = 'Specly'
export const brandColor = '#0B5FFF'
export const sessionColors = {
    awaiting_input: '#F59E0B',
    running: '#0EA5E9',
    completed: '#10B981',
    failed: '#EF4444',
}

// Helper function to get nested design system values
export function getDesignToken(path: string): any {
    return path.split('.').reduce((obj: any, key) => obj?.[key], designSystem)
}

// Spacing utilities
export const spacing = {
    xs: getDesignToken('spacing.xs'),
    sm: getDesignToken('spacing.sm'),
    md: getDesignToken('spacing.md'),
    lg: getDesignToken('spacing.lg'),
    xl: getDesignToken('spacing.xl'),
    '2xl': getDesignToken('spacing.2xl'),
    '3xl': getDesignToken('spacing.3xl'),
}

 // Color utilities
 export const colors = {
     accent: getDesignToken('colors.accent'),
     neutral: getDesignToken('colors.neutral'),
     brand: brandColor,
     session: sessionColors,
 }

// Typography utilities
export const typography = {
    title: getDesignToken('typography.title'),
    subtitle: getDesignToken('typography.subtitle'),
    caption: getDesignToken('typography.caption'),
}

// Component style generators
export const createCardStyle = (variant: 'base' | 'hover' = 'base') => {
    const baseStyle = getDesignToken(`components.card.${variant}`)
    return {
        backgroundColor: baseStyle.backgroundColor,
        borderRadius: baseStyle.borderRadius,
        padding: getDesignToken(`spacing.${baseStyle.padding}`),
        boxShadow: getDesignToken(`shadows.${baseStyle.shadow}`),
        border: baseStyle.border,
        ...(variant === 'hover' && {
            transform: baseStyle.transform,
            transition: baseStyle.transition,
        })
    }
}

export const createListItemStyle = (state: 'base' | 'hover' = 'base') => {
    const baseStyle = getDesignToken(`components.listItem.${state}`)
    return {
        backgroundColor: baseStyle.backgroundColor,
        borderRadius: getDesignToken(`borderRadius.${baseStyle.borderRadius}`),
        padding: getDesignToken(`spacing.${baseStyle.padding}`),
        border: baseStyle.border,
        marginBottom: getDesignToken(`spacing.${baseStyle.marginBottom}`),
        ...(state === 'hover' && {
            transition: baseStyle.transition,
        })
    }
}

export const createAccentBarStyle = (color: 'green' | 'orange' | 'yellow' | 'purple' | 'blue') => {
    const barConfig = getDesignToken('components.accentBar')
    const colorValue = getDesignToken(`components.accentBar.variants.${color}.backgroundColor`)

    return {
        width: barConfig.width,
        height: barConfig.height,
        borderRadius: getDesignToken(`borderRadius.${barConfig.borderRadius}`),
        marginRight: getDesignToken(`spacing.${barConfig.marginRight}`),
        backgroundColor: getDesignToken(`colors.${colorValue.replace('accent.', 'accent.')}`),
    }
}

export const createIconContainerStyle = (variant: 'light' | 'primary' = 'light') => {
    const baseStyle = getDesignToken('components.iconContainer.base')
    const variantStyle = getDesignToken(`components.iconContainer.variants.${variant}`)

    return {
        width: baseStyle.width,
        height: baseStyle.height,
        borderRadius: getDesignToken(`borderRadius.${baseStyle.borderRadius}`),
        display: baseStyle.display,
        alignItems: baseStyle.alignItems,
        justifyContent: baseStyle.justifyContent,
        marginRight: getDesignToken(`spacing.${baseStyle.marginRight}`),
        backgroundColor: variant === 'light'
            ? getDesignToken('colors.neutral.100')
            : getDesignToken('colors.accent.blue'),
        color: variantStyle.color || 'inherit',
    }
}

export const createButtonStyle = (variant: 'primary' | 'secondary' = 'primary') => {
    const buttonStyle = getDesignToken(`components.button.${variant}`)

    return {
        backgroundColor: variant === 'primary'
            ? getDesignToken('colors.accent.blue')
            : buttonStyle.backgroundColor,
        color: variant === 'primary'
            ? buttonStyle.color
            : getDesignToken('colors.neutral.700'),
        padding: `${getDesignToken('spacing.sm')} ${getDesignToken('spacing.md')}`,
        borderRadius: getDesignToken(`borderRadius.${buttonStyle.borderRadius}`),
        fontSize: buttonStyle.fontSize,
        fontWeight: buttonStyle.fontWeight,
        border: buttonStyle.border === 'none' ? 'none' : `1px solid ${getDesignToken('colors.neutral.300')}`,
        cursor: buttonStyle.cursor,
    }
}

// CSS class name generators for Tailwind
export const tailwindClasses = {
    // Card styles
    card: {
        base: 'bg-background rounded-2xl p-6 shadow-sm border border-border',
        hover: 'hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 ease-in-out',
        glass: 'bg-white/80 dark:bg-gray-900/80 backdrop-blur-lg border border-white/30 dark:border-gray-700/50 shadow-lg',
        gradient: 'bg-gradient-to-br from-blue-50/50 to-green-50/50 dark:from-blue-900/20 dark:to-green-900/20 border border-blue-100/50 dark:border-blue-900/30',
        elevated: 'bg-background shadow-md border-0',
        outline: 'bg-transparent border-2 border-border/50 hover:border-border/80',
        accent: 'bg-accent/5 border border-accent/20',
        success: 'bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/50',
        warning: 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50',
        error: 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50',
        info: 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/50',
    },
    
    // List item styles
    listItem: {
        base: 'bg-background rounded-xl p-4 border border-border flex items-start sm:items-center gap-3',
        hover: 'hover:bg-accent/5 transition-colors duration-150',
        active: 'bg-accent/10 border-accent/30',
        disabled: 'opacity-50 cursor-not-allowed',
        interactive: 'cursor-pointer hover:bg-accent/5 active:bg-accent/10',
    },
    
    // Typography
    typography: {
        h1: 'text-4xl md:text-5xl font-bold tracking-tight',
        h2: 'text-3xl md:text-4xl font-bold tracking-tight',
        h3: 'text-2xl md:text-3xl font-semibold tracking-tight',
        h4: 'text-xl md:text-2xl font-semibold',
        title: 'text-lg font-semibold leading-7',
        subtitle: 'text-muted-foreground leading-6',
        body: 'text-foreground leading-relaxed',
        caption: 'text-sm text-muted-foreground',
        small: 'text-xs text-muted-foreground',
        code: 'font-mono text-sm bg-muted/50 px-1.5 py-0.5 rounded-md',
    },
    
    // Spacing utilities
    spacing: {
        // Padding
        p: {
            xs: 'p-1',
            sm: 'p-2',
            md: 'p-4',
            lg: 'p-6',
            xl: 'p-8',
            '2xl': 'p-12',
        },
        // Margin
        m: {
            xs: 'm-1',
            sm: 'm-2',
            md: 'm-4',
            lg: 'm-6',
            xl: 'm-8',
            '2xl': 'm-12',
        },
        // Gap
        gap: {
            xs: 'gap-1',
            sm: 'gap-2',
            md: 'gap-4',
            lg: 'gap-6',
            xl: 'gap-8',
            '2xl': 'gap-12',
        },
        // Space between
        space: {
            xs: 'space-x-1 space-y-1',
            sm: 'space-x-2 space-y-2',
            md: 'space-x-4 space-y-4',
            lg: 'space-x-6 space-y-6',
            xl: 'space-x-8 space-y-8',
            '2xl': 'space-x-12 space-y-12',
        }
    },
    
    // Button styles
    button: {
        primary: 'bg-gradient-to-r from-blue-500 to-green-500 text-white hover:from-blue-600 hover:to-green-600 hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 active:shadow-sm h-10 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80 h-10 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
        outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
        ghost: 'hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
        link: 'text-primary underline-offset-4 hover:underline h-10 px-4 py-2 text-sm font-medium',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        success: 'bg-emerald-600 text-white hover:bg-emerald-700',
        warning: 'bg-amber-500 text-white hover:bg-amber-600',
        info: 'bg-blue-600 text-white hover:bg-blue-700',
    },
    
    // Tab styles
    tab: {
        list: 'inline-flex items-center justify-center bg-muted/20 backdrop-blur-sm p-1.5 rounded-xl border border-border/50',
        trigger: 'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all duration-200 data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-foreground data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:bg-background/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
    },
    
    // Input styles
    input: {
        base: 'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1',
        search: 'pl-10',
        error: 'border-destructive focus-visible:ring-destructive/50',
        success: 'border-emerald-500 focus-visible:ring-emerald-500/50',
    },
    
    // Badge styles
    badge: {
        base: 'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
        default: 'border-transparent bg-primary/10 text-primary hover:bg-primary/20',
        secondary: 'border-transparent bg-secondary/10 text-secondary-foreground hover:bg-secondary/20',
        destructive: 'border-transparent bg-destructive/10 text-destructive hover:bg-destructive/20',
        outline: 'text-foreground border-border',
        success: 'border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
        warning: 'border-transparent bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
        info: 'border-transparent bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
    },
    
    // Alert styles
    alert: {
        base: 'relative w-full rounded-lg border p-4 [&>svg~*]:pl-7 [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:text-foreground',
        default: 'bg-background text-foreground',
        destructive: 'border-destructive/50 text-destructive dark:border-destructive [&>svg]:text-destructive',
        success: 'border-emerald-600/50 text-emerald-800 dark:text-emerald-300 [&>svg]:text-emerald-600',
        warning: 'border-amber-500/50 text-amber-800 dark:text-amber-300 [&>svg]:text-amber-500',
        info: 'border-blue-500/50 text-blue-800 dark:text-blue-300 [&>svg]:text-blue-500',
    },
    
    // Avatar styles
    avatar: {
        base: 'relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full',
        image: 'aspect-square h-full w-full',
        fallback: 'flex h-full w-full items-center justify-center rounded-full bg-muted',
    },
    
    // Skeleton styles
    skeleton: 'animate-pulse rounded-md bg-muted',
    
    // Animation utilities
    animation: {
        spin: 'animate-spin',
        ping: 'animate-ping',
        pulse: 'animate-pulse',
        bounce: 'animate-bounce',
        fadeIn: 'animate-fade-in',
        fadeOut: 'animate-fade-out',
        slideIn: 'animate-slide-in',
        slideOut: 'animate-slide-out',
    },
    
    // Transition utilities
    transition: {
        all: 'transition-all duration-200 ease-in-out',
        colors: 'transition-colors duration-200 ease-in-out',
        opacity: 'transition-opacity duration-200 ease-in-out',
        transform: 'transition-transform duration-200 ease-in-out',
        shadow: 'transition-shadow duration-200 ease-in-out',
    },
    
    // Layout utilities
    layout: {
        container: 'w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8',
        section: 'py-12 md:py-16 lg:py-20',
        grid: 'grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3',
        center: 'flex items-center justify-center',
        stack: 'flex flex-col',
        hstack: 'flex flex-row',
        vstack: 'flex flex-col',
        wrap: 'flex flex-wrap',
    },
    
    // Effect utilities
    effect: {
        glass: 'backdrop-blur-md bg-white/70 dark:bg-gray-900/70',
        gradientText: 'bg-clip-text text-transparent bg-gradient-to-r from-primary to-accent',
        highlight: 'relative after:absolute after:bottom-0.5 after:left-0 after:h-2 after:w-full after:bg-primary/20 after:-z-10',
    },
    
    // Component specific styles
    components: {
        // Tooltip
        tooltip: {
            content: 'z-50 overflow-hidden rounded-md border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
        },
        // Dropdown menu
        dropdown: {
            content: 'z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
            item: 'relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        },
        // Select
        select: {
            trigger: 'flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1',
            content: 'relative z-50 max-h-96 min-w-[8rem] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
            item: 'relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        },
        // Dialog
        dialog: {
            overlay: 'fixed inset-0 z-50 bg-background/80 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            content: 'fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg',
        },
    },
}

export default designSystem
