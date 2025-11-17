import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies
const mockRepo = {
    createProfile: vi.fn(),
    createProfileVersion: vi.fn(),
    getProfileByName: vi.fn(),
    listProfileVersions: vi.fn(),
    bindWorkspaceProfile: vi.fn(),
    getWorkspaceBindingDetails: vi.fn(),
    attachToolToProfileVersion: vi.fn(),
    listProfileVersionAttachments: vi.fn(),
    getProfileVersionByNumber: vi.fn(),
};

vi.mock('../../repositories/profile-repository.js', () => ({
    ProfileRepository: vi.fn(() => mockRepo)
}));

vi.mock('../../database/global-queries.js', () => ({
    GlobalDatabaseService: vi.fn().mockImplementation(() => ({
        initialize: vi.fn(),
        getWorkspace: vi.fn(),
        getDrizzleManager: vi.fn(() => ({ getDb: vi.fn(() => ({})) })),
    })),
    getGlobalDatabaseService: vi.fn(() => ({
        initialize: vi.fn(),
        getWorkspace: vi.fn(),
        getDrizzleManager: vi.fn(() => ({ getDb: vi.fn(() => ({})) })),
    })),
}));

import { ProfilesController } from '../profiles.js';
import type { GlobalDatabaseService } from '../../database/global-queries.js';
import { ProfileRepository } from '../../repositories/profile-repository.js';

// Helper to create param mock
const createParamMock = (params: Record<string, string>) => vi.fn((key?: string) => {
    if (key) return params[key];
    return params;
});

describe('ProfilesController', () => {
    let controller: ProfilesController;
    let mockDb: any;

    beforeEach(() => {
        vi.clearAllMocks();
        mockDb = {
            initialize: vi.fn(),
            getWorkspace: vi.fn(),
            getDrizzleManager: vi.fn(() => ({
                getDb: vi.fn(() => ({
                    select: vi.fn(() => ({
                        from: vi.fn(() => ({
                            where: vi.fn(() => Promise.resolve([]))
                        }))
                    }))
                }))
            })),
        };
        controller = new ProfilesController(mockDb);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('constructor', () => {
        it('should set defaultDb when provided', () => {
            const customDb = { initialize: vi.fn() };
            const testController = new ProfilesController(customDb as any);
            expect(testController).toBeInstanceOf(ProfilesController);
        });

        it('should use getGlobalDatabaseService when no defaultDb', () => {
            const testController = new ProfilesController();
            expect(testController).toBeInstanceOf(ProfilesController);
        });
    });

    describe('createProfile', () => {
        it('should create profile successfully', async () => {
            const mockCtx = {
                req: { json: vi.fn().mockResolvedValue({ name: 'test-profile', description: 'desc' }) },
                json: vi.fn(),
                env: {},
            };
            mockRepo.createProfile.mockResolvedValue({ created: true, profile: { id: '1', name: 'test-profile' } });

            await controller.createProfile(mockCtx as any);

            expect(mockCtx.req.json).toHaveBeenCalled();
            expect(mockDb.initialize).toHaveBeenCalled();
            expect(mockRepo.createProfile).toHaveBeenCalledWith({ name: 'test-profile', description: 'desc', parentProfileId: null });
            expect(mockCtx.json).toHaveBeenCalledWith({ id: '1', name: 'test-profile', created: true }, 201);
        });

        it('should return 400 for missing name', async () => {
            const mockCtx = {
                req: { json: vi.fn().mockResolvedValue({}) },
                json: vi.fn(),
            };

            await controller.createProfile(mockCtx as any);

            expect(mockCtx.json).toHaveBeenCalledWith({ error: 'name required' }, 400);
        });

        it('should return 400 for empty name', async () => {
            const mockCtx = {
                req: { json: vi.fn().mockResolvedValue({ name: '' }) },
                json: vi.fn(),
            };

            await controller.createProfile(mockCtx as any);

            expect(mockCtx.json).toHaveBeenCalledWith({ error: 'name required' }, 400);
        });

        it('should return 409 for existing profile', async () => {
            const mockCtx = {
                req: { json: vi.fn().mockResolvedValue({ name: 'existing' }) },
                json: vi.fn(),
            };
            mockRepo.createProfile.mockResolvedValue({ created: false, profile: { name: 'existing' } });

            await controller.createProfile(mockCtx as any);

            expect(mockCtx.json).toHaveBeenCalledWith({ error: 'profile exists', name: 'existing' }, 409);
        });

        it('should handle validation error', async () => {
            const mockCtx = {
                req: { json: vi.fn().mockResolvedValue({ name: 'test' }) },
                json: vi.fn(),
            };
            const error = new Error('validation failed');
            mockRepo.createProfile.mockRejectedValue(error);

            await controller.createProfile(mockCtx as any);

            expect(mockCtx.json).toHaveBeenCalledWith({ error: 'validation failed' }, 422);
        });

        it('should use fallback when injected dbService is invalid', async () => {
            const mockCtx = {
                req: { json: vi.fn().mockResolvedValue({ name: 'test-profile', description: 'desc' }) },
                json: vi.fn(),
                env: { dbService: 'invalid' }, // Invalid injected service
            };
            mockRepo.createProfile.mockResolvedValue({ created: true, profile: { id: '1', name: 'test-profile' } });

            await controller.createProfile(mockCtx as any);

            expect(mockDb.initialize).toHaveBeenCalled();
            expect(mockRepo.createProfile).toHaveBeenCalledWith({ name: 'test-profile', description: 'desc', parentProfileId: null });
            expect(mockCtx.json).toHaveBeenCalledWith({ id: '1', name: 'test-profile', created: true }, 201);
        });
    });

    describe('createProfileVersion', () => {
        it('should create profile version successfully', async () => {
            const mockCtx = {
                req: {
                    param: vi.fn().mockReturnValue('test-profile'),
                    json: vi.fn().mockResolvedValue({ parent_profile_version_id: 'parent-id' })
                },
                json: vi.fn(),
            };
            mockRepo.getProfileByName.mockResolvedValue({ id: 'profile-id' });
            mockRepo.createProfileVersion.mockResolvedValue({ id: 'version-id', version: 1 });

            await controller.createProfileVersion(mockCtx as any);

            expect(mockRepo.getProfileByName).toHaveBeenCalledWith('test-profile');
            expect(mockRepo.createProfileVersion).toHaveBeenCalledWith({ profileId: 'profile-id', parentProfileVersionId: 'parent-id' });
            expect(mockCtx.json).toHaveBeenCalledWith({ id: 'version-id', version: 1, created: true }, 201);
        });

        it('should return 400 for missing profile param', async () => {
            const mockCtx = {
                req: { param: vi.fn().mockReturnValue(undefined) },
                json: vi.fn(),
            };

            await controller.createProfileVersion(mockCtx as any);

            expect(mockCtx.json).toHaveBeenCalledWith({ error: 'profile param required' }, 400);
        });

        it('should return 404 for profile not found', async () => {
            const mockCtx = {
                req: {
                    param: vi.fn().mockReturnValue('nonexistent'),
                    json: vi.fn().mockResolvedValue({})
                },
                json: vi.fn(),
            };
            mockRepo.getProfileByName.mockResolvedValue(null);

            await controller.createProfileVersion(mockCtx as any);

            expect(mockCtx.json).toHaveBeenCalledWith({ error: 'profile not found', profile: 'nonexistent' }, 404);
        });

        it('should handle validation error', async () => {
            const mockCtx = {
                req: {
                    param: vi.fn().mockReturnValue('test-profile'),
                    json: vi.fn().mockResolvedValue({})
                },
                json: vi.fn(),
            };
            mockRepo.getProfileByName.mockResolvedValue({ id: 'profile-id' });
            const error = new Error('Cycle detected');
            mockRepo.createProfileVersion.mockRejectedValue(error);

            await controller.createProfileVersion(mockCtx as any);

            expect(mockCtx.json).toHaveBeenCalledWith({ error: 'Cycle detected' }, 422);
        });

        it('should handle unknown error in createProfileVersion', async () => {
            const mockCtx = {
                req: {
                    param: vi.fn().mockReturnValue('test-profile'),
                    json: vi.fn().mockResolvedValue({})
                },
                json: vi.fn(),
            };
            mockRepo.getProfileByName.mockResolvedValue({ id: 'profile-id' });
            const error = new Error('some unknown error');
            mockRepo.createProfileVersion.mockRejectedValue(error);

            await controller.createProfileVersion(mockCtx as any);

            expect(mockCtx.json).toHaveBeenCalledWith({ error: 'failed to create profile version' }, 500);
        });

        it('should handle error with no message in createProfileVersion', async () => {
            const mockCtx = {
                req: {
                    param: vi.fn().mockReturnValue('test-profile'),
                    json: vi.fn().mockResolvedValue({})
                },
                json: vi.fn(),
            };
            mockRepo.getProfileByName.mockResolvedValue({ id: 'profile-id' });
            const error = new Error();
            mockRepo.createProfileVersion.mockRejectedValue(error);

            await controller.createProfileVersion(mockCtx as any);

            expect(mockCtx.json).toHaveBeenCalledWith({ error: 'failed to create profile version' }, 500);
        });
    });

    describe('upgradeWorkspaceProfile', () => {
        it('should upgrade workspace profile successfully', async () => {
            const mockCtx = {
                req: {
                    param: createParamMock({ workspaceId: 'ws-id' }),
                    json: vi.fn().mockResolvedValue({ profile: 'test-profile', version: 1 })
                },
                json: vi.fn(),
            };
            mockDb.getWorkspace.mockResolvedValue({ id: 'ws-id' });
            mockRepo.getProfileByName.mockResolvedValue({ id: 'profile-id' });
            mockRepo.listProfileVersions.mockResolvedValue([{ id: 'pv-id', version: 1 }]);
            mockRepo.bindWorkspaceProfile.mockResolvedValue({ workspaceId: 'ws-id', profileVersionId: 'pv-id', pinnedAt: new Date() });

            await controller.upgradeWorkspaceProfile(mockCtx as any);

            expect(mockCtx.json).toHaveBeenCalledWith(
                expect.objectContaining({ workspace_id: 'ws-id', profile_version_id: 'pv-id' }),
                200
            );
        });

        it('should upgrade workspace profile when drizzle query succeeds', async () => {
            // Override the drizzle mock to return a workspace
            mockDb.getDrizzleManager.mockReturnValue({
                getDb: vi.fn(() => ({
                    select: vi.fn(() => ({
                        from: vi.fn(() => ({
                            where: vi.fn(() => ({
                                limit: vi.fn(() => Promise.resolve([{ id: 'ws-id' }]))
                            }))
                        }))
                    }))
                }))
            });

            const mockCtx = {
                req: {
                    param: createParamMock({ workspaceId: 'ws-id' }),
                    json: vi.fn().mockResolvedValue({ profile: 'test-profile', version: 1 })
                },
                json: vi.fn(),
            };
            mockRepo.getProfileByName.mockResolvedValue({ id: 'profile-id' });
            mockRepo.listProfileVersions.mockResolvedValue([{ id: 'pv-id', version: 1 }]);
            mockRepo.bindWorkspaceProfile.mockResolvedValue({ workspaceId: 'ws-id', profileVersionId: 'pv-id', pinnedAt: new Date() });

            await controller.upgradeWorkspaceProfile(mockCtx as any);

            expect(mockDb.getWorkspace).not.toHaveBeenCalled(); // Should not fallback
            expect(mockCtx.json).toHaveBeenCalledWith(
                expect.objectContaining({ workspace_id: 'ws-id', profile_version_id: 'pv-id' }),
                200
            );
        });

        it('should return 400 for missing workspaceId', async () => {
            const mockCtx = {
                req: {
                    param: createParamMock({}),
                    json: vi.fn().mockResolvedValue({ profile: 'test-profile' })
                },
                json: vi.fn(),
            };

            await controller.upgradeWorkspaceProfile(mockCtx as any);

            expect(mockCtx.json).toHaveBeenCalledWith({ error: 'workspaceId required' }, 400);
        });

        it('should return 404 for workspace not found', async () => {
            const mockCtx = {
                req: {
                    param: createParamMock({ workspaceId: 'ws-id' }),
                    json: vi.fn().mockResolvedValue({ profile: 'test-profile' })
                },
                json: vi.fn(),
            };
            mockDb.getWorkspace.mockResolvedValue(null);

            await controller.upgradeWorkspaceProfile(mockCtx as any);

            expect(mockCtx.json).toHaveBeenCalledWith({ error: 'workspace not found', workspaceId: 'ws-id' }, 404);
        });

        it('should return 400 for missing profile', async () => {
            const mockCtx = {
                req: {
                    param: createParamMock({ workspaceId: 'ws-id' }),
                    json: vi.fn().mockResolvedValue({})
                },
                json: vi.fn(),
            };
            mockDb.getWorkspace.mockResolvedValue({ id: 'ws-id' });

            await controller.upgradeWorkspaceProfile(mockCtx as any);

            expect(mockCtx.json).toHaveBeenCalledWith({ error: 'profile name required in body' }, 400);
        });

        it('should return 404 for profile not found', async () => {
            const mockCtx = {
                req: {
                    param: createParamMock({ workspaceId: 'ws-id' }),
                    json: vi.fn().mockResolvedValue({ profile: 'nonexistent' })
                },
                json: vi.fn(),
            };
            mockDb.getWorkspace.mockResolvedValue({ id: 'ws-id' });
            mockRepo.getProfileByName.mockResolvedValue(null);

            await controller.upgradeWorkspaceProfile(mockCtx as any);

            expect(mockCtx.json).toHaveBeenCalledWith({ error: 'profile not found', profile: 'nonexistent' }, 404);
        });

        it('should return 409 for no profile versions', async () => {
            const mockCtx = {
                req: {
                    param: createParamMock({ workspaceId: 'ws-id' }),
                    json: vi.fn().mockResolvedValue({ profile: 'test-profile' })
                },
                json: vi.fn(),
            };
            mockDb.getWorkspace.mockResolvedValue({ id: 'ws-id' });
            mockRepo.getProfileByName.mockResolvedValue({ id: 'profile-id' });
            mockRepo.listProfileVersions.mockResolvedValue([]);

            await controller.upgradeWorkspaceProfile(mockCtx as any);

            expect(mockCtx.json).toHaveBeenCalledWith({ error: 'no profile versions to bind', profile: 'test-profile' }, 409);
        });

        it('should return 404 for version not found', async () => {
            const mockCtx = {
                req: {
                    param: createParamMock({ workspaceId: 'ws-id' }),
                    json: vi.fn().mockResolvedValue({ profile: 'test-profile', version: 2 })
                },
                json: vi.fn(),
            };
            mockDb.getWorkspace.mockResolvedValue({ id: 'ws-id' });
            mockRepo.getProfileByName.mockResolvedValue({ id: 'profile-id' });
            mockRepo.listProfileVersions.mockResolvedValue([{ id: 'pv-id', version: 1 }]);

            await controller.upgradeWorkspaceProfile(mockCtx as any);

            expect(mockCtx.json).toHaveBeenCalledWith({ error: 'profile version not found', profile: 'test-profile', version: 2 }, 404);
        });
    });

    describe('getWorkspaceProfile', () => {
        it('should get workspace profile successfully', async () => {
            const mockCtx = {
                req: {
                    param: createParamMock({ workspaceId: 'ws-id' })
                },
                json: vi.fn(),
            };
            mockRepo.getWorkspaceBindingDetails.mockResolvedValue({
                workspaceId: 'ws-id',
                profileVersionId: 'pv-id',
                pinnedAt: new Date(),
                profileName: 'test-profile',
                profileVersion: 1
            });

            await controller.getWorkspaceProfile(mockCtx as any);

            expect(mockCtx.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    workspace_id: 'ws-id',
                    profile_version_id: 'pv-id',
                    profile_name: 'test-profile',
                    version: 1
                }),
                200
            );
        });

        it('should return 404 for unbound workspace', async () => {
            const mockCtx = {
                req: {
                    param: createParamMock({ workspaceId: 'ws-id' })
                },
                json: vi.fn(),
            };
            mockRepo.getWorkspaceBindingDetails.mockResolvedValue(null);

            await controller.getWorkspaceProfile(mockCtx as any);

            expect(mockCtx.json).toHaveBeenCalledWith({ error: 'workspace profile not bound', workspaceId: 'ws-id' }, 404);
        });
    });

    describe('attachTools', () => {
        it('should attach tools successfully', async () => {
            const mockCtx = {
                req: {
                    param: createParamMock({ profile: 'test-profile', version: '1' }),
                    json: vi.fn().mockResolvedValue({ attachments: [{ tool_name: 'tool1', tool_version_hash: 'hash1' }] })
                },
                json: vi.fn(),
            };
            mockRepo.getProfileByName.mockResolvedValue({ id: 'profile-id' });
            mockRepo.getProfileVersionByNumber.mockResolvedValue({ id: 'pv-id' });
            mockRepo.attachToolToProfileVersion.mockResolvedValue({ created: true });
            mockRepo.listProfileVersionAttachments.mockResolvedValue([{ tool_name: 'tool1' }]);

            await controller.attachTools(mockCtx as any);

            expect(mockCtx.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    profile: 'test-profile',
                    version: 1,
                    attached: [{ tool: 'tool1', created: true }]
                }),
                201
            );
        });

        it('should return 400 for missing profile', async () => {
            const mockCtx = {
                req: {
                    param: createParamMock({ version: '1' }),
                    json: vi.fn().mockResolvedValue({ attachments: [] })
                },
                json: vi.fn(),
            };

            await controller.attachTools(mockCtx as any);

            expect(mockCtx.json).toHaveBeenCalledWith({ error: 'profile and numeric version required' }, 400);
        });

        it('should return 400 for invalid version', async () => {
            const mockCtx = {
                req: {
                    param: createParamMock({ profile: 'test-profile', version: 'invalid' }),
                    json: vi.fn().mockResolvedValue({ attachments: [] })
                },
                json: vi.fn(),
            };

            await controller.attachTools(mockCtx as any);

            expect(mockCtx.json).toHaveBeenCalledWith({ error: 'profile and numeric version required' }, 400);
        });

        it('should return 400 for empty attachments', async () => {
            const mockCtx = {
                req: {
                    param: createParamMock({ profile: 'test-profile', version: '1' }),
                    json: vi.fn().mockResolvedValue({ attachments: [] })
                },
                json: vi.fn(),
            };
            mockRepo.getProfileByName.mockResolvedValue({ id: 'profile-id' });
            mockRepo.getProfileVersionByNumber.mockResolvedValue({ id: 'pv-id' });

            await controller.attachTools(mockCtx as any);

            expect(mockCtx.json).toHaveBeenCalledWith({ error: 'attachments[] required' }, 400);
        });

        it('should return 404 for profile not found', async () => {
            const mockCtx = {
                req: {
                    param: createParamMock({ profile: 'nonexistent', version: '1' }),
                    json: vi.fn().mockResolvedValue({ attachments: [{ tool_name: 'tool1', tool_version_hash: 'hash1' }] })
                },
                json: vi.fn(),
            };
            mockRepo.getProfileByName.mockResolvedValue(null);

            await controller.attachTools(mockCtx as any);

            expect(mockCtx.json).toHaveBeenCalledWith({ error: 'profile not found', profile: 'nonexistent' }, 404);
        });

        it('should return 404 for version not found', async () => {
            const mockCtx = {
                req: {
                    param: createParamMock({ profile: 'test-profile', version: '1' }),
                    json: vi.fn().mockResolvedValue({ attachments: [{ tool_name: 'tool1', tool_version_hash: 'hash1' }] })
                },
                json: vi.fn(),
            };
            mockRepo.getProfileByName.mockResolvedValue({ id: 'profile-id' });
            mockRepo.getProfileVersionByNumber.mockResolvedValue(null);

            await controller.attachTools(mockCtx as any);

            expect(mockCtx.json).toHaveBeenCalledWith({ error: 'profile version not found', profile: 'test-profile', version: 1 }, 404);
        });

        it('should return 400 for missing tool fields', async () => {
            const mockCtx = {
                req: {
                    param: createParamMock({ profile: 'test-profile', version: '1' }),
                    json: vi.fn().mockResolvedValue({ attachments: [{ tool_name: 'tool1' }] })
                },
                json: vi.fn(),
            };
            mockRepo.getProfileByName.mockResolvedValue({ id: 'profile-id' });
            mockRepo.getProfileVersionByNumber.mockResolvedValue({ id: 'pv-id' });

            await controller.attachTools(mockCtx as any);

            expect(mockCtx.json).toHaveBeenCalledWith({ error: 'tool_name and tool_version_hash required for each attachment' }, 400);
        });

        it('should handle attach error', async () => {
            const mockCtx = {
                req: {
                    param: createParamMock({ profile: 'test-profile', version: '1' }),
                    json: vi.fn().mockResolvedValue({ attachments: [{ tool_name: 'tool1', tool_version_hash: 'hash1' }] })
                },
                json: vi.fn(),
            };
            mockRepo.getProfileByName.mockResolvedValue({ id: 'profile-id' });
            mockRepo.getProfileVersionByNumber.mockResolvedValue({ id: 'pv-id' });
            mockRepo.attachToolToProfileVersion.mockRejectedValue(new Error('attach failed'));

            await controller.attachTools(mockCtx as any);

            expect(mockCtx.json).toHaveBeenCalledWith({ error: 'attach failed', tool_name: 'tool1' }, 422);
        });
    });

    describe('getAttachments', () => {
        it('should get attachments successfully', async () => {
            const mockCtx = {
                req: {
                    param: createParamMock({ profile: 'test-profile', version: '1' })
                },
                json: vi.fn(),
            };
            mockRepo.getProfileByName.mockResolvedValue({ id: 'profile-id' });
            mockRepo.getProfileVersionByNumber.mockResolvedValue({ id: 'pv-id' });
            mockRepo.listProfileVersionAttachments.mockResolvedValue([{ tool_name: 'tool1' }]);

            await controller.getAttachments(mockCtx as any);

            expect(mockCtx.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    profile: 'test-profile',
                    version: 1,
                    attachments: [{ tool_name: 'tool1' }]
                }),
                200
            );
        });

        it('should return 400 for missing profile', async () => {
            const mockCtx = {
                req: {
                    param: createParamMock({ version: '1' })
                },
                json: vi.fn(),
            };

            await controller.getAttachments(mockCtx as any);

            expect(mockCtx.json).toHaveBeenCalledWith({ error: 'profile and numeric version required' }, 400);
        });

        it('should return 404 for profile not found', async () => {
            const mockCtx = {
                req: {
                    param: createParamMock({ profile: 'nonexistent', version: '1' })
                },
                json: vi.fn(),
            };
            mockRepo.getProfileByName.mockResolvedValue(null);

            await controller.getAttachments(mockCtx as any);

            expect(mockCtx.json).toHaveBeenCalledWith({ error: 'profile not found', profile: 'nonexistent' }, 404);
        });

        it('should return 404 for version not found', async () => {
            const mockCtx = {
                req: {
                    param: createParamMock({ profile: 'test-profile', version: '1' })
                },
                json: vi.fn(),
            };
            mockRepo.getProfileByName.mockResolvedValue({ id: 'profile-id' });
            mockRepo.getProfileVersionByNumber.mockResolvedValue(null);

            await controller.getAttachments(mockCtx as any);

            expect(mockCtx.json).toHaveBeenCalledWith({ error: 'profile version not found', profile: 'test-profile', version: 1 }, 404);
        });
    });

    describe('publishProfileVersion', () => {
        it('should publish profile version successfully', async () => {
            const mockCtx = {
                req: {
                    param: createParamMock({ profile: 'test-profile', version: '1' })
                },
                json: vi.fn(),
            };
            mockRepo.getProfileByName.mockResolvedValue({ id: 'profile-id' });
            mockRepo.getProfileVersionByNumber.mockResolvedValue({ id: 'pv-id' });

            await controller.publishProfileVersion(mockCtx as any);

            expect(mockCtx.json).toHaveBeenCalledWith(
                { profile: 'test-profile', version: 1, published: true },
                200
            );
        });

        it('should return 400 for missing profile', async () => {
            const mockCtx = {
                req: {
                    param: createParamMock({ version: '1' })
                },
                json: vi.fn(),
            };

            await controller.publishProfileVersion(mockCtx as any);

            expect(mockCtx.json).toHaveBeenCalledWith({ error: 'profile and numeric version required' }, 400);
        });

        it('should return 404 for profile not found', async () => {
            const mockCtx = {
                req: {
                    param: createParamMock({ profile: 'nonexistent', version: '1' })
                },
                json: vi.fn(),
            };
            mockRepo.getProfileByName.mockResolvedValue(null);

            await controller.publishProfileVersion(mockCtx as any);

            expect(mockCtx.json).toHaveBeenCalledWith({ error: 'profile not found', profile: 'nonexistent' }, 404);
        });

        it('should return 404 for version not found', async () => {
            const mockCtx = {
                req: {
                    param: createParamMock({ profile: 'test-profile', version: '1' })
                },
                json: vi.fn(),
            };
            mockRepo.getProfileByName.mockResolvedValue({ id: 'profile-id' });
            mockRepo.getProfileVersionByNumber.mockResolvedValue(null);

            await controller.publishProfileVersion(mockCtx as any);

            expect(mockCtx.json).toHaveBeenCalledWith({ error: 'profile version not found', profile: 'test-profile', version: 1 }, 404);
        });
    });
});