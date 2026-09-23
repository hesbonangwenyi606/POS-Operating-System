import { db } from '../db/database.js';
import { api } from '../api/client.js';

export function createServiceCatalog() {
  async function getServices() {
    try { return await api.getServices(); } catch { return await db.services.toArray(); }
  }

  async function getService(id) {
    try { return await api.getService(id); } catch { return await db.services.get(id); }
  }

  async function createService(data) { await db.services.add(data); await api.createService(data); }
  async function updateService(id, data) { await db.services.update(id, data); await api.updateService(id, data); }
  async function deleteService(id) { await db.services.delete(id); await api.deleteService(id); }

  return { getServices, getService, createService, updateService, deleteService };
}
