import React, { useState, useCallback, useMemo, useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import Line from './Line';
import Arrow from './Arrow';
import Unit from './Unit';
import UnitCreationDialog from './UnitCreationDialog';
import UnitDetailsDialog from './UnitDetailsDialog';
import { HexColorPicker } from 'react-colorful';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import BrushIcon from '@mui/icons-material/Brush';
import TimelineIcon from '@mui/icons-material/Timeline';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AdsClickIcon from '@mui/icons-material/AdsClick';
import PersonIcon from '@mui/icons-material/Person';

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

const HexGrid = forwardRef(({ gridWidth = 32, gridHeight = 32, hexSize = 126, socket, roomData, initialHexData = {}, initialLines = [], initialUnits = [], onBackgroundToggle, apiBaseUrl }, ref) => {
  const [hexData, setHexData] = useState(initialHexData); 
  const [selectedColor, setSelectedColor] = useState('#0000FF');
  
  const [lines, setLines] = useState(initialLines);
  const [units, setUnits] = useState(initialUnits);
  const [interactionMode, setInteractionMode] = useState('color'); // 'color', 'draw', 'erase', 'unit'

  // Performance measurement refs
  const renderStartTime = useRef(0);
  const performanceData = useRef({
    hexRenderData: 0,
    normalHexes: 0,
    specialHexes: 0,
    visionRanges: 0,
    lines: 0,
    units: 0,
    cursors: 0,
    total: 0
  });
  
  // Log performance data periodically
  useEffect(() => {
    const interval = setInterval(() => {
      const data = performanceData.current;
      if (data.total > 0) {
        console.log('Rendering Performance (ms):', {
          hexRenderData: data.hexRenderData.toFixed(2),
          normalHexes: data.normalHexes.toFixed(2),
          specialHexes: data.specialHexes.toFixed(2),
          visionRanges: data.visionRanges.toFixed(2),
          lines: data.lines.toFixed(2),
          units: data.units.toFixed(2),
          cursors: data.cursors.toFixed(2),
          total: data.total.toFixed(2)
        });
      }
    }, 2000); // Log every 2 seconds
    
    return () => clearInterval(interval);
  }, []);

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

  // Unit State
  const [showUnitDialog, setShowUnitDialog] = useState(false);
  const [unitCreationHex, setUnitCreationHex] = useState(null);
  const [isDraggingUnit, setIsDraggingUnit] = useState(false);
  const [draggedUnit, setDraggedUnit] = useState(null);
  const [draggedUnitPosition, setDraggedUnitPosition] = useState(null); // Track current visual position during drag
  const [hoveredUnitId, setHoveredUnitId] = useState(null);
  const [showDeleteUnitDialog, setShowDeleteUnitDialog] = useState(false);
  const [unitToDelete, setUnitToDelete] = useState(null);
  const [showUnitDetailsDialog, setShowUnitDetailsDialog] = useState(false);
  const [selectedUnitId, setSelectedUnitId] = useState(null);
  const [forceParentUnitId, setForceParentUnitId] = useState(null);

  // Unit Grouping State
  const [groupedUnits, setGroupedUnits] = useState(new Set()); // Set of unit IDs that are grouped


  // Other users' cursors state
  const [otherUsersCursors, setOtherUsersCursors] = useState({}); // { userName: { hex_key, mode, timestamp } }

  // Background visibility state
  const [showBackground, setShowBackground] = useState(true);

  const svgRef = useRef(null);

  // Track last emitted cursor position to avoid redundant emissions
  const lastEmittedCursorRef = useRef({ hexKey: null, mode: null });
  
  // Throttled cursor update function to prevent excessive socket emissions
  const throttledCursorUpdate = useCallback(
    throttle((hexKey, mode) => {
      // Only emit if hex or mode actually changed
      if (lastEmittedCursorRef.current.hexKey === hexKey && 
          lastEmittedCursorRef.current.mode === mode) {
        return; // No change, skip emission
      }
      
      if (socket && roomData && !isPanning && !isTransforming) {
        lastEmittedCursorRef.current = { hexKey, mode };
        socket.emit('cursor_update', {
          hex_key: hexKey,
          mode: mode
        });
      }
    }, 300), // Increased to 300ms to reduce emissions significantly
    [socket, roomData, isPanning, isTransforming]
  );

  // Use ref for hover state to avoid React re-renders - only update state when needed for interactions
  const hoveredHexKeyRef = useRef(null);
  const hoverUpdateTimeoutRef = useRef(null);
  
  const setHoveredHexKeyRef = useCallback((hexKey, updateState = false) => {
    const prevKey = hoveredHexKeyRef.current;
    hoveredHexKeyRef.current = hexKey;
    
    // Only update React state if needed for interactions (not just visual feedback)
    if (updateState && hexKey !== hoveredHexKey) {
      // Debounce state updates to reduce re-renders
      if (hoverUpdateTimeoutRef.current) {
        clearTimeout(hoverUpdateTimeoutRef.current);
      }
      hoverUpdateTimeoutRef.current = setTimeout(() => {
        setHoveredHexKey(hexKey);
        hoverUpdateTimeoutRef.current = null;
      }, 50); // 50ms debounce
    }
    
    // Direct DOM manipulation for hover visual feedback (no React re-render)
    if (svgRef.current && prevKey !== hexKey) {
      const svg = svgRef.current;
      
      // Remove hover class from previous hex
      if (prevKey) {
        const prevElement = svg.querySelector(`[data-hex-key="${prevKey}"]`);
        if (prevElement && !prevElement.classList.contains('special-hex')) {
          prevElement.setAttribute('stroke', 'black');
          prevElement.setAttribute('stroke-width', '1');
          prevElement.setAttribute('stroke-opacity', '0.8');
        }
      }
      
      // Add hover class to new hex (only if not special)
      if (hexKey) {
        const element = svg.querySelector(`[data-hex-key="${hexKey}"]`);
        if (element && !element.classList.contains('special-hex')) {
          element.setAttribute('stroke', '#00ffff');
          element.setAttribute('stroke-width', '12.5');
          element.setAttribute('stroke-opacity', '1');
        }
      }
    }
  }, [hoveredHexKey]);

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

    // Listen for unit additions from other users
    const handleUnitAdded = (data) => {
      setUnits(prevUnits => [...prevUnits, data.unit]);
    };

    // Listen for unit movements from other users
    const handleUnitMoved = (data) => {
      setUnits(prevUnits => 
        prevUnits.map(unit => 
          unit.id === data.unit_id 
            ? { ...unit, hex_key: data.hex_key }
            : unit
        )
      );
    };

    // Listen for unit deletions from other users
    const handleUnitDeleted = (data) => {
      setUnits(prevUnits => prevUnits.filter(unit => unit.id !== data.unit_id));
    };

    const handleUnitUpdated = (data) => {
      const updated = data.unit;
      if (!updated || !updated.id) return;
      setUnits(prevUnits => {
        const idx = prevUnits.findIndex(u => u.id === updated.id);
        if (idx === -1) return [...prevUnits, updated];
        const copy = [...prevUnits];
        copy[idx] = { ...copy[idx], ...updated };
        return copy;
      });
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
      // Note: Units are NOT deleted when erasing hex - only colors and lines are removed
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
    socket.on('unit_added', handleUnitAdded);
    socket.on('unit_moved', handleUnitMoved);
    socket.on('unit_deleted', handleUnitDeleted);
    socket.on('unit_updated', handleUnitUpdated);
    socket.on('hex_erased', handleHexErased);
    socket.on('cursor_moved', handleCursorMoved);
    socket.on('user_left', handleUserLeft);

    // Cleanup listeners
    return () => {
      socket.off('hex_updated', handleHexUpdated);
      socket.off('line_added', handleLineAdded);
      socket.off('unit_added', handleUnitAdded);
      socket.off('unit_moved', handleUnitMoved);
      socket.off('unit_deleted', handleUnitDeleted);
      socket.off('unit_updated', handleUnitUpdated);
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

  // Update units when initial data changes (room joined)
  useEffect(() => {
    setUnits(initialUnits);
  }, [initialUnits]);

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

  // Global right-click handler to cancel unit dragging
  useEffect(() => {
    const handleGlobalRightClick = (event) => {
      if (isDraggingUnit) {
        setIsDraggingUnit(false);
        setDraggedUnit(null);
        setDraggedUnitPosition(null);
        event.preventDefault();
      }
    };

    document.addEventListener('contextmenu', handleGlobalRightClick);

    return () => {
      document.removeEventListener('contextmenu', handleGlobalRightClick);
    };
  }, [isDraggingUnit]);

  const startingHex = {q:1, r:1}
  
  // Pre-calculate hex points once - this is constant for all hexes
  const hexPoints = useMemo(() => {
    const hexWidth = Math.sqrt(3) * hexSize;
    return [
      [-hexSize, 0],                      // left
      [-hexSize/2, hexWidth/2],           // bottom-left  
      [hexSize/2, hexWidth/2],            // bottom-right
      [hexSize, 0],                       // right
      [hexSize/2, -hexWidth/2],           // top-right
      [-hexSize/2, -hexWidth/2],          // top-left
    ].map(p => p.join(',')).join(' ');
  }, [hexSize]);
  
  const layout = useMemo(() => {
    const hexes = [];
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const hexWidth = Math.sqrt(3) * hexSize;
    const hexHeight = 2 * hexSize;

    const offset_x =0;
    const offset_y =-2;

    
    for (let r = startingHex.r; r < gridHeight+1; r++) {
 
      for (let q =startingHex.q; q <gridWidth+1 ; q++) {
        
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
  
  // Create fast lookup map for hexes by key (O(1) instead of O(n) find)
  const hexesByKey = useMemo(() => {
    const map = new Map();
    layout.hexes.forEach(hex => {
      map.set(hex.key, hex);
    });
    return map;
  }, [layout.hexes]);
  
  // Memoize base hex rendering properties (static data - doesn't change on hover)
  const baseHexRenderData = useMemo(() => {
    const start = performance.now();
    const renderData = new Map();
    const unitsByHexKey = new Map();
    units.forEach(unit => {
      if (!unitsByHexKey.has(unit.hex_key)) {
        unitsByHexKey.set(unit.hex_key, []);
      }
      unitsByHexKey.get(unit.hex_key).push(unit);
    });
    
    layout.hexes.forEach(hex => {
      const currentHexData = hexData[hex.key] || {};
      const fillColor = currentHexData.fillColor || 'lightgray';
      const isPainted = fillColor !== 'lightgray';
      const hasUnit = unitsByHexKey.has(hex.key);
      
      // Base opacity (without hover/selection effects)
      const opacity = isPainted ? 0.5 : 0;
      
      renderData.set(hex.key, {
        fillColor,
        opacity,
        strokeColor: 'black',
        strokeWidth: 1,
        strokeOpacity: 0.8,
        hasUnit
      });
    });
    
    performanceData.current.hexRenderData = performance.now() - start;
    return renderData;
  }, [layout.hexes, hexData, units]);

  // Calculate which hexes are "special" (hovered/selected) - separate set for filtering
  // Use ref for hover to avoid recalculating on every hover change
  const specialHexesSet = useMemo(() => {
    const specialSet = new Set();
    const lineStartKey = lineStartHex?.key;
    const highlightedLinePathSet = new Set(highlightedLinePath);
    const currentHoverKey = hoveredHexKeyRef.current || hoveredHexKey; // Prefer ref, fallback to state
    
    layout.hexes.forEach(hex => {
      const baseData = baseHexRenderData.get(hex.key);
      if (!baseData) return;
      
      const isHovered = currentHoverKey === hex.key;
      const isLineStartingPoint = interactionMode === 'draw' && lineStartKey === hex.key;
      const isErasableEndpoint = interactionMode === 'erase' && isHovered && 
        lines.some(line => line.start.key === hex.key || line.end.key === hex.key);
      const isPainted = baseData.fillColor !== 'lightgray';
      const isErasableHighlight = interactionMode === 'erase' && isHovered && (isErasableEndpoint || isPainted || baseData.hasUnit);
      const isInLinePath = highlightedLinePathSet.has(hex.key);
      const highlight = interactionMode === 'draw' && (isLineStartingPoint || (isDraggingLine && isHovered));
      const isGeneralHover = isHovered && !highlight && !isErasableHighlight && 
        !(interactionMode === 'unit' && !baseData.hasUnit && !isDraggingUnit);
      const isSelected = interactionMode === 'color' && lastColoredHexKey === hex.key && !isPainting;
      const isUnitTargetHover = interactionMode === 'unit' && isHovered && isDraggingUnit;
      
      const isSpecial = highlight || isErasableHighlight || isGeneralHover || isSelected || isInLinePath || isUnitTargetHover;
      if (isSpecial) {
        specialSet.add(hex.key);
      }
    });
    
    return specialSet;
  }, [baseHexRenderData, hoveredHexKey, lineStartHex, interactionMode, isDraggingLine, lines, lastColoredHexKey, isPainting, highlightedLinePath, isDraggingUnit, layout.hexes]);

  // Calculate dynamic hex properties (hover, selection, etc.) separately
  const hexRenderData = useMemo(() => {
    const renderData = new Map();
    const lineStartKey = lineStartHex?.key;
    const highlightedLinePathSet = new Set(highlightedLinePath);
    
    layout.hexes.forEach(hex => {
      const baseData = baseHexRenderData.get(hex.key);
      if (!baseData) return;
      
      const isHovered = hoveredHexKey === hex.key;
      const isLineStartingPoint = interactionMode === 'draw' && lineStartKey === hex.key;
      const isErasableEndpoint = interactionMode === 'erase' && isHovered && 
        lines.some(line => line.start.key === hex.key || line.end.key === hex.key);
      const isPainted = baseData.fillColor !== 'lightgray';
      const isErasableHighlight = interactionMode === 'erase' && isHovered && (isErasableEndpoint || isPainted || baseData.hasUnit);
      const isInLinePath = highlightedLinePathSet.has(hex.key);
      const highlight = interactionMode === 'draw' && (isLineStartingPoint || (isDraggingLine && isHovered));
      const isGeneralHover = isHovered && !highlight && !isErasableHighlight && 
        !(interactionMode === 'unit' && !baseData.hasUnit && !isDraggingUnit);
      const isSelected = interactionMode === 'color' && lastColoredHexKey === hex.key && !isPainting;
      const isUnitTargetHover = interactionMode === 'unit' && isHovered && isDraggingUnit;
      
      // Calculate opacity
      let opacity = baseData.opacity;
      if (highlight || isSelected) {
        opacity = 0.5;
      } else if (isInLinePath) {
        opacity = 0.3;
      } else if (isHovered && !isPainted) {
        opacity = 0.0;
      } else if (isHovered && isPainted) {
        opacity = 0.5;
      }
      
      // Calculate stroke properties
      let strokeColor = baseData.strokeColor;
      let strokeWidth = baseData.strokeWidth;
      let strokeOpacity = baseData.strokeOpacity;
      
      if (highlight || isErasableHighlight || isUnitTargetHover) {
        strokeColor = 'dodgerblue';
        strokeWidth = 12.5;
        strokeOpacity = 1;
      } else if (isSelected) {
        strokeColor = 'darkorange';
        strokeWidth = 12.5;
        strokeOpacity = 1;
      } else if (isInLinePath) {
        strokeColor = '#ffd700';
        strokeWidth = 8;
        strokeOpacity = 0.8;
      } else if (isGeneralHover) {
        strokeColor = '#00ffff';
        strokeWidth = 12.5;
        strokeOpacity = 1;
      }
      
      const isSpecial = highlight || isErasableHighlight || isGeneralHover || isSelected || isInLinePath || isUnitTargetHover;
      
      renderData.set(hex.key, {
        ...baseData,
        opacity,
        strokeColor,
        strokeWidth,
        strokeOpacity,
        isSpecial,
        isHovered
      });
    });
    
    return renderData;
  }, [baseHexRenderData, hoveredHexKey, lineStartHex, interactionMode, isDraggingLine, lines, lastColoredHexKey, isPainting, highlightedLinePath, isDraggingUnit, layout.hexes]);

  // Memoize normal hexes rendering - only depends on base data, not hover state
  const normalHexesElements = useMemo(() => {
    const elements = [];
    const hexes = layout.hexes;
    for (let i = 0; i < hexes.length; i++) {
      const hex = hexes[i];
      const baseData = baseHexRenderData.get(hex.key);
      if (!baseData) continue;
      
      // Check if this hex is special (hovered/selected) - if so, skip it (will be rendered in special layer)
      if (specialHexesSet.has(hex.key)) continue;
      
      elements.push(
        <polygon
          key={hex.key}
          points={hexPoints}
          transform={`translate(${hex.centerX}, ${hex.centerY})`}
          fill={baseData.fillColor}
          fillOpacity={baseData.opacity}
          stroke={baseData.strokeColor}
          strokeWidth={baseData.strokeWidth}
          strokeOpacity={baseData.strokeOpacity}
          data-q={hex.q}
          data-r={hex.r}
          data-hex-key={hex.key}
          style={{ cursor: 'inherit', pointerEvents: 'all' }}
        />
      );
    }
    return elements;
  }, [layout.hexes, baseHexRenderData, specialHexesSet, hexPoints]);

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
    // Note: Units are NOT deleted when erasing hex - only colors and lines are removed
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

  const createUnit = useCallback((unitData) => {
    // Emit to server
    if (socket && roomData) {
      socket.emit('unit_add', {
        unit: unitData
      });
    }
    // Note: Don't add to local state here - wait for server confirmation via unit_added event
  }, [socket, roomData]);

  const updateUnit = useCallback((unitId, patch) => {
    if (!socket || !roomData) return;
    socket.emit('unit_update', { unit_id: unitId, patch });
    setUnits(prevUnits =>
      prevUnits.map(u => (u.id === unitId ? { ...u, ...patch } : u))
    );
  }, [socket, roomData]);

  const reparentUnit = useCallback((unitId, parentUnitId, hexKey) => {
    if (!socket || !roomData) return;
    socket.emit('unit_reparent', { unit_id: unitId, parent_unit_id: parentUnitId, hex_key: hexKey });
    setUnits(prevUnits =>
      prevUnits.map(u => {
        if (u.id !== unitId) return u;
        return {
          ...u,
          parent_unit_id: parentUnitId,
          ...(hexKey ? { hex_key: hexKey } : {}),
        };
      })
    );
  }, [socket, roomData]);

  const moveUnit = useCallback((unitId, newHexKey) => {
    // Update local state immediately
    setUnits(prevUnits => 
      prevUnits.map(unit => 
        unit.id === unitId 
          ? { ...unit, hex_key: newHexKey }
          : unit
      )
    );

    // Emit to other users
    if (socket && roomData) {
      socket.emit('unit_move', {
        unit_id: unitId,
        hex_key: newHexKey
      });
    }
  }, [socket, roomData]);

  const deleteUnit = useCallback((unitId) => {
    // Remove from local state
    setUnits(prevUnits => prevUnits.filter(unit => unit.id !== unitId));

    // Emit to other users
    if (socket && roomData) {
      socket.emit('unit_delete', {
        unit_id: unitId
      });
    }
  }, [socket, roomData]);

  // Function to clear unit groups on any action
  const clearUnitGroups = useCallback(() => {
    setGroupedUnits(new Set());
  }, []);

  // Function to toggle unit in group
  const toggleUnitInGroup = useCallback((unitId) => {
    setGroupedUnits(prevGroups => {
      const newGroups = new Set(prevGroups);
      if (newGroups.has(unitId)) {
        newGroups.delete(unitId);
      } else {
        newGroups.add(unitId);
      }
      return newGroups;
    });
  }, []);

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
    // Unit creation is now handled in handleHexClick
  }, [interactionMode, applyColorToHex, eraseHex, isPanning, isTransforming]);

  const handleHexMouseEnter = useCallback((hex) => {
    // Update hover ref (visual feedback only, no React re-render)
    const needsStateUpdate = !isPanning && !isTransforming && (
      interactionMode === 'draw' || 
      interactionMode === 'color' || 
      interactionMode === 'erase' ||
      isDraggingUnit
    );
    setHoveredHexKeyRef(hex.key, needsStateUpdate);
    
    // Don't update cursor or handle interactions while panning/transforming (but allow during unit dragging)
    if (isPanning || isTransforming) return;
    
    // Use throttled cursor update instead of direct socket emission
    throttledCursorUpdate(hex.key, interactionMode);
    
    // During unit dragging, only allow hover for visual feedback and track position
    if (isDraggingUnit) {
      setDraggedUnitPosition(hex.key);
      return;
    }

    // No deploy hover mode in click-pickup/click-drop interaction
    
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
  }, [interactionMode, isDraggingLine, lineStartHex, isPainting, isErasing, applyColorToHex, eraseHex, throttledCursorUpdate, isPanning, isTransforming, isDraggingUnit, setHoveredHexKeyRef]);
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

  const handleSvgMouseUp = useCallback((event) => {
    if (interactionMode === 'draw' && isDraggingLine && lineStartHex) {
        const targetHexKey = hoveredHexKey; // Check if mouse was over a hex upon release
        if (targetHexKey) {
            const endHex = hexesByKey.get(targetHexKey);
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
  }, [hoveredHexKey, interactionMode, isDraggingLine, lineStartHex, isPainting, isErasing, layout.hexes, selectedColor, socket, roomData]);

  const handleHexMouseUp = useCallback((hex, event) => {
    // Only handle left mouse button for hex interactions
    if (event && event.button !== 0) return;
    
    // Don't handle hex interactions while panning, transforming, or unit dragging
    if (isPanning || isTransforming || isDraggingUnit) return;
    
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
  }, [interactionMode, isDraggingLine, lineStartHex, isPainting, isErasing, lines, selectedColor, socket, roomData, isPanning, isTransforming, isDraggingUnit]);

  const handleHexClick = useCallback((hex, event) => {
    // Only handle left mouse button for hex interactions
    if (event && event.button !== 0) return;
    
    // Don't handle hex interactions while panning or transforming
    if (isPanning || isTransforming) return;
    
    // Clear unit groups on any hex interaction (unless Ctrl is held)
    if (!event?.ctrlKey && groupedUnits.size > 0) {
      clearUnitGroups();
    }
    
    // Old method: if a unit (or force) is picked up, drop it on the clicked hex
    if (isDraggingUnit && draggedUnit) {
      const existingUnit = units.find(unit => !unit.parent_unit_id && unit.hex_key === hex.key && unit.id !== draggedUnit.id);
      if (existingUnit) {
        // Merge: attach dragged unit as a force of the existing unit (even if same hex)
        console.log('Merging units:', { dragged: draggedUnit.id, target: existingUnit.id, hex: hex.key });
        reparentUnit(draggedUnit.id, existingUnit.id, existingUnit.hex_key);
      } else if (hex.key !== draggedUnit.hex_key) {
        // Normal drop: move to empty hex (only if different hex)
        if (draggedUnit.parent_unit_id) {
          reparentUnit(draggedUnit.id, null, hex.key);
        } else {
          moveUnit(draggedUnit.id, hex.key);
        }
      }
      setIsDraggingUnit(false);
      setDraggedUnit(null);
      setDraggedUnitPosition(null);
      return;
    }
    
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
    } else if (interactionMode === 'unit' && !isDraggingUnit) {
      // Check if there's already a unit on this hex
      const existingUnit = units.find(unit => unit.hex_key === hex.key);
      if (!existingUnit) {
        // Create new unit
        setUnitCreationHex(hex);
        setShowUnitDialog(true);
      }
    }
    // Erase mode now works on mouse down/drag, not click
  }, [interactionMode, isDraggingLine, lineStartHex, lines, isPainting, selectedColor, socket, roomData, isPanning, isTransforming, isDraggingUnit, draggedUnit, draggedUnitPosition, units, moveUnit, groupedUnits, clearUnitGroups, reparentUnit]);

  // Reverted: pointer-based dragging. Using click-pickup/click-drop instead.

  const handleInteractionModeChange = (event, newMode) => {
    if (newMode !== null) { // Prevent unselecting all buttons in ToggleButtonGroup
      setInteractionMode(newMode);
      // Reset states relevant to other modes to prevent conflicts
      setIsPainting(false);
      setIsErasing(false);
      setIsDraggingLine(false);
      setIsDraggingUnit(false);
      setDraggedUnit(null);
      setPreviewLine(null);
      setHoveredHexKey(null);
      setHighlightedLinePath([]);
      clearUnitGroups(); // Clear unit groups on mode change
      // setLastColoredHexKey(null); // Optional: decide if last colored info should persist across mode changes
    }
  };

  const cursorByMode = useMemo(() => ({
    select: "url('/static/cursors/cursor-select.svg') 2 2, auto",
    color: "url('/static/cursors/cursor-paint.svg') 2 2, auto",
    draw: "url('/static/cursors/cursor-measure.svg') 2 2, auto",
    unit: "url('/static/cursors/cursor-unit.svg') 2 2, auto",
    erase: "url('/static/cursors/cursor-erase.svg') 2 2, auto",
  }), []);

  const getCanvasCursor = useCallback(() => {
    // Keep the tool cursor while mouse is held down; only show hand/grab for viewport transforms.
    if (isPanning || isTransforming) return 'grabbing';
    return cursorByMode[interactionMode] || 'grab';
  }, [cursorByMode, interactionMode, isPanning, isTransforming]);

  const handleUnitCreation = useCallback((unitData) => {
    createUnit(unitData);
    setShowUnitDialog(false);
    setUnitCreationHex(null);
    setForceParentUnitId(null);
  }, [createUnit]);

  const handleDeleteUnitConfirm = useCallback(() => {
    if (unitToDelete) {
      deleteUnit(unitToDelete.id);
      setShowDeleteUnitDialog(false);
      setUnitToDelete(null);
    }
  }, [unitToDelete, deleteUnit]);

  const handleDeleteUnitCancel = useCallback(() => {
    setShowDeleteUnitDialog(false);
    setUnitToDelete(null);
  }, []);

  const handleUnitClick = useCallback((unit, event) => {
    if (event.button !== 0) return; // Only left mouse button
    if (isPanning || isTransforming) return;
    if (unit.is_read_only) return;

    event.stopPropagation();
    event.preventDefault();

    if (interactionMode === 'erase') {
      setUnitToDelete(unit);
      setShowDeleteUnitDialog(true);
      return;
    }

    // If we already have a picked-up unit and click another unit: merge into it
    if (isDraggingUnit && draggedUnit && draggedUnit.id !== unit.id) {
      reparentUnit(draggedUnit.id, unit.id, unit.hex_key);
      setIsDraggingUnit(false);
      setDraggedUnit(null);
      setDraggedUnitPosition(null);
      return;
    }

    // Old method: click picks up / puts down
    if (isDraggingUnit && draggedUnit && draggedUnit.id === unit.id) {
      setIsDraggingUnit(false);
      setDraggedUnit(null);
      setDraggedUnitPosition(null);
      return;
    }

    setIsDraggingUnit(true);
    setDraggedUnit(unit);
    setDraggedUnitPosition(unit.hex_key);
  }, [interactionMode, isPanning, isTransforming, isDraggingUnit, draggedUnit, reparentUnit]);

  const handleUnitDoubleClick = useCallback((unit, event) => {
    if (event.button !== 0) return;
    if (isPanning || isTransforming) return;
    if (unit.is_read_only) return;

    event.stopPropagation();
    event.preventDefault();

    // Stop dragging when opening details
    if (isDraggingUnit) {
      setIsDraggingUnit(false);
      setDraggedUnit(null);
      setDraggedUnitPosition(null);
    }

    setSelectedUnitId(unit.id);
    setShowUnitDetailsDialog(true);
  }, [isPanning, isTransforming, isDraggingUnit]);

  const selectedUnit = selectedUnitId ? units.find(u => u.id === selectedUnitId) : null;
  const selectedUnitForces = selectedUnit ? units.filter(u => u.parent_unit_id === selectedUnit.id) : [];

  const forceCountsByParentId = useMemo(() => {
    const counts = new Map();
    units.forEach((u) => {
      if (!u.parent_unit_id) return;
      counts.set(u.parent_unit_id, (counts.get(u.parent_unit_id) || 0) + 1);
    });
    return counts;
  }, [units]);

  const handleUnitMouseEnter = useCallback((unit) => {
    if (isPanning || isTransforming) return;
    setHoveredUnitId(unit.id);
  }, [isPanning, isTransforming]);

  const handleUnitMouseLeave = useCallback(() => {
    setHoveredUnitId(null);
  }, []);

  const getHexAtKey = useCallback((key) => hexesByKey.get(key), [hexesByKey]);
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

  // Function to get all hexes within a given radius from a center hex
  const getHexesWithinRadius = useCallback((centerHex, radius) => {
    if (!centerHex) return [];
    
    const hexesInRadius = [];
    const centerAxial = evenq_to_axial(centerHex);
    
    for (const hex of layout.hexes) {
      const hexAxial = evenq_to_axial(hex);
      const distance = (Math.abs(centerAxial.q - hexAxial.q) + 
                       Math.abs(centerAxial.q + centerAxial.r - hexAxial.q - hexAxial.r) + 
                       Math.abs(centerAxial.r - hexAxial.r)) / 2;
      
      if (distance <= radius) {
        hexesInRadius.push({ ...hex, distance });
      }
    }
    
    return hexesInRadius;
  }, [layout.hexes]);



  // Get vision hexes for all grouped units
  const getGroupedUnitsVision = useMemo(() => {
    const visionHexes = new Map(); // hex_key -> { inRadius4: count, inRadius8: count, distance: min_distance }
    
    for (const unitId of groupedUnits) {
      const unit = units.find(u => u.id === unitId);
      if (!unit) continue;
      
      const unitHex = hexesByKey.get(unit.hex_key);
      if (!unitHex) continue;
      
      // Get hexes within 8 hex radius (includes both 4 and 8)
      const vision8 = getHexesWithinRadius(unitHex, 8);
      vision8.forEach(hex => {
        const existing = visionHexes.get(hex.key) || { inRadius4: 0, inRadius8: 0, distance: hex.distance };
        
        // If within 4 hex radius
        if (hex.distance <= 4) {
          existing.inRadius4 += 1;
        }
        // Always count for 8 hex radius (since we're already filtering by <= 8)
        existing.inRadius8 += 1;
        existing.distance = Math.min(existing.distance, hex.distance);
        
        visionHexes.set(hex.key, existing);
      });
    }
    
    return visionHexes;
  }, [groupedUnits, units, layout.hexes, getHexesWithinRadius]);

  useImperativeHandle(ref, () => ({
    getSVGElement: () => svgRef.current,
  }));

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
            <ToggleButton value="unit" aria-label="unit mode">
              <PersonIcon sx={{ mr: 1, fontSize: '16px' }} />
              Units
            </ToggleButton>
            <ToggleButton value="erase" aria-label="erase lines mode">
              <DeleteOutlineIcon sx={{ mr: 1, fontSize: '16px' }} />
              Erase
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>

        {/* Unit Grouping Status Section */}
        {groupedUnits.size > 0 && (
          <Box sx={{ 
            flexShrink: 0,
            p: 1.5,
            background: 'linear-gradient(135deg, rgba(0, 255, 255, 0.1), rgba(0, 153, 204, 0.05))',
            border: '1px solid var(--neotech-primary)',
            borderRadius: 1,
            boxShadow: 'var(--neotech-glow-small)'
          }}>
            <Typography variant="h6" sx={{ 
              mb: 1, 
              fontSize: '12px', 
              fontWeight: 'bold',
              color: 'var(--neotech-primary)',
              fontFamily: "'Rajdhani', monospace",
              textTransform: 'uppercase',
              letterSpacing: '1px',
              textShadow: 'var(--neotech-glow-small)'
            }}>
              Unit Group ({groupedUnits.size})
            </Typography>
                         <Typography sx={{ 
               fontSize: '10px',
               color: 'var(--neotech-text-secondary)',
               fontFamily: "'Rajdhani', monospace",
               lineHeight: 1.3
             }}>
               Ctrl+Click units to add/remove from group.
               Grouped units show vision ranges:
               <br />• <span style={{color: '#00FFFF'}}>Bright Cyan</span>: 4 hex radius (close vision)
               <br />• <span style={{color: '#4169E1'}}>Royal Blue</span>: 8 hex radius (distant vision)
               <br />• <span style={{color: '#FFFFFF'}}>Thicker borders</span>: Multiple unit overlaps
             </Typography>
          </Box>
        )}

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
        {(interactionMode === 'color' || interactionMode === 'draw' || interactionMode === 'unit') && (
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
          {interactionMode === 'unit' && (
            <Typography variant="caption" sx={{ 
              color: 'var(--neotech-accent)',
              fontFamily: "'Rajdhani', monospace"
            }}>
              {isDraggingUnit ? "Moving unit..." : "Click hex to create unit, drag to move"}
              <br/>Units: {units.length}
            </Typography>
          )}
          {interactionMode === 'erase' && (
            <Typography variant="caption" sx={{ 
              color: 'var(--neotech-error)',
              fontFamily: "'Rajdhani', monospace"
            }}>
              Drag to erase lines and colors. Click unit to delete (with confirmation).
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
                  cursor: getCanvasCursor()
                }}
                onMouseMove={handleSvgMouseMove}
                onMouseUp={handleSvgMouseUp}
                onMouseLeave={() => { 
                    setHoveredHexKeyRef(null, false);
                    setHoveredHexKey(null);
                    // Clear cursor for other users when mouse leaves the map using throttled update
                    throttledCursorUpdate(null, interactionMode);
                }}
                onContextMenu={(e) => e.preventDefault()}
              >
                {(() => {
                  renderStartTime.current = performance.now();
                  return null;
                })()}
                <image href={imageUrl} />
                <g 
                  transform={`translate(${layout.offsetX}, ${layout.offsetY})`}
                  onClick={(e) => {
                    if (e.target.tagName === 'polygon' && e.target.dataset.hexKey) {
                      const hexKey = e.target.dataset.hexKey;
                      const hex = hexesByKey.get(hexKey);
                      if (hex) {
                        const hexDetails = { q: hex.q, r: hex.r, centerX: hex.centerX, centerY: hex.centerY, key: hex.key };
                        if (e.button === 0 || e.nativeEvent.button === undefined) {
                          e.stopPropagation();
                        }
                        handleHexClick(hexDetails, e);
                      }
                    }
                  }}
                  onMouseDown={(e) => {
                    if (e.target.tagName === 'polygon' && e.target.dataset.hexKey) {
                      const hexKey = e.target.dataset.hexKey;
                      const hex = hexesByKey.get(hexKey);
                      if (hex) {
                        const hexDetails = { q: hex.q, r: hex.r, centerX: hex.centerX, centerY: hex.centerY, key: hex.key };
                        if (e.button === 0) {
                          e.stopPropagation();
                        }
                        handleHexMouseDown(hexDetails, e);
                      }
                    }
                  }}
                  onMouseUp={(e) => {
                    if (e.target.tagName === 'polygon' && e.target.dataset.hexKey) {
                      const hexKey = e.target.dataset.hexKey;
                      const hex = hexesByKey.get(hexKey);
                      if (hex) {
                        const hexDetails = { q: hex.q, r: hex.r, centerX: hex.centerX, centerY: hex.centerY, key: hex.key };
                        if (e.button === 0) {
                          e.stopPropagation();
                        }
                        handleHexMouseUp(hexDetails, e);
                      }
                    }
                  }}
                  onMouseMove={(e) => {
                    if (e.target.tagName === 'polygon' && e.target.dataset.hexKey) {
                      const hexKey = e.target.dataset.hexKey;
                      if (hexKey !== hoveredHexKey) {
                        const hex = hexesByKey.get(hexKey);
                        if (hex) {
                          const hexDetails = { q: hex.q, r: hex.r, centerX: hex.centerX, centerY: hex.centerY, key: hex.key };
                          handleHexMouseEnter(hexDetails);
                        }
                      }
                    }
                  }}
                >
                  {/* Render normal hexes first (non-special) - memoized for performance */}
                  {(() => {
                    const start = performance.now();
                    const result = normalHexesElements;
                    performanceData.current.normalHexes = performance.now() - start;
                    return result;
                  })()}

                  {/* Render highlighted/hovered/selected hexes last (on top) */}
                  {(() => {
                    const start = performance.now();
                    const specialHexes = layout.hexes.map((hex) => {
                    const renderData = hexRenderData.get(hex.key);
                    if (!renderData || !renderData.isSpecial) return null;
                    
                    const hexDetails = { q: hex.q, r: hex.r, centerX: hex.centerX, centerY: hex.centerY, key: hex.key };
                    
                    return (
                      <polygon
                        key={`top-${hex.key}`}
                        points={hexPoints}
                        transform={`translate(${hex.centerX}, ${hex.centerY})`}
                        fill={renderData.fillColor}
                        fillOpacity={renderData.opacity}
                        stroke={renderData.strokeColor}
                        strokeWidth={renderData.strokeWidth}
                        strokeOpacity={renderData.strokeOpacity}
                        data-q={hex.q}
                        data-r={hex.r}
                        data-hex-key={hex.key}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleHexClick(hexDetails, e);
                        }}
                        onMouseDown={(e) => {
                          if (e.button === 0) {
                            e.stopPropagation();
                          }
                          handleHexMouseDown(hexDetails, e);
                        }}
                        onMouseUp={(e) => {
                          if (e.button === 0) {
                            e.stopPropagation();
                          }
                          handleHexMouseUp(hexDetails, e);
                        }}
                        onMouseEnter={(e) => {
                          handleHexMouseEnter(hexDetails);
                        }}
                        style={{ cursor: 'inherit', pointerEvents: 'all' }}
                      />
                    );
                  }).filter(Boolean);
                    performanceData.current.specialHexes = performance.now() - start;
                    return specialHexes;
                  })()}

                  {/* Render vision ranges for grouped units - 8 hex radius first (background) */}
                  {groupedUnits.size > 0 && (() => {
                    const start = performance.now();
                    const vision8 = layout.hexes.map((hex) => {
                    const visionData = getGroupedUnitsVision.get(hex.key);
                    if (!visionData || visionData.inRadius8 === 0) return null;
                    
                    // Only render outer ring (5-8 hex distance) for 8-hex vision
                    if (visionData.distance > 4) {
                      const isIntersection = visionData.inRadius8 > 1;
                      
                      return (
                        <g key={`vision8-${hex.key}`}>
                          <circle
                            cx={hex.centerX}
                            cy={hex.centerY}
                            r={hexSize * 0.85}
                            fill={isIntersection ? 'rgba(100, 149, 237, 0.6)' : 'rgba(100, 149, 237, 0.4)'}
                            stroke={isIntersection ? '#4169E1' : '#6495ED'}
                            strokeWidth={isIntersection ? 3 : 2}
                            style={{ pointerEvents: 'none' }}
                          />
                          {/* Intersection count for 8-hex range */}
                          {isIntersection && (
                            <text
                              x={hex.centerX}
                              y={hex.centerY + 5}
                              textAnchor="middle"
                              fontSize={hexSize * 0.25}
                              fill="#FFFFFF"
                              stroke="#000000"
                              strokeWidth={2}
                              fontWeight="bold"
                              style={{ pointerEvents: 'none' }}
                            >
                              {visionData.inRadius8}
                            </text>
                          )}
                        </g>
                      );
                    }
                    return null;
                  }).filter(Boolean);
                    performanceData.current.visionRanges = performance.now() - start;
                    return vision8;
                  })()}

                  {/* Render vision ranges for grouped units - 4 hex radius second (foreground) */}
                  {groupedUnits.size > 0 && (() => {
                    const start = performance.now();
                    const vision4 = layout.hexes.map((hex) => {
                    const visionData = getGroupedUnitsVision.get(hex.key);
                    if (!visionData || visionData.inRadius4 === 0) return null;
                    
                    // Only render inner circle (0-4 hex distance) for 4-hex vision
                    const isIntersection = visionData.inRadius4 > 1;
                    
                    return (
                      <g key={`vision4-${hex.key}`}>
                        <circle
                          cx={hex.centerX}
                          cy={hex.centerY}
                          r={hexSize * 0.75}
                          fill={isIntersection ? 'rgba(0, 255, 255, 0.7)' : 'rgba(0, 255, 255, 0.5)'}
                          stroke={isIntersection ? '#00FFFF' : '#40E0D0'}
                          strokeWidth={isIntersection ? 4 : 2}
                          style={{ pointerEvents: 'none' }}
                        />
                        {/* Intersection count for 4-hex range */}
                        {isIntersection && (
                          <text
                            x={hex.centerX}
                            y={hex.centerY + 5}
                            textAnchor="middle"
                            fontSize={hexSize * 0.3}
                            fill="#000000"
                            stroke="#FFFFFF"
                            strokeWidth={1}
                            fontWeight="bold"
                            style={{ pointerEvents: 'none' }}
                          >
                            {visionData.inRadius4}
                          </text>
                        )}
                      </g>
                    );
                  }).filter(Boolean);
                    performanceData.current.visionRanges += performance.now() - start;
                    return vision4;
                  })()}

                  {/* Render lines */}
                  {(() => {
                    const start = performance.now();
                    const renderedLines = lines.map((line, index) => {
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
                  });
                    performanceData.current.lines = performance.now() - start;
                    return renderedLines;
                  })()}

                  {/* Render units */}
                  {(() => {
                    const start = performance.now();
                    const renderedUnits = units
                      .filter((u) => !u.parent_unit_id)
                      .map((unit) => {
                    const hex = hexesByKey.get(unit.hex_key);
                    if (!hex) return null;
                    
                    const isDragging = isDraggingUnit && draggedUnit && draggedUnit.id === unit.id;
                    const isHovered = hoveredUnitId === unit.id;
                    const forcesCount = forceCountsByParentId.get(unit.id) || 0;
                    
                    // If this unit is being dragged, show it at the tracked drag position
                    let displayX = hex.centerX;
                    let displayY = hex.centerY;
                    
                    if (isDragging && draggedUnitPosition && draggedUnitPosition !== unit.hex_key) {
                      const dragHex = hexesByKey.get(draggedUnitPosition);
                      if (dragHex) {
                        displayX = dragHex.centerX;
                        displayY = dragHex.centerY;
                      }
                    }
                    
                    return (
                      <Unit
                        key={unit.id}
                        unit={unit}
                        centerX={displayX}
                        centerY={displayY}
                        onClick={(e) => handleUnitClick(unit, e)}
                        onDoubleClick={(e) => handleUnitDoubleClick(unit, e)}
                        onMouseEnter={() => handleUnitMouseEnter(unit)}
                        onMouseLeave={handleUnitMouseLeave}
                        isDragging={isDragging}
                        isReadOnly={unit.is_read_only}
                        isHovered={isHovered}
                        isGrouped={groupedUnits.has(unit.id)}
                        apiBaseUrl={apiBaseUrl}
                        forcesCount={forcesCount}
                        onClickWhileDragging={isDragging && draggedUnitPosition ? (e) => {
                          const hex = hexesByKey.get(draggedUnitPosition);
                          if (hex) handleHexClick(hex, e);
                        } : null}
                      />
                    );
                  }).filter(Boolean);
                    performanceData.current.units = performance.now() - start;
                    return renderedUnits;
                  })()}

                  {/* Force pickup ghost (forces are hidden from map while parent_unit_id is set) */}
                  {isDraggingUnit && draggedUnit && draggedUnit.parent_unit_id && draggedUnitPosition && (() => {
                    const hex = hexesByKey.get(draggedUnitPosition);
                    if (!hex) return null;
                    return (
                      <Unit
                        key={`deploy-${draggedUnit.id}`}
                        unit={draggedUnit}
                        centerX={hex.centerX}
                        centerY={hex.centerY}
                        onClick={() => {}}
                        onDoubleClick={() => {}}
                        onMouseEnter={() => {}}
                        onMouseLeave={() => {}}
                        isDragging={true}
                        isReadOnly={false}
                        isHovered={false}
                        isGrouped={false}
                        apiBaseUrl={apiBaseUrl}
                        forcesCount={0}
                        isInteractive={true}
                        onClickWhileDragging={(e) => {
                          const hex = hexesByKey.get(draggedUnitPosition);
                          if (hex) handleHexClick(hex, e);
                        }}
                      />
                    );
                  })()}

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
                  {!isPanning && !isTransforming && (() => {
                    const start = performance.now();
                    const renderedCursors = Object.entries(otherUsersCursors).map(([userName, cursorData]) => {
                    const hex = hexesByKey.get(cursorData.hex_key);
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
                        {cursorData?.mode === 'erase' && (
                          <rect
                            x={hex.centerX - 30}
                            y={hex.centerY - 18}
                            width={60}
                            height={36}
                            rx={6}
                            fill="rgba(231, 76, 60, 0.85)"
                            stroke="black"
                            strokeWidth="6"
                          />
                        )}
                        {cursorData?.mode === 'color' && (
                          <path
                            d={`M ${hex.centerX - 20} ${hex.centerY + 25}
                               L ${hex.centerX + 25} ${hex.centerY - 20}
                               L ${hex.centerX + 40} ${hex.centerY - 5}
                               L ${hex.centerX - 5} ${hex.centerY + 40}
                               Z`}
                            fill="rgba(0, 255, 255, 0.75)"
                            stroke="black"
                            strokeWidth="6"
                          />
                        )}
                        {cursorData?.mode === 'draw' && (
                          <g>
                            <line
                              x1={hex.centerX - 40}
                              y1={hex.centerY + 30}
                              x2={hex.centerX + 40}
                              y2={hex.centerY - 30}
                              stroke="rgba(30, 144, 255, 0.9)"
                              strokeWidth="10"
                              strokeLinecap="round"
                            />
                            <circle
                              cx={hex.centerX - 40}
                              cy={hex.centerY + 30}
                              r="10"
                              fill="rgba(30, 144, 255, 0.9)"
                              stroke="black"
                              strokeWidth="6"
                            />
                            <circle
                              cx={hex.centerX + 40}
                              cy={hex.centerY - 30}
                              r="10"
                              fill="rgba(30, 144, 255, 0.9)"
                              stroke="black"
                              strokeWidth="6"
                            />
                          </g>
                        )}
                        {cursorData?.mode === 'unit' && (
                          <g>
                            <circle
                              cx={hex.centerX}
                              cy={hex.centerY - 18}
                              r="14"
                              fill="rgba(255, 255, 255, 0.85)"
                              stroke="black"
                              strokeWidth="6"
                            />
                            <path
                              d={`M ${hex.centerX - 24} ${hex.centerY + 32}
                                 Q ${hex.centerX} ${hex.centerY + 4} ${hex.centerX + 24} ${hex.centerY + 32}`}
                              fill="none"
                              stroke="rgba(255, 255, 255, 0.85)"
                              strokeWidth="12"
                              strokeLinecap="round"
                            />
                          </g>
                        )}
                        {cursorData?.mode === 'select' && (
                          <path
                            d={`M ${hex.centerX - 10} ${hex.centerY - 35}
                               L ${hex.centerX + 30} ${hex.centerY - 5}
                               L ${hex.centerX + 10} ${hex.centerY - 5}
                               L ${hex.centerX + 15} ${hex.centerY + 30}
                               L ${hex.centerX - 5} ${hex.centerY + 0}
                               L ${hex.centerX - 15} ${hex.centerY + 15}
                               Z`}
                            fill="rgba(255, 255, 255, 0.85)"
                            stroke="black"
                            strokeWidth="6"
                          />
                        )}
        
                        
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
                  }).filter(Boolean);
                    performanceData.current.cursors = performance.now() - start;
                    return renderedCursors;
                  })()}
                </g>
                <Arrow 
                  color={selectedColor} 
                  lineColors={[...new Set(lines.map(line => line.color || selectedColor))]} 
                />
                {(() => {
                  performanceData.current.total = performance.now() - renderStartTime.current;
                  return null;
                })()}
              </svg>
            </TransformComponent>
          </TransformWrapper>
        </Box>
      </Box>

      {/* Unit Creation Dialog */}
      <UnitCreationDialog
        open={showUnitDialog}
        onClose={() => setShowUnitDialog(false)}
        onConfirm={handleUnitCreation}
        hexKey={unitCreationHex?.key}
        initialColor={selectedColor}
        apiBaseUrl={apiBaseUrl}
        parentUnitId={forceParentUnitId}
      />

      <UnitDetailsDialog
        open={showUnitDetailsDialog}
        onClose={() => setShowUnitDetailsDialog(false)}
        unit={selectedUnit}
        forces={selectedUnitForces}
        apiBaseUrl={apiBaseUrl}
        onSaveDescription={(desc) => {
          if (!selectedUnit) return;
          updateUnit(selectedUnit.id, { description: desc });
        }}
        onAddForce={() => {
          if (!selectedUnit) return;
          setForceParentUnitId(selectedUnit.id);
          setUnitCreationHex({ key: selectedUnit.hex_key });
          setShowUnitDialog(true);
        }}
        onBeginDeployForce={(force) => {
          if (!force) return;
          setShowUnitDetailsDialog(false);
          setIsDraggingUnit(true);
          setDraggedUnit(force);
          setDraggedUnitPosition(force.hex_key);
        }}
      />

      {/* Unit Deletion Confirmation Dialog */}
      <Dialog 
        open={showDeleteUnitDialog} 
        onClose={handleDeleteUnitCancel}
        maxWidth="sm"
        PaperProps={{
          sx: {
            background: 'linear-gradient(135deg, rgba(0, 17, 34, 0.95), rgba(0, 8, 17, 0.98))',
            border: '1px solid var(--neotech-border)',
            boxShadow: '0 0 20px rgba(255, 51, 102, 0.3)',
            backdropFilter: 'blur(10px)'
          }
        }}
      >
        <DialogTitle sx={{
          color: 'var(--neotech-error)',
          fontFamily: "'Orbitron', monospace",
          textAlign: 'center',
          borderBottom: '1px solid var(--neotech-border)',
          background: 'linear-gradient(90deg, transparent, rgba(255, 51, 102, 0.1), transparent)'
        }}>
          Delete Unit?
        </DialogTitle>
        <DialogContent sx={{ p: 3 }}>
          <Typography sx={{
            color: 'var(--neotech-text-secondary)',
            fontFamily: "'Rajdhani', monospace",
            fontSize: '14px'
          }}>
            Are you sure you want to delete unit <strong style={{ color: 'var(--neotech-primary)' }}>"{unitToDelete?.name}"</strong>?
            <br />
            <br />
            This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ 
          p: 2, 
          borderTop: '1px solid var(--neotech-border)',
          background: 'linear-gradient(90deg, transparent, rgba(255, 51, 102, 0.05), transparent)'
        }}>
          <Button 
            onClick={handleDeleteUnitCancel}
            sx={{
              color: 'var(--neotech-text-secondary)',
              borderColor: 'var(--neotech-border)',
              fontFamily: "'Rajdhani', monospace",
              fontWeight: 600,
              '&:hover': {
                borderColor: 'var(--neotech-primary)',
                backgroundColor: 'rgba(0, 255, 255, 0.1)'
              }
            }}
            variant="outlined"
          >
            Cancel
          </Button>
          <Button 
            onClick={handleDeleteUnitConfirm}
            sx={{
              background: 'linear-gradient(135deg, rgba(255, 51, 102, 0.3), rgba(204, 0, 51, 0.3))',
              color: 'var(--neotech-error)',
              fontFamily: "'Rajdhani', monospace",
              fontWeight: 600,
              border: '1px solid var(--neotech-error)',
              '&:hover': {
                background: 'linear-gradient(135deg, rgba(255, 51, 102, 0.4), rgba(204, 0, 51, 0.4))',
                boxShadow: '0 0 10px rgba(255, 51, 102, 0.3)'
              }
            }}
            variant="contained"
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
});

export default HexGrid; 