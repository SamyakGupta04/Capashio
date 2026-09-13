// Embeddings run in a worker; face detection cannot

import { FaceDetector } from '@mediapipe/tasks-vision'
import mpLoaderUrl from '@mediapipe/tasks-vision/vision_wasm_internal.js?url'
import mpWasmUrl from '@mediapipe/tasks-vision/vision_wasm_internal.wasm?url'

const FACE_DETECTOR = '/models/face/blaze_face_short_range.tflite'
const MIN_FACE_PX = 40

const worker = new Worker(new URL('./ml.worker.js', import.meta.url), { type: 'module' })
const pending = new Map()
let nextId = 1
let onProgress = () => {}
let faceDetector

worker.onmessage = ({ data }) => {
  if (data.type === 'progress') return onProgress(data)
  const p = pending.get(data.id)
  pending.delete(data.id)
  if (data.ok) p.resolve(data.result)
  else p.reject(new Error(data.error))
}

worker.onerror = (e) => {
  for (const p of pending.values()) p.reject(new Error(e.message || 'worker crashed'))
  pending.clear()
}

const call = (msg, transfer) =>
  new Promise((resolve, reject) => {
    const id = nextId++
    pending.set(id, { resolve, reject })
    worker.postMessage({ id, ...msg }, transfer)
  })

async function loadFaceDetector() {
  faceDetector = await FaceDetector.createFromOptions(
    { wasmLoaderPath: mpLoaderUrl, wasmBinaryPath: mpWasmUrl },
    { baseOptions: { modelAssetPath: FACE_DETECTOR }, runningMode: 'IMAGE' },
  )
}

// Loads every model once; resolves to { device }
let initPromise
export const init = (progress) => {
  onProgress = progress
  initPromise ??= Promise.all([call({ type: 'init' }), loadFaceDetector()]).then(([result]) => result)
  return initPromise
}

export const embedText = (text) => call({ type: 'embedText', text })

// Takes ownership of the bitmap; faces largest first
export function embedImage(bitmap) {
  const W = bitmap.width
  const H = bitmap.height
  // box in pixels, keypoints normalized, eyes first
  const faces = faceDetector
    .detect(bitmap)
    .detections.filter((d) => d.boundingBox.width >= MIN_FACE_PX)
    .sort((a, b) => b.boundingBox.width * b.boundingBox.height - a.boundingBox.width * a.boundingBox.height)
    .map((d) => ({
      box: { x: d.boundingBox.originX / W, y: d.boundingBox.originY / H, w: d.boundingBox.width / W, h: d.boundingBox.height / H },
      eyes: d.keypoints.slice(0, 2).map((k) => ({ x: k.x * W, y: k.y * H })),
    }))
  return call({ type: 'embedImage', bitmap, faces }, [bitmap])
}
