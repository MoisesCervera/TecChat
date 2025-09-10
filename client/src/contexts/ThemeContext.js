import React, { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext();

export const useTheme = () => {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
};

export const ThemeProvider = ({ children }) => {
    const [theme, setTheme] = useState('light');
    const [accentColor, setAccentColor] = useState('blue');

    // Load theme preferences from localStorage
    useEffect(() => {
        const savedTheme = localStorage.getItem('preferredTheme');
        const savedAccent = localStorage.getItem('preferredAccent');

        if (savedTheme) {
            setTheme(savedTheme);
        }

        if (savedAccent) {
            setAccentColor(savedAccent);
        }
    }, []);

    // Apply theme to document root
    useEffect(() => {
        const root = document.documentElement;

        // Remove all theme classes
        root.classList.remove('light-theme', 'dark-theme');

        // Add current theme class
        root.classList.add(`${theme}-theme`);

        // Set accent color
        root.setAttribute('data-accent', accentColor);

        // Save preferences
        localStorage.setItem('preferredTheme', theme);
        localStorage.setItem('preferredAccent', accentColor);
    }, [theme, accentColor]);

    const toggleTheme = () => {
        setTheme(prevTheme => prevTheme === 'light' ? 'dark' : 'light');
    };

    const changeAccentColor = (color) => {
        const validColors = ['blue', 'green', 'purple'];
        if (validColors.includes(color)) {
            setAccentColor(color);
        }
    };

    const value = {
        theme,
        setTheme,
        accentColor,
        setAccentColor: changeAccentColor,
        toggleTheme,
        availableColors: ['blue', 'green', 'purple']
    };

    return (
        <ThemeContext.Provider value={value}>
            {children}
        </ThemeContext.Provider>
    );
};
