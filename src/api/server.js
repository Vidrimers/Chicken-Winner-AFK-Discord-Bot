import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { success, log } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Система сессий на основе SQLite
 */
export class SessionManager {
  constructor(db) {
    this.db = db;
    
    // Создаём таблицу сессий если не существует
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        session_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      )
    `);
    
    // Индекс для быстрой очистки_expired
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at)
    `);
    
    // Очищаем expired сессии при старте
    this.cleanupExpired();
    
    success('SessionManager инициализирован (SQLite)');
  }

  getSession(req) {
    const sessionId = req.headers.cookie?.split('sessionId=')[1]?.split(';')[0];
    if (!sessionId) return null;
    
    const now = Date.now();
    const session = this.db.prepare(
      'SELECT user_id, created_at FROM sessions WHERE session_id = ? AND expires_at > ?'
    ).get(sessionId, now);
    
    return session ? { userId: session.user_id, createdAt: session.created_at } : null;
  }

  setSession(res, userId) {
    const sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    const now = Date.now();
    const expiresAt = now + 86400 * 1000; // 24 часа
    
    this.db.prepare(
      'INSERT INTO sessions (session_id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'
    ).run(sessionId, userId, now, expiresAt);
    
    res.setHeader(
      'Set-Cookie',
      `sessionId=${sessionId}; Path=/; Max-Age=86400; SameSite=Strict; HttpOnly`
    );
    return sessionId;
  }

  clearSession(res, req) {
    const sessionId = req.headers.cookie?.split('sessionId=')[1]?.split(';')[0];
    if (sessionId) {
      this.db.prepare('DELETE FROM sessions WHERE session_id = ?').run(sessionId);
    }
    res.setHeader('Set-Cookie', 'sessionId=; Path=/; Max-Age=0');
  }

  cleanupExpired() {
    const now = Date.now();
    const result = this.db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now);
    if (result.changes > 0) {
      log(`Очищено ${result.changes} истёкших сессий`);
    }
  }
}

// Глобальный экземпляр — будет инициализирован с БД
export let sessionManager = null;

/**
 * Создать и настроить Express сервер
 */
export function createExpressServer(db) {
  // Инициализируем session manager с БД
  sessionManager = new SessionManager(db);
  
  const app = express();

  // Middleware
  app.use(express.json());
  app.use(express.static(path.join(__dirname, '../../public')));
  app.use('/avatars', express.static(path.join(__dirname, '../../avatars')));

  // Middleware сессий — добавляет req.session к каждому запросу
  app.use((req, res, next) => {
    const rawCookie = req.headers.cookie || '';
    const sessionId = rawCookie.split(';')
      .map(c => c.trim())
      .find(c => c.startsWith('sessionId='))
      ?.split('=')?.[1];

    const session = sessionManager.getSession(req);
    
    if (session) {
      req.session = session;
      req.sessionId = sessionId;
    } else {
      req.session = {};
      req.sessionId = null;
    }

    // Записывает изменения req.session обратно в БД и выставляет куку если нужно
    req.session.save = () => {
      if (req.sessionId) {
        // Обновляем существующую сессию
        const now = Date.now();
        const expiresAt = now + 86400 * 1000;
        sessionManager.db.prepare(
          'UPDATE sessions SET user_id = ?, expires_at = ? WHERE session_id = ?'
        ).run(req.session.userId, expiresAt, req.sessionId);
      } else {
        // Создаём новую сессию
        sessionManager.setSession(res, req.session.userId);
      }
    };

    next();
  });

  // Периодическая очистка_expired сессий (каждый час)
  setInterval(() => {
    sessionManager.cleanupExpired();
  }, 3600 * 1000);

  success('Express сервер создан');
  return app;
}

/**
 * Запустить сервер
 */
export function startServer(app, port) {
  return new Promise((resolve) => {
    const server = app.listen(port, () => {
      success(`Сервер запущен на порту ${port}`);
      resolve(server);
    });
  });
}
