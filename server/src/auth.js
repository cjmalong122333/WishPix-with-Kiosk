import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { db } from './db.js';

// Login tokens live in memory, so restarting the server signs everyone out.
const tokens = new Map(); // token -> { teacherId, expiresAt }
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

export function login(username, password) {
  const teacher = db.prepare('SELECT * FROM teachers WHERE username = ?').get(username);
  if (!teacher || !bcrypt.compareSync(password, teacher.password_hash)) return null;
  const token = crypto.randomBytes(24).toString('hex');
  tokens.set(token, { teacherId: teacher.id, expiresAt: Date.now() + TOKEN_TTL_MS });
  return { token, teacher: publicTeacher(teacher) };
}

export function logout(token) {
  tokens.delete(token);
}

export function teacherFromToken(token) {
  const entry = token && tokens.get(token);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    tokens.delete(token);
    return null;
  }
  const teacher = db.prepare('SELECT * FROM teachers WHERE id = ?').get(entry.teacherId);
  return teacher ? publicTeacher(teacher) : null;
}

export function requireTeacher(req, res, next) {
  const token = req.get('authorization')?.replace(/^Bearer /, '');
  const teacher = teacherFromToken(token);
  if (!teacher) return res.status(401).json({ error: 'Please sign in again.' });
  req.teacher = teacher;
  req.token = token;
  next();
}

// Returns an error message, or null when the password was changed.
export function changePassword(teacherId, current, next) {
  const teacher = db.prepare('SELECT * FROM teachers WHERE id = ?').get(teacherId);
  if (!bcrypt.compareSync(current, teacher.password_hash)) return 'Your current password is not correct.';
  if (next.length < 8) return 'The new password needs at least 8 characters.';
  db.prepare('UPDATE teachers SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(next, 10), teacherId);
  return null;
}

export function updateDisplayName(teacherId, displayName) {
  db.prepare('UPDATE teachers SET display_name = ? WHERE id = ?').run(displayName, teacherId);
  return publicTeacher(db.prepare('SELECT * FROM teachers WHERE id = ?').get(teacherId));
}

const publicTeacher = (t) => ({ id: t.id, username: t.username, displayName: t.display_name });
