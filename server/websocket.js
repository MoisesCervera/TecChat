/**
 * WebSocket handler for real-time messaging
 * Simple Socket.IO implementation for chat features
 */

const { getPool } = require('./database/provider-factory');
const { sendDeliveryNotifications } = require('./utils/socket-helpers');

class SocketHandler {
    constructor(io) {
        this.io = io;
        this.activeUsers = new Map(); // userId -> socketId
        this.userSockets = new Map(); // socketId -> userId

        this.setupSocketHandlers();
    }

    setupSocketHandlers() {
        this.io.on('connection', (socket) => {
            console.log(`🔌 Socket conectado: ${socket.id}`);

            // User authentication for socket
            socket.on('authenticate', async (data) => {
                try {
                    const { userId, userName } = data;

                    // Store user mapping
                    this.activeUsers.set(userId, socket.id);
                    this.userSockets.set(socket.id, { userId, userName });

                    // Join user to their personal room
                    socket.join(`user-${userId}`);

                    // Get user's chats and join those rooms
                    const db = getPool();
                    const chats = await db.query(`
                        SELECT id_chat FROM CHAT_PARTICIPANTE WHERE id_usuario = ?
                    `, [userId]);

                    chats.forEach(chat => {
                        socket.join(`chat-${chat.id_chat}`);
                    });

                    // Notify user is online
                    socket.broadcast.emit('user-online', {
                        userId,
                        userName,
                        timestamp: new Date().toISOString()
                    });

                    // Mark messages as delivered for this user who just came online
                    try {
                        // Find all undelivered messages to this user
                        const undeliveredMessages = await db.query(`
                            SELECT m.id_mensaje, m.id_usuario_remitente, m.id_chat
                            FROM MENSAJE m
                            LEFT JOIN MENSAJE_INFO mi ON mi.id_mensaje = m.id_mensaje AND mi.id_usuario = ?
                            WHERE m.id_usuario_remitente <> ?
                            AND (mi.id_mensaje IS NULL OR mi.entregado_en IS NULL)
                            ORDER BY m.enviado_en DESC
                            LIMIT 100
                        `, [userId, userId]);

                        if (undeliveredMessages && undeliveredMessages.length > 0) {
                            console.log(`User ${userName} came online, marking ${undeliveredMessages.length} messages as delivered`);

                            // Group messages by sender and chat
                            const messagesBySender = {};

                            // Mark each message as delivered
                            for (const message of undeliveredMessages) {
                                // Update or insert delivery status
                                const existingRecord = await db.query(`
                                    SELECT * FROM MENSAJE_INFO 
                                    WHERE id_mensaje = ? AND id_usuario = ?
                                `, [message.id_mensaje, userId]);

                                if (existingRecord.length > 0) {
                                    await db.query(`
                                        UPDATE MENSAJE_INFO 
                                        SET entregado_en = CURRENT_TIMESTAMP 
                                        WHERE id_mensaje = ? AND id_usuario = ? AND entregado_en IS NULL
                                    `, [message.id_mensaje, userId]);
                                } else {
                                    await db.query(`
                                        INSERT INTO MENSAJE_INFO (id_mensaje, id_usuario, entregado_en)
                                        VALUES (?, ?, CURRENT_TIMESTAMP)
                                    `, [message.id_mensaje, userId]);
                                }

                                // Track by sender and chat
                                const senderId = message.id_usuario_remitente;
                                const chatId = message.id_chat;
                                const key = `${senderId}-${chatId}`;

                                if (!messagesBySender[key]) {
                                    messagesBySender[key] = {
                                        senderId,
                                        chatId,
                                        messageIds: []
                                    };
                                }
                                messagesBySender[key].messageIds.push(message.id_mensaje);
                            }

                            // Notify each sender about their delivered messages, grouped by chat
                            for (const key in messagesBySender) {
                                const { senderId, chatId, messageIds } = messagesBySender[key];
                                const senderSocketId = this.activeUsers.get(parseInt(senderId));

                                if (senderSocketId) {
                                    // Get chat type
                                    const chatInfo = await db.query(`
                                        SELECT tipo FROM CHAT WHERE id_chat = ?
                                    `, [chatId]);
                                    const chatType = chatInfo[0]?.tipo || 'individual';

                                    console.log(`Notifying sender ${senderId} about ${messageIds.length} messages delivered to ${userName} in chat ${chatId}`);

                                    const timestamp = new Date().toISOString();

                                    // Send both formats for compatibility
                                    this.io.to(senderSocketId).emit('messages-delivered', {
                                        messageIds,
                                        userId,
                                        deliveredByName: userName,
                                        chatId,
                                        chatType,
                                        timestamp
                                    });

                                    this.io.to(senderSocketId).emit('messages_delivered', {
                                        messageIds,
                                        userId,
                                        deliveredByName: userName,
                                        chatId,
                                        chatType,
                                        timestamp
                                    });
                                }
                            }
                        }
                    } catch (error) {
                        console.error('Error marking messages as delivered on user connect:', error);
                    }

                    // Send list of online users to this user
                    const onlineUsersList = Array.from(this.activeUsers.keys());
                    console.log(`Sending online users list to ${userName}: ${JSON.stringify(onlineUsersList)}`);
                    socket.emit('online-users', onlineUsersList);

                    console.log(`✅ Usuario autenticado: ${userName} (${userId})`);

                } catch (error) {
                    console.error('Socket authentication error:', error);
                    socket.emit('auth-error', { error: 'Authentication failed' });
                }
            });

            // Handle new message
            socket.on('send-message', async (data) => {
                try {
                    const { chatId, contenido, tipo = 'texto' } = data;
                    const userInfo = this.userSockets.get(socket.id);

                    if (!userInfo) {
                        socket.emit('error', { error: 'Not authenticated' });
                        return;
                    }

                    const db = getPool();

                    // Verify user participates in chat
                    const participation = await db.query(
                        'SELECT id_chat FROM CHAT_PARTICIPANTE WHERE id_chat = ? AND id_usuario = ?',
                        [chatId, userInfo.userId]
                    );

                    if (participation.length === 0) {
                        socket.emit('error', { error: 'Chat access denied' });
                        return;
                    }

                    // Insert message
                    const result = await db.query(`
                        INSERT INTO MENSAJE (id_chat, id_usuario_remitente, contenido, tipo, enviado_en) 
                        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
                    `, [chatId, userInfo.userId, contenido, tipo]);

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

                    // Get the chat type (individual or group)
                    const chatInfo = await db.query(
                        'SELECT tipo FROM CHAT WHERE id_chat = ?',
                        [chatId]
                    );

                    const chatType = chatInfo[0]?.tipo || 'individual';

                    // Get all participants to track delivery
                    const participants = await db.query(
                        'SELECT id_usuario FROM CHAT_PARTICIPANTE WHERE id_chat = ? AND id_usuario <> ?',
                        [chatId, userInfo.userId]
                    );

                    // For each online participant, automatically mark as delivered
                    const onlineRecipients = [];
                    for (const participant of participants) {
                        const participantId = participant.id_usuario;
                        const isOnline = this.activeUsers.has(participantId);

                        if (isOnline) {
                            // Insert delivery record in MENSAJE_INFO
                            await db.query(
                                'INSERT INTO MENSAJE_INFO (id_mensaje, id_usuario, entregado_en) VALUES (?, ?, CURRENT_TIMESTAMP)',
                                [messageData.id_mensaje, participantId]
                            );

                            // Track online recipients for delivery notification
                            onlineRecipients.push(participantId);
                        }
                    }

                    // If there are online recipients, notify sender immediately about delivery
                    if (onlineRecipients.length > 0) {
                        console.log(`Message ${messageData.id_mensaje} automatically delivered to ${onlineRecipients.length} online recipients`);

                        // Notify sender about immediate delivery
                        socket.emit('messages-delivered', {
                            messageIds: [messageData.id_mensaje],
                            recipients: onlineRecipients,
                            chatId,
                            chatType,
                            timestamp: new Date().toISOString()
                        });

                        socket.emit('messages_delivered', {
                            messageIds: [messageData.id_mensaje],
                            recipients: onlineRecipients,
                            chatId,
                            chatType,
                            timestamp: new Date().toISOString()
                        });
                    }

                    // Emit only to other participants in the chat (not back to sender)
                    console.log(`Sending new message to room chat-${chatId}:`, JSON.stringify({
                        id_mensaje: messageData.id_mensaje,
                        contenido: messageData.contenido,
                        tempId: data.tempId
                    }));

                    // Add a message ID that will be used for delivery tracking
                    const messageToSend = {
                        ...messageData,
                        tempId: data.tempId, // Include tempId for tracking
                        isOwn: false, // Will be overridden by sender's client
                        chatType
                    };

                    // Emit the message to all clients in the chat room
                    socket.to(`chat-${chatId}`).emit('new-message', messageToSend);

                    // Confirm to sender
                    socket.emit('message-sent', {
                        tempId: data.tempId, // For client-side matching
                        messageId: messageData.id_mensaje,
                        timestamp: messageData.enviado_en,
                        chatType
                    });

                    console.log(`📨 Mensaje enviado: ${userInfo.userName} -> Chat ${chatId}`);

                } catch (error) {
                    console.error('Send message error:', error);
                    socket.emit('message-error', {
                        error: 'Error enviando mensaje',
                        tempId: data.tempId
                    });
                }
            });

            // Handle typing indicators
            socket.on('typing-start', (data) => {
                const { chatId } = data;
                const userInfo = this.userSockets.get(socket.id);

                if (userInfo) {
                    socket.to(`chat-${chatId}`).emit('typing-start', {
                        userId: userInfo.userId,
                        userName: userInfo.userName,
                        chatId
                    });
                }
            });

            socket.on('typing-stop', (data) => {
                const { chatId } = data;
                const userInfo = this.userSockets.get(socket.id);

                if (userInfo) {
                    socket.to(`chat-${chatId}`).emit('typing-stop', {
                        userId: userInfo.userId,
                        chatId
                    });
                }
            });

            // Handle ping (keep-alive)
            socket.on('ping', () => {
                // Reply with pong to confirm connection is still active
                socket.emit('pong', { time: new Date().toISOString() });
            });

            // Handle join chat room
            socket.on('join-chat', async (data) => {
                try {
                    const userInfo = this.userSockets.get(socket.id);
                    if (!userInfo) return;

                    const { chatId } = data;

                    // Verify permission to join
                    const db = getPool();
                    const participation = await db.query(
                        'SELECT id_chat FROM CHAT_PARTICIPANTE WHERE id_chat = ? AND id_usuario = ?',
                        [chatId, userInfo.userId]
                    );

                    if (participation.length === 0) {
                        socket.emit('error', { error: 'Chat access denied' });
                        return;
                    }

                    socket.join(`chat-${chatId}`);
                    console.log(`🚪 Usuario ${userInfo.userName} se unió al chat ${chatId}`);

                    // Get chat type
                    const chatInfo = await db.query(
                        'SELECT tipo FROM CHAT WHERE id_chat = ?',
                        [chatId]
                    );

                    const chatType = chatInfo[0]?.tipo || 'individual';

                    // When joining a chat, mark recent undelivered messages as delivered
                    // First, find all messages in the chat that haven't been marked as delivered for this user
                    const undeliveredMessages = await db.query(`
                        SELECT m.id_mensaje, m.id_usuario_remitente
                        FROM MENSAJE m
                        LEFT JOIN MENSAJE_INFO mi ON mi.id_mensaje = m.id_mensaje AND mi.id_usuario = ?
                        WHERE m.id_chat = ? 
                        AND m.id_usuario_remitente <> ?
                        AND (mi.id_mensaje IS NULL OR mi.entregado_en IS NULL)
                        ORDER BY m.enviado_en DESC
                        LIMIT 50
                    `, [userInfo.userId, chatId, userInfo.userId]);

                    if (undeliveredMessages.length > 0) {
                        console.log(`Marking ${undeliveredMessages.length} messages as delivered for user ${userInfo.userName}`);

                        // Group messages by sender for efficiency when sending notifications
                        const messagesBySender = {};

                        // Mark each message as delivered
                        for (const message of undeliveredMessages) {
                            // Check if record exists
                            const existingRecord = await db.query(`
                                SELECT * FROM MENSAJE_INFO 
                                WHERE id_mensaje = ? AND id_usuario = ?
                            `, [message.id_mensaje, userInfo.userId]);

                            if (existingRecord.length > 0) {
                                // Update existing record
                                await db.query(`
                                    UPDATE MENSAJE_INFO 
                                    SET entregado_en = CURRENT_TIMESTAMP 
                                    WHERE id_mensaje = ? AND id_usuario = ? AND entregado_en IS NULL
                                `, [message.id_mensaje, userInfo.userId]);
                            } else {
                                // Insert new record
                                await db.query(`
                                    INSERT INTO MENSAJE_INFO (id_mensaje, id_usuario, entregado_en)
                                    VALUES (?, ?, CURRENT_TIMESTAMP)
                                `, [message.id_mensaje, userInfo.userId]);
                            }

                            // Group by sender for notifications
                            const senderId = message.id_usuario_remitente;
                            if (!messagesBySender[senderId]) {
                                messagesBySender[senderId] = [];
                            }
                            messagesBySender[senderId].push(message.id_mensaje);
                        }

                        // Notify senders that their messages were delivered
                        const timestamp = new Date().toISOString();
                        for (const senderId in messagesBySender) {
                            const senderSocketId = this.activeUsers.get(parseInt(senderId));
                            if (senderSocketId) {
                                console.log(`Sending delivery notification to ${senderId} for messages:`, messagesBySender[senderId]);

                                // Send both formats for compatibility
                                this.io.to(senderSocketId).emit('messages-delivered', {
                                    messageIds: messagesBySender[senderId],
                                    userId: userInfo.userId,
                                    deliveredByName: userInfo.userName,
                                    chatId,
                                    chatType,
                                    timestamp
                                });

                                this.io.to(senderSocketId).emit('messages_delivered', {
                                    messageIds: messagesBySender[senderId],
                                    userId: userInfo.userId,
                                    deliveredByName: userInfo.userName,
                                    chatId,
                                    chatType,
                                    timestamp
                                });
                            } else {
                                console.log(`User ${senderId} is offline, skipping delivery notification`);
                            }
                        }
                    }
                } catch (error) {
                    console.error('Error joining chat:', error);
                    socket.emit('error', { error: 'Error joining chat' });
                }
            });

            // Handle join chat with underscore format
            socket.on('join_chat', async (data) => {
                try {
                    const userInfo = this.userSockets.get(socket.id);
                    if (!userInfo) return;

                    // Extract chatId from different formats
                    let chatId;
                    if (typeof data === 'object') {
                        chatId = data.chatId;
                    } else {
                        chatId = data;
                    }

                    // Verify permission to join
                    const db = getPool();
                    const participation = await db.query(
                        'SELECT id_chat FROM CHAT_PARTICIPANTE WHERE id_chat = ? AND id_usuario = ?',
                        [chatId, userInfo.userId]
                    );

                    if (participation.length === 0) {
                        socket.emit('error', { error: 'Chat access denied' });
                        return;
                    }

                    socket.join(`chat-${chatId}`);
                    console.log(`🏠 Usuario ${userInfo.userName} se unió al chat ${chatId} (underscore format)`);

                    // Get chat type
                    const chatInfo = await db.query(
                        'SELECT tipo FROM CHAT WHERE id_chat = ?',
                        [chatId]
                    );

                    const chatType = chatInfo[0]?.tipo || 'individual';

                    // When joining a chat, mark recent undelivered messages as delivered
                    const undeliveredMessages = await db.query(`
                        SELECT m.id_mensaje, m.id_usuario_remitente
                        FROM MENSAJE m
                        LEFT JOIN MENSAJE_INFO mi ON mi.id_mensaje = m.id_mensaje AND mi.id_usuario = ?
                        WHERE m.id_chat = ? 
                        AND m.id_usuario_remitente <> ?
                        AND (mi.id_mensaje IS NULL OR mi.entregado_en IS NULL)
                        ORDER BY m.enviado_en DESC
                        LIMIT 50
                    `, [userInfo.userId, chatId, userInfo.userId]);

                    if (undeliveredMessages && undeliveredMessages.length > 0) {
                        console.log(`Marking ${undeliveredMessages.length} messages as delivered for user ${userInfo.userName} (underscore format)`);

                        // Group messages by sender for efficiency when sending notifications
                        const messagesBySender = {};

                        // Mark each message as delivered
                        for (const message of undeliveredMessages) {
                            // Check if record exists
                            const existingRecord = await db.query(`
                                SELECT * FROM MENSAJE_INFO 
                                WHERE id_mensaje = ? AND id_usuario = ?
                            `, [message.id_mensaje, userInfo.userId]);

                            if (existingRecord.length > 0) {
                                // Update existing record
                                await db.query(`
                                    UPDATE MENSAJE_INFO 
                                    SET entregado_en = CURRENT_TIMESTAMP 
                                    WHERE id_mensaje = ? AND id_usuario = ? AND entregado_en IS NULL
                                `, [message.id_mensaje, userInfo.userId]);
                            } else {
                                // Insert new record
                                await db.query(`
                                    INSERT INTO MENSAJE_INFO (id_mensaje, id_usuario, entregado_en)
                                    VALUES (?, ?, CURRENT_TIMESTAMP)
                                `, [message.id_mensaje, userInfo.userId]);
                            }

                            // Group by sender for notifications
                            if (!messagesBySender[message.id_usuario_remitente]) {
                                messagesBySender[message.id_usuario_remitente] = [];
                            }
                            messagesBySender[message.id_usuario_remitente].push(message.id_mensaje);
                        }

                        // Notify senders that their messages were delivered
                        for (const senderId in messagesBySender) {
                            const senderSocketId = this.activeUsers.get(parseInt(senderId));
                            if (senderSocketId) {
                                console.log(`Sending delivery notification to ${senderId} for messages:`, messagesBySender[senderId]);
                                this.io.to(senderSocketId).emit('messages-delivered', {
                                    messageIds: messagesBySender[senderId],
                                    userId: userInfo.userId,
                                    chatId,
                                    chatType,
                                    timestamp: new Date().toISOString()
                                });
                            } else {
                                console.log(`User ${senderId} is offline, skipping delivery notification`);
                            }
                        }
                    }
                } catch (error) {
                    console.error('Error handling join_chat:', error);
                    socket.emit('error', { error: 'Error joining chat' });
                }
            });

            // Handle leave chat with dash format
            socket.on('leave-chat', (data) => {
                let chatId;
                if (typeof data === 'object') {
                    chatId = data.chatId;
                } else {
                    chatId = data;
                }
                socket.leave(`chat-${chatId}`);
                console.log(`🚪 Usuario salió del chat ${chatId}`);
            });

            // Handle leave chat with underscore format
            socket.on('leave_chat', (data) => {
                let chatId;
                if (typeof data === 'object') {
                    chatId = data.chatId;
                } else {
                    chatId = data;
                }
                socket.leave(`chat-${chatId}`);
                console.log(`🚪 Usuario salió del chat ${chatId}`);
            });

            // Handle mark message as read with both formats
            socket.on('mark-read', async (data) => {
                try {
                    const userInfo = this.userSockets.get(socket.id);
                    if (!userInfo) return;

                    const { messageId, chatId, chatType } = data;
                    console.log(`📖 Usuario ${userInfo.userName} marcó mensaje ${messageId} como leído`);

                    const timestamp = new Date().toISOString();
                    const db = getPool();

                    // Get message details to know the sender
                    const messages = await db.query(
                        'SELECT id_usuario_remitente FROM MENSAJE WHERE id_mensaje = ?',
                        [messageId]
                    );

                    if (messages.length === 0) {
                        console.error(`Message ${messageId} not found`);
                        return;
                    }

                    const senderId = messages[0].id_usuario_remitente;

                    // Don't mark own messages as read
                    if (senderId === userInfo.userId) {
                        console.log(`Skipping read receipt for own message ${messageId}`);
                        return;
                    }

                    // First update the database based on chat type
                    if (chatType === 'grupo') {
                        // For group chats, use MENSAJE_INFO table
                        // First check if entry exists
                        const existing = await db.query(
                            'SELECT * FROM MENSAJE_INFO WHERE id_mensaje = ? AND id_usuario = ?',
                            [messageId, userInfo.userId]
                        );

                        if (existing.length > 0) {
                            // Update existing record
                            await db.query(
                                'UPDATE MENSAJE_INFO SET leido_en = CURRENT_TIMESTAMP WHERE id_mensaje = ? AND id_usuario = ?',
                                [messageId, userInfo.userId]
                            );
                        } else {
                            // Create new record - mark as both delivered and read
                            await db.query(
                                'INSERT INTO MENSAJE_INFO (id_mensaje, id_usuario, entregado_en, leido_en) VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
                                [messageId, userInfo.userId]
                            );
                        }
                    } else {
                        // For individual chats, update both tables for backward compatibility

                        // Update legacy MENSAJE table
                        await db.query(
                            'UPDATE MENSAJE SET leido_en = CURRENT_TIMESTAMP WHERE id_mensaje = ?',
                            [messageId]
                        );

                        // Also update MENSAJE_INFO table for future-proofing
                        const existing = await db.query(
                            'SELECT * FROM MENSAJE_INFO WHERE id_mensaje = ? AND id_usuario = ?',
                            [messageId, userInfo.userId]
                        );

                        if (existing.length > 0) {
                            // Update existing record
                            await db.query(
                                'UPDATE MENSAJE_INFO SET leido_en = CURRENT_TIMESTAMP WHERE id_mensaje = ? AND id_usuario = ?',
                                [messageId, userInfo.userId]
                            );
                        } else {
                            // Create new record - mark as both delivered and read
                            await db.query(
                                'INSERT INTO MENSAJE_INFO (id_mensaje, id_usuario, entregado_en, leido_en) VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
                                [messageId, userInfo.userId]
                            );
                        }
                    }

                    // Broadcast to all users in the chat
                    socket.to(`chat-${chatId}`).emit('message-read', {
                        messageId,
                        userId: userInfo.userId,
                        readByName: userInfo.userName,
                        chatId,
                        chatType,
                        timestamp
                    });

                    // If the sender is online, send a direct notification too
                    const senderSocketId = this.activeUsers.get(senderId);
                    if (senderSocketId) {
                        this.io.to(senderSocketId).emit('message-read', {
                            messageId,
                            userId: userInfo.userId,
                            readByName: userInfo.userName,
                            chatId,
                            chatType,
                            timestamp
                        });
                    }
                } catch (error) {
                    console.error('Error handling mark-read:', error);
                }
            });

            // Handle mark message as read with underscore format
            socket.on('mark_read', async (data) => {
                try {
                    const userInfo = this.userSockets.get(socket.id);
                    if (!userInfo) return;

                    const { messageId, chatId, chatType } = data;
                    console.log(`� Usuario ${userInfo.userName} marcó mensaje ${messageId} como leído (underscore)`);

                    // Broadcast to all users in the chat
                    socket.to(`chat-${chatId}`).emit('message_read', {
                        messageId,
                        userId: userInfo.userId,
                        readByName: userInfo.userName,
                        chatId,
                        chatType,
                        timestamp: new Date().toISOString()
                    });
                } catch (error) {
                    console.error('Error handling mark_read:', error);
                }
            });

            // Handle disconnection
            // Handle view-chat event
            socket.on('view-chat', (data) => {
                const userInfo = this.userSockets.get(socket.id);
                if (!userInfo) return;

                const { chatId } = data;
                console.log(`👁️ Usuario ${userInfo.userName} está viendo el chat ${chatId}`);
            });

            // Handle leave-chat-view event
            socket.on('leave-chat-view', (data) => {
                const userInfo = this.userSockets.get(socket.id);
                if (!userInfo) return;

                const { chatId } = data;
                console.log(`👋 Usuario ${userInfo.userName} dejó de ver el chat ${chatId}`);
            });

            // Handle explicit message received acknowledgment
            socket.on('message-received', async (data) => {
                try {
                    const userInfo = this.userSockets.get(socket.id);
                    if (!userInfo) return;

                    const { messageId, chatId, chatType } = data;
                    console.log(`📩 Usuario ${userInfo.userName} confirmó recepción del mensaje ${messageId}`);

                    const db = getPool();

                    // First, get the message details to know the sender
                    const messageInfo = await db.query(
                        'SELECT id_usuario_remitente, id_chat FROM MENSAJE WHERE id_mensaje = ?',
                        [messageId]
                    );

                    if (messageInfo.length === 0) {
                        console.error(`Message ${messageId} not found`);
                        return;
                    }

                    const senderId = messageInfo[0].id_usuario_remitente;
                    const messageChatId = messageInfo[0].id_chat;

                    // Update MENSAJE_INFO table to mark message as delivered
                    const existingInfo = await db.query(
                        'SELECT * FROM MENSAJE_INFO WHERE id_mensaje = ? AND id_usuario = ?',
                        [messageId, userInfo.userId]
                    );

                    if (existingInfo.length > 0) {
                        // Update existing record if it doesn't already have a delivery time
                        if (!existingInfo[0].entregado_en) {
                            await db.query(
                                'UPDATE MENSAJE_INFO SET entregado_en = CURRENT_TIMESTAMP WHERE id_mensaje = ? AND id_usuario = ?',
                                [messageId, userInfo.userId]
                            );
                        }
                    } else {
                        // Create new record
                        await db.query(
                            'INSERT INTO MENSAJE_INFO (id_mensaje, id_usuario, entregado_en) VALUES (?, ?, CURRENT_TIMESTAMP)',
                            [messageId, userInfo.userId]
                        );
                    }

                    // Notify the sender that their message was delivered
                    const senderSocketId = this.activeUsers.get(senderId);
                    if (senderSocketId) {
                        const timestamp = new Date().toISOString();

                        // Both formats for compatibility
                        this.io.to(senderSocketId).emit('messages-delivered', {
                            messageIds: [messageId],
                            userId: userInfo.userId,
                            deliveredByName: userInfo.userName,
                            chatId: messageChatId,
                            chatType,
                            timestamp
                        });

                        this.io.to(senderSocketId).emit('messages_delivered', {
                            messageIds: [messageId],
                            userId: userInfo.userId,
                            deliveredByName: userInfo.userName,
                            chatId: messageChatId,
                            chatType,
                            timestamp
                        });
                    }
                } catch (error) {
                    console.error('Error handling message-received event:', error);
                }
            });

            socket.on('disconnect', () => {
                const userInfo = this.userSockets.get(socket.id);

                if (userInfo) {
                    // Remove from active users
                    this.activeUsers.delete(userInfo.userId);
                    this.userSockets.delete(socket.id);

                    // Notify user is offline
                    socket.broadcast.emit('user-offline', {
                        userId: userInfo.userId,
                        userName: userInfo.userName,
                        timestamp: new Date().toISOString()
                    });

                    console.log(`🔌 Usuario desconectado: ${userInfo.userName}`);
                }

                console.log(`🔌 Socket desconectado: ${socket.id}`);
            });
        });
    }

    // Helper methods
    isUserOnline(userId) {
        return this.activeUsers.has(userId);
    }

    getOnlineUsers() {
        return Array.from(this.activeUsers.keys());
    }

    sendToUser(userId, event, data) {
        const socketId = this.activeUsers.get(userId);
        if (socketId) {
            this.io.to(socketId).emit(event, data);
            return true;
        }
        return false;
    }

    sendToChat(chatId, event, data) {
        console.log(`Broadcasting ${event} to chat-${chatId}:`, JSON.stringify(data));
        this.io.to(`chat-${chatId}`).emit(event, data);
    }
}

module.exports = SocketHandler;
