import { useCallback, useEffect, useState } from 'react'

// Lists the cameras connected to this computer: [{ id, label }].
// Browsers hide the camera names until the user has allowed camera access once,
// so call refresh() after a camera has started (HandCamera's onStream does this).
// The list also updates by itself when a camera is plugged in or removed (the 'devicechange' event).
export function useCameras() {
  const [cameras, setCameras] = useState([])

  const refresh = useCallback(async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices()
      setCameras(
        all
          .filter((d) => d.kind === 'videoinput' && d.deviceId)
          .map((d, i) => ({ id: d.deviceId, label: d.label || `Camera ${i + 1}` })),
      )
    } catch {
      setCameras([])
    }
  }, [])

  useEffect(() => {
    const media = navigator.mediaDevices
    if (!media) return
    media.addEventListener?.('devicechange', refresh)
    return () => media.removeEventListener?.('devicechange', refresh)
  }, [refresh])

  return { cameras, refresh }
}
