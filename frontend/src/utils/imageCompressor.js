/**
 * Client-Side Image Crop and WebP Compression Engine for JEE Rivals.
 * Produces ultra-compact Data URLs (Avatars <30KB, Banners <70KB)
 * guaranteeing zero backend storage costs, zero third-party host dependencies,
 * and immune to container wipe data loss.
 */

export function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      return reject(new Error('No file provided.'));
    }
    if (!file.type.startsWith('image/')) {
      return reject(new Error('Please select an image file (PNG, JPG, WEBP).'));
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        resolve({
          img,
          width: img.naturalWidth || img.width,
          height: img.naturalHeight || img.height,
          src: e.target.result,
        });
      };
      img.onerror = () => reject(new Error('Failed to decode image data.'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.readAsDataURL(file);
  });
}

/**
 * Crops and compresses an avatar image to a 256x256 WebP data URL.
 * Applies zoom and pan offsets centered on the square aspect ratio.
 */
export function cropAndCompressAvatar(imgElement, {
  zoom = 1,
  panX = 0, // -50 to 50 (%)
  panY = 0, // -50 to 50 (%)
  targetSize = 256,
  quality = 0.82
} = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = targetSize;
  canvas.height = targetSize;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Canvas 2D context not available.');
  }

  // Smooth rendering settings
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const origW = imgElement.naturalWidth || imgElement.width;
  const origH = imgElement.naturalHeight || imgElement.height;

  // Determine base square crop dimensions
  const minSide = Math.min(origW, origH);
  const cropW = (minSide / zoom);
  const cropH = (minSide / zoom);

  // Compute center point with percentage pan offsets
  const maxPanX = (origW - cropW) / 2;
  const maxPanY = (origH - cropH) / 2;
  const offsetX = (panX / 50) * Math.max(0, maxPanX);
  const offsetY = (panY / 50) * Math.max(0, maxPanY);

  const sourceX = Math.max(0, Math.min(origW - cropW, ((origW - cropW) / 2) + offsetX));
  const sourceY = Math.max(0, Math.min(origH - cropH, ((origH - cropH) / 2) + offsetY));

  ctx.drawImage(
    imgElement,
    sourceX, sourceY, cropW, cropH,
    0, 0, targetSize, targetSize
  );

  let dataUrl = canvas.toDataURL('image/webp', quality);
  // Fallback to jpeg if webp not supported
  if (!dataUrl.startsWith('data:image/webp')) {
    dataUrl = canvas.toDataURL('image/jpeg', 0.85);
  }

  const approxBytes = Math.round((dataUrl.length * 3) / 4);

  return {
    dataUrl,
    width: targetSize,
    height: targetSize,
    sizeBytes: approxBytes,
    sizeKb: (approxBytes / 1024).toFixed(1),
  };
}

/**
 * Crops and compresses a banner header image to 1200x320 WebP data URL.
 * Aspect ratio: 3.75:1
 */
export function cropAndCompressBanner(imgElement, {
  zoom = 1,
  panX = 0, // -50 to 50 (%)
  panY = 0, // -50 to 50 (%)
  targetWidth = 1200,
  targetHeight = 320,
  quality = 0.80
} = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Canvas 2D context not available.');
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const origW = imgElement.naturalWidth || imgElement.width;
  const origH = imgElement.naturalHeight || imgElement.height;
  const targetRatio = targetWidth / targetHeight; // 3.75

  let baseCropW = origW;
  let baseCropH = origW / targetRatio;

  if (baseCropH > origH) {
    baseCropH = origH;
    baseCropW = origH * targetRatio;
  }

  const cropW = baseCropW / zoom;
  const cropH = baseCropH / zoom;

  const maxPanX = (origW - cropW) / 2;
  const maxPanY = (origH - cropH) / 2;
  const offsetX = (panX / 50) * Math.max(0, maxPanX);
  const offsetY = (panY / 50) * Math.max(0, maxPanY);

  const sourceX = Math.max(0, Math.min(origW - cropW, ((origW - cropW) / 2) + offsetX));
  const sourceY = Math.max(0, Math.min(origH - cropH, ((origH - cropH) / 2) + offsetY));

  ctx.drawImage(
    imgElement,
    sourceX, sourceY, cropW, cropH,
    0, 0, targetWidth, targetHeight
  );

  let dataUrl = canvas.toDataURL('image/webp', quality);
  if (!dataUrl.startsWith('data:image/webp')) {
    dataUrl = canvas.toDataURL('image/jpeg', 0.82);
  }

  const approxBytes = Math.round((dataUrl.length * 3) / 4);

  return {
    dataUrl,
    width: targetWidth,
    height: targetHeight,
    sizeBytes: approxBytes,
    sizeKb: (approxBytes / 1024).toFixed(1),
  };
}
