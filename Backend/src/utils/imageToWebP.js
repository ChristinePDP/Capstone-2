import sharp from 'sharp';

const MAX_OUTPUT_DIMENSION = 2000;
const SUPPORTED_FORMATS = new Set(['jpeg', 'png', 'webp', 'gif', 'avif', 'heif', 'tiff', 'svg']);

export class ImageConversionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ImageConversionError';
    this.status = 400;
  }
}

/** Decode an uploaded image and return WebP bytes. Invalid/unsupported input is rejected. */
export async function toWebP(buffer, { maxSize = MAX_OUTPUT_DIMENSION, quality = 82, lossless = false } = {}) {
  try {
    const metadata = await sharp(buffer).metadata();
    if (!metadata.format || !SUPPORTED_FORMATS.has(metadata.format)) {
      throw new ImageConversionError('Unsupported image format. Please upload a JPG, PNG, WebP, GIF, or AVIF image.');
    }

    // Pass all animation pages through so animated GIFs remain animated WebP.
    const image = sharp(buffer, { animated: (metadata.pages || 1) > 1 })
      .rotate()
      .resize({ width: maxSize, height: maxSize, fit: 'inside', withoutEnlargement: true });
    const { data, info } = await image.webp({ quality, lossless, effort: 4 }).toBuffer({ resolveWithObject: true });
    return { buffer: data, size: info.size, width: info.width, height: info.height };
  } catch (error) {
    if (error instanceof ImageConversionError) throw error;
    throw new ImageConversionError('Hindi ma-convert ang image sa WebP. Subukan ang JPG, PNG, WebP, GIF, o AVIF file.');
  }
}
