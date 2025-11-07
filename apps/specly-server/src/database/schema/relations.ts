import { relations } from 'drizzle-orm';
import { 
  workspaces, 
  sessions
} from './global-schema.js';

// Define relationships between tables for better query experience

export const workspaceRelations = relations(workspaces, ({ many }) => ({
  sessions: many(sessions)
}));

export const sessionRelations = relations(sessions, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [sessions.workspaceId],
    references: [workspaces.id]
  })
}));

// Legacy tool flow / feedback relations removed per drastic migration rule.
