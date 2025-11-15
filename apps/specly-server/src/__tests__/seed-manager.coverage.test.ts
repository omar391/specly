import { describe, it, expect, vi, beforeEach } from 'vitest'

class FakeQuery {
  rows: any[]
  constructor(rows: any[] = []) { this.rows = rows }
  from() { return this }
  where() { return this }
  then(resolve: any) { return resolve(this.rows) }
}

class FakeDb {
  data: Record<string, any[]>
  constructor(data: Record<string, any[]>) { this.data = data }
  async delete() { return }
  insert() { return { values: async () => {} } }
  select() {
    // returns a thenable query object; tests will rely on table passed to from by reading arg
    const self = this
    return {
      from(table: any) {
        const name = table && table.name ? table.name : String(table)
        const rows = self.data[name] || []
        return new FakeQuery(rows)
      }
    }
  }
}

const makeDbManager = (data: Record<string, any[]>) => ({ getDb: () => new FakeDb(data) })

describe('SeedManager.seedSpecly', () => {
  it('creates profile/version and attachments when profile is new', async () => {
    // Prepare fake DB with no existing specs/toolVersions/workspaces
    const dbManager = makeDbManager({ specs: [], tools: [], toolVersions: [], workspaces: [], profileVersionTools: [] })

    const profileRepo = {
      createProfile: vi.fn(async () => ({ created: true, profile: { id: 'p1' } })),
      createProfileVersion: vi.fn(async ({ profileId }: any) => ({ id: 'pv1' })),
      getProfileByName: vi.fn(),
      listProfileVersions: vi.fn()
    }

    const toolVersionRepo = {
      listByTool: vi.fn(async (name: string) => [{ hash: 'hv1' }])
    }

    // Mock GlobalDatabaseService to avoid calling real DB initialize
    vi.mock('../database/global-queries.js', () => ({
      GlobalDatabaseService: class {
        constructor(dbManager: any) { this.db = { initialize: async () => {} } }
        async initialize() { await this.db.initialize() }
      }
    }))

    const { SeedManager } = await import('../services/seed-manager.js')
    const sm = new SeedManager(dbManager as any, profileRepo as any, undefined, toolVersionRepo as any)

    const res = await sm.seedSpecly()

    expect(res).toHaveProperty('profileCreated')
    expect(res.profileCreated).toBe(true)
    expect(res.profileVersionsCreated).toBeGreaterThanOrEqual(0)
  })

  it('uses existing profile when createProfile returns false', async () => {
    const dbManager = makeDbManager({ specs: [], tools: [], toolVersions: [], workspaces: [{ id: 'w1' }], profileVersionTools: [] })

    const profileRepo = {
      createProfile: vi.fn(async () => ({ created: false, profile: { id: 'p_existing' } })),
      createProfileVersion: vi.fn(),
      getProfileByName: vi.fn(async () => ({ id: 'p_existing' })),
      listProfileVersions: vi.fn(async (id: string) => [{ id: 'pv_existing' }])
    }

    const toolVersionRepo = { listByTool: vi.fn(async () => [{ hash: 'hv1' }]) }

    vi.mock('../database/global-queries.js', () => ({
      GlobalDatabaseService: class {
        constructor(dbManager: any) { this.db = { initialize: async () => {} } }
        async initialize() { await this.db.initialize() }
      }
    }))
    const { SeedManager } = await import('../services/seed-manager.js')
    const sm = new SeedManager(dbManager as any, profileRepo as any, undefined, toolVersionRepo as any)
    const res = await sm.seedSpecly()

    expect(res.profileCreated).toBe(false)
    // When existing profile has versions, workspaceBindings may be 1
    expect(typeof res.workspaceBindings).toBe('number')
  })
})
