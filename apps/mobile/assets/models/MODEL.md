# Face embedding model

**Status: not bundled.** This directory is intentionally shipped without a
`.tflite` file. Everything else in the app is finished and tested; drop a model
in here and face check-in works end to end.

Until then, run with `--dart-define=FAKE_FACE=true`, which swaps in a stub
embedder and exercises the identical enrolment, upload, marker and server
decision path. Without the model and without that flag, the capture screens show
"The face model is missing from this build" and refuse to upload — they do not
crash.

## Why it is not committed

A face recognition model is a licensing decision, not a build detail. The
widely-circulated `mobilefacenet.tflite` files are re-uploads whose provenance
and terms cannot be established, and the canonical sources do not publish a
TFLite build:

- [Qualcomm AI Hub — MobileFaceNet](https://aihub.qualcomm.com/iot/models/mobile_facenet)
  documents exactly the architecture this app is written against (112×112 input,
  128-dimensional embedding) but distributes PyTorch (`mobilefacenet.pt`), ONNX
  and QNN artefacts — see the
  [Hugging Face repo](https://huggingface.co/qualcomm/MobileFaceNet). A TFLite
  conversion step is required.
- The Flutter [`face_plugin`](https://pub.dev/packages/face_plugin) package takes
  the same position: the model file is "not included".

So: pick a model, **read its licence yourself**, and record what you chose below.

## The contract the code expects

`FaceModelSpec.bundled` in `lib/services/face_embedder.dart` and
`Env.modelVersion` in `lib/env.dart` must agree with the file you add.

| Property | Expected | Where it is set |
|---|---|---|
| Asset path | `assets/models/mobilefacenet.tflite` | `FaceModelSpec.bundled.assetPath` |
| Input shape | `[1, 112, 112, 3]`, float32, NHWC, **RGB** | `inputSize` |
| Normalisation | `(pixel - 127.5) / 128.0` | `mean`, `std` |
| Output shape | `[1, N]` where N is 128, 192 or 512 | read from the model at load |
| Output handling | L2-normalised by the app before upload | `l2Normalise` |
| Version string | must change whenever the file changes | `Env.modelVersion` |

Two details matter more than they look:

- **The output length is read from the model**, not hard-coded, but the server
  pins a check-in's embedding length to the one stored at enrolment
  (`validateEmbedding(embedding, stored.length)`), and
  `SUPPORTED_EMBEDDING_LENGTHS` in `firebase/functions/src/config.ts` must
  include it.
- **Changing the model invalidates every enrolment.** Embeddings from two
  different models are not comparable, so bump `Env.modelVersion`; the server
  then rejects stale check-ins with `FACE_MODEL_MISMATCH` and the app prompts
  everyone to re-enrol. Never reuse a version string for a different file.

## Adding it

1. Put the file at `assets/models/mobilefacenet.tflite`.
2. Confirm `pubspec.yaml` lists `assets/models/` (it already does).
3. Set `Env.modelVersion` to something traceable, e.g. `mobilefacenet-v1`.
4. If the output length is not 128/192/512, add it to
   `SUPPORTED_EMBEDDING_LENGTHS` on the server.
5. `flutter run` on a **real device** — ML Kit and TFLite both need one.

`noCompress += "tflite"` is already set in `android/app/build.gradle.kts`; without
it the model cannot be memory-mapped out of the APK.

## Record what you used

Fill this in when you add the file:

| Field | Value |
|---|---|
| Model | _(e.g. MobileFaceNet)_ |
| Source URL | |
| Licence | |
| SHA-256 of the file | |
| Input size / normalisation | |
| Output dimensions | |
| `Env.modelVersion` | |

## Threshold calibration (M5)

`faceVerifyThreshold` (0.75) and `faceReviewThreshold` (0.60) in
`firebase/functions/src/config.ts` are **placeholders**. They are specific to
the model, so they have to be measured.

Run the app with `--dart-define=DEBUG_SIMILARITY=true` and open "Similarity
calibration" from the home screen. It shows the cosine similarity the server
would compute, against the approved enrolment embedding, without recording
anything.

Collect, with the poster and lighting of the real restaurant:

- the same person, 10+ captures: morning light, evening light, with and without
  glasses, hair up and down, slight head turns;
- at least 3 different people against that first person's enrolment;
- if relevant, a printed photo held up to the camera — this is expected to pass,
  and is the known liveness gap.

Then set:

- `faceVerifyThreshold` a little **below** the lowest same-person score;
- `faceReviewThreshold` a little **above** the highest different-person score.

If those two cross over, the model is not separating the faces well enough —
improve the lighting or the capture distance before widening the band, because a
wide band just sends everything to manual review.

| Measurement | Value |
|---|---|
| Same person, lowest score | |
| Same person, median | |
| Different people, highest score | |
| Chosen `faceVerifyThreshold` | |
| Chosen `faceReviewThreshold` | |
| Captures / people / date | |
