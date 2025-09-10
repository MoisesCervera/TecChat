import React from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LanguageProvider } from './contexts/LanguageContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { SocketProvider } from './contexts/SocketContext';
import AuthPage from './components/auth/AuthPage';
import ChatApp from './components/chat/ChatApp';
import Loading from './components/common/Loading';
import './styles/variables.css';
import './styles/base.css';

const AppContent = () => {
    const { user, isLoading } = useAuth();

    if (isLoading) {
        return (
            <div style={{
                height: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
            }}>
                <Loading size="large" text="Cargando..." />
            </div>
        );
    }

    if (!user) {
        return <AuthPage />;
    }

    return (
        <SocketProvider userId={user.id} userName={user.nombre}>
            <ChatApp />
        </SocketProvider>
    );
};

function App() {
    return (
        <LanguageProvider>
            <ThemeProvider>
                <AuthProvider>
                    <AppContent />
                </AuthProvider>
            </ThemeProvider>
        </LanguageProvider>
    );
}

export default App;
