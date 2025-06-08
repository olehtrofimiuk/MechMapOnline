import React from 'react';
import { 
    Box, 
    Typography, 
    Switch, 
    FormControlLabel, 
    Paper,
    Chip,
    Tooltip
} from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';

const AdminPanel = ({ roomData, availableRooms, roomToggles, socket }) => {
    console.log('AdminPanel received:', { availableRooms, roomToggles });

    const handleToggleRoom = (roomId) => {
        if (socket && roomData) {
            const currentState = roomToggles[roomId]?.enabled || false;
            console.log(`Toggling room ${roomId} from ${currentState} to ${!currentState}`);
            socket.emit('admin_toggle_room', {
                room_id: roomId,
                enabled: !currentState
            });
        }
    };

    const getColoredHexCount = () => {
        if (!roomData?.hex_data) return 0;
        return Object.values(roomData.hex_data).filter(hex => 
            hex.fillColor && hex.fillColor !== 'lightgray'
        ).length;
    };

    const getTotalLineCount = () => {
        return roomData?.lines?.length || 0;
    };

    const getActiveRoomsCount = () => {
        return Object.values(roomToggles).filter(toggle => toggle.enabled).length;
    };

    return (
        <Paper sx={{
            position: 'fixed',
            top: 100,
            right: 20,
            width: 350,
            maxHeight: '80vh',
            overflow: 'auto',
            background: 'linear-gradient(135deg, rgba(0, 17, 34, 0.95), rgba(0, 8, 17, 0.98))',
            border: '2px solid var(--neotech-primary)',
            borderRadius: 2,
            boxShadow: '0 0 20px rgba(0, 255, 255, 0.4), inset 0 0 20px rgba(0, 0, 0, 0.5)',
            backdropFilter: 'blur(10px)',
            p: 3,
            zIndex: 1000
        }}>
            {/* Header */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
                <Typography variant="h6" sx={{
                    color: 'var(--neotech-primary)',
                    fontFamily: "'Orbitron', monospace",
                    fontWeight: 'bold',
                    textShadow: 'var(--neotech-glow-small)',
                    textTransform: 'uppercase',
                    letterSpacing: '1px'
                }}>
                    🛡️ Admin Control
                </Typography>
            </Box>

            {/* Statistics */}
            <Box sx={{ mb: 3, p: 2, 
                background: 'rgba(0, 255, 255, 0.05)',
                border: '1px solid rgba(0, 255, 255, 0.2)',
                borderRadius: 1
            }}>
                <Typography variant="subtitle2" sx={{ 
                    color: 'var(--neotech-text-secondary)', 
                    mb: 1,
                    fontFamily: "'Rajdhani', monospace",
                    fontWeight: 600
                }}>
                    Current Overview
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                    <Chip 
                        label={`${getActiveRoomsCount()} Rooms Active`}
                        size="small"
                        sx={{ 
                            background: 'rgba(0, 255, 136, 0.2)', 
                            color: 'var(--neotech-success)',
                            border: '1px solid var(--neotech-success)'
                        }}
                    />
                    <Chip 
                        label={`${getColoredHexCount()} Hexes`}
                        size="small"
                        sx={{ 
                            background: 'rgba(0, 255, 255, 0.2)', 
                            color: 'var(--neotech-primary)',
                            border: '1px solid var(--neotech-primary)'
                        }}
                    />
                    <Chip 
                        label={`${getTotalLineCount()} Lines`}
                        size="small"
                        sx={{ 
                            background: 'rgba(255, 170, 0, 0.2)', 
                            color: 'var(--neotech-warning)',
                            border: '1px solid var(--neotech-warning)'
                        }}
                    />
                </Box>
            </Box>

            {/* Room Controls */}
            <Typography variant="subtitle1" sx={{ 
                color: 'var(--neotech-text)',
                mb: 2,
                fontFamily: "'Rajdhani', monospace",
                fontWeight: 600
            }}>
                Battlefield Rooms
            </Typography>

            {availableRooms && availableRooms.length > 0 ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {availableRooms.map((room) => {
                        const isEnabled = roomToggles[room.id]?.enabled || false;
                        const roomInfo = roomToggles[room.id];
                        
                        return (
                            <Paper key={room.id} sx={{
                                p: 2,
                                background: isEnabled 
                                    ? 'rgba(0, 255, 136, 0.1)' 
                                    : 'rgba(0, 17, 34, 0.8)',
                                border: isEnabled 
                                    ? '1px solid var(--neotech-success)' 
                                    : '1px solid var(--neotech-border)',
                                borderRadius: 1,
                                transition: 'all 0.3s ease',
                                '&:hover': {
                                    borderColor: 'var(--neotech-primary)',
                                    boxShadow: 'var(--neotech-glow-small)'
                                }
                            }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <Box sx={{ flex: 1 }}>
                                        <Typography variant="body1" sx={{
                                            color: isEnabled ? 'var(--neotech-success)' : 'var(--neotech-text)',
                                            fontFamily: "'Rajdhani', monospace",
                                            fontWeight: 600,
                                            mb: 0.5
                                        }}>
                                            {room.name}
                                        </Typography>
                                        <Typography variant="caption" sx={{
                                            color: 'var(--neotech-text-secondary)',
                                            fontFamily: "'Rajdhani', monospace",
                                            display: 'block'
                                        }}>
                                            ID: {room.id}
                                        </Typography>
                                        {roomInfo && (
                                            <Box sx={{ display: 'flex', gap: 0.5, mt: 1 }}>
                                                {roomInfo.hex_count > 0 && (
                                                    <Chip 
                                                        label={`${roomInfo.hex_count} hexes`}
                                                        size="small"
                                                        sx={{ 
                                                            fontSize: '10px',
                                                            height: '20px',
                                                            background: 'rgba(0, 255, 255, 0.2)', 
                                                            color: 'var(--neotech-primary)'
                                                        }}
                                                    />
                                                )}
                                                {roomInfo.line_count > 0 && (
                                                    <Chip 
                                                        label={`${roomInfo.line_count} lines`}
                                                        size="small"
                                                        sx={{ 
                                                            fontSize: '10px',
                                                            height: '20px',
                                                            background: 'rgba(255, 170, 0, 0.2)', 
                                                            color: 'var(--neotech-warning)'
                                                        }}
                                                    />
                                                )}
                                            </Box>
                                        )}
                                    </Box>
                                    <Tooltip title={isEnabled ? "Hide room data" : "Show room data"}>
                                        <FormControlLabel
                                            control={
                                                <Switch
                                                    checked={isEnabled}
                                                    onChange={() => handleToggleRoom(room.id)}
                                                    sx={{
                                                        '& .MuiSwitch-switchBase.Mui-checked': {
                                                            color: 'var(--neotech-success)',
                                                        },
                                                        '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                                                            backgroundColor: 'var(--neotech-success)',
                                                        },
                                                    }}
                                                />
                                            }
                                            label={
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                    {isEnabled ? <VisibilityIcon fontSize="small" /> : <VisibilityOffIcon fontSize="small" />}
                                                    <Typography variant="caption" sx={{ 
                                                        color: isEnabled ? 'var(--neotech-success)' : 'var(--neotech-text-secondary)',
                                                        fontFamily: "'Rajdhani', monospace"
                                                    }}>
                                                        {isEnabled ? 'Visible' : 'Hidden'}
                                                    </Typography>
                                                </Box>
                                            }
                                            sx={{ ml: 0, mr: 0 }}
                                        />
                                    </Tooltip>
                                </Box>
                            </Paper>
                        );
                    })}
                </Box>
            ) : (
                <Paper sx={{
                    p: 3,
                    textAlign: 'center',
                    background: 'rgba(255, 170, 0, 0.1)',
                    border: '1px solid var(--neotech-warning)',
                    borderRadius: 1
                }}>
                    <Typography variant="body2" sx={{
                        color: 'var(--neotech-warning)',
                        fontFamily: "'Rajdhani', monospace",
                        fontStyle: 'italic'
                    }}>
                        No battlefield rooms available
                    </Typography>
                </Paper>
            )}

            {/* Instructions */}
            <Box sx={{ mt: 3, p: 2, 
                background: 'rgba(0, 255, 255, 0.05)',
                border: '1px solid rgba(0, 255, 255, 0.2)',
                borderRadius: 1
            }}>
                <Typography variant="caption" sx={{
                    color: 'var(--neotech-text-secondary)',
                    fontFamily: "'Rajdhani', monospace",
                    fontStyle: 'italic',
                    lineHeight: 1.4
                }}>
                    💡 Toggle rooms to show/hide their battlefield data. 
                    Data is read-only in admin view. 
                    Colors from multiple rooms will be layered on overlapping hexes.
                </Typography>
            </Box>
        </Paper>
    );
};

export default AdminPanel; 