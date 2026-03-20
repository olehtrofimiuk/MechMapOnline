import React, { useState, useEffect, useRef } from 'react';
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
  ListItemButton,
  ListItemText,
  ListItemIcon,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControlLabel,
  Checkbox,
  LinearProgress
} from '@mui/material';
import PersonIcon from '@mui/icons-material/Person';
import GroupIcon from '@mui/icons-material/Group';
import AddIcon from '@mui/icons-material/Add';
import LoginIcon from '@mui/icons-material/Login';
import LogoutIcon from '@mui/icons-material/Logout';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import LockIcon from '@mui/icons-material/Lock';
import DeleteIcon from '@mui/icons-material/Delete';
import IconButton from '@mui/material/IconButton';

const RoomManager = ({ socket, onRoomJoined, authState, onLogout }) => {
  const [userName, setUserName] = useState('');
  const [roomName, setRoomName] = useState('');
  const [roomPassword, setRoomPassword] = useState('');
  const [roomId, setRoomId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [joinPassword, setJoinPassword] = useState('');
  const [selectedRoomForJoin, setSelectedRoomForJoin] = useState(null);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [selectedRoomForDelete, setSelectedRoomForDelete] = useState(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [availableRooms, setAvailableRooms] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [mapFile, setMapFile] = useState(null);
  const mapFileRef = useRef(null);
  const [uploadedMapFilename, setUploadedMapFilename] = useState(null);
  const [createdRoomId, setCreatedRoomId] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);

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
      setCreatedRoomId(data.room_id);

      setSuccess(`Room "${data.room_name}" (${data.room_id}) created successfully!`);
      setMapFile(null);
      mapFileRef.current = null;
      setUploadedMapFilename(null);
      setUploadProgress(0);
      setIsUploading(false);

      // Small delay to show success message before navigating
      setTimeout(() => {
        onRoomJoined({
          roomId: data.room_id,
          roomName: data.room_name,
          userName: data.user_name,
          is_owner: data.is_owner,
          hexData: data.hex_data,
          lines: data.lines,
          units: data.units || [],
          users: data.users,
          map_filename: data.map_filename
        });
      }, 500);
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
        users: data.users,
        map_filename: data.map_filename
      });
    });

    // Listen for room errors
    socket.on('room_error', (data) => {
      setIsLoading(false);
      setError(data.message);
      setSuccess('');
      // Close any open dialogs on error
      setShowDeleteDialog(false);
      setSelectedRoomForDelete(null);
    });

    // Listen for available rooms list
    socket.on('rooms_list', (data) => {
      setAvailableRooms(data.rooms);
    });

    // Listen for room deletion events
    socket.on('room_deleted', (data) => {
      setIsLoading(false); // Reset loading state
      if (data.admin_action) {
        setSuccess(data.message);
        setError('');
        // Refresh room list
        socket.emit('get_rooms');
      } else if (data.force_leave) {
        setError(data.message);
        setSuccess('');
      }
    });

    // Listen for room list refresh signals
    socket.on('room_list_refresh', (data) => {
      // Refresh room lists when any room is deleted
      socket.emit('get_rooms');
    });

    // Cleanup listeners
    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('room_created');
      socket.off('room_joined');
      socket.off('room_error');
      socket.off('rooms_list');
      socket.off('room_deleted');
      socket.off('room_list_refresh');
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

    if (isUploading) {
      setError('Map is still uploading. Please wait until it reaches 100%.');
      return;
    }
    if (mapFile && !uploadedMapFilename) {
      setError('Map was selected but not uploaded yet. Please wait for upload to finish.');
      return;
    }

    setIsLoading(true);
    setError('');
    setSuccess('');
    
    socket.emit('create_room', {
      user_name: authState.isAuthenticated ? authState.username : userName.trim(),
      room_name: roomName.trim() || 'Unnamed Room',
      room_password: roomPassword.trim() || null,
      map_filename: uploadedMapFilename
    });
  };

  const handleMapFileChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        setError('Please select an image file');
        return;
      }
      // Validate file size (max 100MB)
      if (file.size > 100 * 1024 * 1024) {
        setError('Map file must be less than 100MB');
        return;
      }
      setMapFile(file);
      mapFileRef.current = file;
      setUploadedMapFilename(null);
      setIsUploading(true);
      setUploadProgress(0);
      setError('');

      const formData = new FormData();
      formData.append('file', file);

      const xhr = new XMLHttpRequest();
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable && e.total > 0) {
          const percentComplete = Math.min((e.loaded / e.total) * 100, 99);
          setUploadProgress(percentComplete);
        }
      });

      xhr.addEventListener('load', () => {
        setIsUploading(false);
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const responseData = JSON.parse(xhr.responseText);
            setUploadedMapFilename(responseData.map_filename);
          } catch (e) {
            setError('Map uploaded but server response was invalid.');
            setUploadedMapFilename(null);
            return;
          }
          setUploadProgress(100);
          setSuccess('Map uploaded and ready. Now create the room.');
        } else {
          setUploadedMapFilename(null);
          setUploadProgress(0);
          if (xhr.status === 413) {
            setError('Map upload failed: HTTP 413 (Payload Too Large). Server limit too low.');
          } else if (xhr.status === 400) {
            try {
              const errorData = JSON.parse(xhr.responseText);
              setError(`Map upload failed: ${errorData.detail || 'HTTP 400'}`);
            } catch (e) {
              setError('Map upload failed: HTTP 400');
            }
          } else {
            setError(`Map upload failed: HTTP ${xhr.status}`);
          }
        }
      });

      xhr.addEventListener('error', () => {
        setIsUploading(false);
        setUploadedMapFilename(null);
        setUploadProgress(0);
        setError('Map upload failed: Network error');
      });

      xhr.open('POST', '/api/upload-map-temp');
      xhr.send(formData);
    }
  };

  const handleJoinRoom = (targetRoomId = null, password = '') => {
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
      user_name: authState.isAuthenticated ? authState.username : userName.trim(),
      room_password: password
    });
  };

  const handleRoomClick = (room) => {
    if (room.has_password) {
      // Show password dialog for password-protected rooms
      setSelectedRoomForJoin(room.room_id);
      setJoinPassword('');
      setShowPasswordDialog(true);
    } else {
      // Join directly for rooms without password
      handleJoinRoom(room.room_id);
    }
  };

  const handlePasswordDialogConfirm = () => {
    if (selectedRoomForJoin) {
      handleJoinRoom(selectedRoomForJoin, joinPassword);
      setShowPasswordDialog(false);
      setSelectedRoomForJoin(null);
      setJoinPassword('');
    }
  };

  const handleDeleteRoom = (roomId, roomName, event) => {
    event.stopPropagation(); // Prevent room click
    setSelectedRoomForDelete({ id: roomId, name: roomName });
    setShowDeleteDialog(true);
  };

  const handleDeleteConfirm = () => {
    if (selectedRoomForDelete && socket && isConnected) {
      setIsLoading(true);
      setError('');
      setSuccess('');
      
      socket.emit('admin_delete_room', {
        room_id: selectedRoomForDelete.id
      });
      
      setShowDeleteDialog(false);
      setSelectedRoomForDelete(null);
    }
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
      handleRoomClick(exactMatch);
      return;
    }

    // Then try to join by exact room name
    const nameMatch = availableRooms.find(room => 
      room.name.toLowerCase() === searchQuery.toLowerCase()
    );
    
    if (nameMatch) {
      handleRoomClick(nameMatch);
      return;
    }

    // If no exact match, try to join as room ID anyway (assume no password for direct ID join)
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
          
          {authState.isAuthenticated ? (
            <Chip 
              label={`Authenticated: ${authState.username}`} 
              color="success" 
              size="small" 
              icon={<PersonIcon />}
            />
          ) : (
            <Chip 
              label="Anonymous User" 
              color="default" 
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

        {/* Room Password Input */}
        <Box sx={{ mb: 2 }}>
          <TextField
            fullWidth
            label="Room Password (Optional)"
            type="password"
            value={roomPassword}
            onChange={(e) => setRoomPassword(e.target.value)}
            variant="outlined"
            disabled={isLoading || !isConnected}
            placeholder="Leave empty for public room"
            helperText="Set a password to make the room private"
            InputProps={{
              startAdornment: <LockIcon sx={{ mr: 1, color: 'text.secondary' }} />
            }}
          />
        </Box>

        {/* Map Upload Input */}
        <Box sx={{ mb: 2 }}>
          <input
            accept="image/*"
            style={{ display: 'none' }}
            id="map-file-upload"
            type="file"
            onChange={handleMapFileChange}
            disabled={isLoading || !isConnected}
          />
          <label htmlFor="map-file-upload">
            <Button
              variant="outlined"
              component="span"
              fullWidth
              disabled={isLoading || !isConnected}
              sx={{ mb: 1 }}
            >
              {mapFile ? `Map Selected: ${mapFile.name}` : 'Upload Map Image (Optional)'}
            </Button>
          </label>
          {mapFile && (
            <Button
              variant="text"
              size="small"
              onClick={() => {
                setMapFile(null);
                mapFileRef.current = null;
                setUploadedMapFilename(null);
                setUploadProgress(0);
                setIsUploading(false);
              }}
              sx={{ mt: 0.5 }}
            >
              Remove Map
            </Button>
          )}
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
            Upload a background map image for this room (PNG, JPG, GIF, WebP - max 100MB)
          </Typography>
          {isUploading && (
            <Box sx={{ mt: 1 }}>
              <LinearProgress 
                variant="determinate" 
                value={uploadProgress} 
                sx={{ mb: 0.5 }}
              />
              <Typography variant="caption" color="text.secondary">
                Uploading map: {Math.round(uploadProgress)}%
              </Typography>
            </Box>
          )}
          {!isUploading && uploadedMapFilename && (
            <Typography variant="caption" color="success.main" display="block" sx={{ mt: 1 }}>
              Map uploaded: {uploadedMapFilename}
            </Typography>
          )}
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
                    disablePadding
                    sx={{
                      borderLeft: room.is_active ? '4px solid #4caf50' : '4px solid #ff9800',
                    }}
                  >
                    <ListItemButton
                      onClick={() => handleRoomClick(room)}
                      disabled={(!authState.isAuthenticated && !userName.trim()) || isLoading || !isConnected}
                      sx={{
                        '&:hover': {
                          backgroundColor: 'rgba(0, 0, 0, 0.04)',
                        }
                      }}
                    >
                      <ListItemIcon>
                        {room.has_password ? 
                          <LockIcon color={room.is_active ? 'success' : 'warning'} /> :
                          <GroupIcon color={room.is_active ? 'success' : 'warning'} />
                        }
                      </ListItemIcon>
                      <ListItemText 
                        primary={
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, justifyContent: 'space-between' }}>
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
                              {room.has_password && (
                                <Chip 
                                  label={<LockIcon fontSize="small" />} 
                                  size="small" 
                                  color="warning"
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
                            {authState.isAdmin && (
                              <IconButton
                                size="small"
                                color="error"
                                onClick={(e) => handleDeleteRoom(room.room_id, room.name, e)}
                                sx={{ 
                                  ml: 1,
                                  '&:hover': {
                                    backgroundColor: 'rgba(244, 67, 54, 0.1)'
                                  }
                                }}
                              >
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            )}
                          </Box>
                        }
                        secondary={
                          <Typography variant="caption" component="span" sx={{ display: 'block', mt: 0.5 }}>
                            {room.users_count} user{room.users_count !== 1 ? 's' : ''} 
                            {room.is_active ? ' online' : ' • Last activity: ' + formatActivityTime(room.hours_since_activity)}
                          </Typography>
                        }
                      />
                    </ListItemButton>
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

      {/* Password Dialog for Protected Rooms */}
      <Dialog 
        open={showPasswordDialog} 
        onClose={() => setShowPasswordDialog(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <LockIcon />
            Enter Room Password
          </Box>
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2, color: 'text.secondary' }}>
            This room is password protected. Please enter the password to join.
          </Typography>
          <TextField
            autoFocus
            fullWidth
            label="Room Password"
            type="password"
            value={joinPassword}
            onChange={(e) => setJoinPassword(e.target.value)}
            variant="outlined"
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                handlePasswordDialogConfirm();
              }
            }}
            InputProps={{
              startAdornment: <LockIcon sx={{ mr: 1, color: 'text.secondary' }} />
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowPasswordDialog(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handlePasswordDialogConfirm} 
            variant="contained"
            disabled={!joinPassword.trim()}
          >
            Join Room
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog 
        open={showDeleteDialog} 
        onClose={() => setShowDeleteDialog(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'error.main' }}>
            <DeleteIcon />
            Delete Room
          </Box>
        </DialogTitle>
        <DialogContent>
          <Typography variant="body1" sx={{ mb: 2 }}>
            Are you sure you want to delete this room?
          </Typography>
          {selectedRoomForDelete && (
            <Box sx={{ 
              p: 2, 
              backgroundColor: 'error.light', 
              borderRadius: 1,
              border: '1px solid',
              borderColor: 'error.main'
            }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 'bold', color: 'error.contrastText' }}>
                {selectedRoomForDelete.name}
              </Typography>
              <Typography variant="caption" sx={{ color: 'error.contrastText', opacity: 0.8 }}>
                ID: {selectedRoomForDelete.id}
              </Typography>
            </Box>
          )}
          <Typography variant="body2" sx={{ mt: 2, color: 'text.secondary' }}>
            <strong>Warning:</strong> This action cannot be undone. All data in this room will be permanently lost, 
            and any users currently in the room will be automatically removed.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowDeleteDialog(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleDeleteConfirm} 
            variant="contained"
            color="error"
            disabled={isLoading}
            startIcon={isLoading ? <CircularProgress size={16} /> : <DeleteIcon />}
          >
            {isLoading ? 'Deleting...' : 'Delete Room'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default RoomManager; 