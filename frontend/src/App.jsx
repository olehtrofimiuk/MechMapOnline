import React from 'react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import MainWindow from './components/MainWindow';
import './App.css';

// Neotech Theme Configuration
const neotechTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#00ffff',
      light: '#66ffff',
      dark: '#0099cc',
      contrastText: '#001122',
    },
    secondary: {
      main: '#0099cc',
      light: '#66ccff',
      dark: '#006699',
      contrastText: '#ffffff',
    },
    background: {
      default: '#000000',
      paper: 'rgba(0, 17, 34, 0.95)',
    },
    text: {
      primary: '#ffffff',
      secondary: '#99ccff',
    },
    success: {
      main: '#00ff88',
    },
    warning: {
      main: '#ffaa00',
    },
    error: {
      main: '#ff3366',
    },
    info: {
      main: '#00ffff',
    },
  },
  typography: {
    fontFamily: "'Rajdhani', 'Orbitron', monospace",
    h1: {
      fontFamily: "'Orbitron', monospace",
      fontWeight: 700,
      textShadow: '0 0 5px #00cccc',
    },
    h2: {
      fontFamily: "'Orbitron', monospace",
      fontWeight: 700,
      textShadow: '0 0 5px #00cccc',
    },
    h3: {
      fontFamily: "'Orbitron', monospace",
      fontWeight: 700,
      textShadow: '0 0 5px #00cccc',
    },
    h4: {
      fontFamily: "'Orbitron', monospace",
      fontWeight: 700,
      textShadow: '0 0 5px #00cccc',
    },
    h5: {
      fontFamily: "'Orbitron', monospace",
      fontWeight: 700,
      textShadow: '0 0 5px #00cccc',
    },
    h6: {
      fontFamily: "'Orbitron', monospace",
      fontWeight: 700,
      textShadow: '0 0 5px #00cccc',
    },
    button: {
      fontFamily: "'Orbitron', monospace",
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '1px',
    },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 4,
          transition: 'all 0.3s ease',
          fontFamily: "'Orbitron', monospace",
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '1px',
        },
        contained: {
          background: 'linear-gradient(135deg, #00ffff, #0099cc)',
          color: '#001122',
          boxShadow: '0 0 5px #00cccc',
          '&:hover': {
            background: 'linear-gradient(135deg, #66ffff, #00ffff)',
            boxShadow: '0 0 10px #00cccc, 0 0 20px #00cccc',
            transform: 'translateY(-2px)',
          },
        },
        outlined: {
          border: '1px solid #00ffff',
          color: '#00ffff',
          background: 'rgba(0, 255, 255, 0.1)',
          '&:hover': {
            background: 'rgba(0, 255, 255, 0.2)',
            boxShadow: '0 0 10px #00cccc, 0 0 20px #00cccc',
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          background: 'linear-gradient(135deg, rgba(0, 17, 34, 0.95), rgba(0, 8, 17, 0.98))',
          border: '1px solid rgba(0, 255, 255, 0.3)',
          boxShadow: 'inset 0 0 10px rgba(0, 255, 255, 0.2), 0 0 5px rgba(0, 255, 255, 0.3)',
          backdropFilter: 'blur(10px)',
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            background: 'rgba(0, 17, 34, 0.8)',
            borderRadius: 4,
            '& fieldset': {
              borderColor: 'rgba(0, 255, 255, 0.3)',
            },
            '&:hover fieldset': {
              borderColor: '#00ffff',
            },
            '&.Mui-focused fieldset': {
              borderColor: '#00ffff',
              boxShadow: '0 0 5px #00cccc',
            },
          },
          '& .MuiInputBase-input': {
            color: '#ffffff',
            fontFamily: "'Rajdhani', monospace",
          },
          '& .MuiInputLabel-root': {
            color: '#99ccff',
            fontFamily: "'Rajdhani', monospace",
            '&.Mui-focused': {
              color: '#00ffff',
            },
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          background: 'rgba(0, 255, 255, 0.2)',
          border: '1px solid #00ffff',
          color: '#00ffff',
          fontFamily: "'Rajdhani', monospace",
          fontWeight: 600,
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          background: 'rgba(0, 17, 34, 0.9)',
          border: '1px solid rgba(0, 255, 255, 0.3)',
          borderRadius: 4,
          backdropFilter: 'blur(5px)',
        },
        standardError: {
          borderColor: '#ff3366',
        },
        standardSuccess: {
          borderColor: '#00ff88',
        },
        standardInfo: {
          borderColor: '#00ffff',
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          fontFamily: "'Orbitron', monospace",
          fontWeight: 600,
          textTransform: 'uppercase',
          color: '#99ccff',
          '&.Mui-selected': {
            color: '#00ffff',
            textShadow: '0 0 5px #00cccc',
          },
        },
      },
    },
    MuiTabs: {
      styleOverrides: {
        indicator: {
          background: '#00ffff',
          boxShadow: '0 0 5px #00cccc',
        },
      },
    },
  },
});

function App() {
  return (
    <ThemeProvider theme={neotechTheme}>
      <CssBaseline />
      <div className="App">
        <MainWindow />
      </div>
    </ThemeProvider>
  );
}

export default App;
