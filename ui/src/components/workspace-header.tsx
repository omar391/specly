import React from 'react';
import { Link } from '@tanstack/react-router';
import { brandName } from '@/lib/design-system'

interface WorkspaceHeaderProps {
  workspaceName?: string;
  workspacePath?: string;
  title: string;
  description?: string;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
}

export function WorkspaceHeader({
  workspaceName,
  workspacePath,
  title,
  description,
  icon,
  actions,
}: WorkspaceHeaderProps) {
  return (
    <div className="bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-8">
          {/* Header */}
          <div className="text-center">
            <Link to="/" className="inline-block hover:opacity-80 transition-opacity">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">{brandName}</h1>
            </Link>
            <p className="text-gray-600">
              Model Context Protocol Task Manager
              {(workspaceName || workspacePath) && (
                <span className="text-gray-500 text-sm ml-2">
                  • {workspaceName && <span className="font-medium">{workspaceName}</span>}
                  {workspacePath && <span className="font-mono ml-1">({workspacePath})</span>}
                </span>
              )}
            </p>
          </div>
          
          {/* Page Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {icon && (
                <div className="h-16 w-16 rounded-3xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-xl">
                  {icon}
                </div>
              )}
              <div>
                <h2 className="text-4xl font-bold bg-gradient-to-r from-blue-500 to-blue-600 bg-clip-text text-transparent">
                  {title}
                </h2>
                {description && (
                  <p className="text-gray-600 text-lg mt-1">
                    {description}
                  </p>
                )}
              </div>
            </div>
            
            {actions && (
              <div className="flex-shrink-0">
                {actions}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
