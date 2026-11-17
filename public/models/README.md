# Face model assets

`blaze_face_full_range.tflite` is the MediaPipe BlazeFace full-range detector.

- Source: `https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_full_range/float16/1/blaze_face_full_range.tflite`
- Model card: `https://ai.google.dev/edge/mediapipe/solutions/vision/face_detector`
- License: Apache License 2.0

The file is served from this app at `/models/blaze_face_full_range.tflite`. No
image or model request goes to a third party. `@mediapipe/tasks-vision` ships
the matching WASM runtime, which Vite fingerprints at build time.
