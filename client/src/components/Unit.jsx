import React, { useEffect, useState } from 'react';
import { buildUnitIconUrl, getTintedIconDataUrl } from '../utils/unitIcons';

const Unit = ({ 
  unit, 
  centerX, 
  centerY, 
  onClick,
  onDoubleClick,
  onMouseEnter,
  onMouseLeave,
  isDragging, 
  isReadOnly,
  isHovered,
  isGrouped,
  apiBaseUrl,
  forcesCount,
  isInteractive,
  onClickWhileDragging
}) => {
  const unitSize = 140; // Size of the unit marker (diameter of circle)
  const fontSize = 26; // Font size for unit name (below the icon)

  const readOnly = Boolean(isReadOnly);
  const hovered = Boolean(isHovered);
  const grouped = Boolean(isGrouped);
  const count = typeof forcesCount === 'number' ? forcesCount : 0;
  const interactive = isInteractive !== false;

  const [iconHref, setIconHref] = useState(null);
  useEffect(() => {
    let isCancelled = false;
    const iconPath = unit?.icon_path;
    const tintColor = unit?.tint_color || unit?.color;

    if (!apiBaseUrl || !iconPath) {
      setIconHref(null);
      return () => { isCancelled = true; };
    }

    const iconUrl = buildUnitIconUrl(apiBaseUrl, iconPath);
    if (!tintColor) {
      setIconHref(iconUrl);
      return () => { isCancelled = true; };
    }

    getTintedIconDataUrl(iconUrl, tintColor)
      .then((dataUrl) => {
        if (isCancelled) return;
        setIconHref(dataUrl);
      })
      .catch(() => {
        if (isCancelled) return;
        setIconHref(iconUrl);
      });

    return () => { isCancelled = true; };
  }, [apiBaseUrl, unit]);
  
  // Determine unit style based on state
  const unitStyle = {
    cursor: readOnly ? 'default' : 'inherit',
    opacity: isDragging ? 0.7 : 1,
    filter: hovered ? 'brightness(1.2)' : 'none',
    pointerEvents: interactive ? 'all' : 'none'
  };

  const handleClick = (e) => {
    console.log('Unit clicked:', { unitName: unit.name, isReadOnly, isDragging, button: e.button });
    
    // When dragging, trigger hex click at the dragged position
    if (isDragging && onClickWhileDragging) {
      console.log('Unit is being dragged, triggering hex click');
      e.stopPropagation();
      e.preventDefault();
      onClickWhileDragging(e);
      return;
    }
    
    if (!readOnly && onClick) {
      e.stopPropagation(); // Prevent hex click
      e.preventDefault();
      onClick(e);
    }
  };

  const handleDoubleClick = (e) => {
    if (!interactive) return;
    if (!readOnly && onDoubleClick) {
      // Double-click should always work to open details, even when dragging
      e.stopPropagation();
      e.preventDefault();
      onDoubleClick(e);
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
      onDoubleClick={handleDoubleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Unit circle background */}
      <circle
        cx={centerX}
        cy={centerY}
        r={unitSize / 2}
        fill="rgba(0,0,0,0.15)"
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

      {/* Unit icon */}
      {iconHref && (
        <image
          href={iconHref}
          x={centerX - 44}
          y={centerY - 44}
          width={88}
          height={88}
          style={{ pointerEvents: 'none' }}
          opacity={0.95}
        />
      )}
      
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
        y={centerY + unitSize / 2 + fontSize}
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
      {readOnly && (
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
      {hovered && !readOnly && (
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
      
      {/* Grouped indicator */}
      {grouped && (
        <g>
          {/* Grouped unit border */}
          <circle
            cx={centerX}
            cy={centerY}
            r={unitSize / 2 + 8}
            fill="none"
            stroke="rgba(0, 255, 255, 0.9)"
            strokeWidth={3}
            strokeDasharray="8 4"
            style={{ pointerEvents: 'none' }}
          />
          
          {/* Group indicator symbol */}
          <circle
            cx={centerX - unitSize / 2 + 15}
            cy={centerY - unitSize / 2 + 15}
            r={12}
            fill="rgba(0, 255, 255, 0.9)"
            stroke="#000"
            strokeWidth={1}
            style={{ pointerEvents: 'none' }}
          />
          <text
            x={centerX - unitSize / 2 + 15}
            y={centerY - unitSize / 2 + 19}
            textAnchor="middle"
            fontSize={14}
            fill="#000"
            fontWeight="bold"
            style={{ pointerEvents: 'none' }}
          >
            G
          </text>
        </g>
      )}

      {/* Forces count badge */}
      {count > 0 && (
        <g opacity={0.9}>
          <circle
            cx={centerX + unitSize / 2 - 14}
            cy={centerY + unitSize / 2 - 14}
            r={14}
            fill="rgba(0, 0, 0, 0.7)"
            stroke="rgba(0, 255, 255, 0.9)"
            strokeWidth={2}
            style={{ pointerEvents: 'none' }}
          />
          <text
            x={centerX + unitSize / 2 - 14}
            y={centerY + unitSize / 2 - 9}
            textAnchor="middle"
            fontSize={14}
            fill="rgba(0, 255, 255, 0.95)"
            fontWeight="bold"
            style={{ pointerEvents: 'none', fontFamily: "'Rajdhani', monospace" }}
          >
            {count}
          </text>
        </g>
      )}
    </g>
  );
};

export default Unit; 