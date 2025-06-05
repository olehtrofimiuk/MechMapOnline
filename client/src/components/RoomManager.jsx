import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Paper,
  Divider,
  Alert,
  Chip,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  CircularProgress
} from '@mui/material';
import PersonIcon from '@mui/icons-material/Person';
import GroupIcon from '@mui/icons-material/Group';
import AddIcon from '@mui/icons-material/Add';
import LoginIcon from '@mui/icons-material/Login';
import LogoutIcon from '@mui/icons-material/Logout';

const RoomManager = ({ socket, onRoomJoined, authState, onLogout }) => {
  const [userName, setUserName] = useState('');
  const [roomName, setRoomName] = useState('');
  const [roomId, setRoomId] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [availableRooms, setAvailableRooms] = useState([]);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!socket) return;

    // Track connection status
    const handleConnect = () => {
      setIsConnected(true);
      setError('');
      // Request available rooms when connected
      socket.emit('get_rooms');
    };

    const handleDisconnect = () => {
      setIsConnected(false);
      setError('Connection lost. Please refresh the page.');
    };

    // Listen for connection events
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);

    // Check if already connected
    if (socket.connected) {
      setIsConnected(true);
      socket.emit('get_rooms');
    }

    // Listen for room creation success
    socket.on('room_created', (data) => {
      setIsLoading(false);
      setSuccess(`Room "${data.room_name}" (${data.room_id}) created successfully!`);
      setError('');
      onRoomJoined({
        roomId: data.room_id,
        roomName: data.room_name,
        userName: data.user_name,
        is_owner: data.is_owner,
        hexData: data.hex_data,
        lines: data.lines,
        users: data.users
      });
    });

    // Listen for room join success
    socket.on('room_joined', (data) => {
      setIsLoading(false);
      setSuccess(`Joined room "${data.room_name}" (${data.room_id}) successfully!`);
      setError('');
      onRoomJoined({
        roomId: data.room_id,
        roomName: data.room_name,
        userName: data.user_name,
        is_owner: data.is_owner,
        hexData: data.hex_data,
        lines: data.lines,
        users: data.users
      });
    });

    // Listen for room errors
    socket.on('room_error', (data) => {
      setIsLoading(false);
      setError(data.message);
      setSuccess('');
    });

    // Listen for available rooms list
    socket.on('rooms_list', (data) => {
      setAvailableRooms(data.rooms);
    });

    // Cleanup listeners
    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('room_created');
      socket.off('room_joined');
      socket.off('room_error');
      socket.off('rooms_list');
    };
  }, [socket, onRoomJoined]);

  const handleCreateRoom = () => {
    if (!socket || !isConnected) {
      setError('Not connected to server. Please wait or refresh the page.');
      return;
    }

    // For authenticated users, we don't need a user name input
    if (!authState.isAuthenticated && !userName.trim()) {
      setError('Please enter your name');
      return;
    }

    setIsLoading(true);
    setError('');
    setSuccess('');
    
    socket.emit('create_room', {
      user_name: authState.isAuthenticated ? authState.username : userName.trim(),
      room_name: roomName.trim() || 'Unnamed Room'
    });
  };

  const handleJoinRoom = (targetRoomId = null) => {
    if (!socket || !isConnected) {
      setError('Not connected to server. Please wait or refresh the page.');
      return;
    }

    const roomToJoin = targetRoomId || roomId;
    
    // For authenticated users, we don't need a user name input
    if (!authState.isAuthenticated && !userName.trim()) {
      setError('Please enter your name');
      return;
    }

    if (!roomToJoin.trim()) {
      setError('Please enter a room ID');
      return;
    }

    setIsLoading(true);
    setError('');
    setSuccess('');
    
    socket.emit('join_room', {
      room_id: roomToJoin.trim().toUpperCase(),
      user_name: authState.isAuthenticated ? authState.username : userName.trim()
    });
  };

  const refreshRooms = () => {
    if (socket && isConnected) {
      socket.emit('get_rooms');
    }
  };

  const formatActivityTime = (hoursAgo) => {
    if (hoursAgo < 1) {
      const minutesAgo = Math.round(hoursAgo * 60);
      return minutesAgo <= 1 ? 'Just now' : `${minutesAgo}m ago`;
    } else if (hoursAgo < 24) {
      return `${Math.round(hoursAgo)}h ago`;
    } else {
      const daysAgo = Math.round(hoursAgo / 24);
      return `${daysAgo}d ago`;
    }
  };

  return (
    <Box sx={{ 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center', 
      minHeight: '100vh',
      backgroundColor: '#f5f5f5',
      padding: 2
    }}>
      <Paper sx={{ 
        maxWidth: 600, 
        width: '100%', 
        padding: 4,
        borderRadius: 2,
        boxShadow: 3
      }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Typography variant="h4" sx={{ 
            fontWeight: 'bold',
            color: 'primary.main'
          }}>
            🗺️ Hex Map Online
          </Typography>
          
          {authState.isAuthenticated && (
            <Button
              variant="outlined"
              size="small"
              onClick={onLogout}
              startIcon={<LogoutIcon />}
            >
              Logout
            </Button>
          )}
        </Box>

        <Typography variant="body1" sx={{ 
          textAlign: 'center', 
          mb: 3,
          color: 'text.secondary'
        }}>
          Collaborative hex grid mapping tool
        </Typography>

        {/* User Status */}
        <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1, mb: 2 }}>
          <Chip 
            label={isConnected ? 'Connected' : 'Connecting...'} 
            color={isConnected ? 'success' : 'warning'}
            size="small"
            icon={isConnected ? null : <CircularProgress size={16} />}
          />
          
          {authState.isAuthenticated && (
            <Chip 
              label={`Logged in as ${authState.username}`} 
              color="primary"
              size="small"
              icon={<PersonIcon />}
            />
          )}
        </Box>

        {/* User Name Input - Only for anonymous users */}
        {!authState.isAuthenticated && (
          <Box sx={{ mb: 3 }}>
            <TextField
              fullWidth
              label="Your Name"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              variant="outlined"
              disabled={isLoading || !isConnected}
              InputProps={{
                startAdornment: <PersonIcon sx={{ mr: 1, color: 'text.secondary' }} />
              }}
              onKeyPress={(e) => {
                if (e.key === 'Enter' && userName.trim() && isConnected) {
                  handleCreateRoom();
                }
              }}
            />
          </Box>
        )}

        {/* Room Name Input */}
        <Box sx={{ mb: 3 }}>
          <TextField
            fullWidth
            label="Room Name (Optional)"
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
            variant="outlined"
            disabled={isLoading || !isConnected}
            placeholder="e.g. My Campaign Map, Dungeon Level 1..."
            helperText="Leave empty for 'Unnamed Room'"
          />
        </Box>

        {/* Error/Success Messages */}
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

        {/* Create Room Button */}
        <Button
          fullWidth
          variant="contained"
          size="large"
          onClick={handleCreateRoom}
          disabled={(!authState.isAuthenticated && !userName.trim()) || isLoading || !isConnected}
          startIcon={isLoading ? <CircularProgress size={20} /> : <AddIcon />}
          sx={{ mb: 2 }}
        >
          {isLoading ? 'Creating...' : 'Create New Room'}
        </Button>

        <Divider sx={{ my: 3 }}>
          <Chip label="OR" />
        </Divider>

        {/* Join Room Section */}
        <Typography variant="h6" sx={{ mb: 2, fontWeight: 'bold' }}>
          Join Existing Room
        </Typography>

        <Box sx={{ display: 'flex', gap: 1, mb: 3 }}>
          <TextField
            fullWidth
            label="Room ID"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value.toUpperCase())}
            variant="outlined"
            disabled={isLoading || !isConnected}
            placeholder="e.g. ABC123"
            onKeyPress={(e) => {
              if (e.key === 'Enter' && 
                  (authState.isAuthenticated || userName.trim()) && 
                  roomId.trim() && 
                  isConnected) {
                handleJoinRoom();
              }
            }}
          />
          <Button
            variant="outlined"
            onClick={() => handleJoinRoom()}
            disabled={(!authState.isAuthenticated && !userName.trim()) || !roomId.trim() || isLoading || !isConnected}
            startIcon={<LoginIcon />}
            sx={{ minWidth: 100 }}
          >
            Join
          </Button>
        </Box>

        {/* Available Rooms */}
        {availableRooms.length > 0 && (
          <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
              <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
                Available Rooms ({availableRooms.length})
              </Typography>
              <Button 
                size="small" 
                onClick={refreshRooms} 
                variant="text"
                disabled={!isConnected}
              >
                Refresh
              </Button>
            </Box>
            
            <Paper variant="outlined" sx={{ maxHeight: 300, overflow: 'auto' }}>
              <List dense>
                {availableRooms.map((room) => (
                  <ListItem 
                    key={room.room_id}
                    button
                    onClick={() => handleJoinRoom(room.room_id)}
                    disabled={(!authState.isAuthenticated && !userName.trim()) || isLoading || !isConnected}
                    sx={{
                      borderLeft: room.is_active ? '4px solid #4caf50' : '4px solid #ff9800',
                      '&:hover': {
                        backgroundColor: 'rgba(0, 0, 0, 0.04)',
                      }
                    }}
                  >
                    <ListItemIcon>
                      <GroupIcon color={room.is_active ? 'success' : 'warning'} />
                    </ListItemIcon>
                    <ListItemText 
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
                            {room.name}
                          </Typography>
                          <Chip 
                            label={room.room_id} 
                            size="small" 
                            variant="outlined"
                            sx={{ fontSize: '10px' }}
                          />
                          {room.is_active && (
                            <Chip 
                              label="ACTIVE" 
                              size="small" 
                              color="success"
                              sx={{ fontSize: '9px' }}
                            />
                          )}
                          {room.owner !== 'Anonymous' && (
                            <Chip 
                              label={`Owner: ${room.owner}`} 
                              size="small" 
                              color="primary"
                              variant="outlined"
                              sx={{ fontSize: '9px' }}
                            />
                          )}
                        </Box>
                      }
                      secondary={
                        <Box sx={{ mt: 0.5 }}>
                          <Typography variant="caption" sx={{ display: 'block' }}>
                            {room.users_count} user{room.users_count !== 1 ? 's' : ''} 
                            {room.is_active ? ' online' : ' • Last activity: ' + formatActivityTime(room.hours_since_activity)}
                          </Typography>
                        </Box>
                      }
                    />
                  </ListItem>
                ))}
              </List>
            </Paper>
          </Box>
        )}

        {availableRooms.length === 0 && isConnected && (
          <Box sx={{ textAlign: 'center', py: 2 }}>
            <Typography variant="body2" color="text.secondary">
              No rooms found. Create a new room to get started!
            </Typography>
          </Box>
        )}

        {!isConnected && (
          <Box sx={{ textAlign: 'center', py: 2 }}>
            <Typography variant="body2" color="text.secondary">
              Connecting to server...
            </Typography>
          </Box>
        )}
      </Paper>
    </Box>
  );
};

export default RoomManager; 