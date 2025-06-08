import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import Hexagon from './Hexagon';
import Line from './Line';
import Arrow from './Arrow';
import { HexColorPicker } from 'react-colorful';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import BrushIcon from '@mui/icons-material/Brush';
import TimelineIcon from '@mui/icons-material/Timeline';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AdsClickIcon from '@mui/icons-material/AdsClick';

// Helper function to calculate distance between two hexes (axial coordinates)
// Returns the minimum number of hex steps needed to move from hexA to hexB

// Throttle function to limit socket emissions
const throttle = (func, limit) => {
  let inThrottle;
  return function() {
    const args = arguments;
    const context = this;
    if (!inThrottle) {
      func.apply(context, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
};

const evenq_to_axial = (hex) => {
    const q = hex.q
    const r = hex.r - (hex.q + (hex.q&1)) / 2
    return {q, r}
}


const calculateDistance = (hexA, hexB) => {
  // Convert axial coordinates to cube coordinates
  const a_axial = evenq_to_axial(hexA)
  const b_axial = evenq_to_axial(hexB)

  return (Math.abs(a_axial.q - b_axial.q)   
  + Math.abs(a_axial.q + a_axial.r - b_axial.q - b_axial.r)
  + Math.abs(a_axial.r - b_axial.r))/2 
};

// Generate a consistent color for each user based on their username
const getColorForUser = (name) => {
  // Create a more random hash by using multiple passes
  let hash1 = 0;
  let hash2 = 0;
  for (let i = 0; i < name.length; i++) {
    hash1 = ((hash1 << 5) - hash1 + name.charCodeAt(i)) & 0xffffffff;
    hash2 = ((hash2 << 3) - hash2 + name.charCodeAt(i) * 7) & 0xffffffff;
  }
  
  // Use both hashes to create more varied colors
  const hue = Math.abs(hash1) % 360;
  const saturation = 60 + (Math.abs(hash2) % 30); // 60-90%
  const lightness = 45 + (Math.abs(hash1 + hash2) % 25); // 45-70%
  
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
};

const presetColors = [
  '#FF0000', // Red
  '#0000FF', // Blue
  '#00FF00', // Green
  '#FFFF00', // Yellow
  '#FF00FF', // Magenta/Pink
  '#FFA500', // Orange
  '#FFFFFF', // White
  '#000000', // Black
];

// Hex line drawing algorithm - finds all hexes that a line passes through
const getHexLine = (startHex, endHex) => {
  if (!startHex || !endHex) return [];
  
  const startAxial = evenq_to_axial(startHex);
  const endAxial = evenq_to_axial(endHex);
  
  const distance = Math.max(
    Math.abs(startAxial.q - endAxial.q),
    Math.abs(startAxial.q + startAxial.r - endAxial.q - endAxial.r),
    Math.abs(startAxial.r - endAxial.r)
  );
  
  if (distance === 0) return [startHex];
  
  const results = [];
  for (let i = 0; i <= distance; i++) {
    const t = i / distance;
    const q = Math.round(startAxial.q + (endAxial.q - startAxial.q) * t);
    const r = Math.round(startAxial.r + (endAxial.r - startAxial.r) * t);
    
    // Convert back to offset coordinates
    const offsetQ = q;
    const offsetR = r + (q + (q & 1)) / 2;
    
    results.push({ q: offsetQ, r: offsetR, key: `${offsetQ},${offsetR}` });
  }
  
  return results;
};

// Helper function to find hex at a specific position
const findHexAtPosition = (hexes, x, y, hexSize) => {
  let closestHex = null;
  let minDistance = Infinity;
  
  for (const hex of hexes) {
    const distance = Math.sqrt(
      Math.pow(hex.centerX - x, 2) + Math.pow(hex.centerY - y, 2)
    );
    if (distance < hexSize && distance < minDistance) {
      minDistance = distance;
      closestHex = hex;
    }
  }
  
  return closestHex;
};

const HexGrid = ({ gridWidth = 32, gridHeight = 32, hexSize = 126, socket, roomData, initialHexData = {}, initialLines = [], onBackgroundToggle }) => {
  const [hexData, setHexData] = useState(initialHexData); 
  const [selectedColor, setSelectedColor] = useState('#0000FF');
  
  const [lines, setLines] = useState(initialLines);
  const [interactionMode, setInteractionMode] = useState('color'); // 'color', 'draw', 'erase'

  // Panning state to disable hex interactions during panning
  const [isPanning, setIsPanning] = useState(false);
  const [isTransforming, setIsTransforming] = useState(false);

  // Line Drawing State
  const [lineStartHex, setLineStartHex] = useState(null); // For click-click or drag start
  const [isDraggingLine, setIsDraggingLine] = useState(false);
  const [previewLine, setPreviewLine] = useState(null); // {x1, y1, x2, y2} - local coords
  const [hoveredHexKey, setHoveredHexKey] = useState(null);
  const [highlightedLinePath, setHighlightedLinePath] = useState([]); // Hexes that are part of the current line path

  // Coloring State
  const [isPainting, setIsPainting] = useState(false); // For brush-like coloring
  const [lastColoredHexKey, setLastColoredHexKey] = useState(null); // To show last colored hex in UI

  // Erasing State
  const [isErasing, setIsErasing] = useState(false); // For brush-like erasing

  // Other users' cursors state
  const [otherUsersCursors, setOtherUsersCursors] = useState({}); // { userName: { hex_key, mode, timestamp } }

  // Background visibility state
  const [showBackground, setShowBackground] = useState(true);

  const svgRef = useRef(null);

  // Throttled cursor update function to prevent excessive socket emissions
  const throttledCursorUpdate = useCallback(
    throttle((hexKey, mode) => {
      if (socket && roomData && !isPanning && !isTransforming) {
        socket.emit('cursor_update', {
          hex_key: hexKey,
          mode: mode
        });
      }
    }, 100), // Limit to once per 100ms
    [socket, roomData, isPanning, isTransforming]
  );

  // Socket listeners for multiplayer updates
  useEffect(() => {
    if (!socket || !roomData) return;

    // Listen for hex updates from other users
    const handleHexUpdated = (data) => {
      setHexData(prevData => ({
        ...prevData,
        [data.hex_key]: { ...prevData[data.hex_key], fillColor: data.fill_color }
      }));
    };

    // Listen for line additions from other users
    const handleLineAdded = (data) => {
      setLines(prevLines => [...prevLines, data.line]);
    };

    // Listen for hex erasing from other users
    const handleHexErased = (data) => {
      // Update hex color
      setHexData(prevData => ({
        ...prevData,
        [data.hex_key]: { ...prevData[data.hex_key], fillColor: 'lightgray' }
      }));
      // Update lines
      setLines(data.lines);
    };

    // Listen for other users' cursor movements
    const handleCursorMoved = (data) => {
      const { user_name, hex_key, mode } = data;
      if (user_name) {
        if (hex_key === null) {
          // Remove cursor when hex_key is null (user left the map area)
          setOtherUsersCursors(prevCursors => {
            const updated = { ...prevCursors };
            delete updated[user_name];
            return updated;
          });
        } else {
          // Update cursor position
          const timestamp = Date.now();
          setOtherUsersCursors(prevCursors => ({
            ...prevCursors,
            [user_name]: {
              hex_key,
              mode,
              timestamp
            }
          }));
        }
      }
    };

    // Listen for users leaving to clean up their cursors
    const handleUserLeft = (data) => {
      const { user_name } = data;
      if (user_name) {
        setOtherUsersCursors(prevCursors => {
          const updated = { ...prevCursors };
          delete updated[user_name];
          return updated;
        });
      }
    };

    socket.on('hex_updated', handleHexUpdated);
    socket.on('line_added', handleLineAdded);
    socket.on('hex_erased', handleHexErased);
    socket.on('cursor_moved', handleCursorMoved);
    socket.on('user_left', handleUserLeft);

    // Cleanup listeners
    return () => {
      socket.off('hex_updated', handleHexUpdated);
      socket.off('line_added', handleLineAdded);
      socket.off('hex_erased', handleHexErased);
      socket.off('cursor_moved', handleCursorMoved);
      socket.off('user_left', handleUserLeft);
    };
  }, [socket, roomData]);

  // Update hex data when initial data changes (room joined)
  useEffect(() => {
    setHexData(initialHexData);
  }, [initialHexData]);

  // Update lines when initial data changes (room joined)
  useEffect(() => {
    setLines(initialLines);
  }, [initialLines]);

  // Clean up old cursor positions periodically
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setOtherUsersCursors(prevCursors => {
        const updated = { ...prevCursors };
        Object.keys(updated).forEach(userName => {
          if (now - updated[userName].timestamp > 3000) {
            delete updated[userName];
          }
        });
        return Object.keys(updated).length !== Object.keys(prevCursors).length ? updated : prevCursors;
      });
    }, 1000); // Check every second

    return () => clearInterval(interval);
  }, []);

  const startingHex = {q:1, r:1}
  const layout = useMemo(() => {
    const hexes = [];
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const hexWidth = Math.sqrt(3) * hexSize;
    const hexHeight = 2 * hexSize;

    const offset_x =0;
    const offset_y =-2;

    
    for (let r = startingHex.r; r < gridHeight+1; r++) {
 
      for (let q =startingHex.q; q < gridWidth+1 ; q++) {
        
        // Calculate local centerX and centerY (relative to the eventual <g> transform)
        const centerX =  (hexSize * 1.5 - offset_x) * (q-startingHex.q) + hexSize;
        const centerY =  (hexSize * Math.sqrt(3) + offset_y) * (r-startingHex.r) + hexSize * (1 + (q-startingHex.q) % 2) * Math.sqrt(3) / 2; 
        const key = `${q},${r}`;
        hexes.push({ q, r, centerX, centerY, key });

      }
    }
    const padding = hexSize * 1.5; // Adjusted padding slightly

    const offsetX = -minX + padding;
    const offsetY = -minY + padding;

    return { hexes, offsetX, offsetY };
  }, [gridWidth, gridHeight, hexSize]);

  const applyColorToHex = useCallback((hexKey) => {
    setHexData(prevData => ({
      ...prevData,
      [hexKey]: { ...prevData[hexKey], fillColor: selectedColor }
    }));
    setLastColoredHexKey(hexKey);
    
    // Emit to other users
    if (socket && roomData) {
      socket.emit('hex_update', {
        hex_key: hexKey,
        fill_color: selectedColor
      });
    }
  }, [selectedColor, socket, roomData]);

  const eraseHex = useCallback((hexKey) => {
    // Remove any lines connected to this hex
    setLines(prevLines => prevLines.filter(line => 
        line.start.key !== hexKey && line.end.key !== hexKey
    ));
    // Reset hex color to default (lightgray) which will make it transparent
    setHexData(prevData => ({
        ...prevData,
        [hexKey]: { ...prevData[hexKey], fillColor: 'lightgray' }
    }));
    
    // Emit to other users
    if (socket && roomData) {
      socket.emit('hex_erase', {
        hex_key: hexKey
      });
    }
  }, [socket, roomData]);

  const handleHexMouseDown = useCallback((hex, event) => {
    // Only handle left mouse button for hex interactions
    if (event.button !== 0) return;
    
    // Don't handle hex interactions while panning or transforming
    if (isPanning || isTransforming) return;
    
    if (interactionMode === 'draw') {
      setIsDraggingLine(true);
      setLineStartHex(hex); 
      // Preview line coords are local to the transformed <g>
      setPreviewLine({ x1: hex.centerX, y1: hex.centerY, x2: hex.centerX, y2: hex.centerY });
    } else if (interactionMode === 'color') {
      applyColorToHex(hex.key);
      setIsPainting(true);
    } else if (interactionMode === 'erase') {
      eraseHex(hex.key);
      setIsErasing(true);
    }
    // No mousedown action for 'select' mode directly, click will handle it.
  }, [interactionMode, applyColorToHex, eraseHex, isPanning, isTransforming]);

  const handleHexMouseEnter = useCallback((hex) => {
    // Don't handle hex interactions while panning or transforming
    if (isPanning || isTransforming) return;
    
    setHoveredHexKey(hex.key);
    
    // Use throttled cursor update instead of direct socket emission
    throttledCursorUpdate(hex.key, interactionMode);
    
    if (interactionMode === 'draw' && isDraggingLine && lineStartHex) {
      // Snap preview line to entering hex's center (local coords)
      setPreviewLine({ x1: lineStartHex.centerX, y1: lineStartHex.centerY, x2: hex.centerX, y2: hex.centerY });
      
      // Calculate and highlight the line path
      const linePath = getHexLine(lineStartHex, hex);
      setHighlightedLinePath(linePath.map(h => h.key));
    } else if (interactionMode === 'draw' && lineStartHex && !isDraggingLine) {
      // For click-to-click line drawing, also show path on hover
      const linePath = getHexLine(lineStartHex, hex);
      setHighlightedLinePath(linePath.map(h => h.key));
    } else if (interactionMode === 'color' && isPainting) {
      applyColorToHex(hex.key);
    } else if (interactionMode === 'erase' && isErasing) {
      eraseHex(hex.key);
    }
  }, [interactionMode, isDraggingLine, lineStartHex, isPainting, isErasing, applyColorToHex, eraseHex, throttledCursorUpdate, isPanning, isTransforming]);
  const svgWidth = gridWidth * hexSize * 1.5 + hexSize * 2;
  const svgHeight = gridHeight * hexSize * 1.7 + hexSize * 2;
  
  // console.log('SVG Dimensions:', { svgWidth, svgHeight, gridWidth, gridHeight, hexSize });

  const handleSvgMouseMove = useCallback((event) => {
    if (interactionMode === 'draw' && isDraggingLine && lineStartHex && svgRef.current) {
        // If we're hovering over a hex, let handleHexMouseEnter handle the preview
        // This ensures the line snaps to hex centers when possible
        if (hoveredHexKey) {
          return;
        }
        
        // When not hovering over a hex, follow the mouse cursor
        const svgRect = svgRef.current.getBoundingClientRect();
        
        // Get the actual transform from the SVG element
        const svgElement = svgRef.current;
        const pt = svgElement.createSVGPoint();
        pt.x = event.clientX;
        pt.y = event.clientY;
        
        // Transform to SVG coordinates
        const svgP = pt.matrixTransform(svgElement.getScreenCTM().inverse());
        
        // Convert to local <g> coordinates by accounting for the transform offset
        const localX = svgP.x - layout.offsetX;
        const localY = svgP.y - layout.offsetY;

        setPreviewLine({ 
          x1: lineStartHex.centerX, 
          y1: lineStartHex.centerY, 
          x2: localX, 
          y2: localY 
        });
        
        // Find the closest hex to the mouse position for line path calculation
        const closestHex = findHexAtPosition(layout.hexes, localX, localY, hexSize);
        if (closestHex) {
          const linePath = getHexLine(lineStartHex, closestHex);
          setHighlightedLinePath(linePath.map(h => h.key));
        } else {
          setHighlightedLinePath([]);
        }
    }
  }, [interactionMode, isDraggingLine, lineStartHex, layout.offsetX, layout.offsetY, hoveredHexKey, layout.hexes, hexSize]);

  const handleSvgMouseUp = useCallback(() => {
    if (interactionMode === 'draw' && isDraggingLine && lineStartHex) {
        const targetHexKey = hoveredHexKey; // Check if mouse was over a hex upon release
        if (targetHexKey) {
            const endHex = layout.hexes.find(h => h.key === targetHexKey);
            if (endHex && lineStartHex.key !== endHex.key) {
                const distance = calculateDistance(lineStartHex, endHex);
                const newLine = { start: lineStartHex, end: endHex, distance, color: selectedColor };
                setLines(prevLines => [...prevLines, newLine]);
                
                // Emit to other users
                if (socket && roomData) {
                  socket.emit('line_add', {
                    line: newLine
                  });
                }
            }
        } 
        // Always reset dragging state whether a line was formed or not (if dropped in empty space)
        setIsDraggingLine(false);
        setLineStartHex(null);
        setPreviewLine(null);
        setHighlightedLinePath([]);
    }
    if (interactionMode === 'color' && isPainting) {
      setIsPainting(false);
    }
    if (interactionMode === 'erase' && isErasing) {
      setIsErasing(false);
    }
    // Clear hover state on mouse up to prevent bright hex from staying highlighted
    setHoveredHexKey(null);
  }, [interactionMode, isDraggingLine, lineStartHex, isPainting, isErasing, lines, hoveredHexKey, layout.hexes, selectedColor, socket, roomData]);

  const handleHexMouseUp = useCallback((hex, event) => {
    // Only handle left mouse button for hex interactions
    if (event && event.button !== 0) return;
    
    // Don't handle hex interactions while panning or transforming
    if (isPanning || isTransforming) return;
    
    // This specifically handles mouse up *on a hex*
    if (interactionMode === 'draw' && isDraggingLine && lineStartHex) {
      if (lineStartHex.key !== hex.key) {
        const distance = calculateDistance(lineStartHex, hex);
        const newLine = { start: lineStartHex, end: hex, distance, color: selectedColor };
        setLines(prevLines => [...prevLines, newLine]);
        
        // Emit to other users
        if (socket && roomData) {
          socket.emit('line_add', {
            line: newLine
          });
        }
      }
      setIsDraggingLine(false);
      setLineStartHex(null);
      setPreviewLine(null);
      setHighlightedLinePath([]);
    } else if (interactionMode === 'color' && isPainting) {
      setIsPainting(false);
    } else if (interactionMode === 'erase' && isErasing) {
      setIsErasing(false);
    }
    // Clear hover state on mouse up to prevent bright hex from staying highlighted
    setHoveredHexKey(null);
    // If not dragging, SvgMouseUp will handle it via hoveredHexKey, so this becomes a fallback
    // or can be simplified if SvgMouseUp is robust enough.
  }, [interactionMode, isDraggingLine, lineStartHex, isPainting, isErasing, lines, selectedColor, socket, roomData, isPanning, isTransforming]);

  const handleHexClick = useCallback((hex, event) => {
    // Only handle left mouse button for hex interactions
    if (event && event.button !== 0) return;
    
    // Don't handle hex interactions while panning or transforming
    if (isPanning || isTransforming) return;
    
    if (interactionMode === 'draw' && !isDraggingLine) {
      if (!lineStartHex) {
        setLineStartHex(hex);
        setPreviewLine(null);
        setHighlightedLinePath([]); 
      } else {
        if (lineStartHex.key !== hex.key) {
          const distance = calculateDistance(lineStartHex, hex);
          const newLine = { start: lineStartHex, end: hex, distance, color: selectedColor };
          setLines(prevLines => [...prevLines, newLine]);
          
          // Emit to other users
          if (socket && roomData) {
            socket.emit('line_add', {
              line: newLine
            });
          }
        }
        setLineStartHex(null);
        setHighlightedLinePath([]);
      }
    } else if (interactionMode === 'color' && !isPainting) {
        setLastColoredHexKey(hex.key); 
    }
    // Erase mode now works on mouse down/drag, not click
  }, [interactionMode, isDraggingLine, lineStartHex, lines, isPainting, selectedColor, socket, roomData, isPanning, isTransforming]);

  const handleInteractionModeChange = (event, newMode) => {
    if (newMode !== null) { // Prevent unselecting all buttons in ToggleButtonGroup
      setInteractionMode(newMode);
      // Reset states relevant to other modes to prevent conflicts
      setIsPainting(false);
      setIsErasing(false);
      setIsDraggingLine(false);
      setPreviewLine(null);
      setHoveredHexKey(null);
      setHighlightedLinePath([]);
      // setLastColoredHexKey(null); // Optional: decide if last colored info should persist across mode changes
    }
  };

  const getHexAtKey = (key) => layout.hexes.find(h => h.key === key);
  const lastColoredHexDetails = lastColoredHexKey ? getHexAtKey(lastColoredHexKey) : null;
  const imageUrl = '/static/Map.png';

  // Panning event handlers
  const handlePanningStart = useCallback(() => {
    setIsPanning(true);
    setHoveredHexKey(null); // Clear hover state when panning starts
  }, []);

  const handlePanningStop = useCallback(() => {
    setIsPanning(false);
  }, []);

  const handleTransformStart = useCallback(() => {
    setIsTransforming(true);
  }, []);

  const handleTransformStop = useCallback(() => {
    setIsTransforming(false);
  }, []);

  return (
    <Box sx={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* Left Sidebar */}
      <Box sx={{ 
        width: '280px', 
        background: 'linear-gradient(135deg, rgba(0, 17, 34, 0.95), rgba(0, 8, 17, 0.98))',
        border: '1px solid var(--neotech-border)',
        boxShadow: 'inset 0 0 10px rgba(0, 255, 255, 0.2), 0 0 5px rgba(0, 255, 255, 0.3)',
        backdropFilter: 'blur(10px)',
        padding: 2, 
        borderRight: '2px solid var(--neotech-primary)',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        overflow: 'hidden',
        position: 'relative',
        maxHeight: '100vh'
      }}>
        {/* Animated top border */}
        <Box sx={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '2px',
          background: 'linear-gradient(90deg, transparent, var(--neotech-primary), transparent)',
          animation: 'neotech-scan 3s ease-in-out infinite'
        }} />

        {/* Header */}
        <Typography variant="h5" sx={{ 
          fontWeight: 'bold', 
          mb: 0.5,
          fontSize: '13px',
          color: 'var(--neotech-primary)',
          textShadow: 'var(--neotech-glow-small)',
          fontFamily: "'Orbitron', monospace",
          textTransform: 'uppercase',
          letterSpacing: '2px',
          flexShrink: 0
        }}>
          Hex Map Editor
        </Typography>

        {/* Tools Section */}
        <Box sx={{ flexShrink: 0 }}>
          <Typography variant="h6" sx={{ 
            mb: 1, 
            fontSize: '12px', 
            fontWeight: 'bold',
            color: 'var(--neotech-text-secondary)',
            fontFamily: "'Rajdhani', monospace",
            textTransform: 'uppercase',
            letterSpacing: '1px'
          }}>
            Tools
          </Typography>
          <ToggleButtonGroup
            value={interactionMode}
            exclusive
            onChange={handleInteractionModeChange}
            orientation="vertical"
            fullWidth
            sx={{ 
              '& .MuiToggleButton-root': { 
                justifyContent: 'flex-start', 
                px: 1.5,
                py: 0.8,
                fontSize: '11px',
                border: '1px solid var(--neotech-border)',
                background: 'rgba(0, 255, 255, 0.1)',
                color: 'var(--neotech-text-secondary)',
                fontFamily: "'Rajdhani', monospace",
                fontWeight: 600,
                '&:hover': {
                  background: 'rgba(0, 255, 255, 0.2)',
                  boxShadow: 'var(--neotech-glow-small)'
                },
                '&.Mui-selected': {
                  background: 'linear-gradient(135deg, rgba(0, 255, 255, 0.3), rgba(0, 153, 204, 0.3))',
                  color: 'var(--neotech-primary)',
                  boxShadow: 'var(--neotech-glow-medium)'
                }
              }
            }}
          >
            <ToggleButton value="select" aria-label="select mode">
              <AdsClickIcon sx={{ mr: 1, fontSize: '16px' }} />
              Select
            </ToggleButton>
            <ToggleButton value="color" aria-label="color mode">
              <BrushIcon sx={{ mr: 1, fontSize: '16px' }} />
              Paint
            </ToggleButton>
            <ToggleButton value="draw" aria-label="draw lines mode">
              <TimelineIcon sx={{ mr: 1, fontSize: '16px' }} />
              Measure
            </ToggleButton>
            <ToggleButton value="erase" aria-label="erase lines mode">
              <DeleteOutlineIcon sx={{ mr: 1, fontSize: '16px' }} />
              Erase
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>

        {/* Background Toggle Section */}
        <Box sx={{ flexShrink: 0 }}>
          <Typography variant="h6" sx={{ 
            mb: 1, 
            fontSize: '12px', 
            fontWeight: 'bold',
            color: 'var(--neotech-text-secondary)',
            fontFamily: "'Rajdhani', monospace",
            textTransform: 'uppercase',
            letterSpacing: '1px'
          }}>
            Display
          </Typography>
          <FormControlLabel
            control={
                             <Switch
                 checked={showBackground}
                 onChange={(e) => {
                   setShowBackground(e.target.checked);
                   if (onBackgroundToggle) {
                     onBackgroundToggle(e.target.checked);
                   }
                 }}
                sx={{
                  '& .MuiSwitch-switchBase.Mui-checked': {
                    color: 'var(--neotech-primary)',
                    '&:hover': {
                      backgroundColor: 'rgba(0, 255, 255, 0.1)',
                    },
                  },
                  '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                    backgroundColor: 'var(--neotech-primary)',
                  },
                  '& .MuiSwitch-track': {
                    backgroundColor: 'var(--neotech-border)',
                  },
                  '& .MuiSwitch-switchBase': {
                    color: 'var(--neotech-text-secondary)',
                  }
                }}
              />
            }
            label={
              <Typography sx={{ 
                fontSize: '11px',
                color: 'var(--neotech-text-secondary)',
                fontFamily: "'Rajdhani', monospace",
                fontWeight: 600
              }}>
                Background Map
              </Typography>
            }
            sx={{ 
              ml: 0, 
              '& .MuiFormControlLabel-label': { 
                ml: 1 
              }
            }}
          />
        </Box>

        {/* Color Section - Make it scrollable if needed */}
        {(interactionMode === 'color' || interactionMode === 'draw') && (
          <Box sx={{ flexShrink: 0, display: 'flex', flexDirection: 'column', maxHeight: '60vh' }}>
            <Typography variant="h6" sx={{ 
              mb: 1, 
              fontSize: '12px', 
              fontWeight: 'bold',
              color: 'var(--neotech-text-secondary)',
              fontFamily: "'Rajdhani', monospace",
              textTransform: 'uppercase',
              letterSpacing: '1px',
              flexShrink: 0
            }}>
              Color
            </Typography>
            
            <Box sx={{ overflow: 'auto', flex: 1, minHeight: 0 }}>
              {/* Current Color Display */}
              <Box sx={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: 1, 
                mb: 1.5,
                p: 1,
                background: 'rgba(0, 17, 34, 0.8)',
                border: '1px solid var(--neotech-border)',
                borderRadius: 1,
                boxShadow: 'inset 0 0 10px rgba(0, 0, 0, 0.5)'
              }}>
                <Box
                  sx={{
                    width: 32,
                    height: 32,
                    backgroundColor: selectedColor,
                    border: '1px solid var(--neotech-primary)',
                    borderRadius: 1,
                    boxShadow: 'var(--neotech-glow-small)'
                  }}
                />
                <Typography variant="body2" sx={{ 
                  fontFamily: "'Courier New', monospace",
                  color: 'var(--neotech-accent)',
                  fontSize: '10px'
                }}>
                  {selectedColor}
                </Typography>
              </Box>

              {/* Color Palette */}
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px', mb: 1.5 }}>
                {presetColors.map((color) => (
                  <Box
                    key={color}
                    onClick={() => setSelectedColor(color)}
                    sx={{
                      width: 32,
                      height: 32,
                      backgroundColor: color,
                      border: selectedColor === color ? '2px solid var(--neotech-primary)' : '1px solid var(--neotech-border)',
                      borderRadius: 1,
                      cursor: 'pointer',
                      boxShadow: selectedColor === color ? 'var(--neotech-glow-medium)' : 'none',
                      transition: 'all 0.3s ease',
                      '&:hover': {
                        borderColor: 'var(--neotech-primary)',
                        boxShadow: 'var(--neotech-glow-small)',
                        transform: 'translateY(-1px)'
                      }
                    }}
                  />
                ))}
              </Box>

              {/* Color Picker */}
              <Box sx={{
                background: 'rgba(0, 17, 34, 0.8)',
                border: '1px solid var(--neotech-border)',
                borderRadius: 1,
                padding: 1,
                boxShadow: 'inset 0 0 10px rgba(0, 0, 0, 0.5)'
              }}>
                <HexColorPicker 
                  color={selectedColor} 
                  onChange={setSelectedColor} 
                  style={{ width: '100%', height: '100px' }}
                />
              </Box>
            </Box>
          </Box>
        )}

   
        {/* Status/Info Section */}
        <Box sx={{ 
          p: 1, 
          background: 'rgba(0, 17, 34, 0.8)',
          border: '1px solid var(--neotech-border)',
          borderRadius: 1,
          boxShadow: 'inset 0 0 10px rgba(0, 0, 0, 0.5)',
          fontSize: '10px',
          flexShrink: 0
        }}>
          {interactionMode === 'color' && lastColoredHexDetails && (
            <Typography variant="caption" sx={{ 
              color: 'var(--neotech-text-secondary)',
              fontFamily: "'Rajdhani', monospace"
            }}>
              Last painted: ({lastColoredHexDetails.q+startingHex.q},{lastColoredHexDetails.r+startingHex.r})
            </Typography>
          )}
          {(interactionMode === 'draw' && lineStartHex) && (
            <Typography variant="caption" sx={{ 
              color: 'var(--neotech-primary)',
              fontFamily: "'Rajdhani', monospace"
            }}>
              {isDraggingLine ? "Dragging from:" : "Start:"} ({lineStartHex.q}, {lineStartHex.r})
              {hoveredHexKey && <><br/>Target: ({hoveredHexKey.split(',')[0]}, {hoveredHexKey.split(',')[1]})</>}
            </Typography>
          )}
          {interactionMode === 'erase' && (
            <Typography variant="caption" sx={{ 
              color: 'var(--neotech-error)',
              fontFamily: "'Rajdhani', monospace"
            }}>
              Drag to erase lines and colors
            </Typography>
          )}
        </Box>

        {/* Navigation Tips */}
        <Box sx={{ 
          p: 1, 
          background: 'linear-gradient(135deg, rgba(0, 255, 255, 0.1), rgba(0, 153, 204, 0.1))',
          border: '1px solid var(--neotech-primary)',
          borderRadius: 1,
          fontSize: '11px',
          boxShadow: 'var(--neotech-glow-small)'
        }}>
          <Typography variant="caption" sx={{ 
            display: 'block', 
            fontWeight: 'bold', 
            mb: 0.5,
            color: 'var(--neotech-primary)',
            fontFamily: "'Orbitron', monospace",
            textTransform: 'uppercase'
          }}>
            Tip:
          </Typography>
          <Typography variant="caption" sx={{ 
            display: 'block',
            color: 'var(--neotech-text-secondary)',
            fontFamily: "'Rajdhani', monospace"
          }}>
            Use mouse wheel to zoom in/out
          </Typography>
          <Typography variant="caption" sx={{ 
            display: 'block',
            color: 'var(--neotech-text-secondary)',
            fontFamily: "'Rajdhani', monospace"
          }}>
            Right-click drag to pan the map
          </Typography>
        </Box>
      </Box>

      {/* Main Content Area */}
      <Box sx={{ 
        flex: 1, 
        display: 'flex', 
        flexDirection: 'column',
        overflow: 'hidden'
      }}>
        {/* Hex Grid */}
        <Box sx={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        
          <TransformWrapper
            initialScale={0.3}
            minScale={0.11}
            maxScale={2}
            limitToBounds={false}
            centerZoomedOut={true}
            wheel={{ step: 0.05 }}
            pinch={{ step: 5 }}
            doubleClick={{ disabled: true }}
            centerOnInit={true}
            onPanningStart={handlePanningStart}
            onPanningStop={handlePanningStop}
            onZoomStart={handleTransformStart}
            onZoomStop={handleTransformStop}
          >
            <TransformComponent
              wrapperStyle={{ width: '100%', height: '100%' }}
              contentStyle={{ width: 'max-content', height: 'max-content' }}
            >
              <svg 
                ref={svgRef}
                width={svgWidth}
                height={svgHeight}
                viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                style={{ 
                  border: 'none',
                  display: 'block',
                  cursor: 
                    interactionMode === 'color' && isPainting ? 'grabbing' : 
                    interactionMode === 'erase' && isErasing ? 'grabbing' :
                    interactionMode === 'erase' ? 'crosshair' :
                    'grab'
                }}
                onMouseMove={handleSvgMouseMove}
                onMouseUp={handleSvgMouseUp}
                onMouseLeave={() => { 
                    setHoveredHexKey(null); 
                    // Clear cursor for other users when mouse leaves the map using throttled update
                    throttledCursorUpdate(null, interactionMode);
                }}
                onContextMenu={(e) => e.preventDefault()}
              >
                <image href={imageUrl} />
                <g transform={`translate(${layout.offsetX}, ${layout.offsetY})`}>
                  {/* Render normal hexes first */}
                  {layout.hexes.filter((hex) => {
                    const isLineStartingPoint = interactionMode === 'draw' && lineStartHex?.key === hex.key;
                    const isHovered = hoveredHexKey === hex.key;
                    const isErasableEndpoint = interactionMode === 'erase' && isHovered && 
                      lines.some(line => line.start.key === hex.key || line.end.key === hex.key);
                    const currentHexData = hexData[hex.key] || {};
                    const isPaintedHex = currentHexData.fillColor && currentHexData.fillColor !== 'lightgray';
                    const isErasableHighlight = interactionMode === 'erase' && isHovered && (isErasableEndpoint || isPaintedHex);
                    const isInLinePath = highlightedLinePath.includes(hex.key);
                    
                    const highlight = interactionMode === 'draw' && (isLineStartingPoint || (isDraggingLine && isHovered));
                    const isGeneralHover = isHovered && !highlight && !isErasableHighlight;
                    const isSelected = interactionMode === 'color' && lastColoredHexKey === hex.key && !isPainting;
                    
                    // Only render if NOT highlighted, hovered, selected, or in line path
                    return !highlight && !isErasableHighlight && !isGeneralHover && !isSelected && !isInLinePath;
                  }).map((hex) => {
                    const currentHexData = hexData[hex.key] || {};
                    
                    return (
                      <Hexagon
                        key={hex.key}
                        {...hex}
                        size={hexSize}
                        fillColor={currentHexData.fillColor || 'lightgray'}
                        onClick={handleHexClick} 
                        onMouseDown={handleHexMouseDown}
                        onMouseUp={handleHexMouseUp}
                        onMouseEnter={handleHexMouseEnter}
                        isHighlighted={false}
                        isHovered={false}
                        isSelectedForColoring={false}
                        centerX={hex.centerX} 
                        centerY={hex.centerY}
                      />
                    );
                  })}

                  {/* Render highlighted/hovered/selected hexes last (on top) */}
                  {layout.hexes.filter((hex) => {
                    const isLineStartingPoint = interactionMode === 'draw' && lineStartHex?.key === hex.key;
                    const isHovered = hoveredHexKey === hex.key;
                    const isErasableEndpoint = interactionMode === 'erase' && isHovered && 
                      lines.some(line => line.start.key === hex.key || line.end.key === hex.key);
                    const currentHexData = hexData[hex.key] || {};
                    const isPaintedHex = currentHexData.fillColor && currentHexData.fillColor !== 'lightgray';
                    const isErasableHighlight = interactionMode === 'erase' && isHovered && (isErasableEndpoint || isPaintedHex);
                    const isInLinePath = highlightedLinePath.includes(hex.key);
                    
                    const highlight = interactionMode === 'draw' && (isLineStartingPoint || (isDraggingLine && isHovered));
                    const isGeneralHover = isHovered && !highlight && !isErasableHighlight;
                    const isSelected = interactionMode === 'color' && lastColoredHexKey === hex.key && !isPainting;
                    
                    // Only render if highlighted, hovered, selected, or in line path
                    return highlight || isErasableHighlight || isGeneralHover || isSelected || isInLinePath;
                  }).map((hex) => {
                    const currentHexData = hexData[hex.key] || {};
                    const isLineStartingPoint = interactionMode === 'draw' && lineStartHex?.key === hex.key;
                    const isHovered = hoveredHexKey === hex.key;
                    const isErasableEndpoint = interactionMode === 'erase' && isHovered && 
                      lines.some(line => line.start.key === hex.key || line.end.key === hex.key);
                    const isPaintedHex = currentHexData.fillColor && currentHexData.fillColor !== 'lightgray';
                    const isErasableHighlight = interactionMode === 'erase' && isHovered && (isErasableEndpoint || isPaintedHex);
                    const isInLinePath = highlightedLinePath.includes(hex.key);
                    
                    const highlight = interactionMode === 'draw' && (isLineStartingPoint || (isDraggingLine && isHovered));
                    const isGeneralHover = isHovered && !highlight && !isErasableHighlight;

                    return (
                      <Hexagon
                        key={`top-${hex.key}`}
                        {...hex}
                        size={hexSize}
                        fillColor={currentHexData.fillColor || 'lightgray'}
                        onClick={handleHexClick} 
                        onMouseDown={handleHexMouseDown}
                        onMouseUp={handleHexMouseUp}
                        onMouseEnter={handleHexMouseEnter}
                        isHighlighted={highlight || isErasableHighlight}
                        isHovered={isGeneralHover}
                        isSelectedForColoring={interactionMode === 'color' && lastColoredHexKey === hex.key && !isPainting}
                        isInLinePath={isInLinePath}
                        centerX={hex.centerX} 
                        centerY={hex.centerY}
                      />
                    );
                  })}

                  {lines.map((line, index) => {
                    const isHoveredForErase = interactionMode === 'erase' && 
                                              (hoveredHexKey === line.start.key || hoveredHexKey === line.end.key);
                    return (
                      <Line
                        key={`line-${index}`}
                        startX={line.start.centerX}
                        startY={line.start.centerY}
                        endX={line.end.centerX}
                        endY={line.end.centerY}
                        distance={line.distance}
                        isHoveredForErase={isHoveredForErase}
                        color={line.color || selectedColor}
                      />
                    );
                  })}

                  {interactionMode === 'draw' && previewLine && isDraggingLine && (
                    <line
                      x1={previewLine.x1}
                      y1={previewLine.y1}
                      x2={previewLine.x2}
                      y2={previewLine.y2}
                      stroke="dodgerblue"
                      strokeWidth="2"
                      strokeDasharray="4 2"
                      style={{pointerEvents: 'none'}}
                    />
                  )}
                  
                  {interactionMode === 'draw' && lineStartHex && (
                    <circle 
                        cx={lineStartHex.centerX} 
                        cy={lineStartHex.centerY} 
                        r="6" 
                        fill={isDraggingLine ? "rgba(30,144,255,0.5)" : "rgba(30,144,255,0.8)"} 
                        stroke="white"
                        strokeWidth="1.5"
                        style={{pointerEvents: 'none'}}
                    />
                  )}

                  {/* Render other users' cursors */}
                  {!isPanning && !isTransforming && Object.entries(otherUsersCursors).map(([userName, cursorData]) => {
                    const hex = layout.hexes.find(h => h.key === cursorData.hex_key);
                    if (!hex) return null;

                    const userColor = getColorForUser(userName);
                    const isTimedOut = Date.now() - cursorData.timestamp > 3000;
                    
                    if (isTimedOut) return null;

                    return (
                      <g key={`cursor-${userName}`} style={{pointerEvents: 'none'}}>
                        {/* Cursor circle */}
                        <path
                            d={`M ${hex.centerX-hexSize} ${hex.centerY} 
                               L ${hex.centerX - hexSize/2} ${hex.centerY + Math.sqrt(3) *hexSize/2}
                               L ${hex.centerX + hexSize/2} ${hex.centerY + Math.sqrt(3) *hexSize/2}
                               L ${hex.centerX + hexSize} ${hex.centerY}
                               L ${hex.centerX + hexSize/2} ${hex.centerY - Math.sqrt(3) *hexSize/2}
                               L ${hex.centerX - hexSize/2} ${hex.centerY - Math.sqrt(3) *hexSize/2}
                               L ${hex.centerX - hexSize} ${hex.centerY}
                               Z`}
                            fill="none"
                            stroke={userColor}
                            
                            strokeWidth="10"
                          />
                        
                        {/* Mode indicator */}
        
                        
                        {/* Username label */}
                        <text 
                          x={hex.centerX+120} 
                          y={hex.centerY - 120} 
                          textAnchor="middle" 
                          fontSize="44" 
                          fontWeight="bold"
                          fill={userColor}
                          stroke="black" 
                          strokeWidth="12"
                          paintOrder="stroke"
                        >
                          {userName}
                        </text>
                      </g>
                    );
                  })}
                </g>
                <Arrow 
                  color={selectedColor} 
                  lineColors={[...new Set(lines.map(line => line.color || selectedColor))]} 
                />
              </svg>
            </TransformComponent>
          </TransformWrapper>
        </Box>
      </Box>
    </Box>
  );
};

export default HexGrid; 