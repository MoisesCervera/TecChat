import React from 'react';
import './TypingIndicator.css';

const TypingIndicator = ({ userIds }) => {
    if (!userIds || userIds.length === 0) return null;

    const getTypingText = () => {
        if (userIds.length === 1) {
            return 'escribiendo...';
        } else if (userIds.length === 2) {
            return 'escribiendo...';
        } else {
            return 'varios usuarios escribiendo...';
        }
    };

    return (
        <div className="typing-indicator">
            <div className="typing-indicator__bubble">
                <div className="typing-indicator__dots">
                    <div className="dot"></div>
                    <div className="dot"></div>
                    <div className="dot"></div>
                </div>
                <span className="typing-indicator__text">
                    {getTypingText()}
                </span>
            </div>
        </div>
    );
};

export default TypingIndicator;
