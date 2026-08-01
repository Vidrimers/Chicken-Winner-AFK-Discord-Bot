import { USER_IDS } from '../../config.js';

/**
 * Middleware: проверка авторизации
 * Проверяет наличие сессии и кладёт req.authenticatedUserId
 */
export function requireAuth(req, res, next) {
  const userId = req.session?.userId;
  if (!userId) {
    return res.status(401).json({ error: 'Не авторизован' });
  }
  req.authenticatedUserId = userId;
  next();
}

/**
 * Middleware: проверка прав администратора
 * Использовать ПОСЛЕ requireAuth
 */
export function requireAdmin(req, res, next) {
  if (req.authenticatedUserId !== process.env.ADMIN_USER_ID) {
    return res.status(403).json({ error: 'Доступ запрещён' });
  }
  next();
}

/**
 * Middleware: проверка владения ресурсом
 * Сравнивает req.authenticatedUserId с userId из params
 */
export function requireOwnership(req, res, next) {
  const targetUserId = req.params.userId || req.params.discordId;
  if (req.authenticatedUserId !== targetUserId) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}
