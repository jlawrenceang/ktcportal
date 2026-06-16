// Client-side mirrors of the server-enforced policies, so users get a friendly
// message instead of a raw backend error. The server is the authority:
// password policy lives in GoTrue config (scripts/set-auth-security.mjs) +
// create_staff (migration 0032); upload limits on the storage buckets (0033).

export const PASSWORD_HINT = 'At least 8 characters, including a letter and a number.'

export function passwordIssue(pw: string): string | null {
  if (pw.length < 8) return 'Password must be at least 8 characters.'
  if (!/[A-Za-z]/.test(pw)) return 'Password must include at least one letter.'
  if (!/[0-9]/.test(pw)) return 'Password must include at least one number.'
  return null
}

export const MAX_UPLOAD_MB = 5
const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024
const ALLOWED_UPLOAD_TYPES = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
  'application/pdf',
]
// Types the browser can decode + re-encode on a canvas (HEIC/HEIF can't be).
const COMPRESSIBLE = ['image/jpeg', 'image/png', 'image/webp']

/**
 * Prepare a picked file for upload: oversized browser-decodable images are
 * downscaled (max 2200px long edge) and re-encoded as JPEG, stepping quality
 * down until they fit the 5 MB cap. Returns the (possibly compressed) file,
 * or an error message when it can't be made to fit (PDF/HEIC over the cap,
 * or an image that won't decode).
 */
export async function prepareUpload(file: File): Promise<{ file: File } | { error: string }> {
  const typeIssue = file.type && !ALLOWED_UPLOAD_TYPES.includes(file.type.toLowerCase())
    ? 'Only image files (JPG, PNG, WebP, HEIC) or a PDF are allowed.'
    : null
  if (typeIssue) return { error: typeIssue }
  if (file.size <= MAX_UPLOAD_BYTES) return { file }
  if (!COMPRESSIBLE.includes(file.type.toLowerCase())) {
    return { error: `File is too large — the maximum is ${MAX_UPLOAD_MB} MB. Please use a smaller file.` }
  }
  try {
    const compressed = await compressImage(file)
    if (compressed.size > MAX_UPLOAD_BYTES) {
      return { error: `Couldn’t shrink this image under ${MAX_UPLOAD_MB} MB — please use a smaller photo.` }
    }
    return { file: compressed }
  } catch {
    return { error: `File is too large — the maximum is ${MAX_UPLOAD_MB} MB, and this image couldn’t be compressed.` }
  }
}

async function compressImage(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file)
  const MAX_EDGE = 2200
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('no canvas context')
  // White backdrop so transparent PNGs don't go black when saved as JPEG.
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()

  for (const quality of [0.85, 0.75, 0.65, 0.5]) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
    if (blob && blob.size <= MAX_UPLOAD_BYTES) {
      const name = file.name.replace(/\.[^.]+$/, '') + '.jpg'
      return new File([blob], name, { type: 'image/jpeg' })
    }
  }
  throw new Error('could not compress under the cap')
}
