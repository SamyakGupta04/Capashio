import 'dotenv/config'
import express from 'express'
import mongoose from 'mongoose'
import multer from 'multer'
import { fileURLToPath } from 'node:url'
import { auth } from './auth.js'
import { media } from './media.js'

for (const key of ['CONNECTION_URL', 'JWT_SECRET']) {
  if (!process.env[key]) {
    console.error(`${key} is missing. Copy .env.example to .env and set it.`)
    process.exit(1)
  }
}

const PORT = process.env.PORT || 5001

const app = express()
app.use(express.json({ limit: '2mb' }))
app.use('/api/auth', auth)
app.use(media)
// Serves the built client in production
app.use(express.static(fileURLToPath(new URL('../client/dist', import.meta.url))))

// Every handler error ends here as { error }
app.use((err, req, res, next) => {
  const status = err instanceof multer.MulterError ? 400 : err.status || 500
  if (status === 500) console.error(err)
  res.status(status).json({ error: err.message })
})

await mongoose.connect(process.env.CONNECTION_URL)
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`))
