import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import Button from '../common/Button';
import Input from '../common/Input';
import './Login.css';

const Login = ({ onSwitchToRegister }) => {
    const { login, isLoading, error, clearError } = useAuth();
    const { t } = useLanguage();

    const [formData, setFormData] = useState({
        phone: '',
        password: ''
    });

    const [formErrors, setFormErrors] = useState({});

    const validateForm = () => {
        const errors = {};

        if (!formData.phone.trim()) {
            errors.phone = t('auth.missingFields');
        } else if (!/^\+?[\d\s-()]+$/.test(formData.phone)) {
            errors.phone = t('auth.invalidPhone');
        }

        if (!formData.password) {
            errors.password = t('auth.missingFields');
        }

        return errors;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        clearError();

        const errors = validateForm();
        setFormErrors(errors);

        if (Object.keys(errors).length > 0) {
            return;
        }

        const result = await login(formData.phone, formData.password);

        if (!result.success) {
            // Error is handled by AuthContext
        }
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));

        // Clear field error when user starts typing
        if (formErrors[name]) {
            setFormErrors(prev => ({
                ...prev,
                [name]: ''
            }));
        }

        // Clear global error
        if (error) {
            clearError();
        }
    };

    return (
        <div className="login">
            <div className="login__header">
                <h1 className="login__title">TecChat</h1>
                <p className="login__subtitle">{t('auth.login')}</p>
            </div>

            <form onSubmit={handleSubmit} className="login__form">
                <Input
                    type="tel"
                    name="phone"
                    label={t('auth.phone')}
                    value={formData.phone}
                    onChange={handleInputChange}
                    error={formErrors.phone}
                    placeholder="+1234567890"
                    required
                />

                <Input
                    type="password"
                    name="password"
                    label={t('auth.password')}
                    value={formData.password}
                    onChange={handleInputChange}
                    error={formErrors.password}
                    placeholder="••••••••"
                    required
                />

                {error && (
                    <div className="login__error">
                        {error}
                    </div>
                )}

                <Button
                    type="submit"
                    variant="primary"
                    size="large"
                    loading={isLoading}
                    className="login__submit"
                >
                    {t('auth.loginButton')}
                </Button>

                <button
                    type="button"
                    onClick={onSwitchToRegister}
                    className="login__switch"
                >
                    {t('auth.switchToRegister')}
                </button>
            </form>
        </div>
    );
};

export default Login;
