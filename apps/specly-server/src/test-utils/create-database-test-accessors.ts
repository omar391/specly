import { createTestInstanceAccessors } from '@omar391/mcp-kit/test-utils/create-test-instance-accessors';
import type { TestInstanceAccessors } from '@omar391/mcp-kit/test-utils/create-test-instance-accessors';

export interface DatabaseTestInstances<TDrizzleManager, TDbService> {
    drizzleManager: TDrizzleManager;
    dbService: TDbService;
}

export function createDatabaseTestAccessors<TDrizzleManager, TDbService>(): TestInstanceAccessors<DatabaseTestInstances<TDrizzleManager, TDbService>> {
    return createTestInstanceAccessors<DatabaseTestInstances<TDrizzleManager, TDbService>>();
}
