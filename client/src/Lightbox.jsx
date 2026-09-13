import { useEffect } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ChevronLeft, ChevronRight, ScanSearch, Trash, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

// Square crop of one face from the thumbnail
export function faceStyle(thumbUrl, box, aspect = 1, pad = 0.45) {
  const side = Math.max(box.w, box.h / aspect) * (1 + 2 * pad)
  const nw = Math.min(1, side)
  const nh = Math.min(1, side * aspect)
  const x = Math.min(Math.max(0, box.x + box.w / 2 - nw / 2), 1 - nw)
  const y = Math.min(Math.max(0, box.y + box.h / 2 - nh / 2), 1 - nh)
  return {
    backgroundImage: `url(${thumbUrl})`,
    backgroundSize: `${100 / nw}% ${100 / nh}%`,
    backgroundPosition: `${nw < 1 ? (x / (1 - nw)) * 100 : 0}% ${nh < 1 ? (y / (1 - nh)) * 100 : 0}%`,
  }
}

export default function Lightbox({ item, src, canSearch, onClose, onStep, onFindSimilar, onFace, onDelete }) {
  useEffect(() => {
    if (!item) return
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') onStep(-1)
      if (e.key === 'ArrowRight') onStep(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [item, onClose, onStep])

  const aspect = item ? (item.w || 4) / (item.h || 3) : 1
  const maxW = window.innerWidth * 0.92
  const maxH = window.innerHeight * 0.74
  const width = Math.min(maxW, maxH * aspect)
  const height = width / aspect

  return (
    <AnimatePresence>
      {item && (
        <motion.div
          key="lightbox"
          className="fixed inset-0 z-50 flex flex-col items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <div className="absolute inset-0 bg-white/70 backdrop-blur-2xl" onClick={onClose} />
          <img
            src={src(item, 'thumb')}
            alt=""
            aria-hidden
            className="pointer-events-none absolute inset-0 h-full w-full scale-125 object-cover opacity-40 blur-3xl"
          />

          <Button variant="ghost" size="icon-lg" className="absolute top-4 right-4 rounded-full bg-white/60" onClick={onClose} aria-label="Close">
            <X />
          </Button>
          <Button variant="ghost" size="icon-lg" className="absolute left-3 rounded-full bg-white/60" onClick={() => onStep(-1)} aria-label="Previous">
            <ChevronLeft />
          </Button>
          <Button variant="ghost" size="icon-lg" className="absolute right-3 rounded-full bg-white/60" onClick={() => onStep(1)} aria-label="Next">
            <ChevronRight />
          </Button>

          <motion.div
            key={item._id}
            layoutId={`photo-${item._id}`}
            className="relative overflow-hidden rounded-2xl shadow-2xl shadow-black/30 ring-1 ring-black/10"
            style={{ width, height }}
            transition={{ type: 'spring', stiffness: 300, damping: 32 }}
          >
            <img src={src(item, 'file')} alt="" className="h-full w-full object-cover" />
          </motion.div>

          <motion.div
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.15 }}
            className="mt-4 flex max-w-[92vw] flex-wrap items-center gap-3 rounded-2xl border border-black/5 bg-white/80 px-4 py-2.5 shadow-lg shadow-black/10 backdrop-blur-xl"
          >
            <span className="text-sm text-muted-foreground">
              {new Date(item.createdAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}
            </span>
            {item.faces?.length > 0 && (
              <div className="flex items-center gap-1.5">
                {item.faces.map((f, i) => (
                  <motion.button
                    key={i}
                    whileHover={{ scale: 1.12 }}
                    whileTap={{ scale: 0.95 }}
                    title="Find this person"
                    disabled={!canSearch}
                    onClick={() => onFace(item, i)}
                    className="size-9 rounded-full bg-muted ring-2 ring-white shadow-md disabled:opacity-50"
                    style={faceStyle(src(item, 'thumb'), f.box, aspect)}
                  />
                ))}
              </div>
            )}
            {!item.indexed && <span className="text-xs text-amber-600">Not indexed yet</span>}
            <div className="ml-auto flex gap-2">
              <Button variant="secondary" disabled={!canSearch} onClick={() => onFindSimilar(item)}>
                <ScanSearch /> Find similar
              </Button>
              <Button variant="destructive" onClick={() => window.confirm('Delete this photo?') && onDelete(item)}>
                <Trash /> Delete
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
