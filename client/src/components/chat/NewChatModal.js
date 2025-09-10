import React, { useState, useEffect } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import Button from '../common/Button';
import './NewChatModal.css';

const NewChatModal = ({ onClose, onCreateChat }) => {
    const { t } = useLanguage();
    const [users, setUsers] = useState([]);
    const [filteredUsers, setFilteredUsers] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selectedUser, setSelectedUser] = useState(null);

    // Fetch all available users
    useEffect(() => {
        const fetchUsers = async () => {
            try {
                setLoading(true);
                setError(null);

                const response = await fetch('/api/users/available', {
                    method: 'GET',
                    credentials: 'include'
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || 'Error fetching users');
                }

                const data = await response.json();
                setUsers(data.users || []);
                setFilteredUsers(data.users || []);
            } catch (error) {
                console.error('Error fetching users:', error);
                setError(error.message);
            } finally {
                setLoading(false);
            }
        };

        fetchUsers();
    }, []);

    // Filter users based on search term
    useEffect(() => {
        if (!searchTerm.trim()) {
            setFilteredUsers(users);
            return;
        }

        const term = searchTerm.toLowerCase().trim();
        const filtered = users.filter(user =>
            user.nombre.toLowerCase().includes(term) ||
            user.telefono.includes(term)
        );

        setFilteredUsers(filtered);
    }, [searchTerm, users]);

    const handleCreateChat = () => {
        if (selectedUser) {
            onCreateChat(selectedUser);
            onClose();
        }
    };

    return (
        <div className="new-chat-modal">
            <div className="new-chat-modal__overlay" onClick={onClose}></div>

            <div className="new-chat-modal__content">
                <div className="new-chat-modal__header">
                    <h3>{t('chat.newChat')}</h3>
                    <button className="close-button" onClick={onClose}>×</button>
                </div>

                <div className="new-chat-modal__search">
                    <input
                        type="text"
                        placeholder={t('chat.searchUsers')}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                {loading ? (
                    <div className="new-chat-modal__loading">
                        <div className="spinner"></div>
                        <p>{t('common.loading')}</p>
                    </div>
                ) : error ? (
                    <div className="new-chat-modal__error">
                        <p>{error}</p>
                        <Button
                            variant="ghost"
                            onClick={onClose}
                            size="small"
                        >
                            {t('common.close')}
                        </Button>
                    </div>
                ) : (
                    <div className="new-chat-modal__user-list">
                        {filteredUsers.length > 0 ? (
                            filteredUsers.map(user => (
                                <div
                                    key={user.id_usuario}
                                    className={`user-item ${selectedUser?.id_usuario === user.id_usuario ? 'selected' : ''}`}
                                    onClick={() => setSelectedUser(user)}
                                >
                                    <div className="user-avatar">
                                        {user.nombre.charAt(0).toUpperCase()}
                                    </div>
                                    <div className="user-info">
                                        <div className="user-name">{user.nombre}</div>
                                        <div className="user-phone">{user.telefono}</div>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="empty-results">
                                <p>{t('chat.noUsersFound')}</p>
                            </div>
                        )}
                    </div>
                )}

                <div className="new-chat-modal__actions">
                    <Button
                        variant="ghost"
                        onClick={onClose}
                    >
                        {t('common.cancel')}
                    </Button>
                    <Button
                        variant="primary"
                        disabled={!selectedUser}
                        onClick={handleCreateChat}
                    >
                        {t('chat.startChat')}
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default NewChatModal;
