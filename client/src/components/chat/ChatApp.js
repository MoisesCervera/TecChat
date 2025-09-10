import React, { useState, useEffect, useMemo } from 'react';
import { useSocket } from '../../contexts/SocketContext';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import ChatSidebar from './ChatSidebar';
import ChatWindow from './ChatWindow';
import ChatWelcome from './ChatWelcome';
import './ChatApp.css';

const ChatApp = () => {
    const { user, logout } = useAuth();
    const { t } = useLanguage();
    const { socket, isConnected, isUserOnline, onlineUsers } = useSocket();
    const [selectedChat, setSelectedChat] = useState(null);
    const [chats, setChats] = useState([]);
    const [loading, setLoading] = useState(true);

    // Update chats with online status
    const enhancedChats = useMemo(() => {
        return chats.map(chat => {
            if (chat.tipo === 'individual' && chat.participante) {
                return {
                    ...chat,
                    participante: {
                        ...chat.participante,
                        isOnline: isUserOnline(chat.participante.id_usuario)
                    }
                };
            }
            return chat;
        });
    }, [chats, onlineUsers]);

    // Load user's chats
    useEffect(() => {
        loadChats();
    }, []);

    // Set up socket listeners for chat-related events
    useEffect(() => {
        if (!socket) return;

        // Listen for chat_created events (when someone starts a chat with you)
        const handleChatCreated = async (data) => {
            console.log('New chat created:', data);
            // Reload chats to include the new one
            await loadChats();
        };

        // Listen for chat_updated events (changes to group chats)
        const handleChatUpdated = async (data) => {
            console.log('Chat updated:', data);
            // Reload chats to get updated info
            await loadChats();
        };

        // Listen for new messages to update chats
        const handleNewMessage = async (data) => {
            // Reload chats to update last message
            await loadChats();
        };

        // Register listeners
        socket.on('chat_created', handleChatCreated);
        socket.on('chat-created', handleChatCreated); // Handle both formats
        socket.on('chat_updated', handleChatUpdated);
        socket.on('chat-updated', handleChatUpdated); // Handle both formats
        socket.on('new-message', handleNewMessage);

        // Cleanup
        return () => {
            socket.off('chat_created', handleChatCreated);
            socket.off('chat-created', handleChatCreated);
            socket.off('chat_updated', handleChatUpdated);
            socket.off('chat-updated', handleChatUpdated);
            socket.off('new-message', handleNewMessage);
        };
    }, [socket]);

    const loadChats = async () => {
        try {
            const response = await fetch('/api/users/chats', {
                credentials: 'include'
            });

            if (response.ok) {
                const data = await response.json();
                console.log('Chats loaded:', data);
                // API returns { chats: [...] }, so extract the chats array
                const chatsArray = data.chats || [];
                setChats(Array.isArray(chatsArray) ? chatsArray : []);
            } else {
                console.error('Failed to load chats:', response.status);
                setChats([]);
            }
        } catch (error) {
            console.error('Error loading chats:', error);
            setChats([]);
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = async () => {
        try {
            console.log('Logging out...');
            await logout();
            console.log('Logout completed');
            // The AuthContext will automatically update and redirect to login
            // since the AppContent component in App.js checks for user existence
        } catch (error) {
            console.error('Error during logout:', error);
            alert('Error al cerrar sesión. Inténtalo de nuevo.');
        }
    };

    // Handle creating a new chat with selected user
    const handleCreateChat = async (selectedUser) => {
        try {
            // Check if chat already exists with this user
            const existingChat = chats.find(chat =>
                chat.tipo === 'individual' &&
                chat.participante?.id_usuario === selectedUser.id_usuario
            );

            if (existingChat) {
                // If chat exists, just select it
                setSelectedChat(existingChat);
                return;
            }

            // Create a new chat
            const response = await fetch('/api/chats', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include',
                body: JSON.stringify({
                    tipo: 'individual',
                    participantes: [selectedUser.id_usuario]
                })
            });

            if (!response.ok) {
                throw new Error('Failed to create chat');
            }

            const data = await response.json();
            console.log('New chat created:', data);

            // Get the new chat from the response
            const newChat = data.chat;

            // Add the new chat to the existing chats list to prevent having to reload all chats
            setChats(prevChats => [newChat, ...prevChats]);

            // Wait a tiny bit to make sure the component updates properly
            setTimeout(() => {
                console.log('Selecting new chat:', newChat);
                // Select the new chat
                setSelectedChat(newChat);
            }, 100);

        } catch (error) {
            console.error('Error creating chat:', error);
            alert('Error creating chat. Please try again.');
        }
    };

    if (loading || !user) {
        return (
            <div className="chat-app">
                <div className="chat-app__loading">
                    <div className="loading-spinner">
                        <div className="spinner"></div>
                    </div>
                    <p>{t('general.loading')}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="chat-app">
            <div className="chat-app__container">
                <ChatSidebar
                    user={user}
                    chats={enhancedChats}
                    selectedChat={selectedChat}
                    onSelectChat={setSelectedChat}
                    onLogout={handleLogout}
                    isConnected={isConnected}
                    onCreateChat={handleCreateChat}
                />

                <div className="chat-app__main">
                    {selectedChat ? (
                        <ChatWindow
                            chat={selectedChat}
                            user={user}
                        />
                    ) : (
                        <ChatWelcome user={user} />
                    )}
                </div>
            </div>

            {!isConnected && (
                <div className="chat-app__offline-banner">
                    <span>⚠️ Reconectando... (Tu internet puede estar fallando)</span>
                </div>
            )}
        </div>
    );
};

export default ChatApp;
