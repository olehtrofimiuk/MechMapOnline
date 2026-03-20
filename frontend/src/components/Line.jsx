import React from 'react';

const Line = ({ 
  startX, 
  startY, 
  endX, 
  endY, 
  distance, 
  isHoveredForErase = false,
  color = "#333"
}) => {
  // Function to create marker ID from color
  const getMarkerId = (colorValue) => {
    return `arrow-${colorValue.replace('#', '')}`;
  };

  return (
    <React.Fragment>
      <line
        x1={startX}
        y1={startY}
        x2={endX}
        y2={endY}
        stroke={isHoveredForErase ? "#E74C3C" : color}
        strokeWidth={isHoveredForErase ? 8.5 : 5.5}
        markerEnd={isHoveredForErase ? "url(#arrow-erase)" : `url(#${getMarkerId(color)})`}
      />
      <text
        x={(startX + endX) / 2}
        y={(startY + endY) / 2 - 8}
        textAnchor="middle"
        fill={isHoveredForErase ? "#E74C3C" : "#D32F2F"}
        fontSize="32px"
        fontWeight="bold"
        paintOrder="stroke" 
        stroke="#FFF" 
        strokeWidth="2.5px" 
        strokeLinecap="butt" 
        strokeLinejoin="miter"
        style={{ pointerEvents: 'none' }}
      >
        {distance}
      </text>
    </React.Fragment>
  );
};

export default Line; 