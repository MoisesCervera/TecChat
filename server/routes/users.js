const express = require('express');
const { getPool } = require('../database/provider-factory');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

/**
 * Get available users to start a chat with
 */
router.get('/available', requireAuth, async (req, res) => {
    try {
        const db = getPool();

        // Get all users except the current user
        const users = await db.query(`
            SELECT 
                id_usuario,
                nombre,
                telefono,
                foto_perfil,
                ultima_conexion
            FROM USUARIO
            WHERE id_usuario != ?
            ORDER BY nombre ASC
        `, [req.userId]);

        res.json({ users });

    } catch (error) {
        console.error('Get available users error:', error);
        res.status(500).json({
            error: 'Error retrieving available users',
            code: 'INTERNAL_ERROR'
        });
    }
});

/**
 * Get user's contacts
 */
router.get('/contacts', requireAuth, async (req, res) => {
    try {
        const db = getPool();

        const contacts = await db.query(`
            SELECT 
                c.id_contacto,
                c.id_usuario_contacto as id_usuario,
                c.alias,
                c.bloqueado,
                u.telefono,
                u.nombre,
                u.foto_perfil,
                u.ultima_conexion
            FROM CONTACTO c
            JOIN USUARIO u ON c.id_usuario_contacto = u.id_usuario
            WHERE c.id_usuario = ?
            ORDER BY u.nombre ASC
        `, [req.userId]);

        res.json({ contacts });

    } catch (error) {
        console.error('Get contacts error:', error);
        res.status(500).json({
            error: 'Error obteniendo contactos',
            code: 'INTERNAL_ERROR'
        });
    }
});

/**
 * Add new contact
 */
router.post('/contacts', requireAuth, async (req, res) => {
    try {
        const { telefono, alias } = req.body;

        if (!telefono) {
            return res.status(400).json({
                error: 'Teléfono es requerido',
                code: 'MISSING_PHONE'
            });
        }

        const db = getPool();

        // Find user by phone
        const users = await db.query(
            'SELECT id_usuario, telefono, nombre FROM USUARIO WHERE telefono = ?',
            [telefono]
        );

        if (users.length === 0) {
            return res.status(404).json({
                error: 'Usuario no encontrado',
                code: 'USER_NOT_FOUND'
            });
        }

        const targetUser = users[0];

        // Check if contact already exists
        const existingContact = await db.query(
            'SELECT id_contacto FROM CONTACTO WHERE id_usuario = ? AND id_usuario_contacto = ?',
            [req.userId, targetUser.id_usuario]
        );

        if (existingContact.length > 0) {
            return res.status(409).json({
                error: 'Este contacto ya existe',
                code: 'CONTACT_EXISTS'
            });
        }

        // Add contact
        const result = await db.query(
            'INSERT INTO CONTACTO (id_usuario, id_usuario_contacto, alias) VALUES (?, ?, ?)',
            [req.userId, targetUser.id_usuario, alias || targetUser.nombre]
        );

        // Return new contact info
        const newContact = {
            id_contacto: result.lastID,
            id_usuario: targetUser.id_usuario,
            telefono: targetUser.telefono,
            nombre: targetUser.nombre,
            alias: alias || targetUser.nombre,
            bloqueado: false
        };

        res.status(201).json({
            message: 'Contacto agregado exitosamente',
            contact: newContact
        });

    } catch (error) {
        console.error('Add contact error:', error);
        res.status(500).json({
            error: 'Error agregando contacto',
            code: 'INTERNAL_ERROR'
        });
    }
});

/**
 * Block/unblock contact
 */
router.patch('/contacts/:contactId/block', requireAuth, async (req, res) => {
    try {
        const { contactId } = req.params;
        const { blocked } = req.body;

        const db = getPool();

        // Verify contact belongs to user
        const contacts = await db.query(
            'SELECT id_contacto FROM CONTACTO WHERE id_contacto = ? AND id_usuario = ?',
            [contactId, req.userId]
        );

        if (contacts.length === 0) {
            return res.status(404).json({
                error: 'Contacto no encontrado',
                code: 'CONTACT_NOT_FOUND'
            });
        }

        // Update blocked status
        await db.query(
            'UPDATE CONTACTO SET bloqueado = ? WHERE id_contacto = ?',
            [blocked ? 1 : 0, contactId]
        );

        res.json({
            message: blocked ? 'Contacto bloqueado' : 'Contacto desbloqueado'
        });

    } catch (error) {
        console.error('Block contact error:', error);
        res.status(500).json({
            error: 'Error actualizando contacto',
            code: 'INTERNAL_ERROR'
        });
    }
});

/**
 * Get user's chats
 */
router.get('/chats', requireAuth, async (req, res) => {
    try {
        const db = getPool();

        const chats = await db.query(`
            SELECT 
                c.id_chat,
                c.tipo,
                c.archivado,
                c.creado_en,
                g.nombre as nombre_grupo,
                g.foto as foto_grupo,
                -- Get last message info
                (SELECT contenido FROM MENSAJE 
                 WHERE id_chat = c.id_chat 
                 ORDER BY enviado_en DESC LIMIT 1) as ultimo_mensaje,
                (SELECT enviado_en FROM MENSAJE 
                 WHERE id_chat = c.id_chat 
                 ORDER BY enviado_en DESC LIMIT 1) as fecha_ultimo_mensaje,
                (SELECT u.nombre FROM MENSAJE m 
                 JOIN USUARIO u ON m.id_usuario_remitente = u.id_usuario 
                 WHERE m.id_chat = c.id_chat 
                 ORDER BY m.enviado_en DESC LIMIT 1) as remitente_ultimo_mensaje
            FROM CHAT c
            LEFT JOIN GRUPO g ON c.id_chat = g.id_chat
            WHERE c.id_chat IN (
                SELECT id_chat FROM CHAT_PARTICIPANTE WHERE id_usuario = ?
            )
            AND c.archivado = 0
            ORDER BY fecha_ultimo_mensaje DESC NULLS LAST
        `, [req.userId]);

        // For individual chats, get the other participant's info
        for (let chat of chats) {
            if (chat.tipo === 'individual') {
                const participants = await db.query(`
                    SELECT u.id_usuario, u.nombre, u.telefono, u.foto_perfil, u.ultima_conexion
                    FROM CHAT_PARTICIPANTE cp
                    JOIN USUARIO u ON cp.id_usuario = u.id_usuario
                    WHERE cp.id_chat = ? AND cp.id_usuario != ?
                `, [chat.id_chat, req.userId]);

                if (participants.length > 0) {
                    chat.participante = participants[0];
                }
            }
        }

        res.json({ chats });

    } catch (error) {
        console.error('Get chats error:', error);
        res.status(500).json({
            error: 'Error obteniendo chats',
            code: 'INTERNAL_ERROR'
        });
    }
});

/**
 * Get archived chats
 */
router.get('/chats/archived', requireAuth, async (req, res) => {
    try {
        const db = getPool();

        const chats = await db.query(`
            SELECT 
                c.id_chat,
                c.tipo,
                c.archivado,
                c.creado_en,
                g.nombre as nombre_grupo,
                g.foto as foto_grupo,
                (SELECT contenido FROM MENSAJE 
                 WHERE id_chat = c.id_chat 
                 ORDER BY enviado_en DESC LIMIT 1) as ultimo_mensaje,
                (SELECT enviado_en FROM MENSAJE 
                 WHERE id_chat = c.id_chat 
                 ORDER BY enviado_en DESC LIMIT 1) as fecha_ultimo_mensaje
            FROM CHAT c
            LEFT JOIN GRUPO g ON c.id_chat = g.id_chat
            WHERE c.id_chat IN (
                SELECT id_chat FROM CHAT_PARTICIPANTE WHERE id_usuario = ?
            )
            AND c.archivado = 1
            ORDER BY fecha_ultimo_mensaje DESC
        `, [req.userId]);

        res.json({ chats });

    } catch (error) {
        console.error('Get archived chats error:', error);
        res.status(500).json({
            error: 'Error obteniendo chats archivados',
            code: 'INTERNAL_ERROR'
        });
    }
});

/**
 * Archive/unarchive chat
 */
router.patch('/chats/:chatId/archive', requireAuth, async (req, res) => {
    try {
        const { chatId } = req.params;
        const { archived } = req.body;

        const db = getPool();

        // Verify user participates in chat
        const participation = await db.query(
            'SELECT id_chat FROM CHAT_PARTICIPANTE WHERE id_chat = ? AND id_usuario = ?',
            [chatId, req.userId]
        );

        if (participation.length === 0) {
            return res.status(404).json({
                error: 'Chat no encontrado',
                code: 'CHAT_NOT_FOUND'
            });
        }

        // Update archived status
        await db.query(
            'UPDATE CHAT SET archivado = ? WHERE id_chat = ?',
            [archived ? 1 : 0, chatId]
        );

        res.json({
            message: archived ? 'Chat archivado' : 'Chat restaurado'
        });

    } catch (error) {
        console.error('Archive chat error:', error);
        res.status(500).json({
            error: 'Error archivando chat',
            code: 'INTERNAL_ERROR'
        });
    }
});

/**
 * Create new individual chat
 */
router.post('/chats', requireAuth, async (req, res) => {
    try {
        const { userId } = req.body;

        if (!userId) {
            return res.status(400).json({
                error: 'ID de usuario es requerido',
                code: 'MISSING_USER_ID'
            });
        }

        const db = getPool();

        // Check if chat already exists between these users
        const existingChat = await db.query(`
            SELECT c.id_chat 
            FROM CHAT c
            WHERE c.tipo = 'individual' 
            AND c.id_chat IN (
                SELECT cp1.id_chat FROM CHAT_PARTICIPANTE cp1 
                WHERE cp1.id_usuario = ?
                AND EXISTS (
                    SELECT 1 FROM CHAT_PARTICIPANTE cp2 
                    WHERE cp2.id_chat = cp1.id_chat 
                    AND cp2.id_usuario = ?
                )
            )
        `, [req.userId, userId]);

        if (existingChat.length > 0) {
            return res.status(409).json({
                error: 'Ya existe un chat con este usuario',
                code: 'CHAT_EXISTS',
                chatId: existingChat[0].id_chat
            });
        }

        // Create new chat
        const chatResult = await db.query(
            'INSERT INTO CHAT (tipo) VALUES (?)',
            ['individual']
        );

        const chatId = chatResult.lastID;

        // Add participants
        await db.transaction([
            {
                sql: 'INSERT INTO CHAT_PARTICIPANTE (id_chat, id_usuario) VALUES (?, ?)',
                params: [chatId, req.userId]
            },
            {
                sql: 'INSERT INTO CHAT_PARTICIPANTE (id_chat, id_usuario) VALUES (?, ?)',
                params: [chatId, userId]
            }
        ]);

        res.status(201).json({
            message: 'Chat creado exitosamente',
            chatId: chatId
        });

    } catch (error) {
        console.error('Create chat error:', error);
        res.status(500).json({
            error: 'Error creando chat',
            code: 'INTERNAL_ERROR'
        });
    }
});

module.exports = router;
