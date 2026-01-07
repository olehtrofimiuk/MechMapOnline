import { useEffect, useRef, useState } from 'react';
import { Box, Typography } from '@mui/material';

const FPSCounter = () => {
  const [fps, setFps] = useState(0);
  const [fpsHistory, setFpsHistory] = useState([]);
  const frameCountRef = useRef(0);
  const lastTimeRef = useRef(performance.now());
  const animationFrameRef = useRef(null);
  const maxHistoryLength = 60; // Keep last 60 frames for plotting
  const graphWidth = 200; // Fixed width for viewBox
  const graphHeight = 60; // Fixed height for viewBox

  useEffect(() => {
    const measureFPS = () => {
      const now = performance.now();
      const delta = now - lastTimeRef.current;
      
      frameCountRef.current += 1;
      
      // Calculate FPS from frame delta (smoother than averaging)
      if (delta > 0) {
        const currentFps = Math.round(1000 / delta);
        setFps(currentFps);
        
        // Update history for plotting
        setFpsHistory(prev => {
          const newHistory = [...prev, currentFps];
          if (newHistory.length > maxHistoryLength) {
            return newHistory.slice(-maxHistoryLength);
          }
          return newHistory;
        });
      }
      
      lastTimeRef.current = now;
      animationFrameRef.current = requestAnimationFrame(measureFPS);
    };
    
    lastTimeRef.current = performance.now();
    animationFrameRef.current = requestAnimationFrame(measureFPS);
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  // Calculate min/max for scaling the graph
  const minFps = fpsHistory.length > 0 ? Math.min(...fpsHistory) : 0;
  const maxFps = fpsHistory.length > 0 ? Math.max(...fpsHistory) : 60;
  const range = maxFps - minFps || 1;

  // Determine color based on FPS
  const getFpsColor = (currentFps) => {
    if (currentFps >= 55) return '#00ff88'; // Green for good FPS
    if (currentFps >= 30) return '#ffff00'; // Yellow for acceptable
    return '#ff3333'; // Red for poor
  };

  return (
    <Box
      sx={{
        position: 'fixed',
        top: 10,
        right: 10,
        zIndex: 10000,
        background: 'rgba(0, 17, 34, 0.95)',
        border: '1px solid var(--neotech-primary)',
        borderRadius: 1,
        padding: 1.5,
        minWidth: 200,
        boxShadow: '0 0 20px rgba(0, 255, 255, 0.3)',
        fontFamily: "'Rajdhani', monospace"
      }}
    >
      {/* Current FPS Display */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Typography
          variant="body2"
          sx={{
            fontSize: '12px',
            color: 'var(--neotech-text-secondary)',
            fontWeight: 600
          }}
        >
          FPS:
        </Typography>
        <Typography
          variant="h6"
          sx={{
            fontSize: '24px',
            fontWeight: 'bold',
            color: getFpsColor(fps),
            textShadow: `0 0 10px ${getFpsColor(fps)}`,
            fontFamily: "'Orbitron', monospace"
          }}
        >
          {fps}
        </Typography>
      </Box>

      {/* FPS Graph */}
      {fpsHistory.length > 0 && (
        <Box
          sx={{
            width: '100%',
            height: 60,
            position: 'relative',
            border: '1px solid rgba(0, 255, 255, 0.3)',
            borderRadius: 0.5,
            background: 'rgba(0, 0, 0, 0.3)',
            overflow: 'hidden'
          }}
        >
          <svg
            width="100%"
            height="100%"
            viewBox={`0 0 ${graphWidth} ${graphHeight}`}
            preserveAspectRatio="none"
            style={{ display: 'block' }}
          >
            {/* Grid lines */}
            {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
              <line
                key={`grid-${ratio}`}
                x1={0}
                y1={ratio * graphHeight}
                x2={graphWidth}
                y2={ratio * graphHeight}
                stroke="rgba(0, 255, 255, 0.1)"
                strokeWidth="1"
              />
            ))}
            
            {/* FPS line graph */}
            {fpsHistory.length > 0 && (
              <polyline
                points={fpsHistory.map((value, index) => {
                  const x = (index / Math.max(maxHistoryLength - 1, 1)) * graphWidth;
                  const normalizedValue = (value - minFps) / range;
                  const y = graphHeight - (normalizedValue * graphHeight);
                  return `${x},${y}`;
                }).join(' ')}
                fill="none"
                stroke={getFpsColor(fps)}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
            
            {/* Current FPS indicator */}
            {fpsHistory.length > 0 && (
              <circle
                cx={((fpsHistory.length - 1) / Math.max(maxHistoryLength - 1, 1)) * graphWidth}
                cy={graphHeight - (((fps - minFps) / range) * graphHeight)}
                r="3"
                fill={getFpsColor(fps)}
                style={{ filter: `drop-shadow(0 0 3px ${getFpsColor(fps)})` }}
              />
            )}
          </svg>
          
          {/* Min/Max labels */}
          <Box
            sx={{
              position: 'absolute',
              bottom: 2,
              left: 4,
              right: 4,
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '8px',
              color: 'rgba(0, 255, 255, 0.6)'
            }}
          >
            <span>{minFps}</span>
            <span>{maxFps}</span>
          </Box>
        </Box>
      )}
    </Box>
  );
};

export default FPSCounter;

