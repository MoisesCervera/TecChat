import React, { useState } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { useTheme } from '../../contexts/ThemeContext';
import Button from '../common/Button';
import NewChatModal from './NewChatModal';
import './ChatSidebar.css';

const ChatSidebar = ({ user, chats, selectedChat, onSelectChat, onLogout, isConnected, onCreateChat }) => {
    const { t } = useLanguage();
    const { theme, toggleTheme, accentColor, setAccentColor } = useTheme();
    const [showSettings, setShowSettings] = useState(false);
    const [showNewChatModal, setShowNewChatModal] = useState(false);

    // Don't render if user is not available
    if (!user) {
        return (
            <div className="chat-sidebar">
                <div className="chat-sidebar__loading">
                    <div className="loading-spinner">
                        <div className="spinner"></div>
                    </div>
                    <p>Cargando...</p>
                </div>
            </div>
        );
    }

    const handleChatSelect = (chat) => {
        onSelectChat(chat);
    };

    const formatLastMessage = (chat) => {
        // Check if we have a last message
        if (!chat.ultimo_mensaje) return t('chat.noMessages');

        // Get the sender name for group chats (not needed for individual chats)
        let prefix = '';
        if (chat.tipo === 'grupo' && chat.remitente_ultimo_mensaje) {
            if (chat.remitente_ultimo_mensaje === user.nombre) {
                prefix = 'Tú: ';
            } else {
                prefix = `${chat.remitente_ultimo_mensaje.split(' ')[0]}: `;
            }
        }

        const maxLength = 30; // Shorter to accommodate the prefix
        let message = chat.ultimo_mensaje;

        // Truncate if too long
        if (message.length > maxLength) {
            message = message.substring(0, maxLength) + '...';
        }

        return prefix + message;
    };

    const formatTimestamp = (timestamp) => {
        if (!timestamp) return '';

        const date = new Date(timestamp);
        const now = new Date();
        const diffHours = (now - date) / (1000 * 60 * 60);

        if (diffHours < 24) {
            return date.toLocaleTimeString('es-ES', {
                hour: '2-digit',
                minute: '2-digit'
            });
        } else {
            return date.toLocaleDateString('es-ES', {
                day: 'numeric',
                month: 'short'
            });
        }
    };

    return (
        <div className="chat-sidebar">
            {/* Header */}
            <div className="chat-sidebar__header">
                <div className="chat-sidebar__user">
                    <div className="user-avatar">
                        {user?.nombre ? user.nombre.charAt(0).toUpperCase() : '?'}
                    </div>
                    <div className="user-info">
                        <h3>{user?.nombre || 'Usuario'}</h3>
                        <span className={`user-status ${isConnected ? 'online' : 'offline'}`}>
                            {isConnected ? t('chat.online') : t('chat.offline')}
                        </span>
                    </div>
                </div>

                <div className="chat-sidebar__actions">
                    <button
                        className="action-button"
                        onClick={() => setShowSettings(!showSettings)}
                        title={t('settings.title')}
                    >
                        ⚙️
                    </button>
                    <button
                        className="action-button"
                        onClick={onLogout}
                        title={t('auth.logout')}
                    >
                        🚪
                    </button>
                </div>
            </div>

            {/* Settings Panel */}
            {showSettings && (
                <div className="chat-sidebar__settings">
                    <div className="settings-section">
                        <h4>{t('settings.theme')}</h4>
                        <div className="theme-controls">
                            <Button
                                variant={theme === 'light' ? 'primary' : 'ghost'}
                                size="small"
                                onClick={() => toggleTheme()}
                            >
                                {theme === 'light' ? '☀️' : '🌙'}
                            </Button>

                            <div className="color-picker">
                                {['blue', 'green', 'purple'].map(color => (
                                    <button
                                        key={color}
                                        className={`color-option color-option--${color} ${accentColor === color ? 'active' : ''
                                            }`}
                                        onClick={() => setAccentColor(color)}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Search */}
            <div className="chat-sidebar__search">
                <input
                    type="text"
                    placeholder={t('chat.searchChats')}
                    className="search-input"
                />
            </div>

            {/* Chat List */}
            <div className="chat-sidebar__list">
                {!Array.isArray(chats) || chats.length === 0 ? (
                    <div className="empty-chats">
                        <div className="empty-chats__icon">💬</div>
                        <p>{t('chat.noChats')}</p>
                        <Button
                            variant="primary"
                            size="small"
                            onClick={() => setShowNewChatModal(true)}
                        >
                            {t('chat.newChat')}
                        </Button>
                    </div>
                ) : (
                    chats.map(chat => (
                        <div
                            key={chat.id_chat}
                            className={`chat-item ${selectedChat?.id_chat === chat.id_chat ? 'active' : ''
                                }`}
                            onClick={() => handleChatSelect(chat)}
                        >
                            <div className="chat-item__avatar">
                                {chat.tipo === 'individual' ? (
                                    chat.participante?.nombre?.charAt(0).toUpperCase() || '👤'
                                ) : (
                                    '👥'
                                )}
                            </div>

                            <div className="chat-item__content">
                                <div className="chat-item__header">
                                    <h4 className="chat-item__name">
                                        {chat.tipo === 'individual'
                                            ? chat.participante?.nombre || 'Usuario desconocido'
                                            : chat.nombre_grupo || 'Grupo'
                                        }
                                        {chat.tipo === 'individual' && chat.participante?.isOnline &&
                                            <span className="online-indicator">●</span>
                                        }
                                    </h4>
                                    <span className="chat-item__time">
                                        {formatTimestamp(chat.fecha_ultimo_mensaje)}
                                    </span>
                                </div>

                                <div className="chat-item__preview">
                                    <span className="chat-item__last-message">
                                        {formatLastMessage(chat)}
                                    </span>
                                    {chat.mensajes_no_leidos > 0 && (
                                        <span className="chat-item__unread">
                                            {chat.mensajes_no_leidos}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Floating button for new chat when there are chats */}
            {Array.isArray(chats) && chats.length > 0 && (
                <div className="chat-sidebar__new-chat-button">
                    <Button
                        variant="primary"
                        className="new-chat-button"
                        onClick={() => setShowNewChatModal(true)}
                    >
                        <span className="new-chat-icon">+</span>
                        {t('chat.newChat')}
                    </Button>
                </div>
            )}

            {/* New Chat Modal */}
            {showNewChatModal && (
                <NewChatModal
                    onClose={() => setShowNewChatModal(false)}
                    onCreateChat={onCreateChat}
                />
            )}
        </div>
    );
};

export default ChatSidebar;
