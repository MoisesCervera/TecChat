const express = require('express');
const { getPool } = require('../database/provider-factory');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

/**
 * Create a new chat
 */
router.post('/', requireAuth, async (req, res) => {
    try {
        const { tipo = 'individual', nombre, participantes = [] } = req.body;

        if (tipo === 'individual' && (!participantes || participantes.length !== 1)) {
            return res.status(400).json({
                error: 'Para chats individuales, se necesita exactamente un participante',
                code: 'INVALID_PARTICIPANTS'
            });
        }

        const db = getPool();

        // Start a transaction for creating the chat
        await db.query('BEGIN TRANSACTION');

        try {
            // Check if chat already exists for individual chats
            if (tipo === 'individual') {
                const existingChat = await db.query(`
                    SELECT c.id_chat, c.tipo
                    FROM CHAT c
                    JOIN CHAT_PARTICIPANTE cp1 ON c.id_chat = cp1.id_chat AND cp1.id_usuario = ?
                    JOIN CHAT_PARTICIPANTE cp2 ON c.id_chat = cp2.id_chat AND cp2.id_usuario = ?
                    WHERE c.tipo = 'individual'
                    LIMIT 1
                `, [req.userId, participantes[0]]);

                if (existingChat.length > 0) {
                    // If chat exists, get its details and return
                    const chatDetails = await getChatDetails(existingChat[0].id_chat, req.userId, db);

                    // Commit the transaction
                    await db.query('COMMIT');

                    return res.status(200).json({
                        message: 'Chat already exists',
                        chat: chatDetails
                    });
                }
            }

            // Create a new chat
            const chatResult = await db.query(
                'INSERT INTO CHAT (tipo, creado_en) VALUES (?, CURRENT_TIMESTAMP)',
                [tipo]
            );

            const chatId = chatResult.lastID;

            // Add current user as participant
            await db.query(
                'INSERT INTO CHAT_PARTICIPANTE (id_chat, id_usuario, fecha_union) VALUES (?, ?, CURRENT_TIMESTAMP)',
                [chatId, req.userId]
            );

            // Add other participants
            for (const participantId of participantes) {
                await db.query(
                    'INSERT INTO CHAT_PARTICIPANTE (id_chat, id_usuario, fecha_union) VALUES (?, ?, CURRENT_TIMESTAMP)',
                    [chatId, participantId]
                );
            }

            // If it's a group chat, create the group record
            if (tipo === 'grupo' && nombre) {
                const groupResult = await db.query(
                    'INSERT INTO GRUPO (id_chat, nombre, creado_en) VALUES (?, ?, CURRENT_TIMESTAMP)',
                    [chatId, nombre]
                );

                const groupId = groupResult.lastID;

                // Set current user as admin
                await db.query(
                    'INSERT INTO GRUPO_USUARIO (id_grupo, id_usuario, rol, fecha_union) VALUES (?, ?, ?, CURRENT_TIMESTAMP)',
                    [groupId, req.userId, 'admin']
                );

                // Add other participants as members
                for (const participantId of participantes) {
                    await db.query(
                        'INSERT INTO GRUPO_USUARIO (id_grupo, id_usuario, rol, fecha_union) VALUES (?, ?, ?, CURRENT_TIMESTAMP)',
                        [groupId, participantId, 'member']
                    );
                }
            }

            // Commit the transaction
            await db.query('COMMIT');

            // Get full chat details
            const chatDetails = await getChatDetails(chatId, req.userId, db);

            // Notify via WebSocket if applicable
            const socketHandler = req.app.get('socketHandler');
            if (socketHandler) {
                // Notify participants to refresh their chat list
                for (const participantId of participantes) {
                    socketHandler.sendToUser(participantId, 'chat_created', {
                        chatId,
                        creatorId: req.userId
                    });
                }
            }

            res.status(201).json({
                message: 'Chat created successfully',
                chat: chatDetails
            });

        } catch (error) {
            // Rollback in case of error
            await db.query('ROLLBACK');
            throw error;
        }

    } catch (error) {
        console.error('Create chat error:', error);
        res.status(500).json({
            error: 'Error creating chat',
            code: 'INTERNAL_ERROR'
        });
    }
});

/**
 * Helper function to get detailed chat information
 */
async function getChatDetails(chatId, userId, db) {
    // Get basic chat info
    const chats = await db.query(`
        SELECT c.id_chat, c.tipo, c.creado_en
        FROM CHAT c
        WHERE c.id_chat = ?
    `, [chatId]);

    if (chats.length === 0) {
        return null;
    }

    const chat = chats[0];

    // Get participants
    const participants = await db.query(`
        SELECT 
            cp.id_usuario,
            u.nombre,
            u.telefono,
            u.foto_perfil,
            cp.fecha_union
        FROM CHAT_PARTICIPANTE cp
        JOIN USUARIO u ON cp.id_usuario = u.id_usuario
        WHERE cp.id_chat = ?
    `, [chatId]);

    chat.participantes = participants;

    // If it's an individual chat, get the other participant
    if (chat.tipo === 'individual') {
        const otherParticipant = participants.find(p => p.id_usuario !== userId);
        if (otherParticipant) {
            chat.participante = otherParticipant;
        }
    }

    // If it's a group chat, get group info
    if (chat.tipo === 'grupo') {
        const groups = await db.query(`
            SELECT id_grupo, nombre, foto
            FROM GRUPO
            WHERE id_chat = ?
        `, [chatId]);

        if (groups.length > 0) {
            chat.grupo = groups[0];
            chat.nombre_grupo = groups[0].nombre;
        }
    }

    return chat;
}

module.exports = router;
