import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import Button from '../common/Button';
import Input from '../common/Input';
import './Register.css';

const Register = ({ onSwitchToLogin }) => {
    const { register, isLoading, error, clearError } = useAuth();
    const { t } = useLanguage();

    const [formData, setFormData] = useState({
        name: '',
        phone: '',
        password: '',
        confirmPassword: ''
    });

    const [formErrors, setFormErrors] = useState({});

    const validateForm = () => {
        const errors = {};

        if (!formData.name.trim()) {
            errors.name = t('auth.missingFields');
        }

        if (!formData.phone.trim()) {
            errors.phone = t('auth.missingFields');
        } else if (!/^\+?[\d\s-()]+$/.test(formData.phone)) {
            errors.phone = t('auth.invalidPhone');
        }

        if (!formData.password) {
            errors.password = t('auth.missingFields');
        } else if (formData.password.length < 6) {
            errors.password = t('auth.passwordTooShort');
        }

        if (!formData.confirmPassword) {
            errors.confirmPassword = t('auth.missingFields');
        } else if (formData.password !== formData.confirmPassword) {
            errors.confirmPassword = t('auth.passwordsDontMatch');
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

        const result = await register(formData.name, formData.phone, formData.password);

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

        // Clear confirm password error if passwords now match
        if (name === 'password' && formData.confirmPassword && value === formData.confirmPassword) {
            setFormErrors(prev => ({
                ...prev,
                confirmPassword: ''
            }));
        }

        if (name === 'confirmPassword' && formData.password && value === formData.password) {
            setFormErrors(prev => ({
                ...prev,
                confirmPassword: ''
            }));
        }

        // Clear global error
        if (error) {
            clearError();
        }
    };

    return (
        <div className="register">
            <div className="register__header">
                <h1 className="register__title">TecChat</h1>
                <p className="register__subtitle">{t('auth.register')}</p>
            </div>

            <form onSubmit={handleSubmit} className="register__form">
                <Input
                    type="text"
                    name="name"
                    label={t('auth.name')}
                    value={formData.name}
                    onChange={handleInputChange}
                    error={formErrors.name}
                    placeholder="Juan Pérez"
                    required
                />

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

                <Input
                    type="password"
                    name="confirmPassword"
                    label={t('auth.confirmPassword')}
                    value={formData.confirmPassword}
                    onChange={handleInputChange}
                    error={formErrors.confirmPassword}
                    placeholder="••••••••"
                    required
                />

                {error && (
                    <div className="register__error">
                        {error}
                    </div>
                )}

                <Button
                    type="submit"
                    variant="primary"
                    size="large"
                    loading={isLoading}
                    className="register__submit"
                >
                    {t('auth.registerButton')}
                </Button>

                <button
                    type="button"
                    onClick={onSwitchToLogin}
                    className="register__switch"
                >
                    {t('auth.switchToLogin')}
                </button>
            </form>
        </div>
    );
};

export default Register;
