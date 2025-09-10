import React from 'react';
import Message from './Message';
import TypingIndicator from './TypingIndicator';
import './MessageList.css';

const MessageList = ({ messages = [], user, typing = [], onMessageRead, onMessageDelete }) => {
    const formatDate = (timestamp) => {
        const date = new Date(timestamp);
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);

        if (date.toDateString() === today.toDateString()) {
            return 'Hoy';
        } else if (date.toDateString() === yesterday.toDateString()) {
            return 'Ayer';
        } else {
            return date.toLocaleDateString('es-ES', {
                day: 'numeric',
                month: 'long',
                year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined
            });
        }
    };

    const groupMessagesByDate = (messages) => {
        const groups = {};

        // Ensure messages is an array
        const messagesArray = Array.isArray(messages) ? messages : [];

        messagesArray.forEach(message => {
            const date = formatDate(message.enviado_en);
            if (!groups[date]) {
                groups[date] = [];
            }
            groups[date].push(message);
        });

        return groups;
    };

    const messageGroups = groupMessagesByDate(messages);
    const messagesArray = Array.isArray(messages) ? messages : [];

    if (messagesArray.length === 0) {
        return (
            <div className="message-list">
                <div className="message-list__empty">
                    <div className="empty-icon">💬</div>
                    <p>No hay mensajes aún</p>
                    <span>Envía un mensaje para iniciar la conversación</span>
                </div>
            </div>
        );
    }

    return (
        <div className="message-list">
            {Object.entries(messageGroups).map(([date, dateMessages]) => (
                <div key={date} className="message-group">
                    <div className="date-separator">
                        <span className="date-separator__text">{date}</span>
                    </div>

                    {dateMessages.map((message, index) => {
                        // Skip invalid messages
                        if (!message || typeof message !== 'object') {
                            console.error('Invalid message object:', message);
                            return null;
                        }

                        const prevMessage = dateMessages[index - 1];
                        const nextMessage = dateMessages[index + 1];

                        const isFirstInGroup = !prevMessage ||
                            prevMessage.id_usuario_remitente !== message.id_usuario_remitente ||
                            (new Date(message.enviado_en) - new Date(prevMessage.enviado_en)) > 300000; // 5 minutes

                        const isLastInGroup = !nextMessage ||
                            nextMessage.id_usuario_remitente !== message.id_usuario_remitente ||
                            (new Date(nextMessage.enviado_en) - new Date(message.enviado_en)) > 300000; // 5 minutes

                        return (
                            <Message
                                key={`msg-${message.id_mensaje || index}-${message.leido_en ? 'read' : 'unread'}-${message.read_count || 0
                                    }`}
                                message={message}
                                isOwn={message.id_usuario_remitente === user?.id}
                                isFirstInGroup={isFirstInGroup}
                                isLastInGroup={isLastInGroup}
                                currentUser={user}
                                onMessageRead={onMessageRead}
                                onMessageDelete={onMessageDelete}
                            />
                        );
                    })}
                </div>
            ))}

            {/* Typing indicators */}
            {typing && typing.length > 0 && (
                <TypingIndicator userIds={typing} />
            )}
        </div>
    );
};

export default MessageList;
