import jsQR, { type QRCode } from 'jsqr'
import { analyze, type Analysis } from './analyze'

export type DecodeResult = Analysis & {
  data: string
  location: QRCode['location']
  version: number
  modules: number
  width: number
  height: number
}

// Core decode over raw pixels, shared by the file and camera paths.
export function decodeImageData(imageData: ImageData): DecodeResult | null {
  const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' })
  if (!code) return null
  return {
    ...analyze(imageData, code.location, code.version),
    data: code.data,
    location: code.location,
    version: code.version,
    modules: 17 + 4 * code.version,
    width: imageData.width,
    height: imageData.height,
  }
}

export async function decodeImageFile(file: File): Promise<DecodeResult | null> {
  const url = URL.createObjectURL(file)
  try {
    const img = await loadImage(url)
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('2d context unavailable')
    ctx.drawImage(img, 0, 0)
    return decodeImageData(ctx.getImageData(0, 0, canvas.width, canvas.height))
  } finally {
    URL.revokeObjectURL(url)
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`))
    img.src = src
  })
}
