import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Box,
  Typography,
  Divider
} from '@mui/material';
import { HexColorPicker } from 'react-colorful';

const UnitCreationDialog = ({ 
  open, 
  onClose, 
  onConfirm, 
  hexKey,
  initialColor = '#FF0000'
}) => {
  const [unitName, setUnitName] = useState('');
  const [unitColor, setUnitColor] = useState(initialColor);

  // Preset colors for quick selection
  const presetColors = [
    '#FF0000', // Red
    '#0000FF', // Blue
    '#00FF00', // Green
    '#FFFF00', // Yellow
    '#FF00FF', // Magenta
    '#FFA500', // Orange
    '#FFFFFF', // White
    '#000000', // Black
    '#800080', // Purple
    '#008000', // Dark Green
    '#FFC0CB', // Pink
    '#A52A2A', // Brown
  ];

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setUnitName('');
      setUnitColor(initialColor);
    }
  }, [open, initialColor]);

  const handleConfirm = () => {
    if (unitName.trim()) {
      onConfirm({
        name: unitName.trim(),
        color: unitColor,
        hex_key: hexKey
      });
      onClose();
    }
  };

  const handleKeyPress = (event) => {
    if (event.key === 'Enter') {
      handleConfirm();
    }
  };

  return (
    <Dialog 
      open={open} 
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          background: 'linear-gradient(135deg, rgba(0, 17, 34, 0.95), rgba(0, 8, 17, 0.98))',
          border: '1px solid var(--neotech-border)',
          boxShadow: '0 0 20px rgba(0, 255, 255, 0.3)',
          backdropFilter: 'blur(10px)'
        }
      }}
    >
      <DialogTitle sx={{
        color: 'var(--neotech-primary)',
        fontFamily: "'Orbitron', monospace",
        textAlign: 'center',
        borderBottom: '1px solid var(--neotech-border)',
        background: 'linear-gradient(90deg, transparent, rgba(0, 255, 255, 0.1), transparent)'
      }}>
        Create New Unit
      </DialogTitle>
      
      <DialogContent sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {/* Unit Name Input */}
          <Box>
            <Typography 
              variant="subtitle1" 
              sx={{ 
                mb: 1,
                color: 'var(--neotech-text-secondary)',
                fontFamily: "'Rajdhani', monospace",
                fontWeight: 600
              }}
            >
              Unit Name
            </Typography>
            <TextField
              fullWidth
              value={unitName}
              onChange={(e) => setUnitName(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Enter unit name..."
              autoFocus
              variant="outlined"
              sx={{
                '& .MuiOutlinedInput-root': {
                  color: 'var(--neotech-text-primary)',
                  backgroundColor: 'rgba(0, 17, 34, 0.8)',
                  fontFamily: "'Rajdhani', monospace",
                  '& fieldset': {
                    borderColor: 'var(--neotech-border)',
                  },
                  '&:hover fieldset': {
                    borderColor: 'var(--neotech-primary)',
                  },
                  '&.Mui-focused fieldset': {
                    borderColor: 'var(--neotech-primary)',
                    boxShadow: 'var(--neotech-glow-small)'
                  },
                },
                '& .MuiInputBase-input::placeholder': {
                  color: 'var(--neotech-text-secondary)',
                  opacity: 0.7
                }
              }}
            />
          </Box>

          <Divider sx={{ backgroundColor: 'var(--neotech-border)', opacity: 0.5 }} />

          {/* Color Selection */}
          <Box>
            <Typography 
              variant="subtitle1" 
              sx={{ 
                mb: 2,
                color: 'var(--neotech-text-secondary)',
                fontFamily: "'Rajdhani', monospace",
                fontWeight: 600
              }}
            >
              Unit Color
            </Typography>
            
            {/* Current Color Display */}
            <Box sx={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: 2, 
              mb: 2,
              p: 1.5,
              background: 'rgba(0, 17, 34, 0.8)',
              border: '1px solid var(--neotech-border)',
              borderRadius: 1,
              boxShadow: 'inset 0 0 10px rgba(0, 0, 0, 0.5)'
            }}>
              <Box
                sx={{
                  width: 40,
                  height: 40,
                  backgroundColor: unitColor,
                  border: '1px solid var(--neotech-primary)',
                  borderRadius: 1,
                  boxShadow: 'var(--neotech-glow-small)'
                }}
              />
              <Typography variant="body1" sx={{ 
                fontFamily: "'Courier New', monospace",
                color: 'var(--neotech-accent)',
                fontSize: '14px'
              }}>
                {unitColor}
              </Typography>
            </Box>

            {/* Preset Color Palette */}
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 1, mb: 2 }}>
              {presetColors.map((color) => (
                <Box
                  key={color}
                  onClick={() => setUnitColor(color)}
                  sx={{
                    width: 40,
                    height: 40,
                    backgroundColor: color,
                    border: unitColor === color ? '2px solid var(--neotech-primary)' : '1px solid var(--neotech-border)',
                    borderRadius: 1,
                    cursor: 'pointer',
                    boxShadow: unitColor === color ? 'var(--neotech-glow-medium)' : 'none',
                    transition: 'all 0.3s ease',
                    '&:hover': {
                      borderColor: 'var(--neotech-primary)',
                      boxShadow: 'var(--neotech-glow-small)',
                      transform: 'translateY(-2px)'
                    }
                  }}
                />
              ))}
            </Box>

            {/* Color Picker */}
            <Box sx={{
              background: 'rgba(0, 17, 34, 0.8)',
              border: '1px solid var(--neotech-border)',
              borderRadius: 1,
              padding: 2,
              boxShadow: 'inset 0 0 10px rgba(0, 0, 0, 0.5)'
            }}>
              <HexColorPicker 
                color={unitColor} 
                onChange={setUnitColor} 
                style={{ width: '100%', height: '120px' }}
              />
            </Box>
          </Box>
        </Box>
      </DialogContent>
      
      <DialogActions sx={{ 
        p: 2, 
        borderTop: '1px solid var(--neotech-border)',
        background: 'linear-gradient(90deg, transparent, rgba(0, 255, 255, 0.05), transparent)'
      }}>
        <Button 
          onClick={onClose}
          sx={{
            color: 'var(--neotech-text-secondary)',
            borderColor: 'var(--neotech-border)',
            fontFamily: "'Rajdhani', monospace",
            fontWeight: 600,
            '&:hover': {
              borderColor: 'var(--neotech-primary)',
              backgroundColor: 'rgba(0, 255, 255, 0.1)'
            }
          }}
          variant="outlined"
        >
          Cancel
        </Button>
        <Button 
          onClick={handleConfirm}
          disabled={!unitName.trim()}
          sx={{
            background: 'linear-gradient(135deg, rgba(0, 255, 255, 0.3), rgba(0, 153, 204, 0.3))',
            color: 'var(--neotech-primary)',
            fontFamily: "'Rajdhani', monospace",
            fontWeight: 600,
            border: '1px solid var(--neotech-primary)',
            '&:hover': {
              background: 'linear-gradient(135deg, rgba(0, 255, 255, 0.4), rgba(0, 153, 204, 0.4))',
              boxShadow: 'var(--neotech-glow-medium)'
            },
            '&:disabled': {
              background: 'rgba(128, 128, 128, 0.2)',
              color: 'var(--neotech-text-secondary)',
              border: '1px solid var(--neotech-border)'
            }
          }}
          variant="contained"
        >
          Create Unit
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default UnitCreationDialog; 