# Capashio

A private photo library with on-device semantic search. Type "a dog wearing a hat" or drop a
photo of a person, and the matching photos from your own library come back. All machine learning
runs in your browser on WebGPU (CPU fallback). Photos, text queries, and embeddings never leave
your server or your browser, and the model weights are served from this app, not from a CDN.

- `server/` — Express 5 + Mongoose API. Each photo is one MongoDB document holding the original
  bytes, a thumbnail, and its embeddings. Uploads are capped at 10 MB. Cosine similarity search in plain JS.
- `client/` — Vite + React + Tailwind + shadcn/ui. A Web Worker runs MobileCLIP (text and image
  embeddings), MediaPipe face detection, and an ArcFace face embedding model.

## Setup

Requirements: Node 20+, a MongoDB connection string, `curl`.

```sh
cp server/.env.example server/.env        # set CONNECTION_URL and JWT_SECRET (openssl rand -hex 32)
npm run install:all
npm --prefix client run fetch-models      # downloads ~100 MB of model files into client/public (one time)
npm run dev                               # API on :5001, app on http://localhost:5173
```

Create an account on the sign-in page. Each account sees only its own photos.

## How search works

1. On upload, the browser computes one CLIP vector for the photo and one ArcFace vector per
   detected face, then sends them with the file. Photos uploaded before the models finish loading
   show a dot and can be indexed later with the "Index N photos" button.
2. A text query is wrapped in three caption templates, embedded with the CLIP text encoder, and averaged. A pasted or dropped image (or "Find
   similar" on a photo) is embedded with the CLIP image encoder and the face pipeline.
3. `POST /api/search` ranks the user's photos: face matches above `FACE_THRESHOLD` first, then
   the rest by CLIP similarity, top 50. Weak matches (below `MIN_SCORE` or 75% of the best score)
   are hidden behind a "Show weaker" link. Tunable constants live at the top of `server/media.js`
   and `client/src/ml.worker.js`.
4. Opening a photo shows a chip for each detected face. Clicking a chip finds that person's photos.

Keyboard: `/` focuses search, arrows move between photos in the lightbox, Escape closes it.

## Browser support

WebGPU: Chrome and Edge on Windows, macOS, Android. Other browsers run the same models on the CPU
through WebAssembly, which is slower but works. Uploads accept JPEG, PNG, and WebP up to 10 MB.
