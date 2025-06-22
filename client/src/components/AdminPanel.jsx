import React from 'react';
import { 
    Box, 
    Typography, 
    Switch, 
    FormControlLabel, 
    Paper,
    Chip,
    Tooltip,
    TextField,
    Button,
    Divider
} from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import CasinoIcon from '@mui/icons-material/Casino';

const AdminPanel = ({ roomData, availableRooms, roomToggles, socket }) => {
    console.log('AdminPanel received:', { availableRooms, roomToggles });

    // Dice Panel Toggle
    const [showDicePanel, setShowDicePanel] = React.useState(false);

    // Dice Roller 1 - Attack Rolls (Orange theme)
    const [rollCount1, setRollCount1] = React.useState(1);
    const [modifier1, setModifier1] = React.useState(0);
    const [rollResults1, setRollResults1] = React.useState([]);
    const [lastRollTime1, setLastRollTime1] = React.useState(null);

    // Dice Roller 2 - Defense Rolls (Blue theme)
    const [rollCount2, setRollCount2] = React.useState(1);
    const [modifier2, setModifier2] = React.useState(0);
    const [rollResults2, setRollResults2] = React.useState([]);
    const [lastRollTime2, setLastRollTime2] = React.useState(null);

    // Dice Roller 3 - Skill Rolls (Green theme)
    const [rollCount3, setRollCount3] = React.useState(1);
    const [modifier3, setModifier3] = React.useState(0);
    const [rollResults3, setRollResults3] = React.useState([]);
    const [lastRollTime3, setLastRollTime3] = React.useState(null);

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

    const rollDice = (rollerNumber) => {
        const rolls = [];
        let totalSum = 0;
        
        const rollCount = rollerNumber === 1 ? rollCount1 : rollerNumber === 2 ? rollCount2 : rollCount3;
        const modifier = rollerNumber === 1 ? modifier1 : rollerNumber === 2 ? modifier2 : modifier3;
        
        for (let i = 0; i < rollCount; i++) {
            const dice1 = Math.floor(Math.random() * 6) + 1;
            const dice2 = Math.floor(Math.random() * 6) + 1;
            const rollSum = dice1 + dice2;
            const modifiedSum = rollSum + modifier;
            
            rolls.push({
                id: i + 1,
                dice1,
                dice2,
                rollSum,
                modifiedSum
            });
            
            totalSum += modifiedSum;
        }
        
        const currentTime = new Date().toLocaleTimeString();
        
        if (rollerNumber === 1) {
            setRollResults1(rolls);
            setLastRollTime1(currentTime);
        } else if (rollerNumber === 2) {
            setRollResults2(rolls);
            setLastRollTime2(currentTime);
        } else {
            setRollResults3(rolls);
            setLastRollTime3(currentTime);
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

    const getTotalSum = () => {
        return rollResults1.reduce((sum, roll) => sum + roll.modifiedSum, 0) +
               rollResults2.reduce((sum, roll) => sum + roll.modifiedSum, 0) +
               rollResults3.reduce((sum, roll) => sum + roll.modifiedSum, 0);
    };

    return (
        <>
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

            {/* Dice Panel Toggle */}
            <Box sx={{ mb: 3 }}>
                <Button
                    onClick={() => setShowDicePanel(!showDicePanel)}
                    variant="outlined"
                    fullWidth
                    startIcon={<CasinoIcon />}
                    sx={{
                        borderColor: 'var(--neotech-primary)',
                        color: 'var(--neotech-primary)',
                        fontFamily: "'Rajdhani', monospace",
                        fontWeight: 600,
                        '&:hover': {
                            borderColor: 'var(--neotech-primary)',
                            backgroundColor: 'rgba(0, 255, 255, 0.1)',
                        }
                    }}
                >
                    {showDicePanel ? 'Hide Dice Panel' : 'Show Dice Panel'}
                </Button>
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

        {/* Separate Dice Panel */}
        {showDicePanel && (
            <Paper sx={{
                position: 'fixed',
                top: 20,
                left: 20,
                right: 380,
                height: 'auto',
                maxHeight: '90vh',
                overflow: 'auto',
                background: 'linear-gradient(135deg, rgba(0, 17, 34, 0.95), rgba(0, 8, 17, 0.98))',
                border: '2px solid var(--neotech-primary)',
                borderRadius: 2,
                boxShadow: '0 0 20px rgba(0, 255, 255, 0.4), inset 0 0 20px rgba(0, 0, 0, 0.5)',
                backdropFilter: 'blur(10px)',
                p: 3,
                zIndex: 999
            }}>
                {/* Dice Panel Header */}
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
                    <Typography variant="h6" sx={{
                        color: 'var(--neotech-primary)',
                        fontFamily: "'Orbitron', monospace",
                        fontWeight: 'bold',
                        textShadow: 'var(--neotech-glow-small)',
                        textTransform: 'uppercase',
                        letterSpacing: '1px'
                    }}>
                        🎲 Dice Roller Panel
                    </Typography>
                    <Button
                        onClick={() => setShowDicePanel(false)}
                        size="small"
                        sx={{
                            color: 'var(--neotech-text-secondary)',
                            minWidth: 'auto',
                            '&:hover': {
                                color: 'var(--neotech-primary)',
                                backgroundColor: 'rgba(0, 255, 255, 0.1)'
                            }
                        }}
                    >
                        ✕
                    </Button>
                </Box>

                {/* Horizontal Dice Layout */}
                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                    
                    {/* Attack Rolls - Orange */}
                    <Box sx={{ 
                        flex: '1 1 300px',
                        minWidth: '300px',
                        p: 2, 
                        background: 'rgba(255, 170, 0, 0.05)',
                        border: '1px solid rgba(255, 170, 0, 0.2)',
                        borderRadius: 1
                    }}>
                        <Typography variant="subtitle2" sx={{ 
                            color: 'var(--neotech-warning)', 
                            mb: 2,
                            fontFamily: "'Rajdhani', monospace",
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1
                        }}>
                            <CasinoIcon fontSize="small" />
                            Attack Rolls (2d6)
                        </Typography>
                        
                        <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                            <TextField
                                label="Rolls"
                                type="number"
                                value={rollCount1}
                                onChange={(e) => setRollCount1(Math.max(1, parseInt(e.target.value) || 1))}
                                size="small"
                                inputProps={{ min: 1, max: 20 }}
                                sx={{
                                    flex: 1,
                                    '& .MuiOutlinedInput-root': {
                                        '& fieldset': { borderColor: 'var(--neotech-border)' },
                                        '&:hover fieldset': { borderColor: 'var(--neotech-warning)' },
                                        '&.Mui-focused fieldset': { borderColor: 'var(--neotech-warning)' },
                                    },
                                    '& .MuiInputLabel-root': { color: 'var(--neotech-text-secondary)' },
                                    '& .MuiInputBase-input': { color: 'var(--neotech-text)' },
                                }}
                            />
                            <TextField
                                label="Modifier"
                                type="number"
                                value={modifier1}
                                onChange={(e) => setModifier1(parseInt(e.target.value) || 0)}
                                size="small"
                                inputProps={{ min: -20, max: 20 }}
                                sx={{
                                    flex: 1,
                                    '& .MuiOutlinedInput-root': {
                                        '& fieldset': { borderColor: 'var(--neotech-border)' },
                                        '&:hover fieldset': { borderColor: 'var(--neotech-warning)' },
                                        '&.Mui-focused fieldset': { borderColor: 'var(--neotech-warning)' },
                                    },
                                    '& .MuiInputLabel-root': { color: 'var(--neotech-text-secondary)' },
                                    '& .MuiInputBase-input': { color: 'var(--neotech-text)' },
                                }}
                            />
                        </Box>
                        
                        <Button
                            onClick={() => rollDice(1)}
                            variant="outlined"
                            fullWidth
                            size="small"
                            startIcon={<CasinoIcon />}
                            sx={{
                                borderColor: 'var(--neotech-warning)',
                                color: 'var(--neotech-warning)',
                                fontFamily: "'Rajdhani', monospace",
                                fontWeight: 600,
                                mb: 2,
                                '&:hover': {
                                    borderColor: 'var(--neotech-warning)',
                                    backgroundColor: 'rgba(255, 170, 0, 0.1)',
                                }
                            }}
                        >
                            Roll {rollCount1} × 2d6 {modifier1 !== 0 && `${modifier1 >= 0 ? '+' : ''}${modifier1}`}
                        </Button>

                        {/* Results */}
                        {rollResults1.length > 0 && (
                            <Box>
                                <Typography variant="caption" sx={{
                                    color: 'var(--neotech-text-secondary)',
                                    fontFamily: "'Rajdhani', monospace",
                                    display: 'block',
                                    mb: 1
                                }}>
                                    Results ({lastRollTime1}):
                                </Typography>
                                
                                <Box sx={{ 
                                    maxHeight: '100px', 
                                    overflow: 'auto',
                                    border: '1px solid rgba(255, 170, 0, 0.3)',
                                    borderRadius: 1,
                                    p: 1,
                                    mb: 1
                                }}>
                                    {rollResults1.map((roll) => (
                                        <Typography key={roll.id} variant="caption" sx={{ 
                                            color: 'var(--neotech-text)',
                                            fontFamily: "'Rajdhani', monospace",
                                            display: 'block',
                                            fontSize: '11px'
                                        }}>
                                            Roll {roll.id}: {roll.dice1} + {roll.dice2} = {roll.rollSum}
                                            {modifier1 !== 0 && ` ${modifier1 >= 0 ? '+' : ''}${modifier1} = ${roll.modifiedSum}`}
                                        </Typography>
                                    ))}
                                </Box>
                                
                                <Box sx={{ 
                                    display: 'flex', 
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    p: 1,
                                    background: 'rgba(255, 170, 0, 0.1)',
                                    borderRadius: 1
                                }}>
                                    <Typography variant="caption" sx={{
                                        color: 'var(--neotech-warning)',
                                        fontFamily: "'Rajdhani', monospace",
                                        fontWeight: 600
                                    }}>
                                        Total АХУЙ 240:
                                    </Typography>
                                    <Typography variant="body1" sx={{
                                        color: 'var(--neotech-warning)',
                                        fontFamily: "'Orbitron', monospace",
                                        fontWeight: 'bold'
                                    }}>
                                        {rollResults1.reduce((sum, roll) => sum + roll.modifiedSum, 0)}
                                    </Typography>
                                </Box>
                            </Box>
                        )}
                    </Box>

                    {/* Defense Rolls - Blue */}
                    <Box sx={{ 
                        flex: '1 1 300px',
                        minWidth: '300px',
                        p: 2, 
                        background: 'rgba(0, 123, 255, 0.05)',
                        border: '1px solid rgba(0, 123, 255, 0.2)',
                        borderRadius: 1
                    }}>
                        <Typography variant="subtitle2" sx={{ 
                            color: '#007bff', 
                            mb: 2,
                            fontFamily: "'Rajdhani', monospace",
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1
                        }}>
                            <CasinoIcon fontSize="small" />
                            Defense Rolls (2d6)
                        </Typography>
                        
                        <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                            <TextField
                                label="Rolls"
                                type="number"
                                value={rollCount2}
                                onChange={(e) => setRollCount2(Math.max(1, parseInt(e.target.value) || 1))}
                                size="small"
                                inputProps={{ min: 1, max: 20 }}
                                sx={{
                                    flex: 1,
                                    '& .MuiOutlinedInput-root': {
                                        '& fieldset': { borderColor: 'var(--neotech-border)' },
                                        '&:hover fieldset': { borderColor: '#007bff' },
                                        '&.Mui-focused fieldset': { borderColor: '#007bff' },
                                    },
                                    '& .MuiInputLabel-root': { color: 'var(--neotech-text-secondary)' },
                                    '& .MuiInputBase-input': { color: 'var(--neotech-text)' },
                                }}
                            />
                            <TextField
                                label="Modifier"
                                type="number"
                                value={modifier2}
                                onChange={(e) => setModifier2(parseInt(e.target.value) || 0)}
                                size="small"
                                inputProps={{ min: -20, max: 20 }}
                                sx={{
                                    flex: 1,
                                    '& .MuiOutlinedInput-root': {
                                        '& fieldset': { borderColor: 'var(--neotech-border)' },
                                        '&:hover fieldset': { borderColor: '#007bff' },
                                        '&.Mui-focused fieldset': { borderColor: '#007bff' },
                                    },
                                    '& .MuiInputLabel-root': { color: 'var(--neotech-text-secondary)' },
                                    '& .MuiInputBase-input': { color: 'var(--neotech-text)' },
                                }}
                            />
                        </Box>
                        
                        <Button
                            onClick={() => rollDice(2)}
                            variant="outlined"
                            fullWidth
                            size="small"
                            startIcon={<CasinoIcon />}
                            sx={{
                                borderColor: '#007bff',
                                color: '#007bff',
                                fontFamily: "'Rajdhani', monospace",
                                fontWeight: 600,
                                mb: 2,
                                '&:hover': {
                                    borderColor: '#007bff',
                                    backgroundColor: 'rgba(0, 123, 255, 0.1)',
                                }
                            }}
                        >
                            Roll {rollCount2} × 2d6 {modifier2 !== 0 && `${modifier2 >= 0 ? '+' : ''}${modifier2}`}
                        </Button>

                        {/* Results */}
                        {rollResults2.length > 0 && (
                            <Box>
                                <Typography variant="caption" sx={{
                                    color: 'var(--neotech-text-secondary)',
                                    fontFamily: "'Rajdhani', monospace",
                                    display: 'block',
                                    mb: 1
                                }}>
                                    Results ({lastRollTime2}):
                                </Typography>
                                
                                <Box sx={{ 
                                    maxHeight: '100px', 
                                    overflow: 'auto',
                                    border: '1px solid rgba(0, 123, 255, 0.3)',
                                    borderRadius: 1,
                                    p: 1,
                                    mb: 1
                                }}>
                                    {rollResults2.map((roll) => (
                                        <Typography key={roll.id} variant="caption" sx={{ 
                                            color: 'var(--neotech-text)',
                                            fontFamily: "'Rajdhani', monospace",
                                            display: 'block',
                                            fontSize: '11px'
                                        }}>
                                            Roll {roll.id}: {roll.dice1} + {roll.dice2} = {roll.rollSum}
                                            {modifier2 !== 0 && ` ${modifier2 >= 0 ? '+' : ''}${modifier2} = ${roll.modifiedSum}`}
                                        </Typography>
                                    ))}
                                </Box>
                                
                                <Box sx={{ 
                                    display: 'flex', 
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    p: 1,
                                    background: 'rgba(0, 123, 255, 0.1)',
                                    borderRadius: 1
                                }}>
                                    <Typography variant="caption" sx={{
                                        color: '#007bff',
                                        fontFamily: "'Rajdhani', monospace",
                                        fontWeight: 600
                                    }}>
                                        Total:
                                    </Typography>
                                    <Typography variant="body1" sx={{
                                        color: '#007bff',
                                        fontFamily: "'Orbitron', monospace",
                                        fontWeight: 'bold'
                                    }}>
                                        {rollResults2.reduce((sum, roll) => sum + roll.modifiedSum, 0)}
                                    </Typography>
                                </Box>
                            </Box>
                        )}
                    </Box>

                    {/* Skill Rolls - Green */}
                    <Box sx={{ 
                        flex: '1 1 300px',
                        minWidth: '300px',
                        p: 2, 
                        background: 'rgba(40, 167, 69, 0.05)',
                        border: '1px solid rgba(40, 167, 69, 0.2)',
                        borderRadius: 1
                    }}>
                        <Typography variant="subtitle2" sx={{ 
                            color: '#28a745', 
                            mb: 2,
                            fontFamily: "'Rajdhani', monospace",
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1
                        }}>
                            <CasinoIcon fontSize="small" />
                            Skill Rolls (2d6)
                        </Typography>
                        
                        <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                            <TextField
                                label="Rolls"
                                type="number"
                                value={rollCount3}
                                onChange={(e) => setRollCount3(Math.max(1, parseInt(e.target.value) || 1))}
                                size="small"
                                inputProps={{ min: 1, max: 20 }}
                                sx={{
                                    flex: 1,
                                    '& .MuiOutlinedInput-root': {
                                        '& fieldset': { borderColor: 'var(--neotech-border)' },
                                        '&:hover fieldset': { borderColor: '#28a745' },
                                        '&.Mui-focused fieldset': { borderColor: '#28a745' },
                                    },
                                    '& .MuiInputLabel-root': { color: 'var(--neotech-text-secondary)' },
                                    '& .MuiInputBase-input': { color: 'var(--neotech-text)' },
                                }}
                            />
                            <TextField
                                label="Modifier"
                                type="number"
                                value={modifier3}
                                onChange={(e) => setModifier3(parseInt(e.target.value) || 0)}
                                size="small"
                                inputProps={{ min: -20, max: 20 }}
                                sx={{
                                    flex: 1,
                                    '& .MuiOutlinedInput-root': {
                                        '& fieldset': { borderColor: 'var(--neotech-border)' },
                                        '&:hover fieldset': { borderColor: '#28a745' },
                                        '&.Mui-focused fieldset': { borderColor: '#28a745' },
                                    },
                                    '& .MuiInputLabel-root': { color: 'var(--neotech-text-secondary)' },
                                    '& .MuiInputBase-input': { color: 'var(--neotech-text)' },
                                }}
                            />
                        </Box>
                        
                        <Button
                            onClick={() => rollDice(3)}
                            variant="outlined"
                            fullWidth
                            size="small"
                            startIcon={<CasinoIcon />}
                            sx={{
                                borderColor: '#28a745',
                                color: '#28a745',
                                fontFamily: "'Rajdhani', monospace",
                                fontWeight: 600,
                                mb: 2,
                                '&:hover': {
                                    borderColor: '#28a745',
                                    backgroundColor: 'rgba(40, 167, 69, 0.1)',
                                }
                            }}
                        >
                            Roll {rollCount3} × 2d6 {modifier3 !== 0 && `${modifier3 >= 0 ? '+' : ''}${modifier3}`}
                        </Button>

                        {/* Results */}
                        {rollResults3.length > 0 && (
                            <Box>
                                <Typography variant="caption" sx={{
                                    color: 'var(--neotech-text-secondary)',
                                    fontFamily: "'Rajdhani', monospace",
                                    display: 'block',
                                    mb: 1
                                }}>
                                    Results ({lastRollTime3}):
                                </Typography>
                                
                                <Box sx={{ 
                                    maxHeight: '100px', 
                                    overflow: 'auto',
                                    border: '1px solid rgba(40, 167, 69, 0.3)',
                                    borderRadius: 1,
                                    p: 1,
                                    mb: 1
                                }}>
                                    {rollResults3.map((roll) => (
                                        <Typography key={roll.id} variant="caption" sx={{ 
                                            color: 'var(--neotech-text)',
                                            fontFamily: "'Rajdhani', monospace",
                                            display: 'block',
                                            fontSize: '11px'
                                        }}>
                                            Roll {roll.id}: {roll.dice1} + {roll.dice2} = {roll.rollSum}
                                            {modifier3 !== 0 && ` ${modifier3 >= 0 ? '+' : ''}${modifier3} = ${roll.modifiedSum}`}
                                        </Typography>
                                    ))}
                                </Box>
                                
                                <Box sx={{ 
                                    display: 'flex', 
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    p: 1,
                                    background: 'rgba(40, 167, 69, 0.1)',
                                    borderRadius: 1
                                }}>
                                    <Typography variant="caption" sx={{
                                        color: '#28a745',
                                        fontFamily: "'Rajdhani', monospace",
                                        fontWeight: 600
                                    }}>
                                        Total:
                                    </Typography>
                                    <Typography variant="body1" sx={{
                                        color: '#28a745',
                                        fontFamily: "'Orbitron', monospace",
                                        fontWeight: 'bold'
                                    }}>
                                        {rollResults3.reduce((sum, roll) => sum + roll.modifiedSum, 0)}
                                    </Typography>
                                </Box>
                            </Box>
                        )}
                    </Box>
                </Box>
            </Paper>
        )}
        </>
    );
};

export default AdminPanel; 