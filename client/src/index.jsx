import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';

// Neon Dark Theme
const theme = createTheme({
  palette: {
    mode: 'dark', // Enable dark mode
    primary: {
      main: '#00ffff', // Neon Cyan
      contrastText: '#00FF00', // Black text for high contrast on cyan buttons
    },
    secondary: {
      main: '#ff00ff', // Neon Magenta
      contrastText: '#00FF00', // Black text for high contrast on magenta buttons
    },
    background: {
      default: '#121212', // Very dark grey
      paper: '#1e1e1e',   // Slightly lighter dark grey for paper elements
    },
    text: {
      primary: '#e0e0e0',   // Light grey for primary text
      secondary: '#b0b0b0', // Medium grey for secondary text
    },
    error: {
      main: '#ff6b6b', // A bright red for errors
    },
    // You can further customize divider colors, action states (hover, selected), etc.
  },
  typography: {
    // Ensure typography is generally light
    allVariants: {
      color: '#e0e0e0',
    },
    h1: { color: '#00ffff' }, // Example: Make H1s use primary color
    // Add other typography customizations if needed
  },
  components: {
    // Example: Style buttons to have a more neon feel
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: '8px',
          // Add more shared button styles here
        },
        containedPrimary: {
          boxShadow: '0 0 10px #00ffff, 0 0 20px #00ffff', // Neon glow for primary buttons
          '&:hover': {
            boxShadow: '0 0 15px #00ffff, 0 0 30px #00ffff',
          }
        },
        containedSecondary: {
          boxShadow: '0 0 10px #ff00ff, 0 0 20px #ff00ff', // Neon glow for secondary buttons
          '&:hover': {
            boxShadow: '0 0 15px #ff00ff, 0 0 30px #ff00ff',
          }
        },
      }
    },
    MuiToggleButton: {
        styleOverrides: {
            root: {
                color: '#e0e0e0',
                borderColor: 'rgba(0, 255, 255, 0.5)',
                '&.Mui-selected': {
                    color: '#121212',
                    backgroundColor: '#00ffff',
                    boxShadow: '0 0 10px #00ffff',
                    '&:hover': {
                        backgroundColor: '#00dddd',
                        boxShadow: '0 0 15px #00ffff',
                    }
                },
                '&:hover': {
                    backgroundColor: 'rgba(0, 255, 255, 0.08)',
                    borderColor: '#00ffff',
                }
            }
        }
    },
    MuiTextField: {
        styleOverrides: {
            root: {
                '& label.Mui-focused': {
                    color: '#00ffff', // Neon cyan for focused label
                },
                '& .MuiOutlinedInput-root': {
                    '& fieldset': {
                        borderColor: 'rgba(0, 255, 255, 0.3)', // Lighter border for text field
                    },
                    '&:hover fieldset': {
                        borderColor: '#00ffff', // Neon cyan on hover
                    },
                    '&.Mui-focused fieldset': {
                        borderColor: '#00ffff', // Neon cyan when focused
                    },
                },
            },
        },
    },
  },
});

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    {/* <ThemeProvider theme={theme}> */}
      {/* <CssBaseline /> Ensures consistent baseline and applies background color */}
      <App />
    {/* </ThemeProvider> */}
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
