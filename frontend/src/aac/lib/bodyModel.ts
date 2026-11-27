import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { MODEL, segmentOf, zoneAt, type Zone } from './bodymap.ts'
import { MODEL_URLS } from './preload.ts'

// Match the existing pain model's legacy, unmanaged colour pipeline.
THREE.ColorManagement.enabled = false

export type LayerKey = 'body' | 'inside'
export type Layer = {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>
  zones: Zone[] // distinct zones in this layer
  zone: Uint16Array // vertex -> index into zones
  struct: Uint16Array // vertex -> structure index
  names: string[]
  shade: Float32Array // per structure: slight tone so neighbouring muscles stay readable
  base: THREE.Color
}

export const COLOR = {
  body: 0xdde1ee, inside: 0xf0cdbf, selected: 0x3d4bd8, hover: 0xb9c0f5,
  scoreLow: new THREE.Color(0xf5d9b0), scoreHigh: new THREE.Color(0xd2541f),
}
export const SCALE = 3 / MODEL.height // model metres -> scene units (3 tall, feet at 0)

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)

export async function loadLayer(key: LayerKey, onProgress: (f: number) => void): Promise<Layer> {
  const gltf = await loader.loadAsync(MODEL_URLS[key], e => onProgress(e.total ? e.loaded / e.total : 0))
  gltf.scene.updateMatrixWorld(true)
  const geos: THREE.BufferGeometry[] = [], names: string[] = [], zone: number[] = [], struct: number[] = []
  const zones: Zone[] = [], zoneIds = new Map<string, number>()
  const zoneIndex = (z: Zone) => {
    const k = `${z.part}|${z.sub}|${z.side}`
    let i = zoneIds.get(k)
    if (i === undefined) { i = zones.push(z) - 1; zoneIds.set(k, i) }
    return i
  }
  gltf.scene.traverse(o => {
    if (!(o instanceof THREE.Mesh)) return
    const src = o.geometry as THREE.BufferGeometry
    // Copy out of the quantised (int16) attributes before transforming.
    const pos = src.getAttribute('position'), nor = src.getAttribute('normal')
    const P = new Float32Array(pos.count * 3), N = new Float32Array(pos.count * 3)
    for (let i = 0; i < pos.count; i++) {
      P[i * 3] = pos.getX(i); P[i * 3 + 1] = pos.getY(i); P[i * 3 + 2] = pos.getZ(i)
      if (nor) { N[i * 3] = nor.getX(i); N[i * 3 + 1] = nor.getY(i); N[i * 3 + 2] = nor.getZ(i) }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(P, 3))
    g.setAttribute('normal', new THREE.BufferAttribute(N, 3))
    if (src.index) g.setIndex(Array.from(src.index.array))
    g.applyMatrix4(o.matrixWorld)
    if (!nor) g.computeVertexNormals()

    g.computeBoundingBox()
    const c = g.boundingBox!.getCenter(new THREE.Vector3())
    const seg = key === 'inside' ? 'axial' : segmentOf(c.x, c.y)
    const s = names.push(((o.userData.n ?? o.parent?.userData.n) as string | undefined) || 'Unnamed structure') - 1
    for (let i = 0; i < pos.count; i++) { zone.push(zoneIndex(zoneAt(seg, P[i * 3], P[i * 3 + 1], P[i * 3 + 2]))); struct.push(s) }
    geos.push(g)
  })
  const merged = mergeGeometries(geos)!
  geos.forEach(g => g.dispose())
  merged.setAttribute('color', new THREE.BufferAttribute(new Float32Array(merged.getAttribute('position').count * 3), 3))

  const shade = new Float32Array(names.length)
  names.forEach((n, i) => {
    let h = 0
    for (const ch of n.replace(/\.[a-z]+$/i, '')) h = (h * 31 + ch.charCodeAt(0)) % 100003
    shade[i] = 0.9 + 0.14 * (h / 100003) // left and right twins share a tone
  })
  const mesh = new THREE.Mesh(merged, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0, side: THREE.DoubleSide }))
  return { mesh, zones, zone: Uint16Array.from(zone), struct: Uint16Array.from(struct), names, shade, base: new THREE.Color(COLOR[key]) }
}

