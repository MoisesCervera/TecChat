import React from 'react';
import './Button.css';

const Button = ({
    children,
    variant = 'primary',
    size = 'medium',
    disabled = false,
    loading = false,
    onClick,
    type = 'button',
    className = '',
    ...props
}) => {
    const buttonClass = [
        'btn',
        `btn--${variant}`,
        `btn--${size}`,
        loading && 'btn--loading',
        disabled && 'btn--disabled',
        className
    ].filter(Boolean).join(' ');

    return (
        <button
            type={type}
            className={buttonClass}
            disabled={disabled || loading}
            onClick={onClick}
            {...props}
        >
            {loading && (
                <div className="btn__loading">
                    <div className="btn__spinner"></div>
                </div>
            )}
            <span className={loading ? 'btn__content--hidden' : 'btn__content'}>
                {children}
            </span>
        </button>
    );
};

export default Button;
