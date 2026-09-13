import { Router } from 'express'
import multer from 'multer'
import sharp from 'sharp'
import mongoose from 'mongoose'
import { Media } from './models.js'
import { requireAuth, bad } from './auth.js'

const MAX_FILE_BYTES = 10 * 1024 * 1024 // keeps the document under Mongo's 16 MB
const THUMB_WIDTH = 400
const MIMES = ['image/jpeg', 'image/png', 'image/webp']
const DIM = 512
const TOP_K = 50
const MIN_SCORE = 0.15 // CLIP hits ~0.2+, misses ~0.1
const RELATIVE_CUTOFF = 0.75 // fraction of the best CLIP score
const FACE_THRESHOLD = 0.4 // same person 0.59+, strangers below 0.1

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES },
  fileFilter: (req, file, cb) =>
    MIMES.includes(file.mimetype) ? cb(null, true) : cb(bad('only jpeg, png, or webp images are accepted')),
})

const isVec = (v) => Array.isArray(v) && v.length === DIM && v.every(Number.isFinite)
const isFaces = (v) =>
  Array.isArray(v) &&
  v.every((f) => f && isVec(f.embedding) && f.box && ['x', 'y', 'w', 'h'].every((k) => Number.isFinite(f.box[k])))

// Accepts multipart JSON strings or parsed JSON bodies
function embeddingsFrom(body) {
  let clip, faces
  try {
    clip = typeof body.clip === 'string' ? JSON.parse(body.clip) : body.clip
    faces = typeof body.faces === 'string' ? JSON.parse(body.faces) : body.faces
  } catch {
    throw bad('clip and faces must be JSON')
  }
  if (clip !== undefined && !isVec(clip)) throw bad(`clip must be ${DIM} numbers`)
  if (faces !== undefined && !isFaces(faces)) throw bad('faces malformed')
  return { clip, faces }
}

const cosine = (a, b) => {
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  return dot / Math.sqrt(na * nb)
}

const toItem = (d) => ({
  _id: d._id,
  w: d.w,
  h: d.h,
  createdAt: d.createdAt,
  indexed: d.clip?.length > 0,
  faces: (d.faces || []).map((f) => ({ box: f.box })),
})

export const media = Router()
media.use('/api', requireAuth)

media.get('/api/media', async (req, res) => {
  const docs = await Media.find({ userId: req.userId }, { w: 1, h: 1, createdAt: 1, clip: { $slice: 1 }, 'faces.box': 1 })
    .sort({ createdAt: -1 })
    .lean()
  res.json({ items: docs.map(toItem) })
})

media.post('/api/media', upload.single('file'), async (req, res) => {
  if (!req.file) throw bad('file is required')
  const { clip, faces } = embeddingsFrom(req.body)
  // rotate() applies EXIF orientation
  const image = sharp(req.file.buffer).rotate()
  const { width: w, height: h } = await image.metadata().then((m) => ({ width: m.autoOrient.width, height: m.autoOrient.height }))
  const thumb = await image.resize({ width: THUMB_WIDTH }).jpeg({ quality: 80 }).toBuffer()
  const doc = await Media.create({ userId: req.userId, file: req.file.buffer, thumb, mime: req.file.mimetype, w, h, clip, faces })
  res.status(201).json({ item: toItem(doc) })
})

// Sends the original ("file") or the thumbnail ("thumb")
media.get('/api/media/:id/:kind', async (req, res) => {
  const kind = ['file', 'thumb'].includes(req.params.kind) ? req.params.kind : null
  const doc =
    kind && mongoose.isValidObjectId(req.params.id)
      ? await Media.findOne({ _id: req.params.id, userId: req.userId }, `${kind} mime`).lean()
      : null
  if (!doc) return res.status(404).json({ error: 'not found' })
  res.set('Content-Type', kind === 'thumb' ? 'image/jpeg' : doc.mime)
  res.set('Cache-Control', 'private, max-age=31536000, immutable')
  res.send(doc[kind].buffer ?? doc[kind])
})

media.patch('/api/media/:id/embeddings', async (req, res) => {
  const { clip, faces } = embeddingsFrom(req.body)
  if (!clip) throw bad('clip is required')
  const result = mongoose.isValidObjectId(req.params.id)
    ? await Media.updateOne({ _id: req.params.id, userId: req.userId }, { clip, faces: faces ?? [] })
    : null
  if (!result?.matchedCount) return res.status(404).json({ error: 'not found' })
  res.json({ ok: true })
})

media.delete('/api/media/:id', async (req, res) => {
  const doc = mongoose.isValidObjectId(req.params.id)
    ? await Media.findOneAndDelete({ _id: req.params.id, userId: req.userId }, { projection: { _id: 1 } })
    : null
  if (!doc) return res.status(404).json({ error: 'not found' })
  res.json({ ok: true })
})

// Face matches first, then CLIP similarity
media.post('/api/search', async (req, res) => {
  const { clip, faceOf } = req.body
  let { face } = req.body
  if (faceOf) {
    const doc = mongoose.isValidObjectId(faceOf.id)
      ? await Media.findOne({ _id: faceOf.id, userId: req.userId }, 'faces').lean()
      : null
    face = doc?.faces[faceOf.index]?.embedding
    if (!face) throw bad('no such face')
  }
  if (clip !== undefined && !isVec(clip)) throw bad(`clip must be ${DIM} numbers`)
  if (face !== undefined && !isVec(face)) throw bad(`face must be ${DIM} numbers`)
  if (!clip && !face) throw bad('clip or face is required')

  const docs = await Media.find({ userId: req.userId, 'clip.0': { $exists: true } }, 'w h createdAt clip faces').lean()
  const desc = (a, b) => b.score - a.score

  const faceHits = face
    ? docs
        .map((d) => ({ d, score: Math.max(-1, ...d.faces.map((f) => cosine(face, f.embedding))), byFace: true }))
        .filter((h) => h.score >= FACE_THRESHOLD)
        .sort(desc)
    : []
  const seen = new Set(faceHits.map((h) => String(h.d._id)))
  const clipHits = clip
    ? docs
        .filter((d) => !seen.has(String(d._id)))
        .map((d) => ({ d, score: cosine(clip, d.clip), byFace: false }))
        .sort(desc)
    : []

  const clipCutoff = Math.max(MIN_SCORE, (clipHits[0]?.score ?? 0) * RELATIVE_CUTOFF)
  const strong = faceHits.length + clipHits.filter((h) => h.score >= clipCutoff).length
  const items = [...faceHits, ...clipHits].slice(0, TOP_K).map(({ d, score, byFace }) => ({ ...toItem(d), score, byFace }))
  res.json({ items, strong: Math.min(strong, items.length) })
})
