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
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';

const RoomManager = ({ socket, onRoomJoined, onAdminRoomJoined, authState, onLogout }) => {
  const [userName, setUserName] = useState('');
  const [roomName, setRoomName] = useState('');
  const [roomId, setRoomId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [availableRooms, setAvailableRooms] = useState([]);
  const [adminRooms, setAdminRooms] = useState([]);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!socket) return;

    // Track connection status
    const handleConnect = () => {
      setIsConnected(true);
      setError('');
      // Request available rooms when connected
      socket.emit('get_rooms');
      // Request admin rooms if user is admin
      if (authState.isAdmin) {
        socket.emit('get_admin_rooms');
      }
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
      if (authState.isAdmin) {
        socket.emit('get_admin_rooms');
      }
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
        units: data.units || [],
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
        units: data.units || [],
        users: data.users
      });
    });

    // Listen for admin room events
    socket.on('admin_room_created', (data) => {
      console.log('Admin room created event received:', data);
      setIsLoading(false);
      setSuccess(`Admin room "${data.room_name}" (${data.room_id}) created successfully!`);
      setError('');
      if (onAdminRoomJoined) {
        console.log('Calling onAdminRoomJoined callback');
        onAdminRoomJoined({
          roomId: data.room_id,
          roomName: data.room_name,
          userName: data.user_name,
          is_owner: data.is_owner,
          hexData: data.hex_data,
          lines: data.lines,
          units: data.units || [],
          users: data.users,
          available_rooms: data.available_rooms,
          room_toggles: data.room_toggles,
          isAdminRoom: true
        });
      }
    });

    socket.on('admin_room_joined', (data) => {
      setIsLoading(false);
      setSuccess(`Joined admin room "${data.room_name}" (${data.room_id}) successfully!`);
      setError('');
      if (onAdminRoomJoined) {
        onAdminRoomJoined({
          roomId: data.room_id,
          roomName: data.room_name,
          userName: data.user_name,
          is_owner: data.is_owner,
          hexData: data.hex_data,
          lines: data.lines,
          units: data.units || [],
          users: data.users,
          available_rooms: data.available_rooms,
          room_toggles: data.room_toggles,
          isAdminRoom: true
        });
      }
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

    // Listen for admin rooms list
    socket.on('admin_rooms_list', (data) => {
      setAdminRooms(data.admin_rooms);
    });

    // Cleanup listeners
    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('room_created');
      socket.off('room_joined');
      socket.off('room_error');
      socket.off('rooms_list');
      socket.off('admin_room_created');
      socket.off('admin_room_joined');
      socket.off('admin_rooms_list');
    };
  }, [socket, onRoomJoined, onAdminRoomJoined]);

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

  const handleCreateAdminRoom = () => {
    if (!socket || !isConnected) {
      setError('Not connected to server. Please wait or refresh the page.');
      return;
    }

    if (!authState.isAuthenticated || !authState.isAdmin) {
      setError('Admin privileges required to create admin rooms');
      return;
    }

    setIsLoading(true);
    setError('');
    setSuccess('');
    
    socket.emit('create_room', {
      user_name: authState.username,
      room_name: roomName.trim() || 'Admin Room',
      is_admin_room: true
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
      if (authState.isAdmin) {
        socket.emit('get_admin_rooms');
      }
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

  // Filter rooms based on search query (by ID or Name)
  const filteredRooms = availableRooms.filter(room => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      room.room_id.toLowerCase().includes(query) ||
      room.name.toLowerCase().includes(query)
    );
  });

  const handleSearchJoin = () => {
    if (!searchQuery.trim()) {
      setError('Please enter a room ID or name to search');
      return;
    }

    // First try to join by exact room ID (if it looks like an ID)
    const exactMatch = availableRooms.find(room => 
      room.room_id.toLowerCase() === searchQuery.toLowerCase()
    );
    
    if (exactMatch) {
      handleJoinRoom(exactMatch.room_id);
      return;
    }

    // Then try to join by exact room name
    const nameMatch = availableRooms.find(room => 
      room.name.toLowerCase() === searchQuery.toLowerCase()
    );
    
    if (nameMatch) {
      handleJoinRoom(nameMatch.room_id);
      return;
    }

    // If no exact match, try to join as room ID anyway
    handleJoinRoom(searchQuery.toUpperCase());
  };

  return (
    <Box sx={{ 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center', 
      height: '100vh',
      overflow: 'hidden',
      backgroundImage: 'url(/static/background.jpg)',
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
      padding: 1
    }}>
      <Paper sx={{ 
        maxWidth: 600, 
        width: '100%', 
        maxHeight: '95vh',
        overflow: 'auto',
        padding: 3,
        borderRadius: 2,
        boxShadow: 3
      }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h4" sx={{ 
            fontWeight: 'bold',
            color: 'primary.main',
            fontSize: { xs: '1.5rem', sm: '2rem' }
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
          mb: 2,
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

          {authState.isAdmin && (
            <Chip 
              label="Administrator" 
              color="secondary"
              size="small"
              icon={<AdminPanelSettingsIcon />}
            />
          )}
        </Box>

        {/* User Name Input - Only for anonymous users */}
        {!authState.isAuthenticated && (
          <Box sx={{ mb: 2 }}>
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
        <Box sx={{ mb: 2 }}>
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
          <Alert severity="error" sx={{ mb: 1.5 }}>
            {error}
          </Alert>
        )}
        
        {success && (
          <Alert severity="success" sx={{ mb: 1.5 }}>
            {success}
          </Alert>
        )}

        {/* Create Room Buttons */}
        <Box sx={{ display: 'flex', gap: 1, mb: 1.5 }}>
          <Button
            fullWidth
            variant="contained"
            size="large"
            onClick={handleCreateRoom}
            disabled={(!authState.isAuthenticated && !userName.trim()) || isLoading || !isConnected}
            startIcon={isLoading ? <CircularProgress size={20} /> : <AddIcon />}
          >
            {isLoading ? 'Creating...' : 'Create Battlefield Room'}
          </Button>

          {authState.isAdmin && (
            <Button
              fullWidth
              variant="contained"
              size="large"
              color="secondary"
              onClick={handleCreateAdminRoom}
              disabled={isLoading || !isConnected}
              startIcon={isLoading ? <CircularProgress size={20} /> : <AdminPanelSettingsIcon />}
            >
              {isLoading ? 'Creating...' : 'Create Admin Room'}
            </Button>
          )}
        </Box>

        <Divider sx={{ my: 2 }}>
          <Chip label="OR" />
        </Divider>

        {/* Join Room Section */}
        <Typography variant="h6" sx={{ mb: 1.5, fontWeight: 'bold' }}>
          Search Rooms by ID or Name
        </Typography>

        <Box sx={{ mb: 2 }}>
          <TextField
            fullWidth
            label="Search by Room ID or Name"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            variant="outlined"
            disabled={isLoading || !isConnected}
            placeholder="e.g. ABC123 or My Campaign Map"
            onKeyPress={(e) => {
              if (e.key === 'Enter' && 
                  (authState.isAuthenticated || userName.trim()) && 
                  searchQuery.trim() && 
                  isConnected) {
                handleSearchJoin();
              }
            }}
          />
        </Box>

        {/* Admin Rooms Section */}
        {authState.isAdmin && adminRooms.length > 0 && (
          <Box sx={{ mb: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
              <Typography variant="h6" sx={{ fontWeight: 'bold', color: 'secondary.main' }}>
                <AdminPanelSettingsIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                Admin Rooms ({adminRooms.length})
              </Typography>
            </Box>
            
            <Paper variant="outlined" sx={{ maxHeight: 200, overflow: 'auto', border: '2px solid', borderColor: 'secondary.main' }}>
              <List dense>
                {adminRooms.map((room) => (
                  <ListItem 
                    key={room.room_id}
                    button
                    onClick={() => handleJoinRoom(room.room_id)}
                    disabled={isLoading || !isConnected}
                    sx={{
                      borderLeft: '4px solid #ff9800',
                      '&:hover': {
                        backgroundColor: 'rgba(255, 152, 0, 0.1)',
                      }
                    }}
                  >
                    <ListItemIcon>
                      <AdminPanelSettingsIcon color="secondary" />
                    </ListItemIcon>
                    <ListItemText 
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography variant="subtitle1" sx={{ fontWeight: 'bold', color: 'secondary.main' }}>
                            {room.name}
                          </Typography>
                          <Chip 
                            label={room.room_id} 
                            size="small" 
                            variant="outlined"
                            color="secondary"
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
                          <Chip 
                            label="ADMIN" 
                            size="small" 
                            color="secondary"
                            sx={{ fontSize: '9px' }}
                          />
                        </Box>
                      }
                      secondary={
                        <Box sx={{ mt: 0.5 }}>
                          <Typography variant="caption" sx={{ display: 'block' }}>
                            {room.users_count} admin{room.users_count !== 1 ? 's' : ''} 
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

        {/* Available Rooms */}
        {availableRooms.length > 0 && (
          <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
              <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
                {searchQuery.trim() ? `Search Results (${filteredRooms.length})` : `Battlefield Rooms (${availableRooms.length})`}
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
            
            {searchQuery.trim() && filteredRooms.length === 0 && (
              <Alert severity="info" sx={{ mb: 1.5 }}>
                No rooms found matching "{searchQuery}". Try a different search term or create a new room.
              </Alert>
            )}
            
            <Paper variant="outlined" sx={{ maxHeight: 250, overflow: 'auto' }}>
              <List dense>
                {filteredRooms.map((room) => (
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