import { api } from '../api/client.js';
import { getSyncQueue, markSynced, markSyncFailed, getSyncStatus } from '../db/database.js';

export function createSyncEngine() {
  let syncing = false;

  async function sync() {
    if (syncing) return { synced: 0, status: 'syncing' };
    if (!navigator.onLine) return { synced: 0, status: 'offline' };
    syncing = true;
    try {
      const queue = await getSyncQueue();
      if (queue.length === 0) { syncing = false; return { synced: 0, status: 'synced' }; }
      const batch = queue.slice(0, 20);
      let synced = 0;
      const results = [];
      for (const op of batch) {
        try {
          const existing = await api.syncOperations([{ id: op.id, ...op.payload }]);
          if (existing && existing.synced !== undefined) {
            results.push({ id: op.id, status: existing.synced });
            await markSynced(op.id);
            synced++;
          } else {
            results.push({ id: op.id, status: 'synced' });
            await markSynced(op.id);
            synced++;
          }
        } catch (e) {
          results.push({ id: op.id, status: 'failed', error: e.message });
          await markSyncFailed(op.id);
        }
      }
      syncing = false;
      return { synced, status: 'synced', results };
    } catch (e) {
      syncing = false;
      return { synced: 0, status: 'failed', error: e.message };
    }
  }

  async function getStatus() {
    try { return await api.getSyncStatus(); } catch { return { pending: 0, failed: 0, lastSync: null }; }
  }

  async function retryFailed() {
    if (!navigator.onLine) return { retried: 0, status: 'offline' };
    try {
      const queue = await getSyncQueue();
      const failed = queue.filter(op => op.status === 'failed');
      if (failed.length === 0) return { retried: 0, status: 'none' };
      let retried = 0;
      for (const op of failed.slice(0, 10)) {
        try {
          await api.syncOperations([{ id: op.id, ...op.payload }]);
          await markSynced(op.id);
          retried++;
        } catch { await markSyncFailed(op.id); }
      }
      return { retried, status: retried > 0 ? 'synced' : 'failed' };
    } catch (e) { return { retried: 0, status: 'failed', error: e.message }; }
  }

  return { sync, getStatus, retryFailed };
}