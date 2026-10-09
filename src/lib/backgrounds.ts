/**
 * Shared helpers for the custom background upload feature (Phase 3 M1).
 * The client's declared Content-Type is never trusted — uploads are
 * authenticated by magic-byte sniffing alone.
 */

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024

/**
 * Detect the real image type from magic bytes.
 * Returns one of image/png | image/jpeg | image/gif | image/webp, or null
 * when the buffer is not a supported image.
 */
export function sniffImageMime(buf: Uint8Array): string | null {
  if (buf.length < 12) return null

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return 'image/png'
  }

  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'image/jpeg'
  }

  const ascii = (start: number, s: string) =>
    [...s].every((ch, i) => buf[start + i] === ch.charCodeAt(0))

  // GIF87a / GIF89a
  if (ascii(0, 'GIF87a') || ascii(0, 'GIF89a')) return 'image/gif'

  // WEBP: 'RIFF' + 4 bytes + 'WEBP'
  if (ascii(0, 'RIFF') && ascii(8, 'WEBP')) return 'image/webp'

  return null
}
