/**
 * Authentication Middleware
 * Session-based authentication with 48-hour expiration
 */

const requireAuth = (req, res, next) => {
    if (req.session && req.session.userId) {
        // Check if session is still valid
        if (new Date() > new Date(req.session.expiresAt)) {
            req.session.destroy();
            return res.status(401).json({
                error: 'Sesión expirada',
                code: 'SESSION_EXPIRED'
            });
        }

        // Attach user info to request
        req.userId = req.session.userId;
        req.userPhone = req.session.userPhone;
        req.userName = req.session.userName;

        next();
    } else {
        res.status(401).json({
            error: 'No autorizado - Inicia sesión',
            code: 'NOT_AUTHENTICATED'
        });
    }
};

/**
 * Optional auth - doesn't block request if not authenticated
 */
const optionalAuth = (req, res, next) => {
    if (req.session && req.session.userId) {
        req.userId = req.session.userId;
        req.userPhone = req.session.userPhone;
        req.userName = req.session.userName;
    }
    next();
};

/**
 * Create session for user
 */
const createSession = (req, user) => {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 48); // 48 hours

    req.session.userId = user.id_usuario;
    req.session.userPhone = user.telefono;
    req.session.userName = user.nombre;
    req.session.expiresAt = expiresAt.toISOString();

    return {
        userId: user.id_usuario,
        phone: user.telefono,
        name: user.nombre,
        expiresAt: expiresAt
    };
};

/**
 * Destroy session
 */
const destroySession = (req) => {
    return new Promise((resolve, reject) => {
        req.session.destroy((err) => {
            if (err) {
                console.error('Error destroying session:', err);
                reject(err);
            } else {
                resolve();
            }
        });
    });
};

/**
 * Middleware to handle CORS for authenticated routes
 */
const authCors = (req, res, next) => {
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Origin', req.headers.origin);
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Length, X-Requested-With');

    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
    } else {
        next();
    }
};

module.exports = {
    requireAuth,
    optionalAuth,
    createSession,
    destroySession,
    authCors
};
