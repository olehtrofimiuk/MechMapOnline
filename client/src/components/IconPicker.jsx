import React, { useEffect, useMemo, useState } from 'react';
import { Box, CircularProgress, List, ListItemButton, ListItemText, TextField, Typography } from '@mui/material';
import { buildUnitIconUrl } from '../utils/unitIcons';

const IconPicker = ({ apiBaseUrl, open, value, onChange }) => {
  const [icons, setIcons] = useState([]);
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    if (!open) return;
    if (!apiBaseUrl) return;

    setIsLoading(true);
    setLoadError(null);
    fetch(`${apiBaseUrl}/api/unit-icons`)
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Failed to load icons: ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        const list = Array.isArray(data.icons) ? data.icons : [];
        setIcons(list);
        if (!value && list.length > 0) {
          onChange(list[0]);
        }
      })
      .catch((e) => setLoadError(e.message || String(e)))
      .finally(() => setIsLoading(false));
  }, [apiBaseUrl, open, onChange, value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return icons;
    return icons.filter((p) => p.toLowerCase().includes(q));
  }, [icons, query]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <TextField
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search icons..."
        size="small"
        sx={{
          '& .MuiOutlinedInput-root': {
            color: 'var(--neotech-text-primary)',
            backgroundColor: 'rgba(0, 17, 34, 0.8)',
            fontFamily: "'Rajdhani', monospace",
            '& fieldset': { borderColor: 'var(--neotech-border)' },
            '&:hover fieldset': { borderColor: 'var(--neotech-primary)' },
            '&.Mui-focused fieldset': {
              borderColor: 'var(--neotech-primary)',
              boxShadow: 'var(--neotech-glow-small)',
            },
          },
          '& .MuiInputBase-input::placeholder': {
            color: 'var(--neotech-text-secondary)',
            opacity: 0.7,
          },
        }}
      />

      {isLoading && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <CircularProgress size={18} />
          <Typography sx={{ color: 'var(--neotech-text-secondary)', fontFamily: "'Rajdhani', monospace" }}>
            Loading icons…
          </Typography>
        </Box>
      )}

      {loadError && (
        <Typography sx={{ color: 'var(--neotech-error)', fontFamily: "'Rajdhani', monospace" }}>
          {loadError}
        </Typography>
      )}

      {!isLoading && !loadError && (
        <Box
          sx={{
            maxHeight: 220,
            overflowY: 'auto',
            background: 'rgba(0, 17, 34, 0.6)',
            border: '1px solid var(--neotech-border)',
            borderRadius: 1,
          }}
        >
          <List dense disablePadding>
            {filtered.slice(0, 200).map((iconPath) => {
              const isSelected = value === iconPath;
              const iconUrl = apiBaseUrl ? buildUnitIconUrl(apiBaseUrl, iconPath) : '';
              return (
                <ListItemButton
                  key={iconPath}
                  selected={isSelected}
                  onClick={() => onChange(iconPath)}
                  sx={{
                    gap: 1.5,
                    py: 0.75,
                    '&.Mui-selected': { backgroundColor: 'rgba(0, 255, 255, 0.12)' },
                    '&:hover': { backgroundColor: 'rgba(0, 255, 255, 0.08)' },
                  }}
                >
                  <Box
                    component="img"
                    src={iconUrl}
                    alt={iconPath}
                    sx={{
                      width: 28,
                      height: 28,
                      imageRendering: 'pixelated',
                      background: 'rgba(0,0,0,0.25)',
                      borderRadius: 0.5,
                      border: '1px solid var(--neotech-border)',
                    }}
                  />
                  <ListItemText
                    primary={iconPath}
                    primaryTypographyProps={{
                      sx: {
                        color: isSelected ? 'var(--neotech-primary)' : 'var(--neotech-text-primary)',
                        fontFamily: "'Rajdhani', monospace",
                        fontSize: 13,
                        lineHeight: 1.2,
                      },
                    }}
                  />
                </ListItemButton>
              );
            })}
          </List>
        </Box>
      )}
    </Box>
  );
};

export default IconPicker;


