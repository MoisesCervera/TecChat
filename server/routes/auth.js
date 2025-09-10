const express = require('express');
const bcrypt = require('bcrypt');
const { getPool } = require('../database/provider-factory');
const { createSession, destroySession, requireAuth } = require('../middleware/auth');

const router = express.Router();

/**
 * Register new user
 */
router.post('/register', async (req, res) => {
    try {
        const { telefono, nombre, password } = req.body;

        // Validation
        if (!telefono || !nombre || !password) {
            return res.status(400).json({
                error: 'Teléfono, nombre y contraseña son requeridos',
                code: 'MISSING_FIELDS'
            });
        }

        // Phone number validation (basic)
        if (!/^\+?[\d\s\-\(\)]+$/.test(telefono)) {
            return res.status(400).json({
                error: 'Formato de teléfono inválido',
                code: 'INVALID_PHONE'
            });
        }

        // Password validation
        if (password.length < 6) {
            return res.status(400).json({
                error: 'La contraseña debe tener al menos 6 caracteres',
                code: 'PASSWORD_TOO_SHORT'
            });
        }

        const db = getPool();

        // Check if phone already exists
        const existingUser = await db.query(
            'SELECT id_usuario FROM USUARIO WHERE telefono = ?',
            [telefono]
        );

        if (existingUser.length > 0) {
            return res.status(409).json({
                error: 'Este número de teléfono ya está registrado',
                code: 'PHONE_EXISTS'
            });
        }

        // Hash password
        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(password, saltRounds);

        // Create user
        const result = await db.query(
            `INSERT INTO USUARIO (telefono, nombre, password_hash, ultima_conexion) 
             VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
            [telefono, nombre, passwordHash]
        );

        // Get created user
        const newUser = await db.query(
            'SELECT id_usuario, telefono, nombre, ultima_conexion FROM USUARIO WHERE id_usuario = ?',
            [result.lastID]
        );

        // Create session
        const sessionData = createSession(req, newUser[0]);

        res.status(201).json({
            message: 'Usuario registrado exitosamente',
            user: {
                id: newUser[0].id_usuario,
                telefono: newUser[0].telefono,
                nombre: newUser[0].nombre
            },
            session: sessionData
        });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({
            error: 'Error interno del servidor',
            code: 'INTERNAL_ERROR'
        });
    }
});

/**
 * Login user
 */
router.post('/login', async (req, res) => {
    try {
        const { telefono, password } = req.body;

        if (!telefono || !password) {
            return res.status(400).json({
                error: 'Teléfono y contraseña son requeridos',
                code: 'MISSING_CREDENTIALS'
            });
        }

        const db = getPool();

        // Find user by phone
        const users = await db.query(
            'SELECT id_usuario, telefono, nombre, password_hash FROM USUARIO WHERE telefono = ?',
            [telefono]
        );

        if (users.length === 0) {
            return res.status(401).json({
                error: 'Teléfono o contraseña incorrectos',
                code: 'INVALID_CREDENTIALS'
            });
        }

        const user = users[0];

        // Verify password
        const passwordMatch = await bcrypt.compare(password, user.password_hash);

        if (!passwordMatch) {
            return res.status(401).json({
                error: 'Teléfono o contraseña incorrectos',
                code: 'INVALID_CREDENTIALS'
            });
        }

        // Update last connection
        await db.query(
            'UPDATE USUARIO SET ultima_conexion = CURRENT_TIMESTAMP WHERE id_usuario = ?',
            [user.id_usuario]
        );

        // Create session
        const sessionData = createSession(req, user);

        res.json({
            message: 'Inicio de sesión exitoso',
            user: {
                id: user.id_usuario,
                telefono: user.telefono,
                nombre: user.nombre
            },
            session: sessionData
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            error: 'Error interno del servidor',
            code: 'INTERNAL_ERROR'
        });
    }
});

/**
 * Logout user
 */
router.post('/logout', requireAuth, async (req, res) => {
    try {
        await destroySession(req);
        res.json({ message: 'Sesión cerrada exitosamente' });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({
            error: 'Error cerrando sesión',
            code: 'LOGOUT_ERROR'
        });
    }
});

/**
 * Get current user info
 */
router.get('/me', requireAuth, async (req, res) => {
    try {
        const db = getPool();

        const users = await db.query(
            `SELECT id_usuario, telefono, nombre, foto_perfil, ultima_conexion, ajustes_privacidad 
             FROM USUARIO WHERE id_usuario = ?`,
            [req.userId]
        );

        if (users.length === 0) {
            return res.status(404).json({
                error: 'Usuario no encontrado',
                code: 'USER_NOT_FOUND'
            });
        }

        const user = users[0];

        res.json({
            user: {
                id: user.id_usuario,
                telefono: user.telefono,
                nombre: user.nombre,
                foto_perfil: user.foto_perfil,
                ultima_conexion: user.ultima_conexion,
                ajustes_privacidad: JSON.parse(user.ajustes_privacidad || '{}')
            }
        });

    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({
            error: 'Error obteniendo información del usuario',
            code: 'INTERNAL_ERROR'
        });
    }
});

/**
 * Get current user info (for frontend auth check)
 */
router.get('/me', (req, res) => {
    if (req.session && req.session.userId) {
        res.json({
            id: req.session.userId,
            telefono: req.session.userPhone,
            nombre: req.session.userName
        });
    } else {
        res.status(401).json({
            error: 'No autenticado'
        });
    }
});

/**
 * Check session validity
 */
router.get('/check', (req, res) => {
    if (req.session && req.session.userId) {
        res.json({
            authenticated: true,
            user: {
                id: req.session.userId,
                telefono: req.session.userPhone,
                nombre: req.session.userName
            },
            expiresAt: req.session.expiresAt
        });
    } else {
        res.json({
            authenticated: false
        });
    }
});

module.exports = router;
