import React from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    Box,
    Typography,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Switch,
    CircularProgress,
    Alert,
    IconButton
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import RefreshIcon from '@mui/icons-material/Refresh';

const formatDetail = (detail) => {
    if (typeof detail === 'string') {
        return detail;
    }
    if (Array.isArray(detail)) {
        return detail.map((d) => d.msg || JSON.stringify(d)).join(', ');
    }
    if (detail && typeof detail === 'object') {
        return JSON.stringify(detail);
    }
    return String(detail);
};

const formatDbTime = (value) => {
    if (value == null || value === undefined) {
        return '—';
    }
    if (typeof value === 'number') {
        if (value > 1e12) {
            return new Date(value).toLocaleString();
        }
        if (value > 1e9) {
            return new Date(value * 1000).toLocaleString();
        }
    }
    return String(value);
};

const UserDatabaseDialog = ({ open, onClose, authToken, apiBaseUrl, currentUsername }) => {
    const [userRows, setUserRows] = React.useState([]);
    const [usersLoading, setUsersLoading] = React.useState(false);
    const [usersError, setUsersError] = React.useState(null);
    const [savingUsername, setSavingUsername] = React.useState(null);

    const loadUsers = React.useCallback(async () => {
        if (!authToken || !apiBaseUrl) {
            return;
        }
        setUsersLoading(true);
        setUsersError(null);
        try {
            const response = await fetch(`${apiBaseUrl}/api/admin/users`, {
                headers: { Authorization: `Bearer ${authToken}` }
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                const detail = data.detail !== undefined ? data.detail : data.message;
                setUsersError(formatDetail(detail) || `HTTP ${response.status}`);
                return;
            }
            setUserRows(Array.isArray(data.users) ? data.users : []);
        } catch (err) {
            setUsersError(err.message || String(err));
        } finally {
            setUsersLoading(false);
        }
    }, [authToken, apiBaseUrl]);

    React.useEffect(() => {
        if (open) {
            loadUsers();
        }
    }, [open, loadUsers]);

    const handleAdminToggle = async (rowUsername, nextIsAdmin) => {
        if (!authToken || !apiBaseUrl) {
            return;
        }
        setSavingUsername(rowUsername);
        setUsersError(null);
        try {
            const response = await fetch(
                `${apiBaseUrl}/api/admin/users/${encodeURIComponent(rowUsername)}`,
                {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${authToken}`
                    },
                    body: JSON.stringify({ is_admin: nextIsAdmin })
                }
            );
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                const detail = data.detail !== undefined ? data.detail : data.message;
                setUsersError(formatDetail(detail) || `HTTP ${response.status}`);
                return;
            }
            setUserRows((prev) =>
                prev.map((u) =>
                    u.username === rowUsername ? { ...u, is_admin: nextIsAdmin } : u
                )
            );
        } catch (err) {
            setUsersError(err.message || String(err));
        } finally {
            setSavingUsername(null);
        }
    };

    return (
        <Dialog
            open={open}
            onClose={onClose}
            maxWidth="md"
            fullWidth
            PaperProps={{
                sx: {
                    background: 'linear-gradient(135deg, rgba(0, 17, 34, 0.98), rgba(0, 8, 17, 0.99))',
                    border: '2px solid var(--neotech-primary)',
                    boxShadow: '0 0 24px rgba(0, 255, 255, 0.35), inset 0 0 20px rgba(0, 0, 0, 0.5)',
                    backdropFilter: 'blur(10px)'
                }
            }}
        >
            <DialogTitle
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    color: 'var(--neotech-primary)',
                    fontFamily: "'Orbitron', monospace",
                    fontWeight: 'bold',
                    textShadow: 'var(--neotech-glow-small)',
                    borderBottom: '1px solid rgba(0, 255, 255, 0.2)',
                    pr: 1
                }}
            >
                Users (database)
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <IconButton
                        size="small"
                        onClick={() => loadUsers()}
                        disabled={usersLoading || !authToken}
                        aria-label="Refresh users"
                        sx={{ color: 'var(--neotech-primary)' }}
                    >
                        {usersLoading ? <CircularProgress size={20} /> : <RefreshIcon />}
                    </IconButton>
                    <IconButton size="small" onClick={onClose} aria-label="Close" sx={{ color: 'var(--neotech-text-secondary)' }}>
                        <CloseIcon />
                    </IconButton>
                </Box>
            </DialogTitle>
            <DialogContent sx={{ pt: 2 }}>
                {usersError && (
                    <Alert severity="error" sx={{ mb: 2 }} onClose={() => setUsersError(null)}>
                        {usersError}
                    </Alert>
                )}
                <TableContainer sx={{ maxHeight: 360 }}>
                    <Table size="small" stickyHeader>
                        <TableHead>
                            <TableRow>
                                <TableCell sx={{ color: 'var(--neotech-primary)', fontFamily: "'Rajdhani', monospace", fontWeight: 600, background: 'rgba(0, 17, 34, 0.95)' }}>
                                    User
                                </TableCell>
                                <TableCell sx={{ color: 'var(--neotech-primary)', fontFamily: "'Rajdhani', monospace", fontWeight: 600, background: 'rgba(0, 17, 34, 0.95)' }}>
                                    Created
                                </TableCell>
                                <TableCell sx={{ color: 'var(--neotech-primary)', fontFamily: "'Rajdhani', monospace", fontWeight: 600, background: 'rgba(0, 17, 34, 0.95)' }}>
                                    Last login
                                </TableCell>
                                <TableCell align="right" sx={{ color: 'var(--neotech-primary)', fontFamily: "'Rajdhani', monospace", fontWeight: 600, background: 'rgba(0, 17, 34, 0.95)' }}>
                                    Admin
                                </TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {userRows.length === 0 && !usersLoading && (
                                <TableRow>
                                    <TableCell colSpan={4} sx={{ color: 'var(--neotech-text-secondary)', fontStyle: 'italic' }}>
                                        No users loaded
                                    </TableCell>
                                </TableRow>
                            )}
                            {userRows.map((row) => (
                                <TableRow key={row.username}>
                                    <TableCell sx={{ color: 'var(--neotech-text)', fontFamily: "'Rajdhani', monospace" }}>
                                        {row.username}
                                        {currentUsername && row.username === currentUsername ? ' (you)' : ''}
                                    </TableCell>
                                    <TableCell sx={{ color: 'var(--neotech-text-secondary)', fontSize: '0.75rem' }}>
                                        {formatDbTime(row.created_at)}
                                    </TableCell>
                                    <TableCell sx={{ color: 'var(--neotech-text-secondary)', fontSize: '0.75rem' }}>
                                        {formatDbTime(row.last_login)}
                                    </TableCell>
                                    <TableCell align="right">
                                        <Switch
                                            size="small"
                                            checked={Boolean(row.is_admin)}
                                            disabled={savingUsername === row.username}
                                            onChange={(e) => handleAdminToggle(row.username, e.target.checked)}
                                            sx={{
                                                '& .MuiSwitch-switchBase.Mui-checked': {
                                                    color: 'var(--neotech-success)',
                                                },
                                                '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                                                    backgroundColor: 'var(--neotech-success)',
                                                },
                                            }}
                                        />
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
                <Typography variant="caption" sx={{
                    color: 'var(--neotech-text-secondary)',
                    fontFamily: "'Rajdhani', monospace",
                    fontStyle: 'italic',
                    display: 'block',
                    mt: 2
                }}>
                    Toggle Admin to grant or revoke admin access. At least one admin must remain.
                </Typography>
            </DialogContent>
            <DialogActions sx={{ borderTop: '1px solid rgba(0, 255, 255, 0.2)', px: 2, py: 1.5 }}>
                <Button onClick={onClose} sx={{ color: 'var(--neotech-primary)', fontFamily: "'Orbitron', monospace" }}>
                    Close
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default UserDatabaseDialog;
