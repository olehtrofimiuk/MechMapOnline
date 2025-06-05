import React from 'react';

const Arrow = ({ color = "#333", lineColors = [] }) => {
  // Create a unique set of colors including the current color and erase color
  const allColors = [...new Set([color, "#E74C3C", ...lineColors])];
  
  // Function to create a safe ID from color
  const getMarkerId = (colorValue) => {
    return `arrow-${colorValue.replace('#', '')}`;
  };
  
  return (
    <defs>
      {allColors.map((arrowColor) => (
        <marker
          key={getMarkerId(arrowColor)}
          id={getMarkerId(arrowColor)}
          viewBox="0 0 10 10"
          refX="8" 
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill={arrowColor} />
        </marker>
      ))}
      {/* Keep the legacy arrow and arrow-erase for backward compatibility */}
      <marker
        id="arrow"
        viewBox="0 0 10 10"
        refX="8" 
        refY="5"
        markerWidth="5"
        markerHeight="5"
        orient="auto-start-reverse"
      >
        <path d="M 0 0 L 10 5 L 0 10 z" fill={color} />
      </marker>
      <marker
        id="arrow-erase"
        viewBox="0 0 10 10"
        refX="8" 
        refY="5"
        markerWidth="5"
        markerHeight="5"
        orient="auto-start-reverse"
      >
        <path d="M 0 0 L 10 5 L 0 10 z" fill="#E74C3C" />
      </marker>
    </defs>
  );
};

export default Arrow; 