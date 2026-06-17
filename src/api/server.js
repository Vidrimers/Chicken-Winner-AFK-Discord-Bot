import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { success, log } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Простая система сессий на основе памяти
 */
export class SessionManager {
  constructor() {
    this.sessions = new Map();
  }

  getSession(req) {
    const sessionId = req.headers.cookie?.split('sessionId=')[1]?.split(';')[0];
    return sessionId ? this.sessions.get(sessionId) : null;
  }

  setSession(res, userId) {
    const sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    this.sessions.set(sessionId, { userId, createdAt: Date.now() });
    res.setHeader(
      'Set-Cookie',
      `sessionId=${sessionId}; Path=/; Max-Age=86400; SameSite=Strict`
    );
    return sessionId;
  }

  clearSession(res, req) {
    const sessionId = req.headers.cookie?.split('sessionId=')[1]?.split(';')[0];
    if (sessionId) this.sessions.delete(sessionId);
    res.setHeader('Set-Cookie', 'sessionId=; Path=/; Max-Age=0');
  }
}

// Глобальный экземпляр — единый для всего приложения
export const sessionManager = new SessionManager();

/**
 * Создать и настроить Express сервер
 */
export function createExpressServer() {
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

    if (sessionId && sessionManager.sessions.has(sessionId)) {
      req.session = sessionManager.sessions.get(sessionId);
      req.sessionId = sessionId;
    } else {
      req.session = {};
      req.sessionId = null;
    }

    // Записывает изменения req.session обратно в Map и выставляет куку если нужно
    req.session.save = () => {
      if (req.sessionId) {
        sessionManager.sessions.set(req.sessionId, req.session);
      } else {
        const newId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        sessionManager.sessions.set(newId, req.session);
        req.sessionId = newId;
        res.setHeader('Set-Cookie', `sessionId=${newId}; Path=/; Max-Age=86400; SameSite=Strict`);
      }
    };

    next();
  });

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
