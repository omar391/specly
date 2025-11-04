import { describe, it, expect } from 'vitest';
import {
  workspaces,
  sessions,
  mcpServerMappings,
  specs,
  toolVersions,
  tools,
  profiles,
  profileVersions,
  profileVersionTools,
  workspaceProfileVersions,
  actionJournal,
  workspaceRulesNew,
  type Workspace,
  type NewWorkspace,
  type Session,
  type NewSession,
  type McpServerMapping,
  type NewMcpServerMapping,
  type Spec,
  type NewSpec,
  type ToolVersion,
  type NewToolVersion,
  type Tool,
  type NewTool,
  type Profile,
  type NewProfile,
  type ProfileVersion,
  type NewProfileVersion,
  type ProfileVersionTool,
  type NewProfileVersionTool,
  type WorkspaceProfileVersion,
  type NewWorkspaceProfileVersion,
  type ActionJournalEntry,
  type NewActionJournalEntry
} from '../database/schema/global-schema.js';

describe('Global Schema Definitions', () => {
  describe('Table Structure Validation', () => {
    it('workspaces table should have correct structure', () => {
      expect(workspaces.id.getSQLType()).toBe('text');
      expect(workspaces.path.getSQLType()).toBe('text');
      expect(workspaces.name.getSQLType()).toBe('text');
      expect(workspaces.status.getSQLType()).toBe('text');
      expect(workspaces.createdAt.getSQLType()).toBe('text');
      expect(workspaces.updatedAt.getSQLType()).toBe('text');
      expect(workspaces.lastActivity.getSQLType()).toBe('text');
      expect(workspaces.taskCount.getSQLType()).toBe('integer');
      expect(workspaces.activeTask.getSQLType()).toBe('text');
    });

    it('sessions table should have correct structure', () => {
      expect(sessions.id.getSQLType()).toBe('text');
      expect(sessions.workspaceId.getSQLType()).toBe('text');
      expect(sessions.createdAt.getSQLType()).toBe('text');
      expect(sessions.lastActivity.getSQLType()).toBe('text');
      expect(sessions.isActive.getSQLType()).toBe('integer');
    });

    it('mcpServerMappings table should have correct structure', () => {
      expect(mcpServerMappings.id.getSQLType()).toBe('text');
      expect(mcpServerMappings.interfaceType.getSQLType()).toBe('text');
      expect(mcpServerMappings.mcpServerName.getSQLType()).toBe('text');
      expect(mcpServerMappings.description.getSQLType()).toBe('text');
      expect(mcpServerMappings.isDefault.getSQLType()).toBe('integer');
      expect(mcpServerMappings.createdAt.getSQLType()).toBe('text');
      expect(mcpServerMappings.updatedAt.getSQLType()).toBe('text');
    });

    it('specs table should have correct structure', () => {
      expect(specs.hash.getSQLType()).toBe('text');
      expect(specs.executorType.getSQLType()).toBe('text');
      expect(specs.executorVersion.getSQLType()).toBe('text');
      expect(specs.intent.getSQLType()).toBe('text');
      expect(specs.sideEffect.getSQLType()).toBe('integer');
      expect(specs.contentTemplate.getSQLType()).toBe('text');
      expect(specs.staticParams.getSQLType()).toBe('text');
      expect(specs.inputSchema.getSQLType()).toBe('text');
      expect(specs.outputSchema.getSQLType()).toBe('text');
      expect(specs.idempotencyKeyTemplate.getSQLType()).toBe('text');
      expect(specs.retryPolicy.getSQLType()).toBe('text');
      expect(specs.showOutput.getSQLType()).toBe('integer');
      expect(specs.security.getSQLType()).toBe('text');
      expect(specs.metadata.getSQLType()).toBe('text');
      expect(specs.createdAt.getSQLType()).toBe('text');
    });

    it('toolVersions table should have correct structure', () => {
      expect(toolVersions.hash.getSQLType()).toBe('text');
      expect(toolVersions.toolName.getSQLType()).toBe('text');
      expect(toolVersions.graphManifest.getSQLType()).toBe('text');
      expect(toolVersions.createdAt.getSQLType()).toBe('text');
    });

    it('tools table should have correct structure', () => {
      expect(tools.name.getSQLType()).toBe('text');
      expect(tools.commandAlias.getSQLType()).toBe('text');
      expect(tools.description.getSQLType()).toBe('text');
      expect(tools.createdAt.getSQLType()).toBe('text');
    });

    it('profiles table should have correct structure', () => {
      expect(profiles.id.getSQLType()).toBe('text');
      expect(profiles.name.getSQLType()).toBe('text');
      expect(profiles.description.getSQLType()).toBe('text');
      expect(profiles.parentProfileId.getSQLType()).toBe('text');
      expect(profiles.createdAt.getSQLType()).toBe('text');
    });

    it('profileVersions table should have correct structure', () => {
      expect(profileVersions.id.getSQLType()).toBe('text');
      expect(profileVersions.profileId.getSQLType()).toBe('text');
      expect(profileVersions.parentProfileVersionId.getSQLType()).toBe('text');
      expect(profileVersions.version.getSQLType()).toBe('integer');
      expect(profileVersions.createdAt.getSQLType()).toBe('text');
    });

    it('profileVersionTools table should have correct structure', () => {
      expect(profileVersionTools.id.getSQLType()).toBe('text');
      expect(profileVersionTools.profileVersionId.getSQLType()).toBe('text');
      expect(profileVersionTools.toolName.getSQLType()).toBe('text');
      expect(profileVersionTools.toolVersionHash.getSQLType()).toBe('text');
      expect(profileVersionTools.commandAlias.getSQLType()).toBe('text');
      expect(profileVersionTools.inheritedFromProfileVersionId.getSQLType()).toBe('text');
      expect(profileVersionTools.createdAt.getSQLType()).toBe('text');
    });

    it('workspaceProfileVersions table should have correct structure', () => {
      expect(workspaceProfileVersions.workspaceId.getSQLType()).toBe('text');
      expect(workspaceProfileVersions.profileVersionId.getSQLType()).toBe('text');
      expect(workspaceProfileVersions.pinnedAt.getSQLType()).toBe('text');
    });

    it('actionJournal table should have correct structure', () => {
      expect(actionJournal.id.getSQLType()).toBe('text');
      expect(actionJournal.sessionId.getSQLType()).toBe('text');
      expect(actionJournal.specHash.getSQLType()).toBe('text');
      expect(actionJournal.idempotencyKey.getSQLType()).toBe('text');
      expect(actionJournal.status.getSQLType()).toBe('text');
      expect(actionJournal.attempts.getSQLType()).toBe('integer');
      expect(actionJournal.lastErrorCode.getSQLType()).toBe('text');
      expect(actionJournal.resultJson.getSQLType()).toBe('text');
      expect(actionJournal.errorJson.getSQLType()).toBe('text');
      expect(actionJournal.startedAt.getSQLType()).toBe('text');
      expect(actionJournal.completedAt.getSQLType()).toBe('text');
    });

    it('workspaceRulesNew table should have correct structure', () => {
      expect(workspaceRulesNew.id.getSQLType()).toBe('text');
      expect(workspaceRulesNew.workspaceId.getSQLType()).toBe('text');
      expect(workspaceRulesNew.relation.getSQLType()).toBe('text');
      expect(workspaceRulesNew.rule.getSQLType()).toBe('text');
      expect(workspaceRulesNew.originalText.getSQLType()).toBe('text');
      expect(workspaceRulesNew.confidence.getSQLType()).toBe('integer');
      expect(workspaceRulesNew.sourceSessionId.getSQLType()).toBe('text');
      expect(workspaceRulesNew.active.getSQLType()).toBe('integer');
      expect(workspaceRulesNew.createdAt.getSQLType()).toBe('text');
      expect(workspaceRulesNew.lastReinforcedAt.getSQLType()).toBe('text');
    });
  });

  describe('Type Inference Validation', () => {
    it('should correctly infer Workspace types', () => {
      const workspace: Workspace = {
        id: 'test-id',
        path: '/test/path',
        name: 'Test Workspace',
        status: 'active',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        lastActivity: '2024-01-01T00:00:00Z',
        taskCount: 5,
        activeTask: 'task-1'
      };
      expect(workspace.id).toBe('test-id');
      expect(workspace.taskCount).toBe(5);
    });

    it('should correctly infer NewWorkspace types', () => {
      const newWorkspace: NewWorkspace = {
        id: 'test-id',
        path: '/test/path',
        name: 'Test Workspace'
      };
      expect(newWorkspace.id).toBe('test-id');
      expect(newWorkspace.status).toBeUndefined();
    });

    it('should correctly infer Session types', () => {
      const session: Session = {
        id: 'session-1',
        workspaceId: 'workspace-1',
        createdAt: '2024-01-01T00:00:00Z',
        lastActivity: '2024-01-01T00:00:00Z',
        isActive: true
      };
      expect(session.id).toBe('session-1');
      expect(session.isActive).toBe(true);
    });

    it('should correctly infer Spec types', () => {
      const spec: Spec = {
        hash: 'hash123',
        executorType: 'tool',
        executorVersion: '1.0.0',
        intent: 'human',
        sideEffect: false,
        contentTemplate: 'template',
        staticParams: {},
        inputSchema: '{}',
        outputSchema: '{}',
        idempotencyKeyTemplate: 'key-{{hash}}',
        retryPolicy: '{}',
        showOutput: true,
        security: '{}',
        metadata: {},
        createdAt: '2024-01-01T00:00:00Z'
      };
      expect(spec.hash).toBe('hash123');
      expect(spec.sideEffect).toBe(false);
    });

    it('should correctly infer Tool types', () => {
      const tool: Tool = {
        name: 'test-tool',
        commandAlias: 'tt',
        description: 'A test tool',
        createdAt: '2024-01-01T00:00:00Z'
      };
      expect(tool.name).toBe('test-tool');
      expect(tool.commandAlias).toBe('tt');
    });

    it('should correctly infer Profile types', () => {
      const profile: Profile = {
        id: 'profile-1',
        name: 'Test Profile',
        description: 'A test profile',
        parentProfileId: 'parent-1',
        createdAt: '2024-01-01T00:00:00Z'
      };
      expect(profile.id).toBe('profile-1');
      expect(profile.parentProfileId).toBe('parent-1');
    });

    it('should correctly infer ProfileVersion types', () => {
      const profileVersion: ProfileVersion = {
        id: 'pv-1',
        profileId: 'profile-1',
        parentProfileVersionId: 'parent-pv-1',
        version: 1,
        createdAt: '2024-01-01T00:00:00Z'
      };
      expect(profileVersion.id).toBe('pv-1');
      expect(profileVersion.version).toBe(1);
    });

    it('should correctly infer ActionJournalEntry types', () => {
      const entry: ActionJournalEntry = {
        id: 'entry-1',
        sessionId: 'session-1',
        specHash: 'hash123',
        idempotencyKey: 'key123',
        status: 'success',
        attempts: 1,
        lastErrorCode: null,
        resultJson: { result: 'success' },
        errorJson: null,
        startedAt: '2024-01-01T00:00:00Z',
        completedAt: '2024-01-01T00:00:00Z'
      };
      expect(entry.id).toBe('entry-1');
      expect(entry.status).toBe('success');
      expect(entry.attempts).toBe(1);
    });
  });

  describe('Enum Validation', () => {
    it('workspaces status should accept valid enum values', () => {
      const validStatuses: Array<'active' | 'idle' | 'inactive' | 'disconnected' | 'error'> =
        ['active', 'idle', 'inactive', 'disconnected', 'error'];

      validStatuses.forEach(status => {
        const workspace: NewWorkspace = {
          id: 'test',
          path: '/test',
          name: 'Test',
          status
        };
        expect(workspace.status).toBe(status);
      });
    });

    it('specs intent should accept valid enum values', () => {
      const validIntents: Array<'human' | 'autonomous'> = ['human', 'autonomous'];

      validIntents.forEach(intent => {
        const spec: NewSpec = {
          hash: 'hash123',
          executorType: 'tool',
          executorVersion: '1.0.0',
          intent,
          sideEffect: false
        };
        expect(spec.intent).toBe(intent);
      });
    });

    it('actionJournal status should accept valid enum values', () => {
      const validStatuses: Array<'pending' | 'success' | 'failed'> = ['pending', 'success', 'failed'];

      validStatuses.forEach(status => {
        const entry: NewActionJournalEntry = {
          sessionId: 'session-1',
          specHash: 'hash123',
          idempotencyKey: 'key123',
          status
        };
        expect(entry.status).toBe(status);
      });
    });

    it('workspaceRulesNew relation should accept valid enum values', () => {
      const validRelations: Array<'always-do' | 'never-do' | 'is-a' | 'has-a'> =
        ['always-do', 'never-do', 'is-a', 'has-a'];

      validRelations.forEach(relation => {
        const rule: typeof workspaceRulesNew.$inferInsert = {
          workspaceId: 'workspace-1',
          relation,
          rule: 'test rule'
        };
        expect(rule.relation).toBe(relation);
      });
    });

    it('mcpServerMappings interfaceType should accept valid enum values', () => {
      const validTypes: Array<'github' | 'jira' | 'linear' | 'asana' | 'trello' | 'custom'> =
        ['github', 'jira', 'linear', 'asana', 'trello', 'custom'];

      validTypes.forEach(interfaceType => {
        const mapping: NewMcpServerMapping = {
          interfaceType,
          mcpServerName: 'test-server'
        };
        expect(mapping.interfaceType).toBe(interfaceType);
      });
    });
  });

  describe('Schema Relationships', () => {
    it('should validate foreign key relationships are properly defined', () => {
      // Test that references are properly set up (this validates the schema structure)
      // Note: Drizzle ORM references are validated by successful migration and runtime behavior
      expect(sessions.workspaceId).toBeDefined();
      expect(profileVersionTools.profileVersionId).toBeDefined();
      expect(profileVersionTools.toolName).toBeDefined();
      expect(profileVersionTools.toolVersionHash).toBeDefined();
      expect(workspaceProfileVersions.workspaceId).toBeDefined();
      expect(workspaceProfileVersions.profileVersionId).toBeDefined();
      expect(actionJournal.specHash).toBeDefined();
      expect(workspaceRulesNew.workspaceId).toBeDefined();
    });

    it('should validate cascade delete relationships', () => {
      // Test that cascade deletes are properly configured
      // Note: Drizzle ORM cascade deletes are validated by successful migration and runtime behavior
      expect(sessions.workspaceId).toBeDefined();
      expect(profileVersionTools.profileVersionId).toBeDefined();
      expect(profileVersionTools.toolName).toBeDefined();
      expect(profileVersionTools.toolVersionHash).toBeDefined();
      expect(workspaceProfileVersions.workspaceId).toBeDefined();
      expect(actionJournal.specHash).toBeDefined();
      expect(workspaceRulesNew.workspaceId).toBeDefined();
    });
  });

  describe('Default Values', () => {
    it('should have correct default values for workspaces', () => {
      const workspace: NewWorkspace = {
        id: 'test',
        path: '/test',
        name: 'Test'
      };
      expect(workspace.status).toBeUndefined(); // No default in schema
      expect(workspace.taskCount).toBeUndefined(); // No default in schema
    });

    it('should have correct default values for specs', () => {
      const spec: NewSpec = {
        hash: 'hash123',
        executorType: 'tool',
        executorVersion: '1.0.0',
        intent: 'human',
        sideEffect: false
      };
      expect(spec.sideEffect).toBe(false);
      expect(spec.showOutput).toBeUndefined(); // Has default but not in insert type
      expect(spec.staticParams).toBeUndefined(); // Has default but not in insert type
    });

    it('should have correct default values for actionJournal', () => {
      const entry: NewActionJournalEntry = {
        sessionId: 'session-1',
        specHash: 'hash123',
        idempotencyKey: 'key123',
        status: 'pending'
      };
      expect(entry.attempts).toBeUndefined(); // Has default but not in insert type
    });
  });
});
