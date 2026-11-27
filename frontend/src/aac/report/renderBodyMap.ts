import * as THREE from 'three'
import { loadLayer, SCALE, type Layer } from '../lib/bodyModel.ts'
import { MODEL, facesBack, zoneMatches } from '../lib/bodymap.ts'
import type { ReportRegion } from '../lib/patientReview.ts'

export type MapEntry = { number: number; region: ReportRegion }
export type MapFrame = { front: string; back: string; numbers: number[]; unmapped: number[] }
const W = 900, H = 1300

/** Renders the SAME bundled anatomy/region classifier as Pain, never inferred text locations. */
export async function renderBodyMap(entries: MapEntry[], signal: AbortSignal): Promise<MapFrame[]> {
  let renderer: THREE.WebGLRenderer | null = null
  let layer: Layer | null = null
  const scene = new THREE.Scene()
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
    renderer.setSize(W, H); renderer.setPixelRatio(1)
    renderer.setClearColor(0xffffff, 1)
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace
    THREE.ColorManagement.enabled = false
    layer = await loadLayer('body', () => {})
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
    const pivot = new THREE.Group()
    pivot.scale.setScalar(SCALE); pivot.position.y = -MODEL.floor * SCALE
    pivot.add(layer.mesh); scene.add(pivot)
    scene.add(new THREE.HemisphereLight(0xffffff, 0xa9b0cc, 0.9 * Math.PI))
    const key = new THREE.DirectionalLight(0xffffff, 0.55 * Math.PI); key.position.set(3, 5, 4); scene.add(key)
    const back = new THREE.DirectionalLight(0xffffff, 0.35 * Math.PI); back.position.set(-3, 3, -4); scene.add(back)
    const camera = new THREE.OrthographicCamera(-1.28, 1.28, 1.85, -1.85, 0.1, 30)
    const position = layer.mesh.geometry.getAttribute('position')
    const colors = layer.mesh.geometry.getAttribute('color') as THREE.BufferAttribute
    const p = new THREE.Vector3()
    const bounds = entries.map(entry => {
      const box = new THREE.Box3()
      for (let v = 0; v < layer!.zone.length; v++) {
        if (zoneMatches(layer!.zones[layer!.zone[v]], entry.region)) box.expandByPoint(p.fromBufferAttribute(position, v))
      }
      return box.isEmpty() ? null : box.getCenter(new THREE.Vector3()).multiplyScalar(SCALE).add(new THREE.Vector3(0, -MODEL.floor * SCALE, 0))
    })
    const frames: MapFrame[] = []
    // Up to eight labels per pair keeps multi-location reports readable.
    for (let start = 0; start < entries.length; start += 8) {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
      const batch = entries.slice(start, start + 8)
      const selected = layer.zones.map(zone => batch.some(entry => zoneMatches(zone, entry.region)))
      for (let v = 0; v < layer.zone.length; v++) {
        const chosen = selected[layer.zone[v]], shade = layer.shade[layer.struct[v]]
        colors.setXYZ(v, chosen ? 0.05 : 0.84 * shade, chosen ? 0.40 : 0.87 * shade, chosen ? 0.43 : 0.91 * shade)
      }
      colors.needsUpdate = true
      const capture = (view: 'front' | 'back') => {
        camera.position.set(0, 1.5, view === 'front' ? 8 : -8); camera.lookAt(0, 1.5, 0)
        camera.updateMatrixWorld(); renderer!.render(scene, camera)
        const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('Image capture is unavailable.')
        ctx.drawImage(renderer!.domElement, 0, 0)
        ctx.fillStyle = '#173646'; ctx.font = 'bold 30px sans-serif'; ctx.textAlign = 'center'
        ctx.fillText(view === 'front' ? 'FRONT' : 'BACK', W / 2, 48)
        ctx.font = '22px sans-serif'
        ctx.fillText(view === 'front' ? 'Patient’s RIGHT                            Patient’s LEFT' : 'Patient’s LEFT                            Patient’s RIGHT', W / 2, H - 30)
        const labels = batch.flatMap((entry, i) => {
          const center = bounds[start + i]
          if (!center || facesBack(entry.region) !== (view === 'back')) return []
          const screen = center.clone().project(camera)
          return [{ number: entry.number, x: (screen.x + 1) / 2 * W, y: (1 - screen.y) / 2 * H }]
        }).sort((a, b) => a.y - b.y)
        const positions = new Map<number, number>()
        for (const right of [false, true]) {
          const column = labels.filter(label => (label.x >= W / 2) === right)
          let lastY = 80
          const proposed = column.map(label => { lastY = Math.max(label.y, lastY + 58); return lastY })
          const shift = Math.max(0, (proposed.at(-1) ?? 0) - (H - 100))
          column.forEach((label, i) => positions.set(label.number, proposed[i] - shift))
        }
        for (const label of labels) {
          const y = positions.get(label.number)!
          const right = label.x >= W / 2, x = right ? W - 60 : 60
          ctx.strokeStyle = '#173646'; ctx.lineWidth = 3
          ctx.beginPath(); ctx.moveTo(label.x, label.y); ctx.lineTo(x, y); ctx.stroke()
          ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(label.x, label.y, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
          ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(x, y, 29, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
          ctx.fillStyle = '#173646'; ctx.font = 'bold 23px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(`P${label.number}`, x, y)
        }
        return canvas.toDataURL('image/png')
      }
      frames.push({ front: capture('front'), back: capture('back'), numbers: batch.map(e => e.number), unmapped: batch.filter((_, i) => bounds[start + i] === null).map(e => e.number) })
      // Yield between groups so long reports can be cancelled.
      await new Promise(resolve => window.setTimeout(resolve, 0))
    }
    return frames
  } finally {
    layer?.mesh.geometry.dispose(); layer?.mesh.material.dispose()
    renderer?.dispose(); renderer?.forceContextLoss()
  }
}
