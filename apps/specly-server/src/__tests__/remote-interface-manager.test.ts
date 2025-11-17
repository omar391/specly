import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RemoteInterfaceManager, RemoteInterface, FieldMapping } from '../services/remote-interface-manager.js';
import { DatabaseService } from '../services/database-service.js';

// Mock dependencies
vi.mock('../services/database-service.js');

function createMockWorkspaceDb() {
    return {
        createRemoteInterface: vi.fn(),
        getAllRemoteInterfaces: vi.fn(),
        getRemoteInterface: vi.fn(),
        updateRemoteInterface: vi.fn(),
        deleteRemoteInterface: vi.fn()
    };
}

function createMockDbService() {
    const mockWorkspaceDb = createMockWorkspaceDb();
    return {
        getWorkspace: vi.fn().mockResolvedValue(mockWorkspaceDb)
    } as any;
}

describe('RemoteInterfaceManager', () => {
    let manager: RemoteInterfaceManager;
    let mockDbService: any;

    beforeEach(() => {
        vi.clearAllMocks();
        mockDbService = createMockDbService();
        manager = new RemoteInterfaceManager(mockDbService);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('registerInterface', () => {
        it('registers a GitHub interface with default options', async () => {
            const mockWorkspaceDb = createMockWorkspaceDb();
            mockDbService.getWorkspace.mockResolvedValue(mockWorkspaceDb);

            const result = await manager.registerInterface(
                'workspace-1',
                'github',
                'My GitHub',
                'https://api.github.com',
                'token123'
            );

            expect(result).toMatchObject({
                workspace_id: 'workspace-1',
                interface_type: 'github',
                name: 'My GitHub',
                base_url: 'https://api.github.com',
                api_token: 'token123',
                sync_enabled: true,
                sync_direction: 'bidirectional',
                mcp_server_name: 'github-mcp'
            });

            expect(mockWorkspaceDb.createRemoteInterface).toHaveBeenCalled();
        });

        it('registers interface with custom options', async () => {
            const mockWorkspaceDb = createMockWorkspaceDb();
            mockDbService.getWorkspace.mockResolvedValue(mockWorkspaceDb);

            const customMappings: FieldMapping[] = [
                { specly_field: 'title', remote_field: 'title' }
            ];

            const result = await manager.registerInterface(
                'workspace-1',
                'jira',
                'My Jira',
                'https://company.atlassian.net',
                'token123',
                {
                    projectId: 'PROJ',
                    syncEnabled: false,
                    syncDirection: 'import_only',
                    fieldMappings: customMappings,
                    mcpServerName: 'custom-jira-mcp'
                }
            );

            expect(result).toMatchObject({
                project_id: 'PROJ',
                sync_enabled: false,
                sync_direction: 'import_only',
                mcp_server_name: 'custom-jira-mcp'
            });

            expect(mockWorkspaceDb.createRemoteInterface).toHaveBeenCalled();
        });
    });

    describe('getWorkspaceInterfaces', () => {
        it('returns mapped interfaces from database', async () => {
            const mockWorkspaceDb = createMockWorkspaceDb();
            mockDbService.getWorkspace.mockResolvedValue(mockWorkspaceDb);

            const dbInterfaces = [
                {
                    id: 'ri_1',
                    interfaceType: 'github',
                    name: 'GitHub',
                    baseUrl: 'https://api.github.com',
                    apiToken: 'token',
                    projectId: null,
                    syncEnabled: true,
                    syncDirection: 'bidirectional',
                    fieldMappings: '{"title": "title"}',
                    lastSync: '2024-01-01T00:00:00Z',
                    createdAt: '2024-01-01T00:00:00Z',
                    updatedAt: '2024-01-01T00:00:00Z'
                }
            ];

            mockWorkspaceDb.getAllRemoteInterfaces.mockResolvedValue(dbInterfaces);

            const result = await manager.getWorkspaceInterfaces('workspace-1');

            expect(result).toHaveLength(1);
            expect(result[0]).toMatchObject({
                id: 'ri_1',
                workspace_id: 'workspace-1',
                interface_type: 'github',
                name: 'GitHub',
                base_url: 'https://api.github.com',
                sync_enabled: true,
                sync_direction: 'bidirectional'
            });
        });
    });

    describe('getInterface', () => {
        it('returns mapped interface when found', async () => {
            const mockWorkspaceDb = createMockWorkspaceDb();
            mockDbService.getWorkspace.mockResolvedValue(mockWorkspaceDb);

            const dbInterface = {
                id: 'ri_1',
                interfaceType: 'github',
                name: 'GitHub',
                baseUrl: 'https://api.github.com',
                apiToken: 'token',
                projectId: 'repo',
                syncEnabled: true,
                syncDirection: 'bidirectional',
                fieldMappings: '{"title": "title"}',
                lastSync: '2024-01-01T00:00:00Z',
                createdAt: '2024-01-01T00:00:00Z',
                updatedAt: '2024-01-01T00:00:00Z'
            };

            mockWorkspaceDb.getRemoteInterface.mockResolvedValue(dbInterface);

            const result = await manager.getInterface('workspace-1', 'ri_1');

            expect(result).toMatchObject({
                id: 'ri_1',
                workspace_id: 'workspace-1',
                interface_type: 'github',
                name: 'GitHub',
                project_id: 'repo'
            });
        });

        it('returns null when interface not found', async () => {
            const mockWorkspaceDb = createMockWorkspaceDb();
            mockDbService.getWorkspace.mockResolvedValue(mockWorkspaceDb);

            mockWorkspaceDb.getRemoteInterface.mockResolvedValue(null);

            const result = await manager.getInterface('workspace-1', 'ri_1');

            expect(result).toBeNull();
        });
    });

    describe('updateInterface', () => {
        it('updates interface with provided fields', async () => {
            const mockWorkspaceDb = createMockWorkspaceDb();
            mockDbService.getWorkspace.mockResolvedValue(mockWorkspaceDb);

            await manager.updateInterface('workspace-1', 'ri_1', {
                name: 'Updated Name',
                sync_enabled: false
            });

            expect(mockWorkspaceDb.updateRemoteInterface).toHaveBeenCalledWith('ri_1', {
                name: 'Updated Name',
                sync_enabled: false
            });
        });
    });

    describe('deleteInterface', () => {
        it('deletes interface from database', async () => {
            const mockWorkspaceDb = createMockWorkspaceDb();
            mockDbService.getWorkspace.mockResolvedValue(mockWorkspaceDb);

            await manager.deleteInterface('workspace-1', 'ri_1');

            expect(mockWorkspaceDb.deleteRemoteInterface).toHaveBeenCalledWith('ri_1');
        });
    });

    describe('testConnection', () => {
        beforeEach(() => {
            vi.spyOn(manager as any, 'testGitHubConnection');
            vi.spyOn(manager as any, 'testJiraConnection');
            vi.spyOn(manager as any, 'testLinearConnection');
            vi.spyOn(manager as any, 'testGenericConnection');
        });

        it('returns error when interface not found', async () => {
            const mockWorkspaceDb = createMockWorkspaceDb();
            mockDbService.getWorkspace.mockResolvedValue(mockWorkspaceDb);
            mockWorkspaceDb.getRemoteInterface.mockResolvedValue(null);

            const result = await manager.testConnection('workspace-1', 'ri_1');

            expect(result).toEqual({
                success: false,
                error: 'Interface not found'
            });
        });

        it('tests GitHub connection', async () => {
            const mockWorkspaceDb = createMockWorkspaceDb();
            mockDbService.getWorkspace.mockResolvedValue(mockWorkspaceDb);

            const githubInterface = {
                id: 'ri_1',
                workspace_id: 'workspace-1',
                interface_type: 'github' as const,
                name: 'GitHub',
                base_url: 'https://api.github.com',
                api_token: 'token',
                project_id: undefined,
                sync_enabled: false,
                sync_direction: 'bidirectional' as const,
                field_mappings: '{}',
                mcp_server_name: undefined,
                last_sync: null,
                created_at: '',
                updated_at: ''
            };

            mockWorkspaceDb.getRemoteInterface.mockResolvedValue({
                id: 'ri_1',
                interfaceType: 'github',
                name: 'GitHub',
                baseUrl: 'https://api.github.com',
                apiToken: 'token',
                projectId: null,
                syncEnabled: false,
                syncDirection: 'bidirectional',
                fieldMappings: '{}',
                lastSync: null,
                createdAt: '',
                updatedAt: ''
            });

            (manager as any).testGitHubConnection.mockResolvedValue({
                success: true,
                info: { user: 'testuser' }
            });

            const result = await manager.testConnection('workspace-1', 'ri_1');

            expect((manager as any).testGitHubConnection).toHaveBeenCalledWith(githubInterface);
            expect(result.success).toBe(true);
        });

        it('tests Jira connection', async () => {
            const mockWorkspaceDb = createMockWorkspaceDb();
            mockDbService.getWorkspace.mockResolvedValue(mockWorkspaceDb);

            mockWorkspaceDb.getRemoteInterface.mockResolvedValue({
                id: 'ri_1',
                interfaceType: 'jira',
                baseUrl: 'https://company.atlassian.net',
                apiToken: 'token'
            });

            (manager as any).testJiraConnection.mockResolvedValue({
                success: true,
                info: { user: 'testuser' }
            });

            const result = await manager.testConnection('workspace-1', 'ri_1');

            expect((manager as any).testJiraConnection).toHaveBeenCalled();
            expect(result.success).toBe(true);
        });

        it('tests Linear connection', async () => {
            const mockWorkspaceDb = createMockWorkspaceDb();
            mockDbService.getWorkspace.mockResolvedValue(mockWorkspaceDb);

            mockWorkspaceDb.getRemoteInterface.mockResolvedValue({
                id: 'ri_1',
                interfaceType: 'linear',
                baseUrl: 'https://api.linear.app',
                apiToken: 'token'
            });

            (manager as any).testLinearConnection.mockResolvedValue({
                success: true,
                info: { user: 'testuser' }
            });

            const result = await manager.testConnection('workspace-1', 'ri_1');

            expect((manager as any).testLinearConnection).toHaveBeenCalled();
            expect(result.success).toBe(true);
        });

        it('tests generic connection for unsupported types', async () => {
            const mockWorkspaceDb = createMockWorkspaceDb();
            mockDbService.getWorkspace.mockResolvedValue(mockWorkspaceDb);

            mockWorkspaceDb.getRemoteInterface.mockResolvedValue({
                id: 'ri_1',
                interfaceType: 'custom',
                baseUrl: 'https://api.example.com',
                apiToken: 'token'
            });

            (manager as any).testGenericConnection.mockResolvedValue({
                success: true,
                info: { status: 200 }
            });

            const result = await manager.testConnection('workspace-1', 'ri_1');

            expect((manager as any).testGenericConnection).toHaveBeenCalled();
            expect(result.success).toBe(true);
        });

        it('handles connection test errors', async () => {
            const mockWorkspaceDb = createMockWorkspaceDb();
            mockDbService.getWorkspace.mockResolvedValue(mockWorkspaceDb);

            mockWorkspaceDb.getRemoteInterface.mockResolvedValue({
                id: 'ri_1',
                interfaceType: 'github',
                baseUrl: 'https://api.github.com',
                apiToken: 'token'
            });

            (manager as any).testGitHubConnection.mockRejectedValue(new Error('Network error'));

            const result = await manager.testConnection('workspace-1', 'ri_1');

            expect(result).toEqual({
                success: false,
                error: 'Network error'
            });
        });
    });

    describe('syncInterface', () => {
        it('throws error when interface not found', async () => {
            const mockWorkspaceDb = createMockWorkspaceDb();
            mockDbService.getWorkspace.mockResolvedValue(mockWorkspaceDb);
            mockWorkspaceDb.getRemoteInterface.mockResolvedValue(null);

            await expect(manager.syncInterface('workspace-1', 'ri_1')).rejects.toThrow('Interface not found');
        });

        it('throws error when sync is disabled', async () => {
            const mockWorkspaceDb = createMockWorkspaceDb();
            mockDbService.getWorkspace.mockResolvedValue(mockWorkspaceDb);

            mockWorkspaceDb.getRemoteInterface.mockResolvedValue({
                id: 'ri_1',
                interfaceType: 'jira',
                syncEnabled: false
            });

            await expect(manager.syncInterface('workspace-1', 'ri_1')).rejects.toThrow('Synchronization is disabled');
        });

        it('handles GitHub sync with error in result', async () => {
            const mockWorkspaceDb = createMockWorkspaceDb();
            mockDbService.getWorkspace.mockResolvedValue(mockWorkspaceDb);

            mockWorkspaceDb.getRemoteInterface.mockResolvedValue({
                id: 'ri_1',
                interfaceType: 'github',
                syncEnabled: true
            });

            const result = await manager.syncInterface('workspace-1', 'ri_1');

            expect(result.errors).toContain('GitHub synchronization should use specly_github tool');
            expect(result.interface_id).toBe('ri_1');
        });

        it('handles unsupported interface types with error in result', async () => {
            const mockWorkspaceDb = createMockWorkspaceDb();
            mockDbService.getWorkspace.mockResolvedValue(mockWorkspaceDb);

            mockWorkspaceDb.getRemoteInterface.mockResolvedValue({
                id: 'ri_1',
                interfaceType: 'custom',
                syncEnabled: true
            });

            const result = await manager.syncInterface('workspace-1', 'ri_1');

            expect(result.errors).toContain('Synchronization not implemented for custom');
            expect(result.interface_id).toBe('ri_1');
        });

        it('handles sync errors gracefully', async () => {
            const mockWorkspaceDb = createMockWorkspaceDb();
            mockDbService.getWorkspace.mockResolvedValue(mockWorkspaceDb);

            mockWorkspaceDb.getRemoteInterface.mockResolvedValue({
                id: 'ri_1',
                interfaceType: 'jira',
                syncEnabled: true
            });

            // Mock the syncJiraInterface to throw
            vi.spyOn(manager as any, 'syncJiraInterface').mockRejectedValue(new Error('Sync failed'));

            const result = await manager.syncInterface('workspace-1', 'ri_1');

            expect(result.errors).toContain('Sync failed');
            expect(result.items_failed).toBe(0); // No items were processed
        });
    });

    describe('getDefaultFieldMappings', () => {
        it('returns GitHub field mappings', () => {
            const mappings = (manager as any).getDefaultFieldMappings('github');

            expect(mappings).toEqual([
                { specly_field: 'title', remote_field: 'title' },
                { specly_field: 'description', remote_field: 'description' },
                { specly_field: 'status', remote_field: 'status' },
                { specly_field: 'status', remote_field: 'state', transformation: 'custom' },
                { specly_field: 'priority', remote_field: 'labels', transformation: 'custom' }
            ]);
        });

        it('returns Jira field mappings', () => {
            const mappings = (manager as any).getDefaultFieldMappings('jira');

            expect(mappings).toEqual([
                { specly_field: 'title', remote_field: 'title' },
                { specly_field: 'description', remote_field: 'description' },
                { specly_field: 'status', remote_field: 'status' },
                { specly_field: 'priority', remote_field: 'priority.name' },
                { specly_field: 'status', remote_field: 'status.name' },
                { specly_field: 'assignee', remote_field: 'assignee.displayName' }
            ]);
        });

        it('returns Linear field mappings', () => {
            const mappings = (manager as any).getDefaultFieldMappings('linear');

            expect(mappings).toEqual([
                { specly_field: 'title', remote_field: 'title' },
                { specly_field: 'description', remote_field: 'description' },
                { specly_field: 'status', remote_field: 'status' },
                { specly_field: 'priority', remote_field: 'priority', transformation: 'custom' },
                { specly_field: 'status', remote_field: 'state.name' },
                { specly_field: 'assignee', remote_field: 'assignee.name' }
            ]);
        });

        it('returns default mappings for unknown types', () => {
            const mappings = (manager as any).getDefaultFieldMappings('custom');

            expect(mappings).toEqual([
                { specly_field: 'title', remote_field: 'title' },
                { specly_field: 'description', remote_field: 'description' },
                { specly_field: 'status', remote_field: 'status' }
            ]);
        });
    });

    describe('connection test methods', () => {
        beforeEach(() => {
            vi.spyOn(global, 'fetch').mockImplementation(vi.fn());
        });

        afterEach(() => {
            vi.restoreAllMocks();
        });

        describe('testGitHubConnection', () => {
            it('returns success on valid response', async () => {
                const mockResponse = {
                    ok: true,
                    json: vi.fn().mockResolvedValue({
                        login: 'testuser',
                        name: 'Test User',
                        type: 'User'
                    })
                };
                (global.fetch as any).mockResolvedValue(mockResponse);

                const remoteInterface = {
                    base_url: 'https://api.github.com',
                    api_token: 'token123'
                } as RemoteInterface;

                const result = await (manager as any).testGitHubConnection(remoteInterface);

                expect(result).toEqual({
                    success: true,
                    info: {
                        user: 'testuser',
                        name: 'Test User',
                        type: 'User'
                    }
                });
                expect(global.fetch).toHaveBeenCalledWith('https://api.github.com/user', {
                    headers: {
                        'Authorization': 'token token123',
                        'Accept': 'application/vnd.github.v3+json'
                    }
                });
            });

            it('returns error on API failure', async () => {
                const mockResponse = {
                    ok: false,
                    status: 401,
                    statusText: 'Unauthorized'
                };
                (global.fetch as any).mockResolvedValue(mockResponse);

                const remoteInterface = {
                    base_url: 'https://api.github.com',
                    api_token: 'badtoken'
                } as RemoteInterface;

                const result = await (manager as any).testGitHubConnection(remoteInterface);

                expect(result).toEqual({
                    success: false,
                    error: 'GitHub API error: 401 Unauthorized'
                });
            });

            it('handles network errors', async () => {
                (global.fetch as any).mockRejectedValue(new Error('Network timeout'));

                const remoteInterface = {
                    base_url: 'https://api.github.com',
                    api_token: 'token123'
                } as RemoteInterface;

                const result = await (manager as any).testGitHubConnection(remoteInterface);

                expect(result).toEqual({
                    success: false,
                    error: 'Connection failed: Network timeout'
                });
            });
        });

        describe('testJiraConnection', () => {
            it('returns success on valid response', async () => {
                const mockResponse = {
                    ok: true,
                    json: vi.fn().mockResolvedValue({
                        key: 'user123',
                        displayName: 'Test User',
                        emailAddress: 'test@example.com'
                    })
                };
                (global.fetch as any).mockResolvedValue(mockResponse);

                const remoteInterface = {
                    base_url: 'https://company.atlassian.net',
                    api_token: 'token123'
                } as RemoteInterface;

                const result = await (manager as any).testJiraConnection(remoteInterface);

                expect(result).toEqual({
                    success: true,
                    info: {
                        user: 'user123',
                        name: 'Test User',
                        email: 'test@example.com'
                    }
                });
            });

            it('returns error on API failure', async () => {
                const mockResponse = {
                    ok: false,
                    status: 403,
                    statusText: 'Forbidden'
                };
                (global.fetch as any).mockResolvedValue(mockResponse);

                const remoteInterface = {
                    base_url: 'https://company.atlassian.net',
                    api_token: 'badtoken'
                } as RemoteInterface;

                const result = await (manager as any).testJiraConnection(remoteInterface);

                expect(result).toEqual({
                    success: false,
                    error: 'Jira API error: 403 Forbidden'
                });
            });
        });

        describe('testLinearConnection', () => {
            it('returns success on valid GraphQL response', async () => {
                const mockResponse = {
                    ok: true,
                    json: vi.fn().mockResolvedValue({
                        data: {
                            viewer: {
                                id: 'user123',
                                name: 'Test User',
                                email: 'test@example.com'
                            }
                        }
                    })
                };
                (global.fetch as any).mockResolvedValue(mockResponse);

                const remoteInterface = {
                    base_url: 'https://api.linear.app',
                    api_token: 'token123'
                } as RemoteInterface;

                const result = await (manager as any).testLinearConnection(remoteInterface);

                expect(result).toEqual({
                    success: true,
                    info: {
                        user: 'user123',
                        name: 'Test User',
                        email: 'test@example.com'
                    }
                });
            });

            it('handles GraphQL errors', async () => {
                const mockResponse = {
                    ok: true,
                    json: vi.fn().mockResolvedValue({
                        errors: [{ message: 'Invalid token' }]
                    })
                };
                (global.fetch as any).mockResolvedValue(mockResponse);

                const remoteInterface = {
                    base_url: 'https://api.linear.app',
                    api_token: 'badtoken'
                } as RemoteInterface;

                const result = await (manager as any).testLinearConnection(remoteInterface);

                expect(result).toEqual({
                    success: false,
                    error: 'Linear API error: Invalid token'
                });
            });
        });

        describe('testGenericConnection', () => {
            it('returns success on OK response', async () => {
                const mockResponse = {
                    ok: true,
                    status: 200
                };
                (global.fetch as any).mockResolvedValue(mockResponse);

                const remoteInterface = {
                    base_url: 'https://api.example.com',
                    api_token: 'token123'
                } as RemoteInterface;

                const result = await (manager as any).testGenericConnection(remoteInterface);

                expect(result).toEqual({
                    success: true,
                    info: { status: 200 }
                });
            });

            it('returns error on failed response', async () => {
                const mockResponse = {
                    ok: false,
                    status: 500,
                    statusText: 'Internal Server Error'
                };
                (global.fetch as any).mockResolvedValue(mockResponse);

                const remoteInterface = {
                    base_url: 'https://api.example.com',
                    api_token: 'token123'
                } as RemoteInterface;

                const result = await (manager as any).testGenericConnection(remoteInterface);

                expect(result).toEqual({
                    success: false,
                    error: 'API error: 500 Internal Server Error'
                });
            });
        });
    });

    describe('sync methods', () => {
        describe('syncJiraInterface', () => {
            it('throws not implemented error', async () => {
                const remoteInterface = {} as RemoteInterface;
                const result = {} as any;

                await expect((manager as any).syncJiraInterface(remoteInterface, result)).rejects.toThrow('Jira synchronization not yet implemented');
            });
        });

        describe('syncLinearInterface', () => {
            it('throws not implemented error', async () => {
                const remoteInterface = {} as RemoteInterface;
                const result = {} as any;

                await expect((manager as any).syncLinearInterface(remoteInterface, result)).rejects.toThrow('Linear synchronization not yet implemented');
            });
        });
    });

    describe('getWorkspaceSyncStats', () => {
        it('returns sync statistics for workspace', async () => {
            const mockWorkspaceDb = createMockWorkspaceDb();
            mockDbService.getWorkspace.mockResolvedValue(mockWorkspaceDb);

            const interfaces = [
                {
                    id: 'ri_1',
                    interface_type: 'github' as const,
                    name: 'GitHub',
                    sync_enabled: true,
                    last_sync: new Date().toISOString(),
                    mcp_server_name: 'github-mcp'
                },
                {
                    id: 'ri_2',
                    interface_type: 'jira' as const,
                    name: 'Jira',
                    sync_enabled: false,
                    last_sync: null
                }
            ];

            vi.spyOn(manager, 'getWorkspaceInterfaces').mockResolvedValue(interfaces);

            const result = await manager.getWorkspaceSyncStats('workspace-1');

            expect(result).toMatchObject({
                total_interfaces: 2,
                sync_enabled: 1,
                last_sync_24h: 1,
                interfaces: [
                    {
                        id: 'ri_1',
                        name: 'GitHub',
                        type: 'github',
                        sync_enabled: true,
                        mcp_server_name: 'github-mcp'
                    },
                    {
                        id: 'ri_2',
                        name: 'Jira',
                        type: 'jira',
                        sync_enabled: false,
                        last_sync: null
                    }
                ]
            });
        });

        it('counts interfaces synced within last 24 hours', async () => {
            const yesterday = new Date();
            yesterday.setHours(yesterday.getHours() - 25); // More than 24 hours ago

            const interfaces = [
                {
                    id: 'ri_1',
                    interface_type: 'github' as const,
                    name: 'GitHub',
                    sync_enabled: true,
                    last_sync: new Date().toISOString(), // Recent
                    mcp_server_name: 'github-mcp'
                },
                {
                    id: 'ri_2',
                    interface_type: 'jira' as const,
                    name: 'Jira',
                    sync_enabled: true,
                    last_sync: yesterday.toISOString() // Old
                }
            ];

            vi.spyOn(manager, 'getWorkspaceInterfaces').mockResolvedValue(interfaces);

            const result = await manager.getWorkspaceSyncStats('workspace-1');

            expect(result.sync_enabled).toBe(2);
            expect(result.last_sync_24h).toBe(1);
        });
    });
});