const express = require('express');
const { getPool } = require('../database/provider-factory');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

/**
 * Get messages for a chat
 */
router.get('/:chatId', requireAuth, async (req, res) => {
    try {
        const { chatId } = req.params;
        const { limit = 50, offset = 0 } = req.query;

        const db = getPool();

        // Verify user participates in chat
        const participation = await db.query(
            'SELECT id_chat FROM CHAT_PARTICIPANTE WHERE id_chat = ? AND id_usuario = ?',
            [chatId, req.userId]
        );

        if (participation.length === 0) {
            return res.status(404).json({
                error: 'Chat no encontrado o sin acceso',
                code: 'CHAT_NOT_FOUND'
            });
        }

        // Get chat type
        const chatInfo = await db.query(
            'SELECT tipo FROM CHAT WHERE id_chat = ?',
            [chatId]
        );

        if (chatInfo.length === 0) {
            return res.status(404).json({
                error: 'Chat no encontrado',
                code: 'CHAT_NOT_FOUND'
            });
        }

        const chatType = chatInfo[0].tipo;

        // Get messages with sender info and read status
        let messages;

        if (chatType === 'grupo') {
            // For group chats, get read status from MENSAJE_LEIDO table
            messages = await db.query(`
                SELECT 
                    m.id_mensaje,
                    m.id_chat,
                    m.id_usuario_remitente,
                    m.contenido,
                    m.tipo,
                    m.enviado_en,
                    m.leido_en,
                    u.nombre as nombre_remitente,
                    u.telefono as telefono_remitente,
                    (SELECT COUNT(*) FROM MENSAJE_LEIDO ml WHERE ml.id_mensaje = m.id_mensaje) as read_count,
                    (SELECT EXISTS(SELECT 1 FROM MENSAJE_LEIDO ml WHERE ml.id_mensaje = m.id_mensaje AND ml.id_usuario = ?)) as read_by_me
                FROM MENSAJE m
                JOIN USUARIO u ON m.id_usuario_remitente = u.id_usuario
                WHERE m.id_chat = ?
                ORDER BY m.enviado_en DESC
                LIMIT ? OFFSET ?
            `, [req.userId, chatId, parseInt(limit), parseInt(offset)]);

            // Get list of users who read each message
            for (let message of messages) {
                const readers = await db.query(`
                    SELECT 
                        ml.id_usuario, 
                        ml.leido_en,
                        u.nombre
                    FROM MENSAJE_LEIDO ml
                    JOIN USUARIO u ON ml.id_usuario = u.id_usuario
                    WHERE ml.id_mensaje = ?
                `, [message.id_mensaje]);

                message.readers = readers;
            }
        } else {
            // For individual chats, use traditional method
            messages = await db.query(`
                SELECT 
                    m.id_mensaje,
                    m.id_chat,
                    m.id_usuario_remitente,
                    m.contenido,
                    m.tipo,
                    m.enviado_en,
                    m.leido_en,
                    u.nombre as nombre_remitente,
                    u.telefono as telefono_remitente
                FROM MENSAJE m
                JOIN USUARIO u ON m.id_usuario_remitente = u.id_usuario
                WHERE m.id_chat = ?
                ORDER BY m.enviado_en DESC
                LIMIT ? OFFSET ?
            `, [chatId, parseInt(limit), parseInt(offset)]);
        }

        // Reverse to show oldest first
        messages.reverse();

        // Get multimedia attachments for messages that have them
        for (let message of messages) {
            if (message.tipo !== 'texto') {
                const multimedia = await db.query(
                    'SELECT id_media, url_archivo, tipo, metadata, tamano_bytes FROM MULTIMEDIA WHERE id_mensaje = ?',
                    [message.id_mensaje]
                );
                message.multimedia = multimedia;
            }
        }

        res.json({ messages });

    } catch (error) {
        console.error('Get messages error:', error);
        res.status(500).json({
            error: 'Error obteniendo mensajes',
            code: 'INTERNAL_ERROR'
        });
    }
});

/**
 * Send a message
 */
router.post('/', requireAuth, async (req, res) => {
    try {
        const { chatId, contenido, tipo = 'texto', tempId } = req.body;

        if (!chatId || !contenido) {
            return res.status(400).json({
                error: 'ID de chat y contenido son requeridos',
                code: 'MISSING_FIELDS'
            });
        }

        const db = getPool();

        // Verify user participates in chat
        const participation = await db.query(
            'SELECT id_chat FROM CHAT_PARTICIPANTE WHERE id_chat = ? AND id_usuario = ?',
            [chatId, req.userId]
        );

        if (participation.length === 0) {
            return res.status(404).json({
                error: 'Chat no encontrado o sin acceso',
                code: 'CHAT_NOT_FOUND'
            });
        }

        // Insert message
        const result = await db.query(`
            INSERT INTO MENSAJE (id_chat, id_usuario_remitente, contenido, tipo, enviado_en) 
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        `, [chatId, req.userId, contenido, tipo]);

        // Get the created message with sender info
        const newMessage = await db.query(`
            SELECT 
                m.id_mensaje,
                m.id_chat,
                m.id_usuario_remitente,
                m.contenido,
                m.tipo,
                m.enviado_en,
                m.leido_en,
                u.nombre as nombre_remitente,
                u.telefono as telefono_remitente
            FROM MENSAJE m
            JOIN USUARIO u ON m.id_usuario_remitente = u.id_usuario
            WHERE m.id_mensaje = ?
        `, [result.lastID]);

        const messageData = newMessage[0];

        // Get multimedia attachments if message has them
        if (messageData.tipo !== 'texto') {
            const multimedia = await db.query(
                'SELECT id_media, url_archivo, tipo, metadata, tamano_bytes FROM MULTIMEDIA WHERE id_mensaje = ?',
                [messageData.id_mensaje]
            );
            messageData.multimedia = multimedia;
        }

        res.status(201).json({
            message: messageData,
            tempId: tempId, // Return the tempId to help client match messages
            status: 'Mensaje enviado'
        });

        // Emit WebSocket event to other participants
        const socketHandler = req.app.get('socketHandler');
        if (socketHandler) {
            // Don't emit to everyone - instead use a targeted approach
            // Get all participants in this chat
            const participants = await db.query(
                'SELECT id_usuario FROM CHAT_PARTICIPANTE WHERE id_chat = ? AND id_usuario != ?',
                [chatId, req.userId]
            );

            // Send to each participant (except the sender)
            participants.forEach(participant => {
                socketHandler.sendToUser(participant.id_usuario, 'new-message', {
                    ...messageData,
                    chat_id: chatId, // Add chat_id for frontend compatibility
                    tempId: tempId, // Include tempId for tracking
                    isOwn: false
                });
            });
        }

    } catch (error) {
        console.error('Send message error:', error);
        res.status(500).json({
            error: 'Error enviando mensaje',
            code: 'INTERNAL_ERROR'
        });
    }
});

/**
 * Mark message as read
 */
router.patch('/:messageId/read', requireAuth, async (req, res) => {
    try {
        const { messageId } = req.params;

        const db = getPool();

        // Get message and verify user has access to the chat
        const messages = await db.query(`
            SELECT m.id_mensaje, m.id_chat, m.id_usuario_remitente, c.tipo as chat_tipo
            FROM MENSAJE m
            JOIN CHAT c ON m.id_chat = c.id_chat
            WHERE m.id_mensaje = ?
            AND m.id_chat IN (
                SELECT id_chat FROM CHAT_PARTICIPANTE WHERE id_usuario = ?
            )
        `, [messageId, req.userId]);

        if (messages.length === 0) {
            return res.status(404).json({
                error: 'Mensaje no encontrado',
                code: 'MESSAGE_NOT_FOUND'
            });
        }

        const message = messages[0];

        // Don't mark own messages as read
        if (message.id_usuario_remitente === req.userId) {
            return res.status(400).json({
                error: 'No puedes marcar tus propios mensajes como leídos',
                code: 'OWN_MESSAGE'
            });
        }

        const timestamp = new Date().toISOString();

        // Check if this is a group chat or individual chat
        if (message.chat_tipo === 'grupo') {
            // For group chats, track read status in MENSAJE_LEIDO table

            // Check if already marked as read by this user
            const existingRead = await db.query(
                'SELECT id_mensaje FROM MENSAJE_LEIDO WHERE id_mensaje = ? AND id_usuario = ?',
                [messageId, req.userId]
            );

            if (existingRead.length === 0) {
                // Insert new read record
                await db.query(
                    'INSERT INTO MENSAJE_LEIDO (id_mensaje, id_usuario, leido_en) VALUES (?, ?, CURRENT_TIMESTAMP)',
                    [messageId, req.userId]
                );
            } else {
                // Update existing read record
                await db.query(
                    'UPDATE MENSAJE_LEIDO SET leido_en = CURRENT_TIMESTAMP WHERE id_mensaje = ? AND id_usuario = ?',
                    [messageId, req.userId]
                );
            }
        } else {
            // For individual chats, use the traditional MENSAJE.leido_en field
            await db.query(
                'UPDATE MENSAJE SET leido_en = CURRENT_TIMESTAMP WHERE id_mensaje = ?',
                [messageId]
            );
        }

        res.json({ message: 'Mensaje marcado como leído' });

        // Emit WebSocket event for read receipt
        if (req.io) {
            // Get user's name from database for better user experience
            const db = getPool();
            const users = await db.query('SELECT nombre FROM USUARIO WHERE id_usuario = ?', [req.userId]);
            const userName = users.length > 0 ? users[0].nombre : req.userName || 'Usuario';

            // Create read receipt data with all necessary fields
            const readData = {
                messageId: messageId,
                userId: req.userId,
                readByName: userName,
                chatId: message.id_chat,
                chatType: message.chat_tipo,
                timestamp: timestamp
            };

            console.log('Server emitting read receipt with data:', JSON.stringify(readData));

            // Broadcast to all clients in the chat room
            req.io.to(`chat-${message.id_chat}`).emit('message-read', readData);
            req.io.to(`chat-${message.id_chat}`).emit('message_read', readData);

            // Also send directly to the sender of the message
            req.io.to(`user-${message.id_usuario_remitente}`).emit('message-read', readData);
            req.io.to(`user-${message.id_usuario_remitente}`).emit('message_read', readData);
        }

    } catch (error) {
        console.error('Mark read error:', error);
        res.status(500).json({
            error: 'Error marcando mensaje como leído',
            code: 'INTERNAL_ERROR'
        });
    }
});

/**
 * Mark all messages in chat as read
 */
router.patch('/chat/:chatId/read-all', requireAuth, async (req, res) => {
    try {
        const { chatId } = req.params;

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

        // Get chat type
        const chatInfo = await db.query(
            'SELECT tipo FROM CHAT WHERE id_chat = ?',
            [chatId]
        );

        if (chatInfo.length === 0) {
            return res.status(404).json({
                error: 'Chat no encontrado',
                code: 'CHAT_NOT_FOUND'
            });
        }

        const chatType = chatInfo[0].tipo;
        let updatedCount = 0;

        if (chatType === 'grupo') {
            // For group chats, use MENSAJE_LEIDO table

            // Get all unread messages in this chat
            const unreadMessages = await db.query(`
                SELECT m.id_mensaje
                FROM MENSAJE m
                LEFT JOIN MENSAJE_LEIDO ml ON m.id_mensaje = ml.id_mensaje AND ml.id_usuario = ?
                WHERE m.id_chat = ?
                AND m.id_usuario_remitente != ?
                AND ml.id_mensaje IS NULL
            `, [req.userId, chatId, req.userId]);

            // Insert read records for each unread message
            if (unreadMessages.length > 0) {
                const values = unreadMessages.map(msg =>
                    `(${msg.id_mensaje}, ${req.userId}, CURRENT_TIMESTAMP)`
                ).join(', ');

                const result = await db.query(`
                    INSERT INTO MENSAJE_LEIDO (id_mensaje, id_usuario, leido_en)
                    VALUES ${values}
                `);

                updatedCount = unreadMessages.length;
            }
        } else {
            // For individual chats, use traditional method
            const result = await db.query(`
                UPDATE MENSAJE 
                SET leido_en = CURRENT_TIMESTAMP 
                WHERE id_chat = ? 
                AND id_usuario_remitente != ? 
                AND leido_en IS NULL
            `, [chatId, req.userId]);

            updatedCount = result.changes;
        }

        // If messages were updated and the socket handler is available, emit events
        if (updatedCount > 0 && req.io) {
            // Get the necessary info for the socket message
            const userInfo = await db.query(
                'SELECT nombre FROM USUARIO WHERE id_usuario = ?',
                [req.userId]
            );

            const readByName = userInfo.length > 0 ? userInfo[0].nombre : 'Unknown';
            const timestamp = new Date().toISOString();

            // For group chats, we need to get all messages that were just marked as read
            if (chatType === 'grupo') {
                const recentlyReadMessages = await db.query(`
                    SELECT m.id_mensaje, m.id_usuario_remitente
                    FROM MENSAJE_LEIDO ml
                    JOIN MENSAJE m ON ml.id_mensaje = m.id_mensaje
                    WHERE ml.id_usuario = ? 
                    AND m.id_chat = ?
                    AND ml.leido_en > datetime('now', '-30 seconds')
                `, [req.userId, chatId]);

                // Emit events for each message
                recentlyReadMessages.forEach(msg => {
                    req.io.to(`chat-${chatId}`).emit('message-read', {
                        messageId: msg.id_mensaje,
                        userId: req.userId,
                        readByName,
                        chatId,
                        chatType,
                        timestamp
                    });

                    // Also emit with underscore format for backward compatibility
                    req.io.to(`chat-${chatId}`).emit('message_read', {
                        messageId: msg.id_mensaje,
                        userId: req.userId,
                        readByName,
                        chatId,
                        chatType,
                        timestamp
                    });

                    // Send direct notification to the sender if it's not the reader
                    const senderId = msg.id_usuario_remitente;
                    if (senderId !== req.userId) {
                        req.io.to(`user-${senderId}`).emit('message-read', {
                            messageId: msg.id_mensaje,
                            userId: req.userId,
                            readByName,
                            chatId,
                            chatType,
                            timestamp
                        });

                        req.io.to(`user-${senderId}`).emit('message_read', {
                            messageId: msg.id_mensaje,
                            userId: req.userId,
                            readByName,
                            chatId,
                            chatType,
                            timestamp
                        });
                    }
                });
            } else {
                // For individual chats, get the recently read messages
                const recentlyReadMessages = await db.query(`
                    SELECT id_mensaje, id_usuario_remitente
                    FROM MENSAJE
                    WHERE id_chat = ?
                    AND id_usuario_remitente != ?
                    AND leido_en > datetime('now', '-30 seconds')
                `, [chatId, req.userId]);

                // Emit events for each message
                recentlyReadMessages.forEach(msg => {
                    req.io.to(`chat-${chatId}`).emit('message-read', {
                        messageId: msg.id_mensaje,
                        userId: req.userId,
                        readByName,
                        chatId,
                        chatType,
                        timestamp
                    });

                    // Also emit with underscore format for backward compatibility
                    req.io.to(`chat-${chatId}`).emit('message_read', {
                        messageId: msg.id_mensaje,
                        userId: req.userId,
                        readByName,
                        chatId,
                        chatType,
                        timestamp
                    });

                    // Send direct notification to the sender
                    const senderId = msg.id_usuario_remitente;
                    if (senderId !== req.userId) {
                        req.io.to(`user-${senderId}`).emit('message-read', {
                            messageId: msg.id_mensaje,
                            userId: req.userId,
                            readByName,
                            chatId,
                            chatType,
                            timestamp
                        });

                        req.io.to(`user-${senderId}`).emit('message_read', {
                            messageId: msg.id_mensaje,
                            userId: req.userId,
                            readByName,
                            chatId,
                            chatType,
                            timestamp
                        });
                    }
                });
            }
        }

        res.json({
            message: 'Mensajes marcados como leídos',
            updated: updatedCount
        });

    } catch (error) {
        console.error('Mark all read error:', error);
        res.status(500).json({
            error: 'Error marcando mensajes como leídos',
            code: 'INTERNAL_ERROR'
        });
    }
});

/**
 * Delete message (for sender only)
 */
router.delete('/:messageId', requireAuth, async (req, res) => {
    try {
        const { messageId } = req.params;

        const db = getPool();

        // Verify message belongs to user
        const messages = await db.query(
            'SELECT id_mensaje, contenido FROM MENSAJE WHERE id_mensaje = ? AND id_usuario_remitente = ?',
            [messageId, req.userId]
        );

        if (messages.length === 0) {
            return res.status(404).json({
                error: 'Mensaje no encontrado o sin permisos',
                code: 'MESSAGE_NOT_FOUND'
            });
        }

        // Soft delete - update content instead of deleting
        await db.query(
            'UPDATE MENSAJE SET contenido = ?, tipo = ? WHERE id_mensaje = ?',
            ['Este mensaje fue eliminado', 'eliminado', messageId]
        );

        res.json({ message: 'Mensaje eliminado' });

        // Emit WebSocket event for message deletion
        const socketHandler = req.app.get('socketHandler');
        if (socketHandler) {
            socketHandler.sendToChat(message.id_chat, 'message_deleted', {
                messageId: messageId,
                chatId: message.id_chat,
                deletedBy: req.userId,
                timestamp: new Date().toISOString()
            });
        }

    } catch (error) {
        console.error('Delete message error:', error);
        res.status(500).json({
            error: 'Error eliminando mensaje',
            code: 'INTERNAL_ERROR'
        });
    }
});

/**
 * Get unread message count
 */
router.get('/unread/count', requireAuth, async (req, res) => {
    try {
        const db = getPool();

        // Get unread count per chat
        const unreadCounts = await db.query(`
            SELECT 
                m.id_chat,
                COUNT(*) as unread_count
            FROM MENSAJE m
            WHERE m.id_chat IN (
                SELECT id_chat FROM CHAT_PARTICIPANTE WHERE id_usuario = ?
            )
            AND m.id_usuario_remitente != ?
            AND m.leido_en IS NULL
            GROUP BY m.id_chat
        `, [req.userId, req.userId]);

        res.json({ unreadCounts });

    } catch (error) {
        console.error('Get unread count error:', error);
        res.status(500).json({
            error: 'Error obteniendo conteo de no leídos',
            code: 'INTERNAL_ERROR'
        });
    }
});

module.exports = router;
