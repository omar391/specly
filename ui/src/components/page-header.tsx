import React from 'react';
import { Link } from '@tanstack/react-router';

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
  return (
    <div className="bg-gradient-to-br from-gray-50 via-white to-gray-50 border-b border-gray-200/60">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-8">
          {/* Header */}
          <div className="text-center">
            <Link to="/" className="inline-block hover:opacity-80 transition-all duration-200 group">
              <h1 className="text-3xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent mb-3 group-hover:from-blue-600 group-hover:to-blue-500 transition-all duration-200">
                Specly
              </h1>
            </Link>
            
            {/* Workspace Info */}
            {(workspaceName || workspacePath) && (
              <div className="max-w-2xl mx-auto">
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200/40 rounded-2xl px-6 py-4 shadow-sm">
                  <div className="space-y-3">
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                      <p className="text-lg font-semibold text-blue-900">{workspaceName || 'Workspace'}</p>
                    </div>
                    {workspacePath && (
                      <div className="text-center">
                        <p className="text-sm text-blue-700 font-mono bg-white/60 px-4 py-2 rounded-xl border border-blue-200/60 inline-block break-all max-w-full">
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
            {/* Gradient Background */}
            <div className="absolute inset-0 bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800"></div>
            
            {/* Decorative Elements */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-32 translate-x-32"></div>
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/3 rounded-full translate-y-24 -translate-x-24"></div>
            
            {/* Content */}
            <div className="relative z-10 px-8 py-8">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-6">
                  {icon && (
                    <div className="h-20 w-20 flex-shrink-0 rounded-3xl bg-white/10 backdrop-blur-sm flex items-center justify-center shadow-2xl border border-white/20">
                      {icon}
                    </div>
                  )}
                  <div>
                    <h2 className="text-5xl font-bold text-white mb-2 drop-shadow-lg">
                      {title}
                    </h2>
                    {description && (
                      <p className="text-blue-100 text-xl leading-relaxed drop-shadow-sm">
                        {description}
                      </p>
                    )}
                  </div>
                </div>
                
                {actions && title === "Tasks" && (
                  <div className="flex-shrink-0">
                    {actions}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Content */}
          {children && (
            <div className="bg-white/60 backdrop-blur-md border border-white/20 rounded-2xl p-8 shadow-xl">
              {children}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
