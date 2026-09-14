import { useCallback, useEffect, useRef, useState } from 'react'
import { decodeImageData, type DecodeResult } from './decode'

export type CameraState = 'idle' | 'starting' | 'scanning' | 'error'

// Live camera QR scanning: streams the (rear, if available) camera into a
// <video>, decodes each frame with the same jsQR path as the file uploader,
// and stops as soon as a code is found — handing back the result plus a
// snapshot of the winning frame.
export function useCamera(onResult: (r: DecodeResult, snapshot: string) => void) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const activeRef = useRef(false)
  const [state, setState] = useState<CameraState>('idle')
  const [error, setError] = useState<string | null>(null)

  const teardown = useCallback(() => {
    activeRef.current = false
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
  }, [])

  const stop = useCallback(() => {
    teardown()
    setState('idle')
  }, [teardown])

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Camera not available (needs a secure https connection).')
      setState('error')
      return
    }
    setError(null)
    setState('starting')
    activeRef.current = true
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      })
      const v = videoRef.current
      // Bail if stopped (or unmounted) while the permission prompt was open.
      if (!activeRef.current || !v) {
        stream.getTracks().forEach(t => t.stop())
        return
      }
      streamRef.current = stream
      v.srcObject = stream
      await v.play()
      setState('scanning')

      const canvas = canvasRef.current ?? (canvasRef.current = document.createElement('canvas'))
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) throw new Error('2d context unavailable')

      const tick = () => {
        if (!streamRef.current) return
        if (v.readyState >= v.HAVE_CURRENT_DATA && v.videoWidth) {
          canvas.width = v.videoWidth
          canvas.height = v.videoHeight
          ctx.drawImage(v, 0, 0, canvas.width, canvas.height)
          const result = decodeImageData(ctx.getImageData(0, 0, canvas.width, canvas.height))
          if (result) {
            const snapshot = canvas.toDataURL('image/jpeg', 0.85)
            teardown()
            setState('idle')
            onResult(result, snapshot)
            return
          }
        }
        rafRef.current = requestAnimationFrame(tick)
      }
      rafRef.current = requestAnimationFrame(tick)
    } catch (e) {
      teardown()
      setError(cameraErrMessage(e))
      setState('error')
    }
  }, [onResult, teardown])

  // Release the camera if the component unmounts mid-scan.
  useEffect(() => teardown, [teardown])

  return { videoRef, state, error, start, stop }
}

function cameraErrMessage(e: unknown): string {
  const name = (e as DOMException)?.name
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Camera permission denied.'
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'No camera found.'
    case 'NotReadableError':
      return 'Camera is in use by another app.'
    default:
      return String((e as Error)?.message ?? e)
  }
}
