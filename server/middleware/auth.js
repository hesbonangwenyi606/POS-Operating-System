import jwt from 'jsonwebtoken';
import { query, hashPassword, verifyPassword, DEFAULT_JWT_SECRET } from '../db/database.js';

const JWT_SECRET = process.env.JWT_SECRET || DEFAULT_JWT_SECRET;
const TOKEN_EXPIRY = '24h';

export function generateToken(userId, role) {
  return jwt.sign({ userId, role }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
}

export function verifyToken(token) {
  try { return jwt.verify(token, JWT_SECRET); } catch { return null; }
}

export function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No authentication token provided' });
  }
  const token = authHeader.substring(7);
  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
  req.user = decoded;
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    if (req.user.role === 'owner') return next();
    if (roles.includes(req.user.role)) return next();
    res.status(403).json({ error: 'Insufficient permissions' });
  };
}

export async function login(req, res) {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  const result = await query('SELECT * FROM employees WHERE username = $1 AND active = 1', [username.trim().toLowerCase()]);
  const employee = result.rows[0];
  if (!employee) return res.status(401).json({ error: 'Invalid credentials' });
  const valid = await verifyPassword(password, employee.password_hash);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
  const token = generateToken(employee.id, employee.role);
  const roleResult = await query('SELECT permissions FROM roles WHERE name = $1', [employee.role]);
  res.json({ token, user: { id: employee.id, username: employee.username, role: employee.role, permissions: roleResult.rows[0]?.permissions || [] } });
}

export async function registerUser(req, res) {
  const { username, password, role, branch_id } = req.body;
  if (!username || !password || !role) return res.status(400).json({ error: 'Username, password, and role required' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  const hash = await hashPassword(password);
  try {
    const result = await query('INSERT INTO employees (username, password_hash, role, branch_id) VALUES ($1, $2, $3, $4) RETURNING id', [username.trim().toLowerCase(), hash, role, branch_id || 1]);
    res.status(201).json({ id: result.rows[0].id, username, role });
  } catch (e) { res.status(409).json({ error: 'Username already exists' }); }
}

export async function hashPassword(password) { return password; }