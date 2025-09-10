import React, { useEffect } from 'react';
import { useSocket } from '../../contexts/SocketContext';
import MessageStatus from '../../MessageStatus';

/**
 * Simplified Message component with automatic status tracking
 */
const Message = ({ message, isOwn }) => {
    const { getMessageStatus } = useSocket();

    // For messages sent by the current user, we need to show status
    const renderStatus = () => {
        if (isOwn) {
            // First check if we have a tracked status from socket events
            const trackedStatus = getMessageStatus(message.id_mensaje);

            // If we have a tracked status from real-time events, use it
            if (trackedStatus) {
                console.log(`Using tracked status for message ${message.id_mensaje}: ${trackedStatus}`);
                return <MessageStatus status={trackedStatus} />;
            }

            // Otherwise fall back to database values
            const status = message.leido_en ? 'read' :
                message.entregado_en ? 'delivered' : 'sent';
            console.log(`Using database status for message ${message.id_mensaje}: ${status}`);
            return <MessageStatus status={status} />;
        }
        return null;
    };

    return (
        <div className={`message ${isOwn ? 'own' : 'other'}`}>
            <div className="message-content">
                {message.contenido}
            </div>
            <div className="message-meta">
                <div className="message-time">
                    {(() => {
                        try {
                            const messageDate = new Date(message.enviado_en);
                            // Check if date is valid
                            if (isNaN(messageDate.getTime())) {
                                console.error('Invalid date:', message.enviado_en);
                                return 'Ahora';
                            }

                            const now = new Date();
                            const isToday = messageDate.getDate() === now.getDate() &&
                                messageDate.getMonth() === now.getMonth() &&
                                messageDate.getFullYear() === now.getFullYear();

                            if (isToday) {
                                // Only show time for today's messages
                                return messageDate.toLocaleTimeString([], {
                                    hour: '2-digit',
                                    minute: '2-digit'
                                });
                            } else {
                                // Show date and time for older messages
                                return messageDate.toLocaleDateString([], {
                                    day: '2-digit',
                                    month: '2-digit',
                                    year: '2-digit'
                                }) + ' ' + messageDate.toLocaleTimeString([], {
                                    hour: '2-digit',
                                    minute: '2-digit'
                                });
                            }
                        } catch (e) {
                            console.error('Error formatting date:', e);
                            return 'Ahora';
                        }
                    })()}
                </div>
                {renderStatus()}
            </div>
        </div>
    );
};

export default Message;
