import { useRef, useEffect, useState, useCallback } from "react";
import { io } from 'socket.io-client';
import { Box, Typography, Chip, Button, Alert, Snackbar, CircularProgress } from '@mui/material';
import ExitToAppIcon from '@mui/icons-material/ExitToApp';
import GroupIcon from '@mui/icons-material/Group';
import LogoutIcon from '@mui/icons-material/Logout';

import HexGrid from './HexGrid';
import RoomManager from './RoomManager';
import AuthManager from './AuthManager';

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
        username: null
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
                        username: data.username
                    });
                } else {
                    // Token invalid, clear storage
                    localStorage.removeItem('auth_token');
                    localStorage.removeItem('username');
                    setAuthState({
                        isAuthenticated: false,
                        token: null,
                        username: null
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
                    username: null
                });
            });
        } else {
            setAuthState({
                isAuthenticated: false,
                token: null,
                username: null
            });
        }
    }, []);

    useEffect(() => {
        // Only initialize socket after auth state is determined
        if (authState.isAuthenticated === null) return;

        const sock = io(getApiBaseUrl(), {
            path: "/ws/socket.io/",
            transports: ['websocket'],
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
            username: authData.username
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
            username: null
        });

        // Clear room data
        setRoomData(null);
        setConnectedUsers([]);

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

    // Show auth state loading
    if (authState.isAuthenticated === null) {
        return (
            <Box sx={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                minHeight: '100vh',
                backgroundColor: '#f5f5f5'
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
                    backgroundColor: '#f5f5f5'
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
                backgroundColor: 'primary.main',
                color: 'white',
                boxShadow: 1
            }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
                        🗺️ {roomData.roomName || 'Room'}: {roomData.roomId}
                    </Typography>
                    <Chip 
                        icon={<GroupIcon />}
                        label={`${connectedUsers.length} user${connectedUsers.length !== 1 ? 's' : ''}`}
                        color="secondary"
                        size="small"
                    />
                    {roomData.is_owner && (
                        <Chip 
                            label="OWNER" 
                            color="success" 
                            size="small"
                            sx={{ fontSize: '10px' }}
                        />
                    )}
                </Box>
                
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Typography variant="body2">
                        Welcome, {authState.username || roomData.userName}!
                        {authState.isAuthenticated && <> (Authenticated)</>}
                    </Typography>
                    <Button
                        variant="outlined"
                        color="inherit"
                        size="small"
                        onClick={handleLeaveRoom}
                        disabled={isLeavingRoom}
                        startIcon={isLeavingRoom ? <CircularProgress size={16} /> : <ExitToAppIcon />}
                        sx={{ 
                            borderColor: 'white',
                            '&:hover': { 
                                borderColor: 'white',
                                backgroundColor: 'rgba(255,255,255,0.1)'
                            }
                        }}
                    >
                        {isLeavingRoom ? 'Leaving...' : 'Leave Room'}
                    </Button>
                    {authState.isAuthenticated && (
                        <Button
                            variant="outlined"
                            color="inherit"
                            size="small"
                            onClick={handleLogout}
                            startIcon={<LogoutIcon />}
                            sx={{ 
                                borderColor: 'white',
                                '&:hover': { 
                                    borderColor: 'white',
                                    backgroundColor: 'rgba(255,255,255,0.1)'
                                }
                            }}
                        >
                            Logout
                        </Button>
                    )}
                </Box>
            </Box>

            {/* Connected Users Info */}
            {connectedUsers.length > 1 && (
                <Box sx={{ 
                    px: 2, 
                    py: 1, 
                    backgroundColor: '#f5f5f5', 
                    borderBottom: '1px solid #ddd' 
                }}>
                    <Typography variant="body2" sx={{ fontSize: '12px' }}>
                        Connected users: {connectedUsers.map(user => 
                            `${user.name}${user.is_authenticated ? ' ✓' : ''}`
                        ).join(', ')}
                    </Typography>
                </Box>
            )}

            {/* Hex Grid */}
            <Box sx={{ flex: 1 }}>
                <HexGrid 
                    socket={socket.current}
                    roomData={roomData}
                    initialHexData={roomData.hexData}
                    initialLines={roomData.lines}
                />
            </Box>

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
