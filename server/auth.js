import { Router } from 'express'
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import jwt from 'jsonwebtoken'
import { User } from './models.js'

const scrypt = promisify(scryptCallback)
const COOKIE = 'token'
const SESSION_DAYS = 30
const USERNAME_RE = /^[a-z0-9_.-]{3,32}$/
const MIN_PASSWORD = 8

export const bad = (message) => Object.assign(new Error(message), { status: 400 })

export const requireAuth = (req, res, next) => {
  const token = req.headers.cookie?.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`))?.[1]
  try {
    req.userId = jwt.verify(token, process.env.JWT_SECRET).userId
    next()
  } catch {
    res.status(401).json({ error: 'unauthorized' })
  }
}

// Stored as "salt:hash"
const hashPassword = async (password) => {
  const salt = randomBytes(16).toString('hex')
  const hash = await scrypt(password, salt, 64)
  return `${salt}:${hash.toString('hex')}`
}

const verifyPassword = async (password, stored) => {
  const [salt, hex] = stored.split(':')
  const hash = await scrypt(password, salt, 64)
  return timingSafeEqual(hash, Buffer.from(hex, 'hex'))
}

const credentials = (body) => {
  const username = String(body.username ?? '').trim().toLowerCase()
  const password = String(body.password ?? '')
  if (!USERNAME_RE.test(username)) throw bad('username must be 3-32 characters: letters, digits, . _ or -')
  if (password.length < MIN_PASSWORD) throw bad(`password must be at least ${MIN_PASSWORD} characters`)
  return { username, password }
}

const publicUser = (u) => ({ username: u.username })

const startSession = (res, user) => {
  const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: `${SESSION_DAYS}d` })
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', maxAge: SESSION_DAYS * 86400e3 })
  res.json({ user: publicUser(user) })
}

export const auth = Router()

auth.post('/register', async (req, res) => {
  const { username, password } = credentials(req.body)
  let user
  try {
    user = await User.create({ username, passwordHash: await hashPassword(password) })
  } catch (e) {
    if (e.code === 11000) return res.status(409).json({ error: 'that username is taken' })
    throw e
  }
  startSession(res, user)
})

auth.post('/login', async (req, res) => {
  const { username, password } = credentials(req.body)
  const user = await User.findOne({ username })
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return res.status(401).json({ error: 'wrong username or password' })
  }
  startSession(res, user)
})

auth.post('/logout', (req, res) => {
  res.clearCookie(COOKIE)
  res.json({ ok: true })
})

auth.get('/me', requireAuth, async (req, res) => {
  const user = await User.findById(req.userId)
  if (!user) return res.status(401).json({ error: 'unauthorized' })
  res.json({ user: publicUser(user) })
})
