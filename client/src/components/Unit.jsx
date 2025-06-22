import React from 'react';

const Unit = ({ 
  unit, 
  centerX, 
  centerY, 
  onClick,
  onMouseEnter,
  onMouseLeave,
  isDragging, 
  isReadOnly = false,
  isHovered = false 
}) => {
  const unitSize = 140; // Size of the unit marker (diameter of circle)
  const fontSize = 48; // Font size for unit name
  
  // Determine unit style based on state
  const unitStyle = {
    cursor: isReadOnly ? 'default' : (isDragging ? 'grabbing' : 'grab'),
    opacity: isDragging ? 0.7 : 1,
    filter: isHovered ? 'brightness(1.2)' : 'none'
  };

  const handleClick = (e) => {
    console.log('Unit clicked:', { unitName: unit.name, isReadOnly, button: e.button });
    if (!isReadOnly && onClick) {
      e.stopPropagation(); // Prevent hex click
      e.preventDefault();
      onClick(e);
    }
  };

  const handleMouseEnter = (e) => {
    if (onMouseEnter) {
      onMouseEnter(e);
    }
  };

  const handleMouseLeave = (e) => {
    if (onMouseLeave) {
      onMouseLeave(e);
    }
  };

  return (
    <g 
      style={unitStyle}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Unit circle background */}
      <circle
        cx={centerX}
        cy={centerY}
        r={unitSize / 2}
        fill={unit.color}
        stroke="#000"
        strokeWidth={2}
        style={{ pointerEvents: 'none' }}
      />
      
      {/* Unit circle border for better visibility */}
      <circle
        cx={centerX}
        cy={centerY}
        r={unitSize / 2 + 2}
        fill="none"
        stroke="#fff"
        strokeWidth={1}
        opacity={0.8}
        style={{ pointerEvents: 'none' }}
      />
      
      {/* Invisible click area - smaller than visual circle to allow hex clicks */}
      <circle
        cx={centerX}
        cy={centerY}
        r={Math.min(unitSize / 3, 60)} 
        fill="transparent"
        style={{ pointerEvents: 'all' }}
      />
      
      {/* Unit name text */}
      <text
        x={centerX}
        y={centerY + fontSize / 3}
        textAnchor="middle"
        fontSize={fontSize}
        fontWeight="bold"
        fill="#fff"
        stroke="#000"
        strokeWidth={1}
        paintOrder="stroke"
        style={{ 
          pointerEvents: 'none',
          fontFamily: "'Rajdhani', monospace",
          textShadow: '0 0 3px rgba(0,0,0,0.8)'
        }}
      >
        {unit.name}
      </text>
      
      {/* Read-only indicator for admin rooms */}
      {isReadOnly && (
        <g opacity={0.7}>
          <circle
            cx={centerX + unitSize / 2 - 10}
            cy={centerY - unitSize / 2 + 10}
            r={8}
            fill="rgba(255, 255, 255, 0.9)"
            stroke="#666"
            strokeWidth={1}
          />
          <text
            x={centerX + unitSize / 2 - 10}
            y={centerY - unitSize / 2 + 14}
            textAnchor="middle"
            fontSize={10}
            fill="#666"
            fontWeight="bold"
            style={{ pointerEvents: 'none' }}
          >
            RO
          </text>
        </g>
      )}
      
      {/* Hover highlight */}
      {isHovered && !isReadOnly && (
        <circle
          cx={centerX}
          cy={centerY}
          r={unitSize / 2 + 6}
          fill="none"
          stroke="rgba(255, 255, 255, 0.8)"
          strokeWidth={2}
          strokeDasharray="4 2"
          style={{ pointerEvents: 'none' }}
        />
      )}
    </g>
  );
};

export default Unit; 