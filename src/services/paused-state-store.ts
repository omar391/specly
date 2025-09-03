import { SerializedPausedState } from './spec-engine.js';

/**
 * PausedStateStore abstraction allows swapping persistence layer (memory -> DB)
 */
export interface PausedStateStore {
  save(resumeToken: string, state: SerializedPausedState): Promise<void>;
  get(resumeToken: string): Promise<SerializedPausedState | undefined>;
  delete(resumeToken: string): Promise<void>;
}

/** In-memory implementation (non-durable, test/demo scope) */
export class InMemoryPausedStateStore implements PausedStateStore {
  private store = new Map<string, SerializedPausedState>();
  async save(resumeToken: string, state: SerializedPausedState): Promise<void> {
    this.store.set(resumeToken, state);
  }
  async get(resumeToken: string): Promise<SerializedPausedState | undefined> {
    return this.store.get(resumeToken);
  }
  async delete(resumeToken: string): Promise<void> {
    this.store.delete(resumeToken);
  }
}
