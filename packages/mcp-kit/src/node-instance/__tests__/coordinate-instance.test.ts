import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Mock } from 'vitest';
import {
    coordinateInstanceRole,
    InstanceRole,
    BaseInstanceManager,
    type InstanceLock,
    type InstanceManagerLike,
    type CoordinateInstanceProxyResult,
    type CoordinateInstanceMainResult,
} from '../index.js';

type StubInstanceManager = InstanceManagerLike & {
    tryBecomeMain: Mock<() => Promise<boolean>>;
    readLock: Mock<() => Promise<InstanceLock | null>>;
    removeLock: Mock<() => Promise<void>>;
    fetchMainVersion: Mock<() => Promise<string | null>>;
    requestMainTransition: Mock<() => Promise<boolean>>;
    waitForPort: Mock<(timeoutMs?: number) => Promise<boolean>>;
};

function createStubManager(overrides: Partial<StubInstanceManager> = {}): StubInstanceManager {
    const base: StubInstanceManager = {
        port: 8989,
        tryBecomeMain: vi.fn(async () => false),
        readLock: vi.fn(async () => null),
        removeLock: vi.fn(async () => { }),
        fetchMainVersion: vi.fn(async () => '1.0.0'),
        requestMainTransition: vi.fn(async () => true),
        waitForPort: vi.fn(async () => true),
    } as StubInstanceManager;

    return Object.assign(base, overrides);
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('coordinateInstanceRole', () => {
    it('returns main immediately when lock acquired', async () => {
        const manager = createStubManager({
            tryBecomeMain: vi.fn(async () => true),
        });

        const result = await coordinateInstanceRole({ instanceManager: manager, desiredVersion: '1.0.0' });

        expect(result.status).toBe('main');
        expect(result.role).toBe(InstanceRole.MAIN);
        expect(result.reason).toBe('initial');
        expect(manager.tryBecomeMain).toHaveBeenCalledTimes(1);
        expect(manager.readLock).not.toHaveBeenCalled();
    });

    it('recovers stale lock and becomes main', async () => {
        const staleLock: InstanceLock = { pid: 12345, version: '0.9.0', timestamp: Date.now() };
        const manager = createStubManager({
            tryBecomeMain: vi.fn()
                .mockResolvedValueOnce(false)
                .mockResolvedValueOnce(true),
            readLock: vi.fn(async () => staleLock),
        });

        const pidSpy = vi.spyOn(BaseInstanceManager, 'isPidAlive').mockReturnValue(false);

        const result = await coordinateInstanceRole({ instanceManager: manager, desiredVersion: '1.0.0' });

        expect(result.status).toBe('main');
        expect(result.reason).toBe('stale-lock');
        expect(manager.removeLock).toHaveBeenCalledTimes(1);
        expect(manager.tryBecomeMain).toHaveBeenCalledTimes(2);

        pidSpy.mockRestore();
    });

    it('returns proxy when existing main matches version', async () => {
        const activeLock: InstanceLock = { pid: 3210, version: '1.0.0', timestamp: Date.now() };
        const manager = createStubManager({
            tryBecomeMain: vi.fn(async () => false),
            readLock: vi.fn(async () => activeLock),
        });

        const pidSpy = vi.spyOn(BaseInstanceManager, 'isPidAlive').mockReturnValue(true);

        const result = await coordinateInstanceRole({ instanceManager: manager, desiredVersion: '1.0.0' });

        expect(result.status).toBe('proxy');
        const proxyResult = result as CoordinateInstanceProxyResult<StubInstanceManager>;
        expect(proxyResult.mainVersion).toBe('1.0.0');
        expect(manager.requestMainTransition).not.toHaveBeenCalled();

        pidSpy.mockRestore();
    });

    it('performs version transition when main version mismatches', async () => {
        const manager = createStubManager({
            tryBecomeMain: vi.fn()
                .mockResolvedValueOnce(false)
                .mockResolvedValueOnce(true),
            readLock: vi.fn(async () => ({ pid: 9999, version: '0.9.0', timestamp: Date.now() })),
            fetchMainVersion: vi.fn(async () => '0.9.0'),
        });

        const pidSpy = vi.spyOn(BaseInstanceManager, 'isPidAlive').mockReturnValue(true);

        const result = await coordinateInstanceRole({ instanceManager: manager, desiredVersion: '1.1.0', waitForPortTimeoutMs: 50 });

        expect(result.status).toBe('main');
        expect(result.reason).toBe('version-transition');
        const mainResult = result as CoordinateInstanceMainResult<StubInstanceManager>;
        expect(mainResult.previousVersion).toBe('0.9.0');
        expect(manager.requestMainTransition).toHaveBeenCalledTimes(1);
        expect(manager.removeLock).toHaveBeenCalledTimes(1);
        expect(manager.tryBecomeMain).toHaveBeenCalledTimes(2);

        pidSpy.mockRestore();
    });

    it('throws when transition request fails', async () => {
        const manager = createStubManager({
            tryBecomeMain: vi.fn(async () => false),
            readLock: vi.fn(async () => ({ pid: 8888, version: '0.9.0', timestamp: Date.now() })),
            fetchMainVersion: vi.fn(async () => '0.9.0'),
            requestMainTransition: vi.fn(async () => false),
        });

        const pidSpy = vi.spyOn(BaseInstanceManager, 'isPidAlive').mockReturnValue(true);

        await expect(
            coordinateInstanceRole({ instanceManager: manager, desiredVersion: '1.0.0' })
        ).rejects.toThrow(/Failed to transition/);

        pidSpy.mockRestore();
    });
});
