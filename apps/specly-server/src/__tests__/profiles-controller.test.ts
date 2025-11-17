import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Context } from 'hono';
import { ProfilesController } from '../api/profiles';
import { GlobalDatabaseService } from '../database/global-queries.js';
import { ProfileRepository } from '../repositories/profile-repository.js';

// Mock dependencies
vi.mock('../database/global-queries.js');
vi.mock('../repositories/profile-repository.js');

describe('ProfilesController', () => {
    let controller: ProfilesController;
    let mockDb: GlobalDatabaseService;
    let mockRepo: ProfileRepository;
    let mockContext: Context;

    beforeEach(() => {
        // Reset mocks
        vi.clearAllMocks();

        // Create mock database service
        mockDb = {
            initialize: vi.fn().mockResolvedValue(undefined),
            getWorkspace: vi.fn(),
            getDrizzleManager: vi.fn().mockReturnValue({
                getDb: vi.fn().mockReturnValue({
                    select: vi.fn().mockReturnValue({
                        from: vi.fn().mockReturnValue({
                            where: vi.fn().mockReturnValue([])
                        })
                    })
                })
            })
        } as any;

        // Create mock repository
        mockRepo = {
            createProfile: vi.fn(),
            getProfileByName: vi.fn(),
            createProfileVersion: vi.fn(),
            listProfileVersions: vi.fn(),
            getProfileVersionByNumber: vi.fn(),
            bindWorkspaceProfile: vi.fn(),
            getWorkspaceBindingDetails: vi.fn(),
            attachToolToProfileVersion: vi.fn(),
            listProfileVersionAttachments: vi.fn()
        } as any;

        // Create controller with mock db
        controller = new ProfilesController(mockDb);

        // Mock context
        mockContext = {
            req: {
                json: vi.fn().mockResolvedValue({}),
                param: vi.fn(),
                query: vi.fn()
            },
            json: vi.fn(),
            env: {}
        } as any;

        // Mock ProfileRepository constructor
        vi.mocked(ProfileRepository).mockImplementation(() => mockRepo);
    });

    describe('constructor', () => {
        it('should use provided database service', () => {
            const testController = new ProfilesController(mockDb);
            expect(testController).toBeDefined();
        });

        it('should get global database service when none provided', () => {
            // Mock getGlobalDatabaseService
            const mockGlobalDb = { initialize: vi.fn() };
            vi.mocked(GlobalDatabaseService).mockImplementation(() => mockGlobalDb as any);

            const testController = new ProfilesController();
            expect(testController).toBeDefined();
        });
    });

    describe('createProfileVersion', () => {
        it('should return 400 when profile param is missing', async () => {
            mockContext.req.param.mockReturnValue(undefined);

            const result = await controller.createProfileVersion(mockContext);

            expect(mockContext.json).toHaveBeenCalledWith({ error: 'profile param required' }, 400);
        });

        it('should return 404 when profile not found', async () => {
            mockContext.req.param.mockReturnValue('nonexistent-profile');
            mockContext.req.json.mockResolvedValue({ parent_profile_version_id: null });
            mockRepo.getProfileByName.mockResolvedValue(null);

            const result = await controller.createProfileVersion(mockContext);

            expect(mockContext.json).toHaveBeenCalledWith({ error: 'profile not found', profile: 'nonexistent-profile' }, 404);
        });

        it('should create profile version successfully', async () => {
            const mockProfile = { id: 'profile-1', name: 'test-profile' };
            const mockVersion = { id: 'version-1', version: 1 };

            mockContext.req.param.mockReturnValue('test-profile');
            mockContext.req.json.mockResolvedValue({ parent_profile_version_id: null });
            mockRepo.getProfileByName.mockResolvedValue(mockProfile);
            mockRepo.createProfileVersion.mockResolvedValue(mockVersion);

            const result = await controller.createProfileVersion(mockContext);

            expect(mockRepo.createProfileVersion).toHaveBeenCalledWith({
                profileId: 'profile-1',
                parentProfileVersionId: null
            });
            expect(mockContext.json).toHaveBeenCalledWith({
                id: 'version-1',
                version: 1,
                created: true
            }, 201);
        });

        it('should handle validation errors', async () => {
            const mockProfile = { id: 'profile-1', name: 'test-profile' };

            mockContext.req.param.mockReturnValue('test-profile');
            mockContext.req.json.mockResolvedValue({ parent_profile_version_id: null });
            mockRepo.getProfileByName.mockResolvedValue(mockProfile);
            mockRepo.createProfileVersion.mockRejectedValue(new Error('Cycle detected in profile versions'));

            const result = await controller.createProfileVersion(mockContext);

            expect(mockContext.json).toHaveBeenCalledWith({ error: 'Cycle detected in profile versions' }, 422);
        });
    });

    describe('attachTools', () => {
        it('should return 400 when profile param is missing', async () => {
            mockContext.req.param.mockReturnValue(undefined);

            const result = await controller.attachTools(mockContext);

            expect(mockContext.json).toHaveBeenCalledWith({ error: 'profile and numeric version required' }, 400);
        });

        it('should return 400 when version param is invalid', async () => {
            mockContext.req.param.mockReturnValueOnce('test-profile').mockReturnValueOnce('invalid-version');

            const result = await controller.attachTools(mockContext);

            expect(mockContext.json).toHaveBeenCalledWith({ error: 'profile and numeric version required' }, 400);
        });

        it('should return 400 when attachments array is empty', async () => {
            mockContext.req.param.mockReturnValueOnce('test-profile').mockReturnValueOnce('1');
            mockContext.req.json.mockResolvedValue({ attachments: [] });

            const result = await controller.attachTools(mockContext);

            expect(mockContext.json).toHaveBeenCalledWith({ error: 'attachments[] required' }, 400);
        });

        it('should return 404 when profile not found', async () => {
            mockContext.req.param.mockReturnValueOnce('nonexistent-profile').mockReturnValueOnce('1');
            mockContext.req.json.mockResolvedValue({
                attachments: [{ tool_name: 'test-tool', tool_version_hash: 'hash123' }]
            });
            mockRepo.getProfileByName.mockResolvedValue(null);

            const result = await controller.attachTools(mockContext);

            expect(mockContext.json).toHaveBeenCalledWith({ error: 'profile not found', profile: 'nonexistent-profile' }, 404);
        });

        it('should return 404 when profile version not found', async () => {
            const mockProfile = { id: 'profile-1', name: 'test-profile' };

            mockContext.req.param.mockReturnValueOnce('test-profile').mockReturnValueOnce('1');
            mockContext.req.json.mockResolvedValue({
                attachments: [{ tool_name: 'test-tool', tool_version_hash: 'hash123' }]
            });
            mockRepo.getProfileByName.mockResolvedValue(mockProfile);
            mockRepo.getProfileVersionByNumber.mockResolvedValue(null);

            const result = await controller.attachTools(mockContext);

            expect(mockContext.json).toHaveBeenCalledWith({ error: 'profile version not found', profile: 'test-profile', version: 1 }, 404);
        });

        it('should attach tools successfully', async () => {
            const mockProfile = { id: 'profile-1', name: 'test-profile' };
            const mockVersion = { id: 'version-1' };
            const mockAttachments = [{ tool: 'test-tool', created: true }];

            mockContext.req.param.mockReturnValueOnce('test-profile').mockReturnValueOnce('1');
            mockContext.req.json.mockResolvedValue({
                attachments: [{ tool_name: 'test-tool', tool_version_hash: 'hash123', command_alias: 'alias' }]
            });
            mockRepo.getProfileByName.mockResolvedValue(mockProfile);
            mockRepo.getProfileVersionByNumber.mockResolvedValue(mockVersion);
            mockRepo.attachToolToProfileVersion.mockResolvedValue({ created: true });
            mockRepo.listProfileVersionAttachments.mockResolvedValue(mockAttachments);

            const result = await controller.attachTools(mockContext);

            expect(mockRepo.attachToolToProfileVersion).toHaveBeenCalledWith({
                profileVersionId: 'version-1',
                toolName: 'test-tool',
                toolVersionHash: 'hash123',
                commandAlias: 'alias'
            });
            expect(mockContext.json).toHaveBeenCalledWith({
                profile: 'test-profile',
                version: 1,
                attached: [{ tool: 'test-tool', created: true }],
                attachments: mockAttachments
            }, 201);
        });

        it('should handle attachment validation errors', async () => {
            const mockProfile = { id: 'profile-1', name: 'test-profile' };
            const mockVersion = { id: 'version-1' };

            mockContext.req.param.mockReturnValueOnce('test-profile').mockReturnValueOnce('1');
            mockContext.req.json.mockResolvedValue({
                attachments: [{ tool_name: 'test-tool', tool_version_hash: 'hash123' }]
            });
            mockRepo.getProfileByName.mockResolvedValue(mockProfile);
            mockRepo.getProfileVersionByNumber.mockResolvedValue(mockVersion);
            mockRepo.attachToolToProfileVersion.mockRejectedValue(new Error('Tool already attached'));

            const result = await controller.attachTools(mockContext);

            expect(mockContext.json).toHaveBeenCalledWith({ error: 'Tool already attached', tool_name: 'test-tool' }, 422);
        });
    });

    describe('publishProfileVersion', () => {
        it('should return 400 when profile param is missing', async () => {
            mockContext.req.param.mockReturnValue(undefined);

            const result = await controller.publishProfileVersion(mockContext);

            expect(mockContext.json).toHaveBeenCalledWith({ error: 'profile and numeric version required' }, 400);
        });

        it('should return 400 when version param is invalid', async () => {
            mockContext.req.param.mockReturnValueOnce('test-profile').mockReturnValueOnce('invalid-version');

            const result = await controller.publishProfileVersion(mockContext);

            expect(mockContext.json).toHaveBeenCalledWith({ error: 'profile and numeric version required' }, 400);
        });

        it('should return 404 when profile not found', async () => {
            mockContext.req.param.mockReturnValueOnce('nonexistent-profile').mockReturnValueOnce('1');
            mockRepo.getProfileByName.mockResolvedValue(null);

            const result = await controller.publishProfileVersion(mockContext);

            expect(mockContext.json).toHaveBeenCalledWith({ error: 'profile not found', profile: 'nonexistent-profile' }, 404);
        });

        it('should return 404 when profile version not found', async () => {
            const mockProfile = { id: 'profile-1', name: 'test-profile' };

            mockContext.req.param.mockReturnValueOnce('test-profile').mockReturnValueOnce('1');
            mockRepo.getProfileByName.mockResolvedValue(mockProfile);
            mockRepo.getProfileVersionByNumber.mockResolvedValue(null);

            const result = await controller.publishProfileVersion(mockContext);

            expect(mockContext.json).toHaveBeenCalledWith({ error: 'profile version not found', profile: 'test-profile', version: 1 }, 404);
        });

        it('should publish profile version successfully', async () => {
            const mockProfile = { id: 'profile-1', name: 'test-profile' };
            const mockVersion = { id: 'version-1' };

            mockContext.req.param.mockReturnValueOnce('test-profile').mockReturnValueOnce('1');
            mockRepo.getProfileByName.mockResolvedValue(mockProfile);
            mockRepo.getProfileVersionByNumber.mockResolvedValue(mockVersion);

            const result = await controller.publishProfileVersion(mockContext);

            expect(mockContext.json).toHaveBeenCalledWith({
                profile: 'test-profile',
                version: 1,
                published: true
            }, 200);
        });
    });
});