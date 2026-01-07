import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';

import { buildUnitIconUrl } from '../utils/unitIcons';

const UnitDetailsDialog = ({
  open,
  onClose,
  unit,
  forces,
  apiBaseUrl,
  onSaveDescription,
  onAddForce,
  onBeginDeployForce,
}) => {
  const [descriptionDraft, setDescriptionDraft] = useState('');

  useEffect(() => {
    if (!open) return;
    setDescriptionDraft((unit?.description || '').toString());
  }, [open, unit]);

  const forcesSorted = useMemo(() => {
    const list = Array.isArray(forces) ? forces : [];
    return [...list].sort((a, b) => (a?.name || '').localeCompare(b?.name || ''));
  }, [forces]);

  const iconUrl = unit?.icon_path && apiBaseUrl ? buildUnitIconUrl(apiBaseUrl, unit.icon_path) : null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          background: 'linear-gradient(135deg, rgba(0, 17, 34, 0.95), rgba(0, 8, 17, 0.98))',
          border: '1px solid var(--neotech-border)',
          boxShadow: '0 0 20px rgba(0, 255, 255, 0.3)',
          backdropFilter: 'blur(10px)',
        },
      }}
    >
      <DialogTitle
        sx={{
          color: 'var(--neotech-primary)',
          fontFamily: "'Orbitron', monospace",
          textAlign: 'center',
          borderBottom: '1px solid var(--neotech-border)',
          background: 'linear-gradient(90deg, transparent, rgba(0, 255, 255, 0.1), transparent)',
        }}
      >
        Unit Details
      </DialogTitle>

      <DialogContent sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 2 }}>
          {iconUrl && (
            <Box
              component="img"
              src={iconUrl}
              alt={unit?.icon_path || ''}
              sx={{
                width: 56,
                height: 56,
                background: 'rgba(0,0,0,0.25)',
                borderRadius: 1,
                border: '1px solid var(--neotech-border)',
              }}
            />
          )}
          <Box sx={{ flex: 1 }}>
            <Typography sx={{ color: 'var(--neotech-text-primary)', fontFamily: "'Rajdhani', monospace", fontSize: 18, fontWeight: 700 }}>
              {unit?.name || 'Unnamed'}
            </Typography>
            <Typography sx={{ color: 'var(--neotech-text-secondary)', fontFamily: "'Rajdhani', monospace", fontSize: 13 }}>
              {unit?.hex_key ? `Hex: ${unit.hex_key}` : ''}
            </Typography>
          </Box>
        </Box>

        <Divider sx={{ backgroundColor: 'var(--neotech-border)', opacity: 0.5, mb: 2 }} />

        <Typography sx={{ color: 'var(--neotech-text-secondary)', fontFamily: "'Rajdhani', monospace", fontWeight: 600, mb: 1 }}>
          Description
        </Typography>
        <TextField
          fullWidth
          value={descriptionDraft}
          onChange={(e) => setDescriptionDraft(e.target.value)}
          placeholder="Add notes…"
          multiline
          minRows={3}
          variant="outlined"
          sx={{
            mb: 2,
            '& .MuiOutlinedInput-root': {
              color: 'var(--neotech-text-primary)',
              backgroundColor: 'rgba(0, 17, 34, 0.8)',
              fontFamily: "'Rajdhani', monospace",
              '& fieldset': { borderColor: 'var(--neotech-border)' },
              '&:hover fieldset': { borderColor: 'var(--neotech-primary)' },
              '&.Mui-focused fieldset': { borderColor: 'var(--neotech-primary)', boxShadow: 'var(--neotech-glow-small)' },
            },
            '& .MuiInputBase-input::placeholder': { color: 'var(--neotech-text-secondary)', opacity: 0.7 },
          }}
        />

        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 3 }}>
          <Button
            onClick={() => onSaveDescription(descriptionDraft)}
            variant="outlined"
            sx={{
              color: 'var(--neotech-primary)',
              borderColor: 'var(--neotech-primary)',
              fontFamily: "'Rajdhani', monospace",
              fontWeight: 600,
              '&:hover': { backgroundColor: 'rgba(0, 255, 255, 0.08)' },
            }}
          >
            Save Description
          </Button>
        </Box>

        <Divider sx={{ backgroundColor: 'var(--neotech-border)', opacity: 0.5, mb: 2 }} />

        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
          <Typography sx={{ color: 'var(--neotech-text-secondary)', fontFamily: "'Rajdhani', monospace", fontWeight: 600 }}>
            Forces ({forcesSorted.length})
          </Typography>
          <Button
            onClick={onAddForce}
            variant="contained"
            sx={{
              background: 'linear-gradient(135deg, rgba(0, 255, 255, 0.3), rgba(0, 153, 204, 0.3))',
              color: 'var(--neotech-primary)',
              fontFamily: "'Rajdhani', monospace",
              fontWeight: 700,
              border: '1px solid var(--neotech-primary)',
              '&:hover': { boxShadow: 'var(--neotech-glow-medium)' },
            }}
          >
            Add Force
          </Button>
        </Box>

        <Box
          sx={{
            border: '1px solid var(--neotech-border)',
            borderRadius: 1,
            overflow: 'hidden',
            background: 'rgba(0, 17, 34, 0.6)',
          }}
        >
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ color: 'var(--neotech-text-secondary)', fontFamily: "'Rajdhani', monospace" }}>Icon</TableCell>
                <TableCell sx={{ color: 'var(--neotech-text-secondary)', fontFamily: "'Rajdhani', monospace" }}>Name</TableCell>
                <TableCell sx={{ color: 'var(--neotech-text-secondary)', fontFamily: "'Rajdhani', monospace" }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {forcesSorted.map((f) => {
                const fIconUrl = f?.icon_path && apiBaseUrl ? buildUnitIconUrl(apiBaseUrl, f.icon_path) : null;
                return (
                  <TableRow key={f.id} hover>
                    <TableCell>
                      {fIconUrl && (
                        <Box
                          component="img"
                          src={fIconUrl}
                          alt={f.icon_path}
                          sx={{ width: 28, height: 28, borderRadius: 0.5, border: '1px solid var(--neotech-border)', background: 'rgba(0,0,0,0.25)' }}
                        />
                      )}
                    </TableCell>
                    <TableCell sx={{ color: 'var(--neotech-text-primary)', fontFamily: "'Rajdhani', monospace" }}>
                      {f.name}
                    </TableCell>
                    <TableCell>
                      <Button
                        onClick={() => onBeginDeployForce(f)}
                        variant="outlined"
                        sx={{
                          color: 'var(--neotech-primary)',
                          borderColor: 'var(--neotech-primary)',
                          fontFamily: "'Rajdhani', monospace",
                          fontWeight: 600,
                          '&:hover': { backgroundColor: 'rgba(0, 255, 255, 0.08)' },
                        }}
                      >
                        Deploy to map
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {forcesSorted.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} sx={{ color: 'var(--neotech-text-secondary)', fontFamily: "'Rajdhani', monospace" }}>
                    No forces yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Box>
      </DialogContent>

      <DialogActions sx={{ p: 2, borderTop: '1px solid var(--neotech-border)' }}>
        <Button
          onClick={onClose}
          variant="outlined"
          sx={{
            color: 'var(--neotech-text-secondary)',
            borderColor: 'var(--neotech-border)',
            fontFamily: "'Rajdhani', monospace",
            fontWeight: 600,
            '&:hover': { borderColor: 'var(--neotech-primary)', backgroundColor: 'rgba(0, 255, 255, 0.1)' },
          }}
        >
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default UnitDetailsDialog;


