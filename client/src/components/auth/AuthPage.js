import React, { useState } from 'react';
import Login from './Login';
import Register from './Register';
import './AuthPage.css';

const AuthPage = () => {
    const [isLogin, setIsLogin] = useState(true);

    const switchToRegister = () => setIsLogin(false);
    const switchToLogin = () => setIsLogin(true);

    return (
        <div className="auth-page">
            <div className="auth-page__container">
                {isLogin ? (
                    <Login onSwitchToRegister={switchToRegister} />
                ) : (
                    <Register onSwitchToLogin={switchToLogin} />
                )}
            </div>
        </div>
    );
};

export default AuthPage;
