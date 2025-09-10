import React, { createContext, useContext, useState, useEffect } from 'react';
import io from 'socket.io-client';
import { useAuth } from './AuthContext';
import {
    resetMessageStatus,
    updateMessageStatus,
    batchUpdateMessageStatus,
    getMessageStatus as getMessageStatusUtil,
    processDeliveryData
} from '../utils/messageStatus';

const SocketContext = createContext();

export const useSocket = () => useContext(SocketContext);

export const SocketProvider = ({ children }) => {
    const { user } = useAuth();
    const [socket, setSocket] = useState(null);
    const [isConnected, setIsConnected] = useState(false);
    const [onlineUsers, setOnlineUsers] = useState([]);

    // Track active chats (for read receipts)
    const [activeChat, setActiveChat] = useState(null);

    // Force UI update when message statuses change
    const [messageStatusVersion, setMessageStatusVersion] = useState(0);

    // Helper to trigger UI refresh when message statuses change
    const refreshMessageStatuses = () => {
        setMessageStatusVersion(prev => prev + 1);
    };

    // Connect to WebSocket when authenticated
    useEffect(() => {
        let newSocket;

        if (user?.id) {
            // Create Socket connection
            const baseUrl = process.env.NODE_ENV === 'development'
                ? window.location.hostname === 'localhost'
                    ? 'http://localhost:3002'
                    : `http://${window.location.hostname}:3002`
                : window.location.origin;

            newSocket = io(baseUrl, {
                reconnection: true,
                reconnectionDelay: 1000,
                reconnectionAttempts: 5,
                transports: ['websocket'],
                agent: false,
                upgrade: false,
                rejectUnauthorized: false
            });

            // Set up socket event listeners
            newSocket.on('connect', () => {
                console.log('Socket connected to:', baseUrl);
                setIsConnected(true);

                // Authenticate socket connection
                console.log('Authenticating with user ID:', user.id);
                newSocket.emit('authenticate', {
                    userId: user.id,
                    userName: user.nombre
                });
            });

            newSocket.on('disconnect', () => {
                console.log('Socket disconnected');
                setIsConnected(false);
            });

            newSocket.on('connect_error', (err) => {
                console.error('Socket connection error:', err.message);
            });

            // Track online users
            newSocket.on('online-users', (users) => {
                console.log('Received online users list:', users);
                setOnlineUsers(users);
            });

            newSocket.on('user-online', (data) => {
                console.log('User came online:', data);
                setOnlineUsers(prev => [...prev, data.userId]);
            });

            newSocket.on('user-offline', (data) => {
                console.log('User went offline:', data);
                setOnlineUsers(prev => prev.filter(id => id !== data.userId));
            });

            // Message sent confirmation
            newSocket.on('message-sent', (data) => {
                console.log('Message sent confirmation:', data);

                // Update message status with the confirmed status
                updateMessageStatus(data.messageId, 'sent');

                // If there was a temp ID, remove it from the tracking
                if (data.tempId) {
                    updateMessageStatus(data.tempId, null);
                }

                // Force UI refresh
                refreshMessageStatuses();
            });

            // Message delivered event
            newSocket.on('messages-delivered', (data) => {
                console.log('Messages delivered event:', data);

                try {
                    // Process message IDs regardless of format
                    const messageIds = processDeliveryData(data);

                    if (messageIds.length > 0) {
                        console.log(`Updating status for ${messageIds.length} messages to 'delivered'`);
                        batchUpdateMessageStatus(messageIds, 'delivered');
                        refreshMessageStatuses();
                    } else {
                        console.warn('No valid message IDs found in delivery data:', data);
                    }
                } catch (error) {
                    console.error('Error handling messages-delivered event:', error, data);
                }
            });

            // Message read events
            newSocket.on('message-read', (data) => {
                console.log('Message read event:', data);

                // Update message status using our utility
                updateMessageStatus(
                    data.messageId,
                    data.chatType === 'grupo' ? 'group-read' : 'read'
                );
                refreshMessageStatuses();
            });

            // Handle underscore format too
            newSocket.on('message_read', (data) => {
                console.log('Message read event (underscore):', data);

                // Update message status using our utility
                updateMessageStatus(
                    data.messageId,
                    data.chatType === 'grupo' ? 'group-read' : 'read'
                );
                refreshMessageStatuses();
            });

            // Handle underscore format for message delivery
            newSocket.on('messages_delivered', (data) => {
                console.log('Messages delivered (underscore):', data);

                try {
                    // Process message IDs regardless of format
                    const messageIds = processDeliveryData(data);

                    if (messageIds.length > 0) {
                        console.log(`Updating status for ${messageIds.length} messages to 'delivered' (underscore format)`);
                        batchUpdateMessageStatus(messageIds, 'delivered');
                        refreshMessageStatuses();
                    } else {
                        console.warn('No valid message IDs found in delivery data (underscore):', data);
                    }
                } catch (error) {
                    console.error('Error handling messages_delivered event:', error, data);
                }
            });

            // Handle read messages (batch)
            newSocket.on('messages-read', (data) => {
                console.log('Messages read:', data);

                try {
                    if (data && data.messageIds && Array.isArray(data.messageIds)) {
                        const validIds = data.messageIds.filter(id => id);

                        if (validIds.length > 0) {
                            console.log(`Updating status for ${validIds.length} messages to 'read'`);

                            const status = data.chatType === 'grupo' ? 'group-read' : 'read';
                            batchUpdateMessageStatus(validIds, status);
                            refreshMessageStatuses();
                        }
                    } else {
                        console.warn('Received invalid message read data:', data);
                    }
                } catch (error) {
                    console.error('Error handling messages-read event:', error, data);
                }
            });

            // Message error handling
            newSocket.on('message-error', (data) => {
                console.error('Message error:', data);

                // Mark message as failed
                if (data.tempId) {
                    updateMessageStatus(data.tempId, 'failed');
                    refreshMessageStatuses();
                }
            });

            setSocket(newSocket);
        }

        // Cleanup on unmount
        return () => {
            if (newSocket) {
                newSocket.disconnect();
            }
        };
    }, [user]);

    // Handle changing active chat
    useEffect(() => {
        if (socket && activeChat) {
            // Notify server that user is viewing this chat
            socket.emit('view-chat', { chatId: activeChat });

            // Cleanup function - notify when leaving the chat
            return () => {
                socket.emit('leave-chat-view', { chatId: activeChat });
            };
        }
    }, [socket, activeChat]);

    // Send a new message - supports both formats (object or individual params)
    const sendMessage = (chatIdOrOptions, contentParam, typeParam = 'texto') => {
        if (!socket || !isConnected) {
            console.error('Cannot send message: socket disconnected');
            return null;
        }

        // Handle both calling styles:
        // 1. sendMessage(chatId, content, type)
        // 2. sendMessage({ chatId, content, multimedia, tempId })
        let chatId, content, type, tempId;

        if (typeof chatIdOrOptions === 'object') {
            // Object parameter style
            chatId = chatIdOrOptions.chatId;
            content = chatIdOrOptions.content;
            type = chatIdOrOptions.multimedia ? 'multimedia' : chatIdOrOptions.tipo || 'texto';
            tempId = chatIdOrOptions.tempId || `temp-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
        } else {
            // Individual parameters style
            chatId = chatIdOrOptions;
            content = contentParam;
            type = typeParam;
            tempId = `temp-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
        }

        // Add temporary status
        updateMessageStatus(tempId, 'sending');
        refreshMessageStatuses();

        console.log(`Sending message to chat ${chatId} with tempId ${tempId}`);

        // Send message through socket
        socket.emit('send-message', {
            chatId,
            contenido: content,
            tipo: type,
            tempId
        });

        return {
            tempId,
            status: 'sending'
        };
    };

    // Join a specific chat room
    const joinChat = (chatId) => {
        if (socket && isConnected) {
            console.log(`Joining chat room: chat-${chatId}`);
            socket.emit('join-chat', { chatId });

            // Also join with alternate format to ensure compatibility
            socket.emit('join_chat', { chatId });
        } else {
            console.warn(`Cannot join chat ${chatId}: socket connected = ${isConnected}`);
        }
    };

    // Set active chat (for read receipts)
    const viewChat = (chatId) => {
        setActiveChat(chatId);
    };

    // Get message status - this will force a re-render when the version changes
    const getMessageStatus = (messageId) => {
        // Including the version in this function forces components to re-render
        // when message statuses are updated
        if (messageStatusVersion || !messageStatusVersion) {
            return getMessageStatusUtil(messageId);
        }
        return null;
    };

    // Force refresh a specific message status
    const refreshMessageStatus = (messageId) => {
        // Implementation could request status from server if needed
        console.log(`Refreshing status for message ${messageId}`);
    };

    // Check if user is online
    const isUserOnline = (userId) => {
        const isOnline = onlineUsers.includes(userId);
        console.log(`Checking if user ${userId} is online:`, isOnline, 'Current online users:', onlineUsers);
        return isOnline;
    };

    const value = {
        socket,
        isConnected,
        onlineUsers,
        sendMessage,
        joinChat,
        leaveChat: joinChat, // Add leaveChat function that just calls joinChat for compatibility
        viewChat,
        getMessageStatus,
        refreshMessageStatus: refreshMessageStatuses,
        updateMessageStatus,
        batchUpdateMessageStatus,
        resetMessageStatus: () => {
            resetMessageStatus();
            refreshMessageStatuses();
        },
        isUserOnline,
        activeChat
    };

    return (
        <SocketContext.Provider value={value}>
            {children}
        </SocketContext.Provider>
    );
};

export default SocketContext;
