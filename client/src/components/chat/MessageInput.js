import React, { useState, useRef, useEffect } from 'react';
import { useSocket } from '../../contexts/SocketContext';
import { useLanguage } from '../../contexts/LanguageContext';
import Button from '../common/Button';
import './MessageInput.css';

const MessageInput = ({ onSendMessage, onSendFile, chat, user, disabled = false }) => {
    const { t } = useLanguage();
    const { socket, startTyping, stopTyping } = useSocket();
    const [message, setMessage] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [uploading, setUploading] = useState(false);
    const textareaRef = useRef(null);
    const fileInputRef = useRef(null);
    const typingTimeoutRef = useRef(null);

    // Cleanup typing timeout on unmount
    useEffect(() => {
        return () => {
            if (typingTimeoutRef.current) {
                clearTimeout(typingTimeoutRef.current);
            }
            if (isTyping && socket && chat) {
                socket.emit('typing_stop', {
                    chatId: chat.id_chat,
                    userId: user.id
                });
            }
        };
    }, [isTyping, socket, chat, user]);

    const handleInputChange = (e) => {
        const value = e.target.value;
        setMessage(value);

        // Handle typing indicators
        if (value.trim() && !isTyping) {
            setIsTyping(true);
            if (socket && chat) {
                socket.emit('typing_start', {
                    chatId: chat.id_chat,
                    userId: user.id,
                    userName: user.nombre
                });
            }
        } else if (!value.trim() && isTyping) {
            setIsTyping(false);
            if (socket && chat) {
                socket.emit('typing_stop', {
                    chatId: chat.id_chat,
                    userId: user.id
                });
            }
        }

        // Clear existing timeout
        if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
        }

        // Set new timeout to stop typing
        if (value.trim()) {
            typingTimeoutRef.current = setTimeout(() => {
                setIsTyping(false);
                if (socket && chat) {
                    socket.emit('typing_stop', {
                        chatId: chat.id_chat,
                        userId: user.id
                    });
                }
            }, 3000); // Stop typing after 3 seconds of inactivity
        }

        handleTextareaResize();
    };

    const handleKeyPress = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const handleSend = () => {
        if (!message.trim() || disabled || uploading) return;

        // Stop typing indicator
        if (isTyping) {
            setIsTyping(false);
            if (socket && chat) {
                socket.emit('typing_stop', {
                    chatId: chat.id_chat,
                    userId: user.id
                });
            }
            if (typingTimeoutRef.current) {
                clearTimeout(typingTimeoutRef.current);
            }
        }

        // Send message
        onSendMessage(message.trim());
        setMessage('');

        // Reset textarea height
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
        }
    };

    const handleFileSelect = () => {
        if (fileInputRef.current) {
            fileInputRef.current.click();
        }
    };

    const handleFileChange = async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0 || disabled || uploading) return;

        setUploading(true);

        try {
            for (const file of files) {
                console.log('Uploading file:', file.name, 'Type:', file.type);
                if (onSendFile) {
                    await onSendFile(file, message.trim());
                }
            }
            setMessage(''); // Clear caption after successful upload
        } catch (error) {
            console.error('Error uploading file:', error);
            // Error is now handled in ChatWindow.js with an alert
        } finally {
            setUploading(false);
            // Reset file input
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    const handleTextareaResize = () => {
        const textarea = textareaRef.current;
        if (textarea) {
            textarea.style.height = 'auto';
            const maxHeight = 120; // Max 4-5 lines
            textarea.style.height = Math.min(textarea.scrollHeight, maxHeight) + 'px';
        }
    };

    useEffect(() => {
        handleTextareaResize();
    }, [message]);

    // Cleanup typing timeout on unmount
    useEffect(() => {
        return () => {
            if (typingTimeoutRef.current) {
                clearTimeout(typingTimeoutRef.current);
            }
            if (isTyping && chat) {
                stopTyping(chat.id_chat);
            }
        };
    }, []);

    return (
        <div className="message-input">
            <div className="message-input__container">
                <div className="message-input__field">
                    <textarea
                        ref={textareaRef}
                        value={message}
                        onChange={handleInputChange}
                        onKeyPress={handleKeyPress}
                        placeholder={t('chat.typeMessage')}
                        disabled={disabled}
                        className="message-input__textarea"
                        rows={1}
                    />

                    <div className="message-input__actions">
                        {/* File upload button */}
                        <button
                            className="action-button file-button"
                            onClick={handleFileSelect}
                            disabled={disabled || uploading}
                            title="Adjuntar archivo"
                        >
                            📎
                        </button>

                        {/* Hidden file input */}
                        <input
                            ref={fileInputRef}
                            type="file"
                            multiple
                            onChange={handleFileChange}
                            style={{ display: 'none' }}
                            accept="image/*,video/*,video/quicktime,audio/*,.pdf,.doc,.docx,.txt,.xls,.xlsx"
                        />

                        {/* Add emoji picker button here if needed */}
                        <button
                            className="action-button emoji-button"
                            onClick={() => {/* TODO: Add emoji picker */ }}
                            disabled={disabled || uploading}
                            title="Emojis"
                        >
                            😊
                        </button>
                    </div>
                </div>

                <Button
                    onClick={handleSend}
                    disabled={!message.trim() || disabled || uploading}
                    variant="primary"
                    className="message-input__send"
                    title={uploading ? 'Subiendo...' : t('chat.send')}
                >
                    <span className="send-icon">
                        {uploading ? '⏳' : '📤'}
                    </span>
                </Button>
            </div>
        </div>
    );
};

export default MessageInput;
