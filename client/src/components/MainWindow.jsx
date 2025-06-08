import { useRef, useEffect, useState, useCallback } from "react";
import { io } from 'socket.io-client';
import { Box, Typography, Chip, Button, Alert, Snackbar, CircularProgress } from '@mui/material';
import ExitToAppIcon from '@mui/icons-material/ExitToApp';
import GroupIcon from '@mui/icons-material/Group';
import LogoutIcon from '@mui/icons-material/Logout';
import SaveIcon from '@mui/icons-material/Save';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import GetAppIcon from '@mui/icons-material/GetApp';
import PublishIcon from '@mui/icons-material/Publish';
import HelpIcon from '@mui/icons-material/Help';

import HexGrid from './HexGrid';
import RoomManager from './RoomManager';
import AuthManager from './AuthManager';
import AdminPanel from './AdminPanel';

const MainWindow = () => {
    const socket = useRef(null);
    const [roomData, setRoomData] = useState(null);
    const [connectedUsers, setConnectedUsers] = useState([]);
    const [userActivity, setUserActivity] = useState('');
    const [showActivityMessage, setShowActivityMessage] = useState(false);
    const [isSocketReady, setIsSocketReady] = useState(false);
    const [isLeavingRoom, setIsLeavingRoom] = useState(false);
    const [authState, setAuthState] = useState({
        isAuthenticated: null, // null = checking, true = authenticated, false = not authenticated
        token: null,
        username: null,
        isAdmin: false
    });
    const [showBackground, setShowBackground] = useState(true);
    const [adminData, setAdminData] = useState({
        availableRooms: [],
        roomToggles: {},
        isAdminRoom: false
    });

    // Get API base URL based on environment
    const getApiBaseUrl = () => {
        if (process.env.NODE_ENV === 'production') {
            return window.location.origin; // Use same domain as served from
        }
        return 'http://localhost:8000'; // Development server
    };

    // Check for existing authentication on component mount
    useEffect(() => {
        const token = localStorage.getItem('auth_token');
        const username = localStorage.getItem('username');
        
        if (token && username) {
            // Verify token with server
            fetch(`${getApiBaseUrl()}/api/verify-token`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            })
            .then(response => response.json())
            .then(data => {
                if (data.valid) {
                    setAuthState({
                        isAuthenticated: true,
                        token: token,
                        username: data.username,
                        isAdmin: data.is_admin || false
                    });
                } else {
                    // Token invalid, clear storage
                    localStorage.removeItem('auth_token');
                    localStorage.removeItem('username');
                    setAuthState({
                        isAuthenticated: false,
                        token: null,
                        username: null,
                        isAdmin: false
                    });
                }
            })
            .catch(error => {
                console.error('Token verification failed:', error);
                // Clear storage on error
                localStorage.removeItem('auth_token');
                localStorage.removeItem('username');
                setAuthState({
                    isAuthenticated: false,
                    token: null,
                    username: null,
                    isAdmin: false
                });
            });
        } else {
            setAuthState({
                isAuthenticated: false,
                token: null,
                username: null,
                isAdmin: false
            });
        }
    }, []);

    useEffect(() => {
        // Only initialize socket after auth state is determined
        if (authState.isAuthenticated === null) return;

        const sock = io(getApiBaseUrl(), {
            path: "/ws/socket.io/",
            transports: ['websocket', 'polling'],
          });
        socket.current = sock;
        
        socket.current.on("connect", () => {
            console.log("Connected to server");
            setIsSocketReady(true);
            
            // Authenticate with server if we have a token
            if (authState.isAuthenticated && authState.token) {
                socket.current.emit('authenticate', { token: authState.token });
            }
        });
        
        socket.current.on('disconnect', (reason) => {
            console.log('WebSocket disconnected:', reason);
            setIsSocketReady(false);
        });

        socket.current.on('connect_error', (error) => {
            console.error('Connection error:', error);
            setIsSocketReady(false);
        });

        socket.current.on('auth_success', (data) => {
            console.log('Socket authentication successful:', data.username);
        });

        socket.current.on('auth_error', (data) => {
            console.error('Socket authentication failed:', data.message);
            // Handle auth error by logging out
            handleLogout();
        });

        // Admin room event handlers are now handled in RoomManager

        socket.current.on('admin_room_data_updated', (data) => {
            setRoomData(prev => ({
                ...prev,
                hexData: data.hex_data,
                lines: data.lines
            }));
            setAdminData(prev => ({
                ...prev,
                roomToggles: data.room_toggles
            }));
            
            if (data.toggled_room_name && data.hasOwnProperty('enabled')) {
                setUserActivity(`${data.toggled_room_name} visibility ${data.enabled ? 'enabled' : 'disabled'}`);
                setShowActivityMessage(true);
            }
        });

        socket.current.on('admin_error', (data) => {
            setUserActivity(`Admin Error: ${data.message}`);
            setShowActivityMessage(true);
        });

        // Cleanup on unmount
        return () => {
            if (socket.current) {
                socket.current.disconnect();
            }
        };
    }, [authState.isAuthenticated, authState.token]);

    const handleAuthSuccess = useCallback((authData) => {
        setAuthState({
            isAuthenticated: authData.isAuthenticated,
            token: authData.token,
            username: authData.username,
            isAdmin: authData.isAdmin || false
        });
    }, []);

    const handleLogout = useCallback(async () => {
        if (authState.token) {
            try {
                await fetch(`${getApiBaseUrl()}/api/logout`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${authState.token}`
                    }
                });
            } catch (error) {
                console.error('Logout request failed:', error);
            }
        }

        // Clear local storage
        localStorage.removeItem('auth_token');
        localStorage.removeItem('username');

        // Clear auth state
        setAuthState({
            isAuthenticated: false,
            token: null,
            username: null,
            isAdmin: false
        });

        // Clear room data
        setRoomData(null);
        setConnectedUsers([]);
        setAdminData({
            availableRooms: [],
            roomToggles: {},
            isAdminRoom: false
        });

        // Disconnect socket if connected
        if (socket.current) {
            socket.current.disconnect();
        }
    }, [authState.token]);

    // Handle joining a room successfully
    const handleRoomJoined = useCallback((data) => {
        setRoomData(data);
        setConnectedUsers(data.users || []);
        
        // Set up room-specific socket listeners
        if (socket.current) {
            // Clean up any existing listeners first
            socket.current.off('user_joined');
            socket.current.off('user_left');
            socket.current.off('hex_updated');
            socket.current.off('line_added');
            socket.current.off('hex_erased');
            socket.current.off('room_left');

            // Listen for other users joining
            socket.current.on('user_joined', (userData) => {
                setConnectedUsers(prev => [...prev, { name: userData.user_name, is_authenticated: userData.is_authenticated }]);
                setUserActivity(`${userData.user_name} joined the room`);
                setShowActivityMessage(true);
            });

            // Listen for users leaving
            socket.current.on('user_left', (userData) => {
                setConnectedUsers(prev => prev.filter(user => user.name !== userData.user_name));
                setUserActivity(`${userData.user_name} left the room`);
                setShowActivityMessage(true);
            });

            // Listen for hex updates from other users
            socket.current.on('hex_updated', (data) => {
                // This will be handled by HexGrid component
                setUserActivity(`${data.user_name} painted a hex`);
                setShowActivityMessage(true);
            });

            // Listen for line additions from other users
            socket.current.on('line_added', (data) => {
                // This will be handled by HexGrid component
                setUserActivity(`${data.user_name} drew a line`);
                setShowActivityMessage(true);
            });

            // Listen for erasing from other users
            socket.current.on('hex_erased', (data) => {
                // This will be handled by HexGrid component
                setUserActivity(`${data.user_name} erased something`);
                setShowActivityMessage(true);
            });

            // Listen for room left confirmation
            socket.current.on('room_left', (data) => {
                if (data.success) {
                    console.log('Successfully left room');
                    setRoomData(null);
                    setConnectedUsers([]);
                    setIsLeavingRoom(false);
                    setAdminData({
                        availableRooms: [],
                        roomToggles: {},
                        isAdminRoom: false
                    });
                }
            });
        }
    }, []);

    // Handle joining an admin room successfully
    const handleAdminRoomJoined = useCallback((data) => {
        console.log('Admin room joined data:', data);
        console.log('Available rooms:', data.available_rooms);
        console.log('Room toggles:', data.room_toggles);
        
        setRoomData(data);
        setConnectedUsers(data.users || []);
        setAdminData({
            availableRooms: data.available_rooms || [],
            roomToggles: data.room_toggles || {},
            isAdminRoom: true
        });
        
        console.log('Admin data set to:', {
            availableRooms: data.available_rooms || [],
            roomToggles: data.room_toggles || {},
            isAdminRoom: true
        });
        
        // Set up admin room-specific socket listeners
        if (socket.current) {
            // Clean up any existing listeners first
            socket.current.off('user_joined');
            socket.current.off('user_left');
            socket.current.off('room_left');

            // Listen for other users joining admin room
            socket.current.on('user_joined', (userData) => {
                setConnectedUsers(prev => [...prev, { name: userData.user_name, is_authenticated: userData.is_authenticated }]);
                setUserActivity(`Admin ${userData.user_name} joined the admin room`);
                setShowActivityMessage(true);
            });

            // Listen for users leaving admin room
            socket.current.on('user_left', (userData) => {
                setConnectedUsers(prev => prev.filter(user => user.name !== userData.user_name));
                setUserActivity(`Admin ${userData.user_name} left the admin room`);
                setShowActivityMessage(true);
            });

            // Listen for room left confirmation
            socket.current.on('room_left', (data) => {
                if (data.success) {
                    console.log('Successfully left admin room');
                    setRoomData(null);
                    setConnectedUsers([]);
                    setIsLeavingRoom(false);
                    setAdminData({
                        availableRooms: [],
                        roomToggles: {},
                        isAdminRoom: false
                    });
                }
            });
        }
    }, []);

    const handleLeaveRoom = () => {
        if (socket.current && !isLeavingRoom) {
            setIsLeavingRoom(true);
            
            // Clean up listeners
            socket.current.off('user_joined');
            socket.current.off('user_left');
            socket.current.off('hex_updated');
            socket.current.off('line_added');
            socket.current.off('hex_erased');
            
            // Just emit leave room event - don't disconnect socket
            socket.current.emit('leave_room');
        }
    };

    const handleCloseActivityMessage = () => {
        setShowActivityMessage(false);
    };

    const handleBackgroundToggle = (show) => {
        setShowBackground(show);
    };

    // Save Room Data to File
    const handleSaveRoom = useCallback(() => {
        if (!roomData) return;

        // Add a small delay to ensure all state updates have been processed
        setTimeout(() => {
            const dataToSave = {
                roomName: roomData.roomName,
                roomId: roomData.roomId,
                hexData: roomData.hexData,
                lines: roomData.lines,
                savedAt: new Date().toISOString()
            };

            const blob = new Blob([JSON.stringify(dataToSave, null, 2)], {
                type: 'application/json'
            });

            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${roomData.roomName || roomData.roomId}_map.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            setUserActivity(`Room saved as ${link.download}`);
            setShowActivityMessage(true);
        }, 200); // 200ms delay to ensure state updates are complete
    }, [roomData]);

    // Load Room Data from File
    const handleLoadRoom = useCallback(() => {
        if (!socket.current || !roomData) return;

        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (event) => {
            const file = event.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const importedData = JSON.parse(e.target.result);
                    
                    // Validate the imported data structure
                    if (importedData.hexData && importedData.lines) {
                        // First, clear all existing hex data by resetting them to default
                        Object.keys(roomData.hexData).forEach(hexKey => {
                            if (roomData.hexData[hexKey].fillColor !== 'lightgray') {
                                socket.current.emit('hex_update', {
                                    hex_key: hexKey,
                                    fill_color: 'lightgray'
                                });
                            }
                        });

                        // Clear all existing lines
                        if (roomData.lines && roomData.lines.length > 0) {
                            socket.current.emit('clear_lines');
                        }

                        // Update local room data with cleared state first
                        setRoomData(prev => ({
                            ...prev,
                            hexData: Object.keys(prev.hexData).reduce((acc, key) => {
                                acc[key] = { ...prev.hexData[key], fillColor: 'lightgray' };
                                return acc;
                            }, {}),
                            lines: []
                        }));

                        // Wait a moment for clearing to sync, then load new data
                        setTimeout(() => {
                            // Update local room data with imported data
                            setRoomData(prev => ({
                                ...prev,
                                hexData: importedData.hexData,
                                lines: importedData.lines
                            }));

                            // Sync hex data with other users
                            Object.entries(importedData.hexData).forEach(([hexKey, hexInfo]) => {
                                if (hexInfo.fillColor && hexInfo.fillColor !== 'lightgray') {
                                    socket.current.emit('hex_update', {
                                        hex_key: hexKey,
                                        fill_color: hexInfo.fillColor
                                    });
                                }
                            });

                            // Sync lines with other users
                            importedData.lines.forEach(line => {
                                socket.current.emit('line_add', {
                                    line: line
                                });
                            });
                        }, 100);
                        
                        setUserActivity(`Room data loaded from ${file.name}`);
                        setShowActivityMessage(true);
                    } else {
                        setUserActivity('Invalid room data file format');
                        setShowActivityMessage(true);
                    }
                } catch (error) {
                    setUserActivity('Error reading room data file');
                    setShowActivityMessage(true);
                }
            };
            reader.readAsText(file);
        };
        input.click();
    }, [roomData]);

    // Show Help
    const handleHelp = useCallback(() => {
        // This would open a help dialog or guide
        setUserActivity('Help: Use tools on the left to paint and draw. Mouse wheel to zoom, right-click to pan.');
        setShowActivityMessage(true);
    }, []);

    // Show auth state loading
    if (authState.isAuthenticated === null) {
        return (
            <Box sx={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                minHeight: '100vh',
                backgroundImage: 'url(/static/background.jpg)',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                backgroundRepeat: 'no-repeat'
            }}>
                <Box sx={{ textAlign: 'center' }}>
                    <CircularProgress size={40} sx={{ mb: 2 }} />
                    <Typography variant="h6" color="text.secondary">
                        Checking authentication...
                    </Typography>
                </Box>
            </Box>
        );
    }

    // Show authentication screen
    if (authState.isAuthenticated === false) {
        return <AuthManager onAuthSuccess={handleAuthSuccess} />;
    }

    // If not in a room, show room manager
    if (!roomData) {
        // Show loading while socket is connecting
        if (!isSocketReady) {
            return (
                <Box sx={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    minHeight: '100vh',
                    backgroundImage: 'url(/static/background.jpg)',
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    backgroundRepeat: 'no-repeat'
                }}>
                    <Box sx={{ textAlign: 'center' }}>
                        <CircularProgress size={40} sx={{ mb: 2 }} />
                        <Typography variant="h6" color="text.secondary">
                            Connecting to server...
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                            Please make sure the server is running
                        </Typography>
                    </Box>
                </Box>
            );
        }

        return (
            <RoomManager 
                socket={socket.current} 
                onRoomJoined={handleRoomJoined}
                onAdminRoomJoined={handleAdminRoomJoined}
                authState={authState}
                onLogout={handleLogout}
            />
        );
    }

    // If in a room, show the hex grid with room info
    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
            {/* Room Header */}
            <Box sx={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                p: 2, 
                background: 'linear-gradient(135deg, rgba(0, 17, 34, 0.95), rgba(0, 8, 17, 0.98))',
                border: '1px solid var(--neotech-border)',
                borderBottom: '2px solid var(--neotech-primary)',
                boxShadow: '0 0 20px rgba(0, 255, 255, 0.3)',
                color: 'var(--neotech-text)',
                position: 'relative'
            }}>
                {/* Animated bottom border */}
                <Box sx={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: '2px',
                    background: 'linear-gradient(90deg, transparent, var(--neotech-primary), transparent)',
                    animation: 'neotech-scan 3s ease-in-out infinite'
                }} />

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, position: 'relative', zIndex: 1 }}>
                    <Typography variant="h6" sx={{ 
                        fontWeight: 'bold',
                        color: 'var(--neotech-primary)',
                        textShadow: 'var(--neotech-glow-small)',
                        fontFamily: "'Orbitron', monospace",
                        textTransform: 'uppercase',
                        letterSpacing: '1px'
                    }}>
                        🗺️ {roomData.roomName || 'Room'}: {roomData.roomId}
                    </Typography>
                    <Chip 
                        icon={<GroupIcon />}
                        label={`${connectedUsers.length} user${connectedUsers.length !== 1 ? 's' : ''}`}
                        sx={{
                            background: 'rgba(0, 255, 255, 0.2)',
                            border: '1px solid var(--neotech-primary)',
                            color: 'var(--neotech-primary)',
                            fontFamily: "'Rajdhani', monospace",
                            fontWeight: 600,
                            boxShadow: 'var(--neotech-glow-small)'
                        }}
                        size="small"
                    />
                    {roomData.is_owner && (
                        <Chip 
                            label="OWNER" 
                            sx={{
                                background: 'rgba(0, 255, 136, 0.2)',
                                border: '1px solid var(--neotech-success)',
                                color: 'var(--neotech-success)',
                                fontFamily: "'Rajdhani', monospace",
                                fontWeight: 600,
                                fontSize: '10px',
                                boxShadow: '0 0 5px rgba(0, 255, 136, 0.3)'
                            }}
                            size="small"
                        />
                    )}
                </Box>

                {/* Action Buttons */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, position: 'relative', zIndex: 1 }}>
                    <Button
                        variant="outlined"
                        size="small"
                        onClick={handleSaveRoom}
                        startIcon={<SaveIcon />}
                        sx={{ 
                            border: '1px solid var(--neotech-success)',
                            color: 'var(--neotech-success)',
                            background: 'rgba(0, 255, 136, 0.1)',
                            fontFamily: "'Orbitron', monospace",
                            fontWeight: 600,
                            textTransform: 'uppercase',
                            fontSize: '10px',
                            minWidth: 'auto',
                            px: 1,
                            transition: 'all 0.3s ease',
                            '&:hover': { 
                                background: 'rgba(0, 255, 136, 0.2)',
                                boxShadow: '0 0 10px rgba(0, 255, 136, 0.3)',
                                transform: 'translateY(-1px)'
                            }
                        }}
                    >
                        Save
                    </Button>
                    <Button
                        variant="outlined"
                        size="small"
                        onClick={handleLoadRoom}
                        startIcon={<FolderOpenIcon />}
                        sx={{ 
                            border: '1px solid var(--neotech-warning)',
                            color: 'var(--neotech-warning)',
                            background: 'rgba(255, 170, 0, 0.1)',
                            fontFamily: "'Orbitron', monospace",
                            fontWeight: 600,
                            textTransform: 'uppercase',
                            fontSize: '10px',
                            minWidth: 'auto',
                            px: 1,
                            transition: 'all 0.3s ease',
                            '&:hover': { 
                                background: 'rgba(255, 170, 0, 0.2)',
                                boxShadow: '0 0 10px rgba(255, 170, 0, 0.3)',
                                transform: 'translateY(-1px)'
                            }
                        }}
                    >
                        Load
                    </Button>

                    <Button
                        variant="outlined"
                        size="small"
                        onClick={handleHelp}
                        startIcon={<HelpIcon />}
                        sx={{ 
                            border: '1px solid var(--neotech-border)',
                            color: 'var(--neotech-text-secondary)',
                            background: 'rgba(0, 17, 34, 0.8)',
                            fontFamily: "'Orbitron', monospace",
                            fontWeight: 600,
                            textTransform: 'uppercase',
                            fontSize: '10px',
                            minWidth: 'auto',
                            px: 1,
                            transition: 'all 0.3s ease',
                            '&:hover': { 
                                background: 'rgba(0, 255, 255, 0.2)',
                                borderColor: 'var(--neotech-primary)',
                                color: 'var(--neotech-primary)',
                                boxShadow: 'var(--neotech-glow-small)'
                            }
                        }}
                    >
                        Help
                    </Button>
                </Box>
                
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, position: 'relative', zIndex: 1 }}>
                    <Typography variant="body2" sx={{
                        color: 'var(--neotech-text-secondary)',
                        fontFamily: "'Rajdhani', monospace",
                        fontWeight: 500
                    }}>
                        Welcome, {authState.username || roomData.userName}!
                        {authState.isAuthenticated && <> (Authenticated)</>}
                    </Typography>
                    <Button
                        variant="outlined"
                        size="small"
                        onClick={handleLeaveRoom}
                        disabled={isLeavingRoom}
                        startIcon={isLeavingRoom ? <CircularProgress size={16} sx={{ color: 'var(--neotech-primary)' }} /> : <ExitToAppIcon />}
                        sx={{ 
                            border: '1px solid var(--neotech-primary)',
                            color: 'var(--neotech-primary)',
                            background: 'rgba(0, 255, 255, 0.1)',
                            fontFamily: "'Orbitron', monospace",
                            fontWeight: 600,
                            textTransform: 'uppercase',
                            fontSize: '11px',
                            transition: 'all 0.3s ease',
                            '&:hover': { 
                                background: 'rgba(0, 255, 255, 0.2)',
                                boxShadow: 'var(--neotech-glow-medium)',
                                transform: 'translateY(-1px)'
                            },
                            '&:disabled': {
                                border: '1px solid rgba(0, 255, 255, 0.3)',
                                color: 'rgba(0, 255, 255, 0.5)'
                            }
                        }}
                    >
                        {isLeavingRoom ? 'Leaving...' : 'Leave Room'}
                    </Button>
                    {authState.isAuthenticated && (
                        <Button
                            variant="outlined"
                            size="small"
                            onClick={handleLogout}
                            startIcon={<LogoutIcon />}
                            sx={{ 
                                border: '1px solid var(--neotech-border)',
                                color: 'var(--neotech-text-secondary)',
                                background: 'rgba(0, 17, 34, 0.8)',
                                fontFamily: "'Orbitron', monospace",
                                fontWeight: 600,
                                textTransform: 'uppercase',
                                fontSize: '11px',
                                transition: 'all 0.3s ease',
                                '&:hover': { 
                                    background: 'rgba(255, 51, 102, 0.2)',
                                    borderColor: 'var(--neotech-error)',
                                    color: 'var(--neotech-error)',
                                    boxShadow: '0 0 10px rgba(255, 51, 102, 0.3)'
                                }
                            }}
                        >
                            Logout
                        </Button>
                    )}
                </Box>
            </Box>

            {/* Connected Users Info with Colors */}
            {(connectedUsers.length >= 1 || roomData) && (
                <Box sx={{ 
                    px: 2, 
                    py: 1, 
                    background: 'rgba(0, 17, 34, 0.9)',
                    border: '1px solid var(--neotech-border)',
                    borderTop: 'none',
                    borderBottom: '1px solid var(--neotech-primary)',
                    boxShadow: 'inset 0 0 10px rgba(0, 0, 0, 0.5)'
                }}>
                    <Box sx={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: 1, 
                        flexWrap: 'wrap' 
                    }}>
                        <Typography variant="body2" sx={{ 
                            fontSize: '12px',
                            color: 'var(--neotech-text-secondary)',
                            fontFamily: "'Rajdhani', monospace",
                            marginRight: 1
                        }}>
                            Connected users:
                        </Typography>
                        {(connectedUsers.length > 0 ? connectedUsers : [{ name: authState.username || roomData?.userName || 'You', is_authenticated: authState.isAuthenticated }]).map(user => {
                            // Generate the same color as in HexGrid
                            const getColorForUser = (name) => {
                                let hash1 = 0;
                                let hash2 = 0;
                                for (let i = 0; i < name.length; i++) {
                                    hash1 = ((hash1 << 5) - hash1 + name.charCodeAt(i)) & 0xffffffff;
                                    hash2 = ((hash2 << 3) - hash2 + name.charCodeAt(i) * 7) & 0xffffffff;
                                }
                                const hue = Math.abs(hash1) % 360;
                                const saturation = 60 + (Math.abs(hash2) % 30);
                                const lightness = 45 + (Math.abs(hash1 + hash2) % 25);
                                return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
                            };
                            
                            const userColor = getColorForUser(user.name);
                            
                            return (
                                <Box key={user.name} sx={{ 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    gap: 0.5,
                                    px: 1,
                                    py: 0.5,
                                    borderRadius: 1,
                                    background: 'rgba(0, 0, 0, 0.3)',
                                    border: `1px solid ${userColor}`,
                                }}>
                                    <Box sx={{
                                        width: 12,
                                        height: 12,
                                        borderRadius: '50%',
                                        backgroundColor: userColor,
                                        border: '1px solid white'
                                    }} />
                                    <Typography variant="body2" sx={{ 
                                        fontSize: '11px',
                                        color: userColor,
                                        fontFamily: "'Rajdhani', monospace",
                                        fontWeight: 600
                                    }}>
                                        {user.name}{user.is_authenticated ? ' ✓' : ''}
                                    </Typography>
                                </Box>
                            );
                        })}
                    </Box>
                </Box>
            )}

            {/* Hex Grid */}
            <Box sx={{ 
                flex: 1,
                backgroundImage: showBackground ? 'url(/static/cockpit2.png)' : 'none',
                backgroundSize: 'cover',
                backgroundPosition: 'left 160px center',
                backgroundRepeat: 'no-repeat'
            }}>
                <HexGrid 
                    socket={socket.current}
                    roomData={roomData}
                    initialHexData={roomData.hexData}
                    initialLines={roomData.lines}
                    connectedUsers={connectedUsers}
                    onBackgroundToggle={handleBackgroundToggle}
                />
            </Box>

            {/* Admin Panel */}
            {authState.isAdmin && adminData.isAdminRoom && (
                <AdminPanel
                    roomData={roomData}
                    availableRooms={adminData.availableRooms}
                    roomToggles={adminData.roomToggles}
                    socket={socket.current}
                />
            )}

            {/* Debug info for admin panel */}
            {console.log('Render check - authState.isAdmin:', authState.isAdmin, 'adminData.isAdminRoom:', adminData.isAdminRoom, 'adminData:', adminData)}

            {/* Activity Notifications */}
            <Snackbar
                open={showActivityMessage}
                autoHideDuration={3000}
                onClose={handleCloseActivityMessage}
                anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
            >
                <Alert 
                    onClose={handleCloseActivityMessage} 
                    severity="info" 
                    sx={{ width: '100%' }}
                >
                    {userActivity}
                </Alert>
            </Snackbar>
        </Box>
    );
}

export default MainWindow;
