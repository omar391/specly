// Drizzle ORM Schema Definitions
// Converts the SQL schema to TypeScript for type safety and automated migrations

// Re-export with explicit namespaces to avoid duplicate symbol names (e.g., sessions)
export * as GlobalSchema from './global-schema.js';
export * as WorkspaceSchema from './workspace-schema.js';
export * as Relations from './relations.js';
