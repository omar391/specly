import { DatabaseService } from './database-service.js';
import { ToolNames } from '../constants/tool-names.js';

export interface RemoteInterface {
    id: string;
    workspace_id: string;
    interface_type: 'github' | 'jira' | 'linear' | 'asana' | 'trello' | 'custom';
    name: string;
    base_url: string;
    api_token: string;
    project_id?: string; // Jira project key, Linear team ID, etc.
    sync_enabled: boolean;
    sync_direction: 'bidirectional' | 'import_only' | 'export_only';
    field_mappings: string; // JSON string of field mappings
    mcp_server_name?: string; // Name of the specialized MCP server to delegate operations to
    last_sync: string | null;
    created_at: string;
    updated_at: string;
}

export interface MCPServerMapping {
    id: string;
    interface_type: RemoteInterface['interface_type'];
    mcp_server_name: string;
    description: string;
    is_default: boolean;
    created_at: string;
    updated_at: string;
}

export interface FieldMapping {
    specly_field: string;
    remote_field: string;
    transformation?: 'direct' | 'uppercase' | 'lowercase' | 'custom';
    custom_transform?: string; // Custom transformation logic
}

export interface SyncResult {
    interface_id: string;
    items_imported: number;
    items_exported: number;
    items_updated: number;
    items_failed: number;
    errors: string[];
    last_sync: string;
}

export class RemoteInterfaceManager {
    private dbService: DatabaseService;

    constructor(dbService: DatabaseService) {
        this.dbService = dbService;
    }

    /**
     * Register a new remote interface
     */
    async registerInterface(
        workspaceId: string,
        interfaceType: RemoteInterface['interface_type'],
        name: string,
        baseUrl: string,
        apiToken: string,
        options: {
            projectId?: string;
            syncEnabled?: boolean;
            syncDirection?: RemoteInterface['sync_direction'];
            fieldMappings?: FieldMapping[];
            mcpServerName?: string;
        } = {}
    ): Promise<RemoteInterface> {
        const interfaceId = `ri_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const now = new Date().toISOString();

        // Get default MCP server name if not provided
        const mcpServerName = options.mcpServerName || `${interfaceType}-mcp`;

        const defaultFieldMappings = this.getDefaultFieldMappings(interfaceType);
        const fieldMappings = options.fieldMappings || defaultFieldMappings;

        const remoteInterface: RemoteInterface = {
            id: interfaceId,
            workspace_id: workspaceId,
            interface_type: interfaceType,
            name,
            base_url: baseUrl,
            api_token: apiToken,
            project_id: options.projectId,
            sync_enabled: options.syncEnabled ?? true,
            sync_direction: options.syncDirection ?? 'bidirectional',
            field_mappings: JSON.stringify(fieldMappings),
            mcp_server_name: mcpServerName,
            last_sync: null,
            created_at: now,
            updated_at: now
        };

        // Use WorkspaceDatabaseService method
        const workspaceDb = await this.dbService.getWorkspace(workspaceId);
        // Map to DB format
        const dbRemoteInterface = {
            id: remoteInterface.id,
            interfaceType: remoteInterface.interface_type,
            name: remoteInterface.name,
            baseUrl: remoteInterface.base_url,
            apiToken: remoteInterface.api_token,
            projectId: remoteInterface.project_id ?? null,
            syncEnabled: remoteInterface.sync_enabled,
            syncDirection: remoteInterface.sync_direction,
            fieldMappings: remoteInterface.field_mappings,
            mcpServerName: remoteInterface.mcp_server_name,
            lastSync: remoteInterface.last_sync,
            createdAt: remoteInterface.created_at,
            updatedAt: remoteInterface.updated_at,
        };
        await workspaceDb.createRemoteInterface(dbRemoteInterface);

        return remoteInterface;
    }

    /**
     * Get all remote interfaces for a workspace
     */
    async getWorkspaceInterfaces(workspaceId: string): Promise<RemoteInterface[]> {
        // Use WorkspaceDatabaseService method
        const workspaceDb = await this.dbService.getWorkspace(workspaceId);
        const dbInterfaces = await workspaceDb.getAllRemoteInterfaces();
        return dbInterfaces.map((i: any) => ({
            id: i.id,
            workspace_id: workspaceId,
            interface_type: i.interfaceType,
            name: i.name,
            base_url: i.baseUrl,
            api_token: i.apiToken,
            project_id: i.projectId ?? undefined,
            sync_enabled: i.syncEnabled ?? false,
            sync_direction: i.syncDirection ?? 'bidirectional',
            field_mappings: typeof i.fieldMappings === 'string' ? i.fieldMappings : JSON.stringify(i.fieldMappings ?? {}),
            // mcp_server_name omitted: not present in DB object,
            last_sync: i.lastSync ?? null,
            created_at: i.createdAt ?? '',
            updated_at: i.updatedAt ?? '',
        }));
    }

    /**
     * Get a specific remote interface
     */
    async getInterface(workspaceId: string, interfaceId: string): Promise<RemoteInterface | null> {
        const workspaceDb = await this.dbService.getWorkspace(workspaceId);
        const i = await workspaceDb.getRemoteInterface(interfaceId);
        if (!i) return null;
        return {
            id: i.id,
            workspace_id: workspaceId,
            interface_type: i.interfaceType,
            name: i.name,
            base_url: i.baseUrl,
            api_token: i.apiToken,
            project_id: i.projectId ?? undefined,
            sync_enabled: i.syncEnabled ?? false,
            sync_direction: i.syncDirection ?? 'bidirectional',
            field_mappings: typeof i.fieldMappings === 'string' ? i.fieldMappings : JSON.stringify(i.fieldMappings ?? {}),
            // mcp_server_name omitted: not present in DB object,
            last_sync: i.lastSync ?? null,
            created_at: i.createdAt ?? '',
            updated_at: i.updatedAt ?? '',
        };
    }

    /**
     * Update remote interface configuration
     */
    async updateInterface(
        workspaceId: string,
        interfaceId: string,
        updates: Partial<Pick<RemoteInterface, 'name' | 'base_url' | 'api_token' | 'project_id' | 'sync_enabled' | 'sync_direction' | 'field_mappings' | 'mcp_server_name'>>
    ): Promise<void> {
        const workspaceDb = await this.dbService.getWorkspace(workspaceId);
        await workspaceDb.updateRemoteInterface(interfaceId, updates);
    }

    /**
     * Delete a remote interface
     */
    async deleteInterface(workspaceId: string, interfaceId: string): Promise<void> {
        const workspaceDb = await this.dbService.getWorkspace(workspaceId);
        await workspaceDb.deleteRemoteInterface(interfaceId);
    }

    // MCP server mapping methods removed: no valid service method exists.

    /**
     * Test connection to a remote interface
     */
    async testConnection(workspaceId: string, interfaceId: string): Promise<{ success: boolean; error?: string; info?: any }> {
        const remoteInterface = await this.getInterface(workspaceId, interfaceId);
        if (!remoteInterface) {
            return { success: false, error: 'Interface not found' };
        }

        try {
            switch (remoteInterface.interface_type) {
                case 'github':
                    return await this.testGitHubConnection(remoteInterface);
                case 'jira':
                    return await this.testJiraConnection(remoteInterface);
                case 'linear':
                    return await this.testLinearConnection(remoteInterface);
                default:
                    return await this.testGenericConnection(remoteInterface);
            }
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    /**
     * Synchronize tasks with a remote interface
     */
    async syncInterface(workspaceId: string, interfaceId: string): Promise<SyncResult> {
        const remoteInterface = await this.getInterface(workspaceId, interfaceId);
        if (!remoteInterface) {
            throw new Error('Interface not found');
        }

        if (!remoteInterface.sync_enabled) {
            throw new Error('Synchronization is disabled for this interface');
        }

        const result: SyncResult = {
            interface_id: interfaceId,
            items_imported: 0,
            items_exported: 0,
            items_updated: 0,
            items_failed: 0,
            errors: [],
            last_sync: new Date().toISOString()
        };

        try {
            switch (remoteInterface.interface_type) {
                case 'github':
                    // GitHub sync is handled by GitHubTool
                    throw new Error(`GitHub synchronization should use ${ToolNames.GITHUB} tool`);
                case 'jira':
                    await this.syncJiraInterface(remoteInterface, result);
                    break;
                case 'linear':
                    await this.syncLinearInterface(remoteInterface, result);
                    break;
                default:
                    throw new Error(`Synchronization not implemented for ${remoteInterface.interface_type}`);
            }

            // Update last sync timestamp: implement with a valid service method if needed.

        } catch (error) {
            result.errors.push(error instanceof Error ? error.message : 'Unknown sync error');
        }

        return result;
    }

    /**
     * Get default field mappings for an interface type
     */
    private getDefaultFieldMappings(interfaceType: RemoteInterface['interface_type']): FieldMapping[] {
        const baseMapping: FieldMapping[] = [
            { specly_field: 'title', remote_field: 'title' },
            { specly_field: 'description', remote_field: 'description' },
            { specly_field: 'status', remote_field: 'status' }
        ];

        switch (interfaceType) {
            case 'github':
                return [
                    ...baseMapping,
                    { specly_field: 'status', remote_field: 'state', transformation: 'custom' },
                    { specly_field: 'priority', remote_field: 'labels', transformation: 'custom' }
                ];
            case 'jira':
                return [
                    ...baseMapping,
                    { specly_field: 'priority', remote_field: 'priority.name' },
                    { specly_field: 'status', remote_field: 'status.name' },
                    { specly_field: 'assignee', remote_field: 'assignee.displayName' }
                ];
            case 'linear':
                return [
                    ...baseMapping,
                    { specly_field: 'priority', remote_field: 'priority', transformation: 'custom' },
                    { specly_field: 'status', remote_field: 'state.name' },
                    { specly_field: 'assignee', remote_field: 'assignee.name' }
                ];
            default:
                return baseMapping;
        }
    }

    /**
     * Test GitHub connection
     */
    private async testGitHubConnection(remoteInterface: RemoteInterface): Promise<{ success: boolean; error?: string; info?: any }> {
        try {
            const response = await fetch(`${remoteInterface.base_url}/user`, {
                headers: {
                    'Authorization': `token ${remoteInterface.api_token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (response.ok) {
                const user = await response.json();
                return {
                    success: true,
                    info: {
                        user: user.login,
                        name: user.name,
                        type: user.type
                    }
                };
            } else {
                return {
                    success: false,
                    error: `GitHub API error: ${response.status} ${response.statusText}`
                };
            }
        } catch (error) {
            return {
                success: false,
                error: `Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`
            };
        }
    }

    /**
     * Test Jira connection
     */
    private async testJiraConnection(remoteInterface: RemoteInterface): Promise<{ success: boolean; error?: string; info?: any }> {
        try {
            const response = await fetch(`${remoteInterface.base_url}/rest/api/2/myself`, {
                headers: {
                    'Authorization': `Bearer ${remoteInterface.api_token}`,
                    'Accept': 'application/json'
                }
            });

            if (response.ok) {
                const user = await response.json();
                return {
                    success: true,
                    info: {
                        user: user.key,
                        name: user.displayName,
                        email: user.emailAddress
                    }
                };
            } else {
                return {
                    success: false,
                    error: `Jira API error: ${response.status} ${response.statusText}`
                };
            }
        } catch (error) {
            return {
                success: false,
                error: `Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`
            };
        }
    }

    /**
     * Test Linear connection
     */
    private async testLinearConnection(remoteInterface: RemoteInterface): Promise<{ success: boolean; error?: string; info?: any }> {
        try {
            const response = await fetch(`${remoteInterface.base_url}/graphql`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${remoteInterface.api_token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    query: 'query { viewer { id name email } }'
                })
            });

            if (response.ok) {
                const result = await response.json();
                if (result.data?.viewer) {
                    return {
                        success: true,
                        info: {
                            user: result.data.viewer.id,
                            name: result.data.viewer.name,
                            email: result.data.viewer.email
                        }
                    };
                } else {
                    return {
                        success: false,
                        error: `Linear API error: ${result.errors?.[0]?.message || 'Unknown error'}`
                    };
                }
            } else {
                return {
                    success: false,
                    error: `Linear API error: ${response.status} ${response.statusText}`
                };
            }
        } catch (error) {
            return {
                success: false,
                error: `Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`
            };
        }
    }

    /**
     * Test generic REST API connection
     */
    private async testGenericConnection(remoteInterface: RemoteInterface): Promise<{ success: boolean; error?: string; info?: any }> {
        try {
            const response = await fetch(remoteInterface.base_url, {
                headers: {
                    'Authorization': `Bearer ${remoteInterface.api_token}`,
                    'Accept': 'application/json'
                }
            });

            return {
                success: response.ok,
                error: response.ok ? undefined : `API error: ${response.status} ${response.statusText}`,
                info: response.ok ? { status: response.status } : undefined
            };
        } catch (error) {
            return {
                success: false,
                error: `Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`
            };
        }
    }

    /**
     * Sync with Jira interface (placeholder implementation)
     */
    private async syncJiraInterface(remoteInterface: RemoteInterface, result: SyncResult): Promise<void> {
        // Placeholder for Jira synchronization logic
        // This would implement bidirectional sync between Specly tasks and Jira issues
        throw new Error('Jira synchronization not yet implemented');
    }

    /**
     * Sync with Linear interface (placeholder implementation)
     */
    private async syncLinearInterface(remoteInterface: RemoteInterface, result: SyncResult): Promise<void> {
        // Placeholder for Linear synchronization logic
        // This would implement bidirectional sync between Specly tasks and Linear issues
        throw new Error('Linear synchronization not yet implemented');
    }

    /**
     * Get sync statistics for all interfaces in a workspace
     */
    async getWorkspaceSyncStats(workspaceId: string): Promise<{
        total_interfaces: number;
        sync_enabled: number;
        last_sync_24h: number;
        interfaces: Array<{
            id: string;
            name: string;
            type: string;
            sync_enabled: boolean;
            last_sync: string | null;
            mcp_server_name?: string;
        }>;
    }> {
        const interfaces = await this.getWorkspaceInterfaces(workspaceId);
        const now = new Date();
        const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

        const syncEnabled = interfaces.filter(i => i.sync_enabled).length;
        const lastSync24h = interfaces.filter(i =>
            i.last_sync && new Date(i.last_sync) > yesterday
        ).length;

        return {
            total_interfaces: interfaces.length,
            sync_enabled: syncEnabled,
            last_sync_24h: lastSync24h,
            interfaces: interfaces.map(i => ({
                id: i.id,
                name: i.name,
                type: i.interface_type,
                sync_enabled: i.sync_enabled,
                last_sync: i.last_sync,
                mcp_server_name: i.mcp_server_name
            }))
        };
    }
}
