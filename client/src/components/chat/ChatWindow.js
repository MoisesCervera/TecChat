import React, { useState, useEffect, useRef } from 'react';
import { useSocket } from '../../contexts/SocketContext';
import { useLanguage } from '../../contexts/LanguageContext';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import { acknowledgeMessageReceipt } from '../../utils/messageStatus';
import './ChatWindow.css';

const ChatWindow = ({ chat, user }) => {
    const languageContext = useLanguage();
    const t = languageContext?.t || ((key) => key); // Fallback if context is undefined
    const { socket, joinChat, leaveChat, sendMessage, isUserOnline, updateMessageStatus } = useSocket();
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [typing, setTyping] = useState(new Set());
    const messagesEndRef = useRef(null);

    // Load messages when chat changes
    useEffect(() => {
        if (chat?.id_chat) {
            console.log(`Loading messages for chat ${chat.id_chat}`);
            setMessages([]); // Clear previous messages
            setLoading(true);
            loadMessages();
            joinChat(chat.id_chat);

            // Notify server this user is viewing this chat (helps with read status)
            if (socket) {
                socket.emit('view-chat', { chatId: chat.id_chat });
            }
        }

        return () => {
            if (chat?.id_chat) {
                leaveChat(chat.id_chat);

                // Notify server this user is no longer viewing this chat
                if (socket) {
                    socket.emit('leave-chat-view', { chatId: chat.id_chat });
                }
            }
        };
    }, [chat?.id_chat]); // Only reload when the actual chat ID changes

    // Socket event listeners
    useEffect(() => {
        if (!socket) {
            console.log('No socket available for chat', chat?.id_chat);
            return;
        }

        console.log(`Setting up socket event listeners for chat ${chat?.id_chat}`);

        const handleNewMessage = (message) => {
            // Check the shape of the message object
            const actualMessage = message.message || message;
            const chatId = actualMessage.id_chat || actualMessage.chat_id;

            console.log(`Received message event for chat ${chatId}, current chat: ${chat?.id_chat}`);

            if (chatId === chat?.id_chat) {
                console.log('Received new message via socket:', actualMessage);

                // Skip our own messages - we handle these via optimistic updates and API responses
                if (actualMessage.id_usuario_remitente === user.id) {
                    console.log('Skipping our own message received via socket');
                    return;
                }

                // For other users' messages, check for duplicates
                const isDuplicate = messages.some(msg => {
                    // Case 1: Same message ID (most obvious case)
                    if (msg.id_mensaje === actualMessage.id_mensaje && actualMessage.id_mensaje) {
                        console.log(`Duplicate detected by ID match: ${actualMessage.id_mensaje}`);
                        return true;
                    }

                    // Case 2: Message from same user with same content sent very recently
                    if (msg.id_usuario_remitente === actualMessage.id_usuario_remitente &&
                        msg.contenido === actualMessage.contenido &&
                        Math.abs(new Date(msg.enviado_en) - new Date(actualMessage.enviado_en)) < 10000) { // 10 seconds
                        console.log(`Duplicate detected by content+user+time: ${actualMessage.contenido}`);
                        return true;
                    }

                    return false;
                });

                if (isDuplicate) {
                    console.log('Duplicate message detected, not adding:', actualMessage.id_mensaje);
                    return;
                }

                if (actualMessage.multimedia) {
                    console.log('Multimedia content in socket event:', actualMessage.multimedia);
                }

                // Add other users' messages to the chat
                setMessages(prev => [...prev, actualMessage]);

                // Mark the message as delivered in our utility
                updateMessageStatus(actualMessage.id_mensaje, 'delivered');

                // Send explicit delivery acknowledgment to server
                if (socket && actualMessage.id_mensaje) {
                    acknowledgeMessageReceipt(
                        socket,
                        actualMessage.id_mensaje,
                        chat.id_chat,
                        chat.tipo || 'individual'
                    );
                }

                scrollToBottom();

                // Auto mark as read since we're in this chat
                markMessageAsRead(actualMessage.id_mensaje);

                // Also update the message status in our utility
                if (socket) {
                    socket.emit('mark-read', {
                        messageId: actualMessage.id_mensaje,
                        chatId: chat.id_chat,
                        chatType: chat.tipo
                    });
                }
            }
        };

        const handleTypingStart = (data) => {
            if (data.chatId === chat?.id_chat && data.userId !== user.id) {
                setTyping(prev => new Set([...prev, data.userId]));
            }
        };

        const handleTypingStop = (data) => {
            if (data.chatId === chat?.id_chat) {
                setTyping(prev => {
                    const newSet = new Set(prev);
                    newSet.delete(data.userId);
                    return newSet;
                });
            }
        };

        const handleMessageRead = (data) => {
            console.log('Received message read event:', data);

            if (data.chatId === chat?.id_chat) {
                setMessages(prev => {
                    // Make a deep copy to ensure state change is detected
                    const updatedMessages = [...prev];

                    // Find the message to update
                    const messageIndex = updatedMessages.findIndex(msg => msg.id_mensaje === data.messageId);

                    if (messageIndex !== -1) {
                        const msg = updatedMessages[messageIndex];

                        // Handle group chats
                        if (data.chatType === 'grupo') {
                            // Update read count and readers list for group chats
                            const currentReaders = msg.readers || [];
                            const readerExists = currentReaders.some(
                                reader => reader.id_usuario === data.userId
                            );

                            // Create new or updated reader object
                            const readerObj = {
                                id_usuario: data.userId,
                                nombre: data.readByName || 'Usuario',
                                leido_en: data.timestamp
                            };

                            // Add new reader or update existing one
                            const updatedReaders = readerExists
                                ? currentReaders.map(r => r.id_usuario === data.userId ? readerObj : r)
                                : [...currentReaders, readerObj];

                            updatedMessages[messageIndex] = {
                                ...msg,
                                read_count: updatedReaders.length,
                                readers: updatedReaders,
                                read_by_me: msg.read_by_me || data.userId === user.id
                            };
                        }
                        // Handle individual chats
                        else {
                            updatedMessages[messageIndex] = {
                                ...msg,
                                leido_en: data.timestamp
                            };
                        }

                        console.log('Updated message with read status:', updatedMessages[messageIndex]);
                    }

                    return updatedMessages;
                });
            }
        };

        const handleMessageDeleted = (data) => {
            if (data.chatId === chat?.id_chat) {
                setMessages(prev =>
                    prev.map(msg =>
                        msg.id_mensaje === data.messageId
                            ? { ...msg, contenido: 'Este mensaje fue eliminado', tipo: 'eliminado' }
                            : msg
                    )
                );
            }
        };

        // Register event listeners - only use one format to avoid duplicates
        socket.on('new-message', handleNewMessage);  // Only use the dash format
        socket.on('typing-start', handleTypingStart);
        socket.on('typing-stop', handleTypingStop);
        socket.on('message-read', handleMessageRead);
        socket.on('message_read', handleMessageRead); // Add underscore version
        socket.on('message-deleted', handleMessageDeleted);
        socket.on('message_deleted', handleMessageDeleted); // Add underscore version

        // Special handler for message-sent confirmations
        socket.on('message-sent', (data) => {
            console.log('Received message-sent confirmation:', data);
            // This confirms our optimistic message was received by the server
            // No need to add a new message, just update the optimistic one
        });

        socket.on('message_sent', (data) => {
            console.log('Received message_sent confirmation:', data);
            // Handle underscore version too
        });

        // Cleanup
        return () => {
            socket.off('new-message', handleNewMessage);
            socket.off('typing-start', handleTypingStart);
            socket.off('typing-stop', handleTypingStop);
            socket.off('message-read', handleMessageRead);
            socket.off('message_read', handleMessageRead); // Remove underscore version
            socket.off('message-deleted', handleMessageDeleted);
            socket.off('message_deleted', handleMessageDeleted); // Remove underscore version
            socket.off('message-sent');
            socket.off('message_sent');
        };
    }, [socket, chat, user]);

    // Auto-scroll to bottom when new messages arrive
    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const markMessageAsRead = async (messageId) => {
        if (!messageId) return;

        try {
            const response = await fetch(`/api/messages/${messageId}/read`, {
                method: 'PATCH',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                console.log(`Marked message ${messageId} as read`);
            } else {
                console.error('Failed to mark message as read');
            }
        } catch (error) {
            console.error('Error marking message as read:', error);
        }
    };

    // Mark all messages as read when entering a chat
    const markAllAsRead = async () => {
        if (!chat?.id_chat) return;

        try {
            const response = await fetch(`/api/messages/chat/${chat.id_chat}/read-all`, {
                method: 'PATCH',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                console.log('All messages marked as read');

                // Update local message state to reflect read status
                setMessages(prev => prev.map(msg => {
                    // Don't mark our own messages
                    if (msg.id_usuario_remitente === user.id) return msg;

                    // Mark others' messages as read
                    if (chat.tipo === 'grupo') {
                        const currentReaders = msg.readers || [];
                        const readerExists = currentReaders.some(
                            reader => reader.id_usuario === user.id
                        );

                        // Create reader object
                        const readerObj = {
                            id_usuario: user.id,
                            nombre: user.nombre,
                            leido_en: new Date().toISOString()
                        };

                        // Add to readers if not already there
                        const updatedReaders = readerExists
                            ? currentReaders.map(r => r.id_usuario === user.id ? readerObj : r)
                            : [...currentReaders, readerObj];

                        return {
                            ...msg,
                            read_count: updatedReaders.length,
                            readers: updatedReaders,
                            read_by_me: true
                        };
                    } else {
                        // For individual chats
                        return {
                            ...msg,
                            leido_en: new Date().toISOString()
                        };
                    }
                }));
            } else {
                console.error('Failed to mark messages as read');
            }
        } catch (error) {
            console.error('Error marking messages as read:', error);
        }
    }; const loadMessages = async () => {
        if (!chat) return;

        try {
            setLoading(true);
            const response = await fetch(`/api/messages/${chat.id_chat}`, {
                credentials: 'include'
            });

            if (response.ok) {
                const data = await response.json();
                setMessages(data.messages || []);

                // Mark all messages as read when entering a chat
                markAllAsRead();
            } else {
                console.error('Failed to load messages');
            }
        } catch (error) {
            console.error('Error loading messages:', error);
        } finally {
            setLoading(false);
        }
    };

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    const handleSendMessage = async (content, multimedia) => {
        if (!chat || (!content.trim() && !multimedia)) return;

        // Generate temporary ID for optimistic UI update
        const tempId = `temp-${Date.now()}`;
        console.log(`Generated tempId: ${tempId} for new message`);

        try {
            // Optimistically add message to the UI
            const now = new Date();
            const optimisticMessage = {
                id_mensaje: tempId,
                id_chat: chat.id_chat,
                id_usuario_remitente: user.id,
                contenido: content,
                tipo: multimedia ? 'multimedia' : 'texto',
                enviado_en: now.toISOString(),
                nombre_remitente: user.nombre,
                isOptimistic: true,
                tempId: tempId // Tracking ID to match with server message
            };

            setMessages(prev => [...prev, optimisticMessage]);
            scrollToBottom();

            // Send via HTTP API - most reliable method
            console.log(`Sending message through HTTP API for chat ${chat.id_chat}`);
            const response = await fetch('/api/messages', {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    chatId: chat.id_chat,
                    contenido: content,
                    tipo: multimedia ? 'multimedia' : 'texto',
                    tempId
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('Failed to send message via API:', errorText);
                throw new Error('Failed to send message via API: ' + errorText);
            }

            const result = await response.json();
            console.log('Message sent successfully via API:', result);

            // Replace optimistic message with real one if we got a response
            if (result && result.message) {
                console.log('Replacing optimistic message with server message:', result.message);

                // Update our message array, replacing the optimistic one with the real one
                setMessages(prev => prev.map(msg =>
                    msg.id_mensaje === tempId ? {
                        ...result.message,
                        isOptimistic: false,
                        originalTempId: tempId
                    } : msg
                ));
            }
        } catch (error) {
            console.error('Error sending message:', error);

            // Show error to user
            alert('Error sending message. Please try again.');

            // Remove the optimistic message
            setMessages(prev => prev.filter(msg => msg.id_mensaje !== tempId));
        }
    };

    const handleSendFile = async (file, caption = '') => {
        if (!chat) return;

        try {
            console.log('Sending file:', file.name, 'Type:', file.type);

            const formData = new FormData();
            formData.append('file', file);
            formData.append('chatId', chat.id_chat);
            if (caption.trim()) {
                formData.append('caption', caption.trim());
            }

            const response = await fetch('/api/upload', {
                method: 'POST',
                credentials: 'include',
                body: formData
            });

            if (!response.ok) {
                const errorText = await response.text();
                let errorMessage;
                try {
                    const errorJson = JSON.parse(errorText);
                    errorMessage = errorJson.error || errorJson.message || 'Error uploading file';
                } catch (e) {
                    errorMessage = errorText || 'Error uploading file';
                }

                // Show error to user in UI
                alert(`Failed to upload file: ${errorMessage}`);
                throw new Error(errorMessage);
            }

            const data = await response.json();

            // Manually add the new message to the state to ensure immediate display
            if (data.data) {
                const newMessage = {
                    ...data.data,
                    isOwn: true  // This is your own message
                };
                console.log('Adding uploaded file message to state:', newMessage);
                setMessages(prev => [...prev, newMessage]);
                scrollToBottom();
            }

            return data;
        } catch (error) {
            console.error('Error uploading file:', error);
            // Show error message to user
            alert(`Upload failed: ${error.message}`);
            throw error;
        }
    };

    const markAsRead = async (messageId) => {
        try {
            console.log(`Marking message ${messageId} as read`);

            // Update via REST API
            const response = await fetch(`/api/messages/${messageId}/read`, {
                method: 'PATCH', // Using PATCH as it's correct for partial updates
                credentials: 'include'
            });

            if (!response.ok) {
                console.error('Failed to mark message as read');
                return;
            }

            // Also emit socket event to ensure real-time updates
            if (socket) {
                // Send with dash format
                socket.emit('mark-read', {
                    messageId: messageId,
                    chatId: chat.id_chat,
                    chatType: chat.tipo, // Include chat type for group vs individual handling
                    userId: user.id,
                    userName: user.nombre
                });

                // Also send with underscore format for compatibility
                socket.emit('mark_read', {
                    messageId: messageId,
                    chatId: chat.id_chat,
                    chatType: chat.tipo,
                    userId: user.id,
                    userName: user.nombre
                });

                // Update the UI immediately to reflect read status
                setMessages(prev =>
                    prev.map(msg => {
                        if (msg.id_mensaje === messageId) {
                            if (chat.tipo === 'grupo') {
                                // For group chats, update read_count
                                const currentReaders = msg.readers || [];
                                const alreadyRead = currentReaders.some(r => r.id_usuario === user.id);

                                if (!alreadyRead) {
                                    return {
                                        ...msg,
                                        read_count: (msg.read_count || 0) + 1,
                                        readers: [...currentReaders, {
                                            id_usuario: user.id,
                                            nombre: user.nombre,
                                            leido_en: new Date().toISOString()
                                        }],
                                        read_by_me: true
                                    };
                                }
                                return { ...msg, read_by_me: true };
                            } else {
                                // For individual chats, set leido_en
                                return {
                                    ...msg,
                                    leido_en: new Date().toISOString()
                                };
                            }
                        }
                        return msg;
                    })
                );
            }
        } catch (error) {
            console.error('Error marking message as read:', error);
        }
    };

    const deleteMessage = async (messageId) => {
        try {
            // Delete via REST API
            const response = await fetch(`/api/messages/${messageId}`, {
                method: 'DELETE',
                credentials: 'include'
            });

            if (!response.ok) {
                console.error('Failed to delete message');
                return;
            }

            // Also emit socket event to ensure real-time updates
            if (socket) {
                socket.emit('delete-message', {
                    messageId: messageId,
                    chatId: chat.id_chat
                });

                // Update local state immediately
                setMessages(prev =>
                    prev.map(msg =>
                        msg.id_mensaje === messageId
                            ? { ...msg, contenido: 'Este mensaje fue eliminado', tipo: 'eliminado' }
                            : msg
                    )
                );
            }
        } catch (error) {
            console.error('Error deleting message:', error);
        }
    };

    if (!chat) {
        return (
            <div className="chat-window">
                <div className="welcome-message">
                    <h2>{t('selectChat')}</h2>
                    <p>{t('selectChatMessage')}</p>
                </div>
            </div>
        );
    }

    const otherUser = chat.tipo === 'individual' ?
        (chat.usuario1_id === user.id ? chat.usuario2 : chat.usuario1) : null;
    const isOnline = otherUser ? isUserOnline(otherUser.id) : false;

    return (
        <div className="chat-window">
            {/* Chat Header */}
            <div className="chat-header">
                <div className="chat-info">
                    <div className="chat-avatar">
                        {chat.tipo === 'individual' ? (
                            <img
                                src={otherUser?.avatar || '/default-avatar.png'}
                                alt={otherUser?.nombre || 'Usuario'}
                            />
                        ) : (
                            <div className="group-avatar">G</div>
                        )}
                        {chat.tipo === 'individual' && isOnline && (
                            <div className="online-indicator"></div>
                        )}
                    </div>
                    <div className="chat-details">
                        <h3>
                            {chat.tipo === 'individual' ?
                                otherUser?.nombre || 'Usuario desconocido' :
                                chat.nombre
                            }
                        </h3>
                        {chat.tipo === 'individual' && (
                            <span className="status">
                                {isOnline ? t('online') : t('offline')}
                            </span>
                        )}
                        {typing.size > 0 && (
                            <span className="typing-indicator">
                                {t('typing')}...
                            </span>
                        )}
                    </div>
                </div>
                <div className="chat-actions">
                    <button className="header-btn" title={t('call')}>
                        📞
                    </button>
                    <button className="header-btn" title={t('videoCall')}>
                        📹
                    </button>
                    <button className="header-btn" title={t('options')}>
                        ⚙️
                    </button>
                </div>
            </div>

            {/* Messages Area */}
            <div className="messages-container">
                {loading ? (
                    <div className="loading-messages">
                        <div className="spinner"></div>
                        <p>{t('loadingMessages')}</p>
                    </div>
                ) : (
                    <MessageList
                        messages={messages.map(message => ({
                            ...message,
                            // Add recipient's online status for delivery status determination
                            recipientIsOnline: chat.tipo === 'individual' && isOnline,
                            // Add a status update timestamp to force re-renders on status changes
                            statusUpdateTime: message.leido_en ? new Date(message.leido_en).getTime() : 0
                        }))}
                        user={user}
                        typing={Array.from(typing)} // Convert Set to Array for compatibility
                        onMessageRead={markAsRead}
                        onMessageDelete={deleteMessage}
                        isOnline={isOnline} // Pass online status to trigger re-renders when it changes
                    />
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Message Input */}
            <MessageInput
                onSendMessage={handleSendMessage}
                onSendFile={handleSendFile}
                chat={chat}
                user={user}
            />
        </div>
    );
};

export default ChatWindow;
