import React from 'react';
import { Link } from '@tanstack/react-router';
import { spacing, colors, tailwindClasses, brandName } from '../lib/design-system';

export interface PageHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  workspaceName?: string;
  workspacePath?: string;
  actions?: React.ReactNode;
}

export function PageHeader({
  title,
  description,
  icon,
  workspaceName,
  workspacePath,
  children,
  actions,
}: PageHeaderProps) {
  // use tokens for spacing and colors, but keep responsive utility classes for layout
  return (
    <div
      // use neutral tokens for subtle gradient + token border
      style={{
        background: `linear-gradient(180deg, ${colors.neutral[50]}, ${colors.neutral[0]})`,
        borderBottom: `1px solid ${colors.neutral[200]}`,
      }}
    >
      <div
        className={tailwindClasses.layout.container}
        style={{ paddingTop: spacing.xl, paddingBottom: spacing.xl }}
      >
        <div className="space-y-8">
          {/* Header */}
          <div className="text-center">
            <Link to="/" className="inline-block hover:opacity-80 transition-all duration-200 group">
              <h1
                // gradient text using neutral tokens so it's theme-aware
                style={{
                  background: `linear-gradient(90deg, ${colors.neutral[900]}, ${colors.neutral[700]})`,
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text',
                  color: 'transparent',
                }}
                className="text-3xl font-bold mb-3 group-hover:opacity-90 transition-all duration-200"
              >
                {brandName}
              </h1>
            </Link>

            {/* Workspace Info */}
            {(workspaceName || workspacePath) && (
              <div className="max-w-2xl mx-auto">
                <div className={`${tailwindClasses.card.gradient} rounded-2xl shadow-sm`}>
                  <div className="space-y-3">
                    <div className="flex items-center justify-center gap-2">
                      <div
                        className="w-2 h-2 rounded-full animate-pulse"
                        style={{ backgroundColor: colors.accent.blue }}
                      ></div>
                      <p
                        className="text-lg font-semibold"
                        style={{ color: colors.accent.blue }}
                      >
                        {workspaceName || 'Workspace'}
                      </p>
                    </div>
                    {workspacePath && (
                      <div className="text-center">
                        <p
                          className="text-sm font-mono inline-block break-all max-w-full"
                          style={{
                            color: colors.accent.blue,
                            backgroundColor: 'rgba(255,255,255,0.6)',
                            padding: `0.5rem 1rem`,
                            borderRadius: '0.75rem',
                            border: `1px solid ${colors.neutral[200]}`,
                          }}
                        >
                          {workspacePath}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Page Header */}
          <div className="relative overflow-hidden rounded-2xl">
            {/* Gradient Background using accent token (use existing gradient token where available) */}
            <div
              className="absolute inset-0"
              style={{
                // design-system includes gradient strings for some accent gradients
                background:
                  // prefer a provided gradient token if present
                  (colors as any).accent?.gradientBlueGreen ||
                  `linear-gradient(135deg, ${colors.accent.blue}, ${colors.accent.purple})`,
              }}
            ></div>

            {/* Decorative Elements */}
            <div
              className="absolute top-0 right-0 w-64 h-64 rounded-full -translate-y-32 translate-x-32"
              style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}
            ></div>
            <div
              className="absolute bottom-0 left-0 w-48 h-48 rounded-full translate-y-24 -translate-x-24"
              style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}
            ></div>

            {/* Content */}
            <div className="relative z-10 px-6 py-6 sm:px-8 sm:py-8 lg:px-12 lg:py-12">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-6">
                  {icon && (
                    <div
                      className="h-20 w-20 flex-shrink-0 rounded-3xl backdrop-blur-sm flex items-center justify-center shadow-2xl"
                      style={{
                        backgroundColor: 'rgba(255,255,255,0.12)',
                        border: `1px solid rgba(255,255,255,0.12)`,
                      }}
                    >
                      {icon}
                    </div>
                  )}
                  <div>
                    <h2
                      className="text-4xl md:text-5xl font-bold mb-2"
                      style={{ color: colors.neutral[0], textShadow: '0 2px 12px rgba(0,0,0,0.15)' }}
                    >
                      {title}
                    </h2>
                    {description && (
                      <p
                        className="text-base md:text-xl leading-relaxed"
                        style={{ color: colors.accent.blue + 'dd' /* slight tint */ }}
                      >
                        {description}
                      </p>
                    )}
                  </div>
                </div>

                {actions && title === 'Tasks' && (
                  <div className="flex-shrink-0">
                    {actions}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Content */}
          {children && (
            <div
              className="bg-white/60 backdrop-blur-md rounded-2xl shadow-xl"
              style={{ border: `1px solid rgba(255,255,255,0.2)`, padding: spacing.lg }}
            >
              {children}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
