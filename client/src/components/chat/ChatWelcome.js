import React from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import './ChatWelcome.css';

const ChatWelcome = ({ user }) => {
    const { t } = useLanguage();

    return (
        <div className="chat-welcome">
            <div className="chat-welcome__content">
                <div className="chat-welcome__logo">
                    <div className="chat-welcome__icon">
                        💬
                    </div>
                    <h1 className="chat-welcome__title">TecChat</h1>
                </div>

                <div className="chat-welcome__message">
                    <h2>¡Bienvenido, {user.nombre}!</h2>
                    <p>{t('chat.selectChat')}</p>
                </div>

                <div className="chat-welcome__features">
                    <div className="feature">
                        <div className="feature__icon">🚀</div>
                        <div className="feature__text">
                            <h3>Mensajería rápida</h3>
                            <p>Envía mensajes al instante con confirmación de entrega</p>
                        </div>
                    </div>

                    <div className="feature">
                        <div className="feature__icon">👥</div>
                        <div className="feature__text">
                            <h3>Chats grupales</h3>
                            <p>Crea grupos y chatea con múltiples contactos</p>
                        </div>
                    </div>

                    <div className="feature">
                        <div className="feature__icon">🌙</div>
                        <div className="feature__text">
                            <h3>Modo oscuro</h3>
                            <p>Interfaz adaptable para cualquier momento del día</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ChatWelcome;
