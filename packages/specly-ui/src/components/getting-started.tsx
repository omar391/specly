import { designSystem, tailwindClasses } from '@/lib/design-system'

export function GettingStarted() {
  return (
    <div className={`${tailwindClasses.card.base} ${tailwindClasses.card.hover}`}>
      <div className="text-center py-16">
        <div 
          className="h-28 w-28 mx-auto rounded-3xl flex items-center justify-center mb-8"
          style={{ 
            background: `linear-gradient(135deg, ${designSystem.colors.accent.blue}15, ${designSystem.colors.accent.green}15)`,
            border: `3px solid ${designSystem.colors.accent.blue}30`
          }}
        >
          <span className="text-5xl">🚀</span>
        </div>
        <div>
          <h2 
            className={`${tailwindClasses.typography.title} mb-4`}
            style={{ fontSize: '2rem', fontWeight: '700' }}
          >
            Welcome to Specly!
          </h2>
          <p 
            className={`${tailwindClasses.typography.subtitle} mb-8 max-w-lg mx-auto`}
            style={{ fontSize: '1.2rem', lineHeight: '1.6' }}
          >
            Your AI-powered task management system is ready. Let's activate your first workspace.
          </p>
          
          {/* Prominent instruction card */}
          <div 
            className="max-w-xl mx-auto mb-8 p-6 rounded-2xl"
            style={{ 
              background: `linear-gradient(135deg, ${designSystem.colors.accent.blue}08, ${designSystem.colors.accent.green}08)`,
              border: `2px solid ${designSystem.colors.accent.blue}20`
            }}
          >
            <div className="flex items-center justify-center gap-3 mb-4">
              <div 
                className="h-10 w-10 rounded-full flex items-center justify-center"
                style={{ backgroundColor: designSystem.colors.accent.blue }}
              >
                <span className="text-white text-lg font-bold">!</span>
              </div>
              <h3 
                className={`${tailwindClasses.typography.title} text-lg`}
                style={{ color: designSystem.colors.accent.blue, fontWeight: '600' }}
              >
                Quick Start Required
              </h3>
            </div>
            <p 
              className={`${tailwindClasses.typography.subtitle} mb-4`}
              style={{ fontSize: '1rem' }}
            >
              To activate Specly, run this command in your IDE or CLI:
            </p>
            <div 
              className="px-4 py-3 rounded-lg font-mono text-lg text-center"
              style={{ 
                backgroundColor: designSystem.colors.neutral[900],
                color: designSystem.colors.accent.green,
                border: `1px solid ${designSystem.colors.neutral[700]}`
              }}
            >
              taskpilot_start
            </div>
            <p 
              className={`${tailwindClasses.typography.caption} mt-3`}
              style={{ color: designSystem.colors.neutral[600] }}
            >
              Or use <code 
                className="px-1 py-0.5 rounded font-mono text-xs"
                style={{ backgroundColor: designSystem.colors.neutral[100] }}
              >taskpilot_init</code> to initialize a new project workspace
            </p>
          </div>
          
          {/* Step-by-step guide */}
          <div className="max-w-md mx-auto mb-8 space-y-4">
            <h4 
              className={`${tailwindClasses.typography.title} text-lg mb-4`}
              style={{ color: designSystem.colors.neutral[700] }}
            >
              How it works:
            </h4>
            
            <div 
              className="p-4 rounded-xl text-left"
              style={{ backgroundColor: designSystem.colors.neutral[50] }}
            >
              <div className="flex items-start gap-3">
                <div 
                  className="h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 mt-0.5"
                  style={{ 
                    backgroundColor: designSystem.colors.accent.blue,
                    color: 'white'
                  }}
                >
                  1
                </div>
                <div>
                  <p className={`${tailwindClasses.typography.subtitle} font-medium mb-1`}>
                    Open your IDE (VS Code, Cursor, etc.)
                  </p>
                  <p className={`${tailwindClasses.typography.caption}`} style={{ color: designSystem.colors.neutral[600] }}>
                    Make sure Specly MCP is configured in your settings
                  </p>
                </div>
              </div>
            </div>
            
            <div 
              className="p-4 rounded-xl text-left"
              style={{ backgroundColor: designSystem.colors.neutral[50] }}
            >
              <div className="flex items-start gap-3">
                <div 
                  className="h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 mt-0.5"
                  style={{ 
                    backgroundColor: designSystem.colors.accent.blue,
                    color: 'white'
                  }}
                >
                  2
                </div>
                <div>
                  <p className={`${tailwindClasses.typography.subtitle} font-medium mb-1`}>
                    Run the activation command
                  </p>
                  <p className={`${tailwindClasses.typography.caption}`} style={{ color: designSystem.colors.neutral[600] }}>
                    This connects your workspace to Specly
                  </p>
                </div>
              </div>
            </div>
            
            <div 
              className="p-4 rounded-xl text-left"
              style={{ backgroundColor: designSystem.colors.neutral[50] }}
            >
              <div className="flex items-start gap-3">
                <div 
                  className="h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 mt-0.5"
                  style={{ 
                    backgroundColor: designSystem.colors.accent.green,
                    color: 'white'
                  }}
                >
                  3
                </div>
                <div>
                  <p className={`${tailwindClasses.typography.subtitle} font-medium mb-1`}>
                    Your workspace appears here!
                  </p>
                  <p className={`${tailwindClasses.typography.caption}`} style={{ color: designSystem.colors.neutral[600] }}>
                    Start managing tasks, tracking progress, and boosting productivity
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
