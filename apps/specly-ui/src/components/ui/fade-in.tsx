import { motion } from 'framer-motion'
import { type ReactNode } from 'react'

export function FadeIn({ children, className, delay = 0 }: { children: ReactNode, className?: string, delay?: number }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay, ease: "easeOut" }}
            className={className}
        >
            {children}
        </motion.div>
    )
}
