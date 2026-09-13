import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { api } from './api'
import Gallery from './Gallery'
import Logo from './Logo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function App() {
  // undefined = checking session, null = signed out
  const [user, setUser] = useState(undefined)

  useEffect(() => {
    api.onUnauthorized = () => setUser(null)
    api('/api/auth/me')
      .then((r) => setUser(r.user))
      .catch(() => setUser(null))
  }, [])

  const signOut = async () => {
    await api('/api/auth/logout', { method: 'POST' })
    setUser(null)
  }

  if (user === undefined) return null
  if (!user) return <SignIn onSignedIn={setUser} />
  return <Gallery user={user} onSignOut={signOut} />
}

const BLOBS = [
  { className: 'bg-violet-300/50 -top-24 -left-24', dur: 9 },
  { className: 'bg-sky-300/50 -right-24 top-1/3', dur: 11 },
  { className: 'bg-emerald-200/60 -bottom-24 left-1/3', dur: 13 },
]

function SignIn({ onSignedIn }) {
  const [mode, setMode] = useState('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const { user } = await api(`/api/auth/${mode}`, { method: 'POST', body: { username, password } })
      onSignedIn(user)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden p-4">
      {BLOBS.map((b, i) => (
        <div
          key={i}
          className={`absolute size-[28rem] rounded-full blur-3xl ${b.className}`}
          style={{ animation: `float ${b.dur}s ease-in-out infinite`, animationDelay: `${i * 1.5}s` }}
        />
      ))}
      <motion.form
        onSubmit={submit}
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 220, damping: 24 }}
        className="relative w-full max-w-sm space-y-4 rounded-3xl border border-white/60 bg-white/70 p-8 shadow-2xl shadow-black/10 backdrop-blur-2xl"
      >
        <div className="flex items-center gap-2">
          <Logo className="size-7" />
          <span className="font-heading text-2xl leading-none">Capashio</span>
        </div>
        <h1 className="font-heading pt-2 text-[2.1rem] leading-[1.05]">
          Your photos,
          <br />
          <em>searched by meaning.</em>
        </h1>
        <p className="pb-1 text-sm text-muted-foreground">Everything runs on your device. Nothing leaves it.</p>
        <Input
          autoFocus
          placeholder="Username"
          autoComplete="username"
          className="h-11 rounded-xl bg-white"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <Input
          type="password"
          placeholder="Password"
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          className="h-11 rounded-xl bg-white"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && (
          <motion.p key={error} initial={{ x: -8 }} animate={{ x: 0 }} transition={{ type: 'spring', stiffness: 600, damping: 12 }} className="text-sm text-destructive">
            {error}
          </motion.p>
        )}
        <Button type="submit" size="lg" className="w-full rounded-xl" disabled={busy}>
          {mode === 'login' ? 'Sign in' : 'Create account'}
        </Button>
        <button
          type="button"
          className="w-full text-sm text-muted-foreground hover:text-foreground"
          onClick={() => setMode((m) => (m === 'login' ? 'register' : 'login'))}
        >
          {mode === 'login' ? 'New here? Create an account' : 'Have an account? Sign in'}
        </button>
      </motion.form>
    </main>
  )
}
