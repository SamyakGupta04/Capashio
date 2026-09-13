// CLIP and ArcFace embeddings; weights served from /models

import {
  env,
  AutoTokenizer,
  AutoProcessor,
  CLIPTextModelWithProjection,
  CLIPVisionModelWithProjection,
  RawImage,
} from '@huggingface/transformers'
import * as ort from 'onnxruntime-web/webgpu'
import ortMjsUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url'
import ortWasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url'

env.allowLocalModels = true
env.allowRemoteModels = false
env.localModelPath = '/models/'
// Keep the ORT runtime off the CDN
env.backends.onnx.wasm.wasmPaths = { mjs: ortMjsUrl, wasm: ortWasmUrl }
ort.env.logLevel = 'error'

const CLIP_ID = 'Xenova/mobileclip_s0'
// q8 vision is broken for this model
const CLIP_TEXT_DTYPE = 'q8'
const CLIP_VISION_DTYPE = 'fp32'
const CLIP_MAX_SIDE = 512
const CLIP_TEXT_LEN = 77 // fixed by the text encoder
// Caption templates, averaged (prompt ensembling)
const TEXT_TEMPLATES = ['a photo of {}.', 'a close-up photo of {}.', '{}']
const FACE_MODEL = '/models/face/w600k_mbf.onnx'
// ArcFace 112x112 template eye positions
const EYE_L = { x: 38.3, y: 51.7 }
const EYE_R = { x: 73.5, y: 51.5 }

let tokenizer, processor, textModel, visionModel, faceSession, device

const progress = (p) => {
  if (p.status === 'progress') self.postMessage({ type: 'progress', file: p.file, loaded: p.loaded, total: p.total })
}

async function fetchWithProgress(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
  const total = Number(res.headers.get('content-length')) || 0
  const reader = res.body.getReader()
  const chunks = []
  let loaded = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    loaded += value.length
    self.postMessage({ type: 'progress', file: url, loaded, total })
  }
  return new Uint8Array(await new Blob(chunks).arrayBuffer())
}

async function loadClip(dev) {
  tokenizer = await AutoTokenizer.from_pretrained(CLIP_ID)
  processor = await AutoProcessor.from_pretrained(CLIP_ID)
  textModel = await CLIPTextModelWithProjection.from_pretrained(CLIP_ID, { device: dev, dtype: CLIP_TEXT_DTYPE, progress_callback: progress })
  visionModel = await CLIPVisionModelWithProjection.from_pretrained(CLIP_ID, { device: dev, dtype: CLIP_VISION_DTYPE, progress_callback: progress })
}

async function init() {
  device = navigator.gpu ? 'webgpu' : 'wasm'
  try {
    await loadClip(device)
  } catch (e) {
    if (device === 'wasm') throw e
    console.warn('WebGPU model load failed, retrying on wasm', e?.stack || e)
    device = 'wasm'
    await loadClip(device)
  }
  faceSession = await ort.InferenceSession.create(await fetchWithProgress(FACE_MODEL), {
    executionProviders: device === 'webgpu' ? ['webgpu', 'wasm'] : ['wasm'],
  })
  return { device }
}

const l2 = (v) => {
  let n = 0
  for (const x of v) n += x * x
  n = Math.sqrt(n) || 1
  return Array.from(v, (x) => x / n)
}

async function embedText(text) {
  const prompts = TEXT_TEMPLATES.map((t) => t.replace('{}', text))
  const inputs = tokenizer(prompts, { padding: 'max_length', max_length: CLIP_TEXT_LEN, truncation: true })
  const { text_embeds } = await textModel(inputs)
  const normalized = text_embeds.normalize(2, -1)
  const [n, dim] = normalized.dims
  const mean = new Array(dim).fill(0)
  for (let i = 0; i < n * dim; i++) mean[i % dim] += normalized.data[i] / n
  return l2(mean)
}

function downscale(bitmap, maxSide) {
  const s = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * s)
  const h = Math.round(bitmap.height * s)
  const ctx = new OffscreenCanvas(w, h).getContext('2d')
  ctx.drawImage(bitmap, 0, 0, w, h)
  return ctx.getImageData(0, 0, w, h)
}

// Align eyes to the template, crop 112x112, return NCHW input
function alignedFaceInput(bitmap, eyes) {
  const [le, re] = [...eyes].sort((a, b) => a.x - b.x)
  const angle = Math.atan2(re.y - le.y, re.x - le.x)
  const scale = (EYE_R.x - EYE_L.x) / Math.hypot(re.x - le.x, re.y - le.y)
  const ctx = new OffscreenCanvas(112, 112).getContext('2d')
  ctx.translate((EYE_L.x + EYE_R.x) / 2, (EYE_L.y + EYE_R.y) / 2)
  ctx.rotate(-angle)
  ctx.scale(scale, scale)
  ctx.translate(-(le.x + re.x) / 2, -(le.y + re.y) / 2)
  ctx.drawImage(bitmap, 0, 0)
  const { data } = ctx.getImageData(0, 0, 112, 112)
  const input = new Float32Array(3 * 112 * 112)
  for (let i = 0; i < 112 * 112; i++) {
    for (let ch = 0; ch < 3; ch++) input[ch * 112 * 112 + i] = (data[i * 4 + ch] - 127.5) / 127.5
  }
  return input
}

async function embedImage(bitmap, detected) {
  const small = downscale(bitmap, CLIP_MAX_SIDE)
  const raw = new RawImage(small.data, small.width, small.height, 4)
  const { image_embeds } = await visionModel(await processor(raw))
  const clip = Array.from(image_embeds.normalize(2, -1).data)

  const faces = []
  for (const { box, eyes } of detected) {
    const input = alignedFaceInput(bitmap, eyes)
    const feeds = { [faceSession.inputNames[0]]: new ort.Tensor('float32', input, [1, 3, 112, 112]) }
    const out = await faceSession.run(feeds)
    faces.push({ box, embedding: l2(out[faceSession.outputNames[0]].data) })
  }
  bitmap.close()
  return { clip, faces }
}

const handlers = {
  init,
  embedText: ({ text }) => embedText(text),
  embedImage: ({ bitmap, faces }) => embedImage(bitmap, faces),
}

self.onmessage = async ({ data }) => {
  try {
    self.postMessage({ id: data.id, ok: true, result: await handlers[data.type](data) })
  } catch (e) {
    self.postMessage({ id: data.id, ok: false, error: e?.message || String(e) })
  }
}
