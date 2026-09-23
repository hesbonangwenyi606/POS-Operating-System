import { query } from '../db/database.js';

export function auditLog(req, action, entity, entityId, oldValue = null, newValue = null) {
  try {
    query('INSERT INTO audit_log (user_id, action, entity, entity_id, old_value, new_value, device, ip) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)', [req.user?.userId || null, action, entity, entityId || null, JSON.stringify(oldValue), JSON.stringify(newValue), req.headers['user-agent'] || 'unknown', req.ip || 'unknown']).catch(() => {});
  } catch (e) {
    console.error('Audit log error:', e.message);
  }
}

export function createAuditMiddleware(entityName) {
  return (req, action, oldValueFn, newValueFn) => {
    return (req, res, next) => {
      const oldValue = oldValueFn ? oldValueFn(req) : null;
      res.on('finish', () => {
        const newValue = newValueFn ? newValueFn(req, res) : null;
        if (res.statusCode < 400) {
          auditLog(req, action, entityName, req.params.id || null, oldValue, newValue);
        }
      });
      next();
    };
  };
}