# Capashio: what was built and how the ML works

Capashio is a private photo library with on-device semantic search. You type a phrase
("a dog wearing a hat"), paste a photo, or click a face, and your own photos come back ranked.
Every model runs inside the browser on WebGPU. No image, text, or embedding leaves your server
or your machine, and the model weights are served from this app, not from a CDN.

## 1. What changed from the old app

| Area | Before | Now |
|---|---|---|
| Client | Create React App, Redux, hand-written CSS, dead Google sign-in shell | Vite, React 19, Tailwind 4, shadcn/ui, `motion` for animation |
| Server | Express 4, three routes, no users | Express 5, username + password accounts, per-user media, search |
| Storage | Base64 image strings inside MongoDB documents | One document per photo: original bytes, 400px thumbnail, metadata, and vectors. 10 MB upload cap |
| Auth | None | scrypt password hashes, JWT in an httpOnly cookie, photos streamed only to their owner |
| Search | None | CLIP text and image search, face identity search, cosine ranking in plain JS |

## 2. Architecture in one picture

```
Browser (Web Worker)                          Server (Express + MongoDB)
--------------------                          --------------------------
MobileCLIP text encoder  --> 512-d vector --\
MobileCLIP image encoder --> 512-d vector ---+--> POST /api/media   (file + clip + faces)
MediaPipe BlazeFace      --> face boxes      |    POST /api/search  (clip and/or face vector)
ArcFace MobileFaceNet    --> 512-d per face -/         |
                                                        v
                                             cosine similarity over the user's
                                             stored vectors, top 50 returned
```

The browser does all inference. The server stores photos and vectors, and compares vectors. There is no
vector database; a user's photos are scanned linearly, which is O(n x 512) per query and fine
for thousands of photos.

## 3. The models

All weights live in `client/public/models/` (git-ignored) and are fetched once by
`client/scripts/fetch-models.sh`. The browser caches them in Cache Storage after the first load.

| Purpose | Model | File | Size | Precision |
|---|---|---|---|---|
| Text embedding | MobileCLIP-S0 text tower (`Xenova/mobileclip_s0`) | `onnx/text_model_quantized.onnx` | 43 MB | int8 |
| Image embedding | MobileCLIP-S0 image tower | `onnx/vision_model.onnx` | 46 MB | fp32 |
| Face detection | MediaPipe BlazeFace short range | `face/blaze_face_short_range.tflite` | 0.2 MB | fp16 |
| Face embedding | InsightFace MobileFaceNet (`w600k_mbf.onnx`, buffalo_sc pack) | `face/w600k_mbf.onnx` | 14 MB | fp32 |

Runtimes: `@huggingface/transformers` v4 (which bundles `onnxruntime-web`) for CLIP,
`onnxruntime-web` directly for the face model, and `@mediapipe/tasks-vision` for detection.
The ONNX Runtime and MediaPipe wasm binaries are bundled by Vite and served from the same
origin. Transformers.js is configured with `allowRemoteModels = false`, so it can never fall
back to Hugging Face.

Why these precisions: measured on 12 September 2026 with five test photos, the int8 image
tower was broken (unrelated photos scored about 0.85 to each other and text ranking was
random). fp32 image plus int8 text ranked every query correctly with clear margins, and int8
text matched fp32 text. So text stays int8 (small) and vision stays fp32 (correct).

Why not the larger `clip-vit-base-patch32`: measured on 13 September 2026, it works at int8
(154 MB) and at int8 text plus int4 vision (128 MB), and it also ranks 8 of 8 test queries
correctly. But its hit-to-miss gap is narrower (for "fruit": 0.30 versus 0.24, against 0.28
versus 0.17 for MobileCLIP with templates), and it is 40 to 70 MB larger. No gain, so MobileCLIP
stays.

## 4. Where the ML code lives

- `client/src/ml.worker.js`: loads CLIP and the face model, computes embeddings. Runs in a
  Web Worker because WebGPU shader compilation blocks whichever thread creates the session
  for several seconds. Picks `webgpu` when `navigator.gpu` exists, otherwise `wasm`, and
  retries once on `wasm` if the WebGPU load throws.
- `client/src/ml.js`: main-thread side. Owns the worker, a pending-promise map, and MediaPipe
  face detection. Detection stays on the main thread because MediaPipe's wasm loader is a
  classic script and does not work inside a module worker.
- `server/media.js`: upload, thumbnail, vector validation, cosine ranking, owner-only photo
  serving. The 10 MB cap keeps every document under MongoDB's 16 MB limit. All tunable constants are at the top of this file and of `ml.worker.js`.

## 5. What happens on upload

1. The browser decodes the file with `createImageBitmap`.
2. `ml.js` runs BlazeFace on the bitmap. Boxes narrower than `MIN_FACE_PX = 40` are dropped.
   Faces are sorted largest first. The two eye keypoints are converted to pixels.
3. The bitmap is transferred to the worker. The worker:
   - downscales to a 512px long side, runs the CLIP image tower, L2-normalizes the 512 floats;
   - for each face, rotates so the eyes are level, scales so the inter-eye distance is
     35.2 px, crops 112x112 (the ArcFace template), converts to NCHW RGB in [-1, 1], runs
     MobileFaceNet, L2-normalizes the 512 floats.
4. The file, the CLIP vector, and the face list (`{ box, embedding }`) go to `POST /api/media`
   as one multipart request. The server validates the vectors once (length 512, finite
   numbers), makes a 400px JPEG thumbnail with EXIF orientation applied, and stores one
   document with the original bytes, the thumbnail, width and height, and the vectors.
5. If the models are still loading, the upload goes through without vectors. The photo shows a
   pulsing dot, and the "Index N photos" button embeds it later through the same worker and
   `PATCH /api/media/:id/embeddings`.

## 6. What happens on search

- Text: the query is wrapped in three caption templates ("a photo of {}.", "a close-up photo
  of {}.", and the bare text), each is tokenized with padding to 77 tokens (the text tower's
  positional embedding is fixed at that length) and embedded, and the three vectors are
  averaged. This prompt ensembling widens the gap between hits and misses, especially for
  one-word queries. The result is sent as `{ clip }`.
- Image (paste, drop on the search bar, or "Find similar"): the image goes through the same
  pipeline as an upload, and the request carries `{ clip, face }` where `face` is the largest
  detected face, if any.
- Face chip in the lightbox: the request carries `{ faceOf: { id, index } }` and the server
  uses the vector it already stores for that face.

Ranking rule in `POST /api/search`:

1. If a face vector is present, every photo with any face whose cosine similarity is at or
   above `FACE_THRESHOLD = 0.4` is a match. Matches come first, best face score first, and are
   flagged `byFace`.
2. Remaining photos are ordered by CLIP cosine similarity to the query vector.
3. The top `TOP_K = 50` are returned with their scores, plus a `strong` count: face matches and
   CLIP results scoring at least `MIN_SCORE = 0.15` and `RELATIVE_CUTOFF = 0.75` of the best
   CLIP score. The gallery shows only the strong results and offers "Show N weaker".

Face threshold evidence: same person across different photos scored 0.59 to 0.90, different
people scored at or below 0.10. Typical CLIP text-to-image scores are 0.20 to 0.27 for a hit
and about 0.10 for unrelated photos, so the UI fades tiles by rank rather than by an absolute
cutoff.

## 7. Measured results

Test set: 20 photos including five of Obama, two of Biden, one each of Lin-Manuel Miranda and
Lena, plus objects, animals, and scenes. Verified with a real Chrome instance driven by
Playwright on both the dev server and the production build.

| Query | Top result | Score |
|---|---|---|
| "fruit" | fruit photo | 0.26 |
| "a butterfly" | butterfly | 0.25 |
| "a monkey" | baboon | 0.27 |
| "a painting" | Starry Night | 0.22 |
| "two men in suits" | Obama and Biden together | 0.21 |
| Face of Obama, photo 1 | the other Obama photos, then the shared photo | 0.65, 0.63 |
| Face of Biden | the shared photo | 0.90 |

Model load: about 100 MB on the first visit, then 1 to 3 seconds from cache. Requests to
hosts other than localhost during a full session: none.

## 8. Fallbacks and limits

- No WebGPU (Firefox, older Safari): the same weights run on WebAssembly. The status caption
  says "CPU (slow)".
- WebGPU present but the load fails: one automatic retry on WebAssembly.
- HEIC uploads are rejected with a clear message; browsers cannot decode them.
- Face identity works on frontal and near-frontal faces. Very small faces (under 40 px) and
  strong profiles are skipped by design.
- Login has no rate limit yet. Add one before exposing the app to the internet.
- Search is a linear scan per user. Revisit only if a single user passes roughly 20,000 photos.

## 9. Running and testing

```sh
cp server/.env.example server/.env        # CONNECTION_URL and JWT_SECRET (openssl rand -hex 32)
npm run install:all
npm --prefix client run fetch-models      # one-time model download
npm run dev                               # API on :5001, app on the port Vite prints
```

Production: `npm --prefix client run build`, then `node server/index.js` serves the built app
and the API from one process.
