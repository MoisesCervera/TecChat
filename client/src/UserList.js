import React from 'react';
import MessageStatus from './MessageStatus';

function UserList({ users, selectedUser, onSelect, messages, onShowSettings }) {
    const getLastMessage = (userId) => {
        if (!messages || !messages[userId] || !messages[userId].length) return { text: "", time: "" };
        const lastMsg = messages[userId][messages[userId].length - 1];
        return {
            text: lastMsg.text,
            time: lastMsg.time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            from: lastMsg.from,
            status: lastMsg.status || 'sent'
        };
    };

    return (
        <div className="user-list">
            <h2>TecChat</h2>
            <ul>
                {users.map(user => {
                    const lastMessage = getLastMessage(user.id);
                    return (
                        <li
                            key={user.id}
                            className={user.id === selectedUser.id ? 'selected' : ''}
                            onClick={() => onSelect(user)}
                        >
                            <div className="avatar">{user.name.charAt(0)}</div>
                            <div className="user-info">
                                <div className="user-name-row">
                                    <span className="user-name">{user.name}</span>
                                    <span className="message-time-small">{lastMessage.time}</span>
                                </div>
                                <div className="last-message">
                                    <div className="message-status">
                                        <MessageStatus status={lastMessage.status} size="small" />
                                    </div>
                                    <span className="last-message-text">
                                        {lastMessage.from === 'Me' ? 'You: ' : ''}
                                        {lastMessage.text}
                                    </span>
                                </div>
                            </div>
                        </li>
                    );
                })}
            </ul>
            <div className="user-list-controls">
                <button className="control-btn" title="Settings" onClick={onShowSettings}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="3"></circle>
                        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                    </svg>
                </button>
                <button className="control-btn" title="Favorite Chats">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                    </svg>
                </button>
                <button className="control-btn" title="New Contact">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                        <circle cx="8.5" cy="7" r="4"></circle>
                        <line x1="20" y1="8" x2="20" y2="14"></line>
                        <line x1="23" y1="11" x2="17" y2="11"></line>
                    </svg>
                </button>
            </div>
        </div>
    );
}

export default UserList;
