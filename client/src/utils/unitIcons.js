const tintedIconCache = new Map();

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

const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load icon image: ${src}`));
    img.src = src;
  });

export const getTintedIconDataUrl = async (iconUrl, tintColor) => {
  if (typeof iconUrl !== 'string' || !iconUrl) {
    throw new Error('iconUrl is required');
  }
  if (typeof tintColor !== 'string' || !tintColor) {
    throw new Error('tintColor is required');
  }

  const cacheKey = `${iconUrl}::${tintColor}`;
  const cached = tintedIconCache.get(cacheKey);
  if (cached) return cached;

  const { r: tr, g: tg, b: tb } = hexToRgb(tintColor);
  const img = await loadImage(iconUrl);

  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context not available');
  }

  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  // Replace near-white pixels with tint color
  const threshold = 240;
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a === 0) continue;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    if (r >= threshold && g >= threshold && b >= threshold) {
      data[i] = tr;
      data[i + 1] = tg;
      data[i + 2] = tb;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  const result = canvas.toDataURL('image/png');
  tintedIconCache.set(cacheKey, result);
  return result;
};


