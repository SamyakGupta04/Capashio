import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Cpu, ImagePlus, ImageUp, LoaderCircle, LogOut, ScanFace, Search, Sparkles, X } from 'lucide-react'
import { api } from './api'
import * as ml from './ml'
import Lightbox from './Lightbox'
import Logo from './Logo'
import { Button } from '@/components/ui/button'

const ROW_HEIGHT = 230
const GAP = 8
const EXAMPLES = ['a dog wearing a hat', 'sunset at the beach', 'birthday cake', 'someone laughing', 'snow on the mountains', 'a red car']

// Justified rows: full width, real aspect ratios
function justify(items, width) {
  const rows = []
  let row = []
  let sum = 0
  for (const item of items) {
    const ar = (item.w || 4) / (item.h || 3)
    row.push({ item, ar })
    sum += ar
    const h = (width - GAP * (row.length - 1)) / sum
    if (h <= ROW_HEIGHT) {
      rows.push({ row, h })
      row = []
      sum = 0
    }
  }
  if (row.length) rows.push({ row, h: Math.min(ROW_HEIGHT, (width - GAP * (row.length - 1)) / sum) })
  return rows.flatMap(({ row, h }) => row.map(({ item, ar }) => ({ item, w: ar * h, h })))
}

export default function Gallery({ user, onSignOut }) {
  const src = (item, kind) => `/api/media/${item._id}/${kind}`

  const [items, setItems] = useState([])
  const [results, setResults] = useState(null) // { label, items, strong, showAll }
  const [query, setQuery] = useState('')
  const [placeholder, setPlaceholder] = useState('')
  const [searching, setSearching] = useState(false)
  const [models, setModels] = useState({ state: 'loading', pct: 0 }) // loading | ready | error
  const [busy, setBusy] = useState(null) // { label, done, total }
  const [errors, setErrors] = useState([])
  const [selected, setSelected] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [width, setWidth] = useState(0)
  const gridRef = useRef()
  const fileInput = useRef()
  const imageInput = useRef()
  const searchInput = useRef()
  const mlReady = useRef(false)

  const ready = models.state === 'ready'
  const shown = results ? (results.showAll ? results.items : results.items.slice(0, results.strong)) : items
  const unindexed = items.filter((i) => !i.indexed).length

  useEffect(() => {
    api('/api/media').then((r) => setItems(r.items)).catch((e) => setErrors([e.message]))

    const progress = {}
    ml.init((p) => {
      progress[p.file] = p
      const all = Object.values(progress)
      const loaded = all.reduce((n, x) => n + x.loaded, 0)
      const total = all.reduce((n, x) => n + x.total, 0)
      setModels({ state: 'loading', pct: total ? Math.round((loaded / total) * 100) : 0 })
    })
      .then(({ device }) => {
        mlReady.current = true
        setModels({ state: 'ready', device })
      })
      .catch((e) => setModels({ state: 'error', message: e.message }))

    const onKey = (e) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault()
        searchInput.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useLayoutEffect(() => {
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    ro.observe(gridRef.current)
    return () => ro.disconnect()
  }, [])

  // Typewriter placeholder
  useEffect(() => {
    if (!ready || query) return
    let example = Math.floor(Math.random() * EXAMPLES.length)
    let pos = 0
    let timer
    const tick = () => {
      const text = EXAMPLES[example]
      pos += 1
      setPlaceholder(text.slice(0, pos))
      if (pos < text.length) timer = setTimeout(tick, 45)
      else {
        timer = setTimeout(() => {
          example = (example + 1) % EXAMPLES.length
          pos = 0
          tick()
        }, 2200)
      }
    }
    tick()
    return () => clearTimeout(timer)
  }, [ready, query])

  const fail = (message) => setErrors((prev) => [...prev, message])

  async function uploadFiles(fileList) {
    const files = [...fileList].filter((f) => f.type.startsWith('image/'))
    if (!files.length) return
    setErrors([])
    for (let i = 0; i < files.length; i++) {
      setBusy({ label: 'Adding', done: i, total: files.length })
      try {
        const fd = new FormData()
        fd.append('file', files[i])
        if (mlReady.current) {
          const { clip, faces } = await ml.embedImage(await createImageBitmap(files[i]))
          fd.append('clip', JSON.stringify(clip))
          fd.append('faces', JSON.stringify(faces))
        }
        const { item } = await api('/api/media', { method: 'POST', body: fd })
        setItems((prev) => [item, ...prev])
      } catch (e) {
        fail(`${files[i].name}: ${e.message}`)
      }
    }
    setBusy(null)
  }

  async function indexAll() {
    const todo = items.filter((i) => !i.indexed)
    setErrors([])
    for (let i = 0; i < todo.length; i++) {
      setBusy({ label: 'Indexing', done: i, total: todo.length })
      try {
        const blob = await (await fetch(src(todo[i], 'file'))).blob()
        const emb = await ml.embedImage(await createImageBitmap(blob))
        await api(`/api/media/${todo[i]._id}/embeddings`, { method: 'PATCH', body: emb })
        setItems((prev) => prev.map((p) => (p._id === todo[i]._id ? { ...p, indexed: true, faces: emb.faces } : p)))
      } catch (e) {
        fail(`photo ${i + 1}: ${e.message}`)
      }
    }
    setBusy(null)
  }

  async function runSearch(label, embed) {
    setSearching(true)
    setErrors([])
    try {
      const body = await embed()
      const r = await api('/api/search', { method: 'POST', body })
      setResults({ label, items: r.items, strong: r.strong, showAll: false })
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (e) {
      fail(e.message)
    } finally {
      setSearching(false)
    }
  }

  const searchText = (text) =>
    text.trim() ? runSearch(`“${text.trim()}”`, async () => ({ clip: await ml.embedText(text.trim()) })) : clearSearch()

  const searchImage = (blob, label) =>
    runSearch(label, async () => {
      const { clip, faces } = await ml.embedImage(await createImageBitmap(blob))
      return { clip, face: faces[0]?.embedding }
    })

  const searchPerson = (id, index) => runSearch('this person', async () => ({ faceOf: { id, index } }))

  const clearSearch = () => {
    setResults(null)
    setQuery('')
  }

  async function findSimilar(item) {
    setSelected(null)
    const blob = await (await fetch(src(item, 'file'))).blob()
    searchImage(blob, 'this photo')
  }

  async function deleteItem(item) {
    try {
      await api(`/api/media/${item._id}`, { method: 'DELETE' })
      setSelected(null)
      setItems((prev) => prev.filter((p) => p._id !== item._id))
      setResults((prev) => prev && { ...prev, items: prev.items.filter((p) => p._id !== item._id) })
    } catch (e) {
      fail(e.message)
    }
  }

  const step = (dir) => {
    const i = shown.findIndex((p) => p._id === selected?._id)
    if (i >= 0) setSelected(shown[(i + dir + shown.length) % shown.length])
  }

  const scores = shown.map((i) => i.score)
  const [minScore, maxScore] = [Math.min(...scores), Math.max(...scores)]
  // Only CLIP-ranked photos fade by score
  const relevance = (item) => (results && !item.byFace && maxScore > minScore ? (item.score - minScore) / (maxScore - minScore) : 1)
  const layout = justify(shown, width - 1)

  return (
    <div
      className="relative min-h-screen"
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        uploadFiles(e.dataTransfer.files)
      }}
    >
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div
          className="absolute inset-0 transition-opacity duration-1000"
          style={{ opacity: results ? 0 : 1, background: 'radial-gradient(70% 45% at 50% -10%, rgba(167,139,250,0.22), transparent 70%)' }}
        />
        <div
          className="absolute inset-0 transition-opacity duration-1000"
          style={{ opacity: results ? 1 : 0, background: 'radial-gradient(70% 45% at 50% -10%, rgba(56,189,248,0.25), transparent 70%)' }}
        />
      </div>

      <header className="sticky top-0 z-30 px-3 pt-3 sm:px-5">
        <div className="relative mx-auto flex max-w-[1600px] items-center gap-4 rounded-2xl border border-black/5 bg-white/75 px-3 py-2 shadow-lg shadow-black/5 backdrop-blur-xl sm:px-4">
          <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-black/25 to-transparent" />

          <div className="flex shrink-0 items-center gap-2.5">
            <Logo className="size-8" />
            <div className="leading-none">
              <h1 className="font-heading text-2xl">Capashio</h1>
              <ModelStatus models={models} />
            </div>
          </div>

          <form
            className={`relative mx-auto w-full max-w-2xl rounded-full p-[1.5px] transition-all ${
              searching
                ? 'thinking'
                : 'bg-gradient-to-r from-black/10 via-black/30 to-black/10 focus-within:from-black/70 focus-within:via-black focus-within:to-black/70 focus-within:shadow-lg focus-within:shadow-black/10'
            }`}
            onSubmit={(e) => {
              e.preventDefault()
              searchText(query)
            }}
            onDrop={(e) => {
              const f = e.dataTransfer.files[0]
              if (!f?.type.startsWith('image/')) return
              e.preventDefault()
              e.stopPropagation()
              setDragging(false)
              searchImage(f, 'the dropped image')
            }}
          >
            <div className="relative rounded-full bg-white">
              <button
                type="submit"
                aria-label="Search"
                disabled={!ready}
                className="absolute top-1/2 left-1.5 grid size-8 -translate-y-1/2 place-items-center rounded-full bg-gradient-to-br from-neutral-900 to-neutral-600 text-white shadow-md shadow-black/25 transition-transform hover:scale-105 disabled:opacity-60"
              >
                {searching ? <LoaderCircle className="size-4 animate-spin" /> : <Search className="size-4" />}
              </button>
              <input
                ref={searchInput}
                className="h-11 w-full rounded-full bg-transparent pr-24 pl-12 text-[15px] outline-none placeholder:text-muted-foreground/60 disabled:cursor-wait"
                placeholder={ready ? placeholder || 'Search your photos' : 'Warming up the models…'}
                disabled={!ready}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onPaste={(e) => {
                  const f = e.clipboardData.files[0]
                  if (!f?.type.startsWith('image/')) return
                  e.preventDefault()
                  searchImage(f, 'the pasted image')
                }}
              />
              <span className="absolute top-1/2 right-1.5 flex -translate-y-1/2 items-center gap-1">
                {results ? (
                  <button
                    type="button"
                    className="flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-foreground hover:bg-black/10"
                    onClick={clearSearch}
                  >
                    <X className="size-3.5" /> Clear
                  </button>
                ) : (
                  <>
                    <kbd
                      title="Press / to search"
                      className="hidden rounded-md border border-black/10 bg-muted px-1.5 py-0.5 font-sans text-[10px] font-medium text-muted-foreground shadow-[inset_0_-1px_0_rgba(0,0,0,0.08)] sm:inline"
                    >
                      /
                    </kbd>
                    <button
                      type="button"
                      title="Search with an image (or paste one here)"
                      aria-label="Search with an image"
                      disabled={!ready}
                      onClick={() => imageInput.current.click()}
                      className="grid size-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                    >
                      <ImageUp className="size-4" />
                    </button>
                  </>
                )}
              </span>
              <input
                ref={imageInput}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  if (e.target.files[0]) searchImage(e.target.files[0], 'your image')
                  e.target.value = ''
                }}
              />
            </div>
          </form>

          <div className="flex shrink-0 items-center gap-1.5">
            <div className="flex items-center gap-2 rounded-full border border-black/5 bg-white py-1 pr-3 pl-1 shadow-sm">
              <span className="grid size-7 place-items-center rounded-full bg-gradient-to-br from-neutral-900 to-neutral-500 text-xs font-semibold text-white">
                {user.username[0].toUpperCase()}
              </span>
              <span className="hidden text-sm font-medium md:inline">{user.username}</span>
            </div>
            <Button variant="ghost" size="icon" className="rounded-full" title="Sign out" aria-label="Sign out" onClick={onSignOut}>
              <LogOut />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-3 pb-24 sm:px-5">
        <div className="flex flex-wrap items-center gap-2 py-4">
          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            hidden
            onChange={(e) => {
              uploadFiles(e.target.files)
              e.target.value = ''
            }}
          />
          <Button onClick={() => fileInput.current.click()} disabled={!!busy} className="rounded-full">
            <ImagePlus /> Add photos
          </Button>
          {unindexed > 0 && ready && (
            <Button variant="secondary" className="rounded-full" onClick={indexAll} disabled={!!busy}>
              <Sparkles /> Index {unindexed} {unindexed === 1 ? 'photo' : 'photos'}
            </Button>
          )}
          <AnimatePresence>
            {results && (
              <motion.p
                key={results.label}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                className="text-sm text-muted-foreground"
              >
                <span className="font-semibold text-foreground tabular-nums">{shown.length}</span> {shown.length === 1 ? 'photo' : 'photos'} like{' '}
                <span className="font-heading text-lg text-foreground italic">{results.label}</span>
                {results.strong < results.items.length && (
                  <>
                    {' '}·{' '}
                    <button
                      type="button"
                      className="underline underline-offset-2 hover:text-foreground"
                      onClick={() => setResults((r) => ({ ...r, showAll: !r.showAll }))}
                    >
                      {results.showAll ? 'Hide weaker matches' : `Show ${results.items.length - results.strong} weaker`}
                    </button>
                  </>
                )}{' '}
                ·{' '}
                <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={clearSearch}>
                  Show all
                </button>
              </motion.p>
            )}
          </AnimatePresence>
          <span className="ml-auto text-sm text-muted-foreground tabular-nums">
            {items.length} {items.length === 1 ? 'photo' : 'photos'}
          </span>
        </div>

        <div ref={gridRef} className="flex flex-wrap" style={{ gap: GAP }}>
          <AnimatePresence mode="popLayout">
            {layout.map(({ item, w, h }, i) => {
              const rel = relevance(item)
              return (
                <motion.button
                  key={item._id}
                  data-tile={item._id}
                  data-score={item.score}
                  data-face={item.byFace ? 1 : 0}
                  layout
                  initial={{ opacity: 0, scale: 0.94, filter: 'blur(14px) saturate(0.2)' }}
                  animate={{ opacity: results ? 0.45 + 0.55 * rel : 1, scale: 1, filter: 'blur(0px) saturate(1)' }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{
                    layout: { type: 'spring', stiffness: 220, damping: 28 },
                    opacity: { duration: 0.45 },
                    filter: { duration: 0.9, delay: Math.min(i, 12) * 0.03 },
                    scale: { duration: 0.35 },
                  }}
                  whileHover={{ scale: 1.02, zIndex: 1 }}
                  style={{ width: w, height: h }}
                  onClick={() => setSelected(item)}
                  className="group relative overflow-hidden rounded-xl bg-muted shadow-sm shadow-black/5 ring-1 ring-black/5 outline-none hover:shadow-xl hover:shadow-black/10 focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <motion.div layoutId={selected?._id === item._id ? undefined : `photo-${item._id}`} className="h-full w-full">
                    <img src={src(item, 'thumb')} alt="" loading="lazy" className="h-full w-full object-cover" />
                  </motion.div>
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between bg-gradient-to-t from-black/55 to-transparent p-2 pt-8 text-[11px] text-white opacity-0 transition-opacity group-hover:opacity-100">
                    <span>{new Date(item.createdAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}</span>
                    {item.faces?.length > 0 && (
                      <span className="flex items-center gap-1">
                        <ScanFace className="size-3" /> {item.faces.length}
                      </span>
                    )}
                  </div>
                  {item.score != null && (
                    <>
                      <span
                        className={`absolute top-2 left-2 flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium text-white shadow ${item.byFace ? 'bg-emerald-500' : 'bg-sky-500'}`}
                      >
                        {item.byFace ? <ScanFace className="size-3" /> : null}
                        {item.byFace ? 'match' : item.score.toFixed(2)}
                      </span>
                      <div className="absolute inset-x-0 bottom-0 h-1 bg-black/25">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.round(rel * 100)}%` }}
                          transition={{ duration: 0.6, delay: 0.2 }}
                          className={`h-full ${item.byFace ? 'bg-emerald-400' : 'bg-sky-400'}`}
                        />
                      </div>
                    </>
                  )}
                  {!item.indexed && <span title="Not indexed yet" className="absolute top-2 right-2 size-2.5 animate-pulse rounded-full bg-amber-400 ring-2 ring-white" />}
                </motion.button>
              )
            })}
          </AnimatePresence>
        </div>

        {shown.length === 0 && (
          <div className="grid place-items-center py-24 text-center">
            {results ? (
              <p className="text-sm text-muted-foreground">Nothing like that here.</p>
            ) : (
              <>
                <div className="relative mb-8 h-32 w-56">
                  {[-10, 4, 14].map((tilt, i) => (
                    <div
                      key={tilt}
                      className="absolute inset-x-8 top-2 h-28 rounded-xl border border-black/5 bg-white shadow-lg shadow-black/10"
                      style={{ '--tilt': `${tilt}deg`, animation: `float ${5 + i}s ease-in-out infinite`, animationDelay: `${i * 0.6}s` }}
                    >
                      <div className="m-3 h-16 rounded-md bg-gradient-to-br from-violet-200 via-sky-200 to-emerald-200" />
                    </div>
                  ))}
                </div>
                <p className="font-heading text-3xl">Your library is empty</p>
                <p className="mt-2 text-sm text-muted-foreground">Drop photos anywhere on this page, or use Add photos.</p>
              </>
            )}
          </div>
        )}
      </main>

      <AnimatePresence>
        {(busy || errors.length > 0) && (
          <motion.div
            key="toast"
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            className="fixed bottom-5 left-1/2 z-40 w-[min(92vw,420px)] -translate-x-1/2 space-y-2 rounded-2xl border border-black/5 bg-white/85 p-3 shadow-xl shadow-black/10 backdrop-blur-xl"
          >
            {busy && (
              <div>
                <p className="mb-1.5 flex justify-between text-sm">
                  <span>{busy.label} photos</span>
                  <span className="text-muted-foreground">
                    {busy.done + 1} of {busy.total}
                  </span>
                </p>
                <div className="relative h-1.5 overflow-hidden rounded-full bg-muted">
                  <motion.div className="h-full rounded-full bg-foreground" animate={{ width: `${(busy.done / busy.total) * 100}%` }} />
                  <div className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/70 to-transparent" style={{ animation: 'shimmer 1.2s infinite' }} />
                </div>
              </div>
            )}
            {errors.map((e, i) => (
              <p key={i} className="text-sm text-destructive">
                {e}
              </p>
            ))}
            {errors.length > 0 && !busy && (
              <button type="button" className="text-xs text-muted-foreground underline" onClick={() => setErrors([])}>
                Dismiss
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {dragging && (
          <motion.div
            key="drop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none fixed inset-0 z-40 bg-white/60 p-6 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.96 }}
              animate={{ scale: 1 }}
              className="grid h-full place-items-center rounded-3xl border-2 border-dashed border-violet-400 bg-violet-50/60"
            >
              <div className="text-center">
                <ImagePlus className="mx-auto mb-3 size-10 text-violet-500" />
                <p className="text-lg font-medium">Drop to add to your library</p>
                <p className="text-sm text-muted-foreground">Drop on the search bar to search by image instead</p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <Lightbox
        item={selected}
        src={src}
        canSearch={ready}
        onClose={() => setSelected(null)}
        onStep={step}
        onFindSimilar={findSimilar}
        onFace={(item, index) => {
          setSelected(null)
          searchPerson(item._id, index)
        }}
        onDelete={deleteItem}
      />
    </div>
  )
}

function ModelStatus({ models }) {
  const r = 5
  const c = 2 * Math.PI * r
  if (models.state === 'loading') {
    return (
      <span className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground" title="Downloading the models once; they are cached after this">
        <svg width="14" height="14" viewBox="0 0 14 14" className="-rotate-90">
          <circle cx="7" cy="7" r={r} fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
          <circle cx="7" cy="7" r={r} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - models.pct / 100)} style={{ transition: 'stroke-dashoffset 0.4s' }} />
        </svg>
        Loading models {models.pct}%
      </span>
    )
  }
  if (models.state === 'error') {
    return (
      <span className="mt-1 block text-[11px] text-destructive" title={models.message}>
        Models failed
      </span>
    )
  }
  return (
    <motion.span
      initial={{ opacity: 0, y: 2 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-1 flex items-center gap-1 text-[11px] font-medium text-emerald-700"
    >
      <Cpu className="size-3" /> On-device · {models.device === 'webgpu' ? 'WebGPU' : 'CPU (slow)'}
    </motion.span>
  )
}
