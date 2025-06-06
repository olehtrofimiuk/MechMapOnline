import React, { useState } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Paper,
  Divider,
  Alert,
  Tabs,
  Tab,
  CircularProgress
} from '@mui/material';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import LoginIcon from '@mui/icons-material/Login';
import { styled } from '@mui/material/styles';

const StyledPaper = styled(Paper)(({ theme }) => ({
  maxWidth: 400,
  width: '100%',
  padding: theme.spacing(4),
  borderRadius: theme.spacing(2),
  boxShadow: theme.shadows[3]
}));

const AuthManager = ({ onAuthSuccess }) => {
  const [currentTab, setCurrentTab] = useState(0); // 0 = login, 1 = register
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    confirmPassword: ''
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Get API base URL based on environment
  const getApiBaseUrl = () => {
    if (process.env.NODE_ENV === 'production') {
      return window.location.origin; // Use same domain as served from
    }
    return 'http://localhost:8000'; // Development server
  };

  const handleTabChange = (event, newValue) => {
    setCurrentTab(newValue);
    setError('');
    setSuccess('');
    setFormData({
      username: '',
      password: '',
      confirmPassword: ''
    });
  };

  const handleInputChange = (field) => (event) => {
    setFormData(prev => ({
      ...prev,
      [field]: event.target.value
    }));
    setError('');
  };

  const validateForm = () => {
    if (!formData.username.trim()) {
      setError('Username is required');
      return false;
    }
    if (formData.username.length < 3) {
      setError('Username must be at least 3 characters');
      return false;
    }
    if (!formData.password) {
      setError('Password is required');
      return false;
    }
    if (formData.password.length < 4) {
      setError('Password must be at least 4 characters');
      return false;
    }
    if (currentTab === 1 && formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return false;
    }
    return true;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      const endpoint = currentTab === 0 ? '/api/login' : '/api/register';
      const response = await fetch(`${getApiBaseUrl()}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          username: formData.username.trim(),
          password: formData.password
        })
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess(data.message);
        
        // Store token in localStorage
        localStorage.setItem('auth_token', data.token);
        localStorage.setItem('username', data.username);
        
        // Call success callback
        onAuthSuccess({
          token: data.token,
          username: data.username,
          isAuthenticated: true
        });
      } else {
        setError(data.detail || 'Authentication failed');
      }
    } catch (error) {
      console.error('Auth error:', error);
      setError('Network error. Please check if the server is running.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSkipAuth = () => {
    onAuthSuccess({
      token: null,
      username: null,
      isAuthenticated: false
    });
  };

  return (
    <Box sx={{ 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center', 
      minHeight: '100vh',
      backgroundImage: 'url(/static/background.jpg)',
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
      padding: 2
    }}>
      <StyledPaper>
        <Typography variant="h4" sx={{ 
          textAlign: 'center', 
          mb: 2,
          fontWeight: 'bold',
          color: 'primary.main'
        }}>
          🗺️ Hex Map Online
        </Typography>

        <Typography variant="body2" sx={{ 
          textAlign: 'center', 
          mb: 3,
          color: 'text.secondary'
        }}>
          Collaborative hex grid mapping tool
        </Typography>

        <Tabs 
          value={currentTab} 
          onChange={handleTabChange} 
          variant="fullWidth"
          sx={{ mb: 3 }}
        >
          <Tab label="Login" icon={<LoginIcon />} />
          <Tab label="Register" icon={<PersonAddIcon />} />
        </Tabs>

        <form onSubmit={handleSubmit}>
          <TextField
            fullWidth
            label="Username"
            value={formData.username}
            onChange={handleInputChange('username')}
            variant="outlined"
            disabled={isLoading}
            sx={{ mb: 2 }}
            autoComplete="username"
          />

          <TextField
            fullWidth
            label="Password"
            type="password"
            value={formData.password}
            onChange={handleInputChange('password')}
            variant="outlined"
            disabled={isLoading}
            sx={{ mb: currentTab === 1 ? 2 : 3 }}
            autoComplete={currentTab === 0 ? "current-password" : "new-password"}
          />

          {currentTab === 1 && (
            <TextField
              fullWidth
              label="Confirm Password"
              type="password"
              value={formData.confirmPassword}
              onChange={handleInputChange('confirmPassword')}
              variant="outlined"
              disabled={isLoading}
              sx={{ mb: 3 }}
              autoComplete="new-password"
            />
          )}

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          {success && (
            <Alert severity="success" sx={{ mb: 2 }}>
              {success}
            </Alert>
          )}

          <Button
            type="submit"
            fullWidth
            variant="contained"
            size="large"
            disabled={isLoading}
            startIcon={isLoading ? <CircularProgress size={20} /> : 
              (currentTab === 0 ? <LoginIcon /> : <PersonAddIcon />)}
            sx={{ mb: 2 }}
          >
            {isLoading ? 
              (currentTab === 0 ? 'Logging in...' : 'Registering...') :
              (currentTab === 0 ? 'Login' : 'Register')
            }
          </Button>
        </form>

        <Divider sx={{ my: 2 }}>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            OR
          </Typography>
        </Divider>

        <Button
          fullWidth
          variant="outlined"
          onClick={handleSkipAuth}
          disabled={isLoading}
          sx={{ 
            borderStyle: 'dashed',
            color: 'text.secondary',
            borderColor: 'text.secondary'
          }}
        >
          Continue as Anonymous
        </Button>

        <Typography variant="caption" sx={{ 
          display: 'block',
          textAlign: 'center',
          mt: 2,
          color: 'text.secondary'
        }}>
          {currentTab === 0 ? 
            "Don't have an account? Switch to Register" :
            "Already have an account? Switch to Login"
          }
        </Typography>
      </StyledPaper>
    </Box>
  );
};

export default AuthManager; 