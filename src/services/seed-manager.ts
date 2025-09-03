import type { DrizzleDatabaseManager } from '../database/drizzle-connection.js';
import { mcpServerMappings, type NewMcpServerMapping } from '../database/schema/global-schema.js';
import { MCP_SERVER_MAPPINGS_SEED } from '../data/embedded-seed-data.js';
import { isStdioMode } from '../utils/cli-parser.js';
/**
 * Pure TypeScript/Drizzle ORM seed manager
 * Eliminates custom SQL and JSON, uses type-safe Drizzle operations
 */
export class SeedManager {
  private drizzleDb: ReturnType<DrizzleDatabaseManager['getDb']>;

  constructor(private dbManager: DrizzleDatabaseManager) {
    this.drizzleDb = this.dbManager.getDb();
  }

  /**
   * Initialize global seed data using pure Drizzle ORM operations
   */
  async initializeGlobalData(): Promise<void> {
    try {
      // Clear only mappings we still support; legacy tool flow constructs removed.
      await this.drizzleDb.delete(mcpServerMappings);
      await this.drizzleDb.insert(mcpServerMappings).values(MCP_SERVER_MAPPINGS_SEED as NewMcpServerMapping[]);
      if (!isStdioMode()) {
        console.log('Global MCP server mappings seeded (Specly mode)');
      }
    } catch (error) {
      console.error('Error initializing global data:', error);
      throw error;
    }
  }
}