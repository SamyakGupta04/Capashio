#!/bin/sh
# Downloads model weights into client/public; skips existing files
set -eu
cd "$(dirname "$0")/.."

HF=https://huggingface.co

get() { # get <url> <dest>
  if [ -f "$2" ]; then echo "skip $2"; return; fi
  echo "get  $2"
  curl -fL --create-dirs --progress-bar -o "$2" "$1"
}

CLIP=public/models/Xenova/mobileclip_s0
for f in config.json tokenizer.json tokenizer_config.json preprocessor_config.json \
         onnx/text_model_quantized.onnx onnx/vision_model.onnx; do
  get "$HF/Xenova/mobileclip_s0/resolve/main/$f" "$CLIP/$f"
done

get "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite" \
    public/models/face/blaze_face_short_range.tflite
get "$HF/WePrompt/buffalo_sc/resolve/main/w600k_mbf.onnx" public/models/face/w600k_mbf.onnx

du -sh public/models
