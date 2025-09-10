import React, { createContext, useContext, useState, useEffect } from 'react';
import { es } from '../locales/es';

const LanguageContext = createContext();

const languages = {
    es
};

export const useLanguage = () => {
    const context = useContext(LanguageContext);
    if (!context) {
        throw new Error('useLanguage must be used within a LanguageProvider');
    }
    return context;
};

export const LanguageProvider = ({ children }) => {
    const [currentLanguage, setCurrentLanguage] = useState('es');

    // Load language preference from localStorage
    useEffect(() => {
        const savedLanguage = localStorage.getItem('preferredLanguage');
        if (savedLanguage && languages[savedLanguage]) {
            setCurrentLanguage(savedLanguage);
        }
    }, []);

    // Save language preference when it changes
    useEffect(() => {
        localStorage.setItem('preferredLanguage', currentLanguage);
    }, [currentLanguage]);

    const changeLanguage = (languageCode) => {
        if (languages[languageCode]) {
            setCurrentLanguage(languageCode);
        }
    };

    const t = (key) => {
        if (!key || typeof key !== 'string') {
            console.error('Invalid translation key:', key);
            return key;
        }

        try {
            const keys = key.split('.');
            let value = languages[currentLanguage];

            for (const k of keys) {
                if (value === undefined || value === null) {
                    console.warn(`Translation missing for key: ${key}`);
                    return key;
                }
                value = value[k];
            }

            return value || key;
        } catch (error) {
            console.error('Translation error for key:', key, error);
            return key;
        }
    };

    const value = {
        currentLanguage,
        changeLanguage,
        t,
        availableLanguages: Object.keys(languages)
    };

    return (
        <LanguageContext.Provider value={value}>
            {children}
        </LanguageContext.Provider>
    );
};
