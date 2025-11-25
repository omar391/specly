
import { getGlobalDatabaseService } from './src/database/global-queries.js';
import { tools } from './src/database/schema/global-schema.js';

async function main() {
    try {
        console.log("Initializing DB...");
        const dbService = getGlobalDatabaseService();
        await dbService.initialize();
        console.log("DB Initialized.");

        const db = dbService.getDrizzleManager().getDb();
        console.log("Querying tools...");
        const allTools = await db.select().from(tools);
        console.log("Tools:", allTools);
    } catch (error) {
        console.error("Error:", error);
    }
}

main();
