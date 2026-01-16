import React from 'react';

export const ThemeContext = React.createContext({
  currentTheme: 'light',
  toggleTheme: () => {},
});
