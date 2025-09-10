import React from 'react';
import './Loading.css';

const Loading = ({ size = 'medium', text, className = '' }) => {
    return (
        <div className={`loading ${className}`}>
            <div className={`loading-spinner loading-spinner--${size}`}>
                <div className="loading-spinner__circle"></div>
                <div className="loading-spinner__circle"></div>
                <div className="loading-spinner__circle"></div>
            </div>
            {text && <p className="loading-text">{text}</p>}
        </div>
    );
};

export default Loading;
