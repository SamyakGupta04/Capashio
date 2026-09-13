import mongoose from 'mongoose'

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
})

const faceSchema = new mongoose.Schema(
  {
    box: { x: Number, y: Number, w: Number, h: Number }, // normalized 0..1
    embedding: [Number],
  },
  { _id: false },
)

const mediaSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  file: { type: Buffer, required: true }, // original bytes
  thumb: { type: Buffer, required: true }, // 400px JPEG
  mime: { type: String, required: true },
  w: Number, // original size after EXIF rotation
  h: Number,
  clip: [Number], // empty until indexed
  faces: [faceSchema],
  createdAt: { type: Date, default: Date.now },
})

export const User = mongoose.model('User', userSchema)
export const Media = mongoose.model('Media', mediaSchema)
