const hexToRgb = (hexColor) => {
  const trimmed = hexColor.trim();
  const match = /^#?([0-9a-fA-F]{6})$/.exec(trimmed);
  if (!match) {
    throw new Error(`Invalid hex color: "${hexColor}"`);
  }
  const value = match[1];
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return { r, g, b };
};

export const buildUnitIconUrl = (apiBaseUrl, iconPath) => {
  if (typeof apiBaseUrl !== 'string' || !apiBaseUrl) {
    throw new Error('apiBaseUrl is required');
  }
  if (typeof iconPath !== 'string' || !iconPath) {
    throw new Error('iconPath is required');
  }
  const normalized = iconPath.replace(/^\/+/, '');
  const encoded = normalized
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `${apiBaseUrl}/unit-icons/${encoded}`;
};

/**
 * Generates a unique filter ID for SVG filters based on color.
 * 
 * @param {string} hexColor - Target color in hex format (e.g., "#FF0000")
 * @returns {string} Unique filter ID
 */
export const getFilterId = (hexColor) => {
  if (typeof hexColor !== 'string' || !hexColor) {
    return null;
  }
  // Create a unique ID from the color
  return `color-filter-${hexColor.replace('#', '')}`;
};

/**
 * Creates an SVG filter definition that selectively tints white/light areas
 * while preserving black areas. Uses feColorMatrix for precise control.
 * 
 * Strategy: Extract luminance, then multiply by target color.
 * This only affects pixels with brightness, leaving black untouched.
 * 
 * @param {string} hexColor - Target color in hex format (e.g., "#FF0000")
 * @returns {Object} SVG filter element props with id and children elements
 */
export const createColorFilter = (hexColor) => {
  if (typeof hexColor !== 'string' || !hexColor) {
    return null;
  }

  const { r, g, b } = hexToRgb(hexColor);
  
  // Normalize RGB values (0-1)
  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;
  
  // Create a color matrix that tints based on luminance
  // Matrix format: [R' G' B' A' 1] = [R G B A 1] × 5x5 matrix
  // We extract luminance and multiply by target color
  // This way: black (luminance=0) stays black, white (luminance=1) becomes target color
  
  // Standard luminance weights
  const lumR = 0.2126;
  const lumG = 0.7152;
  const lumB = 0.0722;
  
  // Matrix that:
  // - Extracts luminance: L = 0.2126*R + 0.7152*G + 0.0722*B
  // - Applies target color proportionally: R' = L * rNorm, etc.
  // - Preserves alpha
  const matrix = [
    rNorm * lumR, rNorm * lumG, rNorm * lumB, 0, 0,
    gNorm * lumR, gNorm * lumG, gNorm * lumB, 0, 0,
    bNorm * lumR, bNorm * lumG, bNorm * lumB, 0, 0,
    0, 0, 0, 1, 0
  ];
  
  const filterId = getFilterId(hexColor);
  
  return {
    id: filterId,
    matrix: matrix.join(' ')
  };
};

/**
 * Calculates CSS filter values for use with HTML img elements.
 * This is a fallback for components that can't use SVG filters.
 * Note: CSS filters have limitations and may create glow effects.
 * 
 * @param {string} hexColor - Target color in hex format (e.g., "#FF0000")
 * @returns {string} CSS filter string
 */
export const getColorFilter = (hexColor) => {
  if (typeof hexColor !== 'string' || !hexColor) {
    return 'none';
  }

  const { r, g, b } = hexToRgb(hexColor);
  
  // Normalize RGB values (0-1)
  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;
  
  // Calculate HSL for filter calculation
  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  const delta = max - min;
  
  const lightness = (max + min) / 2;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
  
  // Calculate hue
  let hue = 0;
  if (delta !== 0) {
    if (max === rNorm) {
      hue = 60 * (((gNorm - bNorm) / delta) % 6);
    } else if (max === gNorm) {
      hue = 60 * ((bNorm - rNorm) / delta + 2);
    } else {
      hue = 60 * ((rNorm - gNorm) / delta + 4);
    }
  }
  if (hue < 0) hue += 360;
  
  // CSS filter for HTML img elements (used in dialogs)
  const sepiaValue = 100;
  const saturateValue = Math.max(200, Math.min(600, saturation * 500 + 150));
  const hueRotateValue = hue;
  const brightnessValue = Math.max(0.6, Math.min(1.5, lightness * 1.8 + 0.4));
  
  return `contrast(1.5) sepia(${sepiaValue}%) saturate(${saturateValue}%) hue-rotate(${hueRotateValue}deg) brightness(${brightnessValue})`;
};



