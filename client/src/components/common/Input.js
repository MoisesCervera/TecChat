import React, { forwardRef } from 'react';
import './Input.css';

const Input = forwardRef(({
    label,
    error,
    helperText,
    required = false,
    className = '',
    id,
    ...props
}, ref) => {
    const inputId = id || `input-${Math.random().toString(36).substr(2, 9)}`;

    return (
        <div className={`input-group ${className}`}>
            {label && (
                <label htmlFor={inputId} className="input-label">
                    {label}
                    {required && <span className="input-required">*</span>}
                </label>
            )}

            <input
                ref={ref}
                id={inputId}
                className={`input ${error ? 'input--error' : ''}`}
                {...props}
            />

            {error && (
                <span className="input-error">{error}</span>
            )}

            {helperText && !error && (
                <span className="input-helper">{helperText}</span>
            )}
        </div>
    );
});

Input.displayName = 'Input';

export default Input;
