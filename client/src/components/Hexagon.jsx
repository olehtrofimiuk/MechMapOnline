import React from 'react';

const Hexagon = ({
  q, r, size = 70, fillColor = 'lightgray', 
  centerX, centerY, 
  onClick, 
  onMouseDown, 
  onMouseUp, 
  onMouseEnter, 
  isHighlighted, // General purpose highlighting (e.g., for drag over, line start)
  isSelectedForColoring, // Specific for when a hex is selected for a color change action
  isHovered, // General hover state for all interaction modes
  isInLinePath // Hexes that are part of the current line path being drawn
}) => {
  const hexWidth = Math.sqrt(3) * size;
  // const hexHeight = 2 * size; // Not directly used for points if size is radius

  // Calculate points relative to (0,0) as the center of the hexagon
  const points = [
    [-size, 0],                      // left
    [-size/2, hexWidth/2],           // bottom-left  
    [size/2, hexWidth/2],            // bottom-right
    [size, 0],                       // right
    [size/2, -hexWidth/2],           // top-right
    [-size/2, -hexWidth/2],          // top-left
  ].map(p => p.join(',')).join(' ');

  const hexDetails = { q, r, centerX, centerY, key: `${q},${r}` };

  const handleMouseEvent = (handler, event) => {
    // Only stop propagation for left-click events
    // Right-click events should bubble up to SVG for panning
    if (event.button === 0) {
      event.stopPropagation();
    }
    if (handler) {
      handler(hexDetails, event);
    }
  };

  // Determine if hex is painted (has a color different from default lightgray)
  const isPainted = fillColor !== 'lightgray';

  // Calculate opacity: painted hexes get 0.5, unpainted get 0, highlights get higher opacity
  let opacity = 0; // Default for unpainted hexes
  if (isPainted) {
    opacity = 0.5; // Painted hexes
  }
  if (isHighlighted || isSelectedForColoring) {
    opacity = 0.5; // Highlighted states get higher opacity
  } else if (isInLinePath) {
    opacity = 0.3; // Line path hexes get moderate opacity
  } else if (isHovered && !isPainted) {
    opacity = 0.0; // Hover on unpainted hexes gets slight opacity
  } else if (isHovered && isPainted) {
    opacity = 0.5; // Hover on painted hexes gets slightly higher opacity
  }

  // Determine stroke color and properties
  let strokeColor = 'black';
  let strokeWidth = 1;
  let strokeOpacity = 0.8;
  
  if (isHighlighted) {
    strokeColor = 'dodgerblue';
    strokeWidth = 12.5;
    strokeOpacity = 1;
  } else if (isSelectedForColoring) {
    strokeColor = 'darkorange';
    strokeWidth = 12.5;
    strokeOpacity = 1;
  } else if (isInLinePath) {
    strokeColor = '#ffd700'; // Gold color for line path
    strokeWidth = 8;
    strokeOpacity = 0.8;
  } else if (isHovered) {
    strokeColor = '#00ffff';
    strokeWidth = 12.5;
    strokeOpacity = 1;
  }

  return (
    <g 
      transform={`translate(${centerX}, ${centerY})`} 
      onClick={(e) => handleMouseEvent(onClick, e)}
      onMouseDown={(e) => handleMouseEvent(onMouseDown, e)}
      onMouseUp={(e) => handleMouseEvent(onMouseUp, e)}
      onMouseEnter={(e) => handleMouseEvent(onMouseEnter, e)}
      data-q={q}
      data-r={r}
      style={{ cursor: 'pointer' }}
    >
      <polygon 
        points={points} 
        fill={fillColor} 
        fillOpacity={opacity}
        stroke={strokeColor} 
        strokeWidth={strokeWidth} 
        strokeOpacity={strokeOpacity}
      />
      
      
      {/* <text 
        textAnchor="middle" 
        dy=".3em" 
        fontSize={Math.max(10, size / 4)} 
        fill="#333"
      >
        {`${q},${r}`}
      </text> */}
     
    </g>
  );
};

export default Hexagon; 