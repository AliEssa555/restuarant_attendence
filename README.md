> **Local customer demo:** see [demo/README.md](demo/README.md). Run `docker compose up --build -d`, then use the **Local demo APK** workflow artifact. Current demos use GPS attendance; face recognition is deprecated.

# Restaurant Attendance — Demo v0.1

Attendance for small restaurants. Employees check in on their phone; managers
run everything from a web portal.

Two check-in methods:

| Method | What it proves | Trust |
|---|---|---|
| **Manual** | Nothing — the employee tapped a button. | Low. Demo convenience. |
| **Face + poster** | *This person*, *at this spot*: a live selfie with the restaurant's printed QR poster visible behind them. The phone computes a face embedding on-device; the **server** compares it with the manager-approved enrolment embedding and decodes the poster's QR from the uploaded photo. | Medium-low — see [Known limitations](#known-limitations). |

The design rule everything follows: **the client sends evidence, never
conclusions.** No similarity score, no status and no timestamp is ever accepted
from a phone.

```
apps/mobile     Flutter app (employees)
apps/portal     Next.js portal (owners / managers)
firebase/
  functions     Cloud Functions — every privileged write
  tests         Firestore + Storage security rules tests
  *.rules       the actual access control
scripts         seed script
```

---

## What you need

| Tool | Why | Check |
|---|---|---|
| Node 22+ | Functions, portal, scripts | `node -v` |
| Firebase CLI | Emulators, deploy | `firebase --version` |
| **Java 11+ (JDK)** | **The Firestore and Storage emulators are JVM processes. Without it `firebase emulators:start` cannot start them.** | `java -version` |
| Flutter (stable) | The mobile app | `flutter --version` |
| Android device or emulator | ML Kit and TFLite need a real device for face capture | `flutter devices` |

Install the Firebase CLI with `npm i -g firebase-tools`. For Java, any JDK works
— [Temurin](https://adoptium.net/) or the one bundled with Android Studio.

The app's **face model is not committed** — see
[`apps/mobile/assets/models/MODEL.md`](apps/mobile/assets/models/MODEL.md). You
can run and test the whole system without it using `FAKE_FACE=true`.

---

## Quick start (local, against the emulators)

```bash
# 1. Install everything and create apps/portal/.env.local
npm run setup

# 2. Start Auth, Firestore, Storage and Functions (needs Java)
npm run emulators

# 3. In a second terminal, load the demo data
npm run seed

# 4. In a third terminal, start the portal
npm run dev:portal
```

Then open <http://localhost:3000> and sign in:

| Account | Email | Password |
|---|---|---|
| Owner | `owner@demo.test` | `demo1234` |
| Manager | `manager@demo.test` | `demo1234` |
| Employees | `ayesha@demo.test` … (see the seed output) | `demo1234` |

The Emulator Suite UI is at <http://localhost:4000>.

### The mobile app

```bash
cd apps/mobile

# Android emulator (10.0.2.2 is its alias for your machine):
flutter run --dart-define=USE_EMULATORS=true --dart-define=FAKE_FACE=true

# A physical phone on the same wifi — pass your computer's LAN address:
flutter run \
  --dart-define=USE_EMULATORS=true \
  --dart-define=EMULATOR_HOST=192.168.1.20 \
  --dart-define=FAKE_FACE=true
```

Sign in as one of the seeded employees. `FAKE_FACE=true` substitutes a stub
embedding so enrolment and check-in work with no camera and no bundled model;
drop it once you have added a `.tflite` file and are testing on a real device.

### Build flags

| Flag | Default | Does |
|---|---|---|
| `USE_EMULATORS` | `false` | Point every Firebase service at the local emulators |
| `EMULATOR_HOST` | `10.0.2.2` | Where the emulators are, as seen from the device |
| `FAKE_FACE` | `false` | Stub out the on-device face pipeline |
| `DEBUG_SIMILARITY` | `false` | Show the hidden threshold-calibration screen |
| `FUNCTIONS_REGION` | `asia-south1` | Must match `firebase/functions/src/config.ts` |

---

## Legacy face check-in (deprecated)

1. **Enrolment, once.** The employee takes three photos (straight, slight left,
   slight right). The phone runs ML Kit face detection, aligns and crops each
   face, runs the TFLite model, and averages the three embeddings. It refuses
   locally if any two of the three disagree (cosine < 0.6).
2. **A manager approves it.** They compare the photo with the real person.
   *This is the anti-fraud anchor of the whole system* — it is the only reason
   the stored embedding can be trusted to belong to who it claims to. Until it
   is approved, face check-in is disabled for that employee.
3. **Check-in.** The employee stands in front of the printed poster and takes a
   selfie. The phone produces an embedding and uploads the photo. It sends no
   score.
4. **The server decides.** `recordAttendance`:
   - checks the claims, that the employee is active, and that the restaurant
     allows this method;
   - returns the original result if this `clientRequestId` was already used
     (idempotency), and rate-limits to 5 face attempts per 10 minutes;
   - checks the presence state machine (you cannot check in twice);
   - checks the photo is under *this* employee's own Storage prefix, is a JPEG,
     and was uploaded in the last 3 minutes **according to Storage, not the
     device**;
   - refuses a photo whose sha256 it has seen before, so a good photo cannot be
     replayed every morning;
   - decodes the poster's QR with `jsqr`, retrying on a mirrored and on an
     upscaled centre crop, and constant-time compares the secret;
   - validates the embedding and refuses one that is a near-identical copy of
     the enrolment vector (cosine > 0.999), which means it was played back
     rather than computed from a new photo;
   - computes the cosine similarity **itself**;
   - runs `decideStatus` — a pure, table-tested function — to get
     `verified` / `pending_review` / `rejected`;
   - writes the record, the photo hash and the presence update in one
     transaction, with lateness computed in the restaurant's timezone.

Rejected attempts are still stored. They never move presence, but they are the
audit trail for someone probing the system.

### Reason codes

`MARKER_NOT_FOUND`, `MARKER_INVALID`, `FACE_NOT_ENROLLED`,
`FACE_MODEL_MISMATCH`, `NO_FACE`, `MULTIPLE_FACES`, `FACE_MISMATCH`,
`EMBEDDING_INVALID`, `PHOTO_STALE`, `PHOTO_REUSED`, `RATE_LIMITED`,
`ALREADY_CHECKED_IN`, `NOT_CHECKED_IN`, `METHOD_NOT_ALLOWED`,
`EMPLOYEE_INACTIVE`.

These are a three-way contract between
`firebase/functions/src/lib/errors.ts`, `apps/mobile/lib/models/reason_codes.dart`
and `apps/portal/src/lib/reason-codes.ts`. A test in the mobile app asserts the
list matches, so adding one on the server and forgetting a message fails the
build rather than showing an employee a raw identifier.

---

## The check-in poster

Generated at **Settings → Check-in poster** (`/settings/poster`) and printed on
A4. The QR payload is `ATTN1|{restaurantId}|{version}|{secret}`.

The secret lives in `restaurants/{rid}/private/checkin`, which the security
rules deny to **every** client, including the owner. The only way it leaves the
server is the `getMarkerPayload` callable that renders this page — so a manager
can print the poster but cannot read the secret out of Firestore and forge a
check-in with it.

**Put it up** at shoulder height near the entrance or staff area, well lit, with
staff standing 50–80 cm in front.

**"Rotate code"** (owner only) issues a new secret and bumps the version. Every
printed poster stops working immediately. Use it if the code has been
photographed or shared.

---

## Threshold calibration — do this before trusting the scores

`faceVerifyThreshold` (0.75) and `faceReviewThreshold` (0.60) in
`firebase/functions/src/config.ts` are **placeholders**. The right values depend
on the model you bundle and on the restaurant's lighting.

Run the app with `--dart-define=DEBUG_SIMILARITY=true`, open "Similarity
calibration" from the home screen, and follow the procedure in
[`MODEL.md`](apps/mobile/assets/models/MODEL.md): capture the same person many
times, then several different people, and set the verify threshold just below
the lowest same-person score and the review threshold just above the highest
different-person score.

An owner can then set them from **Settings** without a redeploy.

---

## Known limitations

Read these before showing this to anyone as a security control.

- **The embedding comes from the phone.** Someone who reverse-engineers the APK
  could submit a forged vector. What is in place: the server computes the score
  rather than trusting one, the copied-embedding check catches a replayed
  enrolment vector, the photo with the poster is always uploaded and visible to
  the manager, and every attempt — including rejections — is auditable in the
  portal. What would actually fix it: move matching server-side (a self-hosted
  model on Cloud Run, or a paid face API) plus Play Integrity / App Attest.
- **An employee can read their own enrolment embedding.** The rules let them
  read their own employee document, which contains it. Combined with the point
  above, a determined employee could craft a vector close enough to pass but not
  close enough to trip the copy check. Fixing it properly means moving the
  embedding out of that document.
- **No liveness detection.** A good printed photo of the employee held in front
  of the poster will pass. Later: a blink or head-turn challenge via ML Kit, or
  a rotating QR shown on an in-restaurant tablet.
- **The poster can be photographed** and used elsewhere. Mitigation now is the
  rotate button; properly, a code that changes on its own.
- **On-device models are weaker than commercial APIs.** Lighting, glasses and
  masks all matter, which is why calibration is not optional.
- **Manual check-in is trivially fakeable** and is labelled as such everywhere in
  the UI. Set the restaurant to "Face only" if that matters.

---

## Testing

```bash
npm test             # functions unit tests + Flutter tests
npm run test:rules   # security rules against the emulators (needs Java)
npm run lint         # tsc on functions and portal, flutter analyze
```

| Suite | Covers |
|---|---|
| `firebase/functions` (vitest) | `decideStatus` table tests reaching every stored reject reason, cosine/`validateEmbedding`, timezone and lateness incl. DST and overnight shifts, `decodeMarker` against generated QR fixtures (normal, mirrored, compressed, no QR, wrong restaurant, old version, forged secret, non-image bytes), path and photo-freshness checks |
| `apps/mobile` (flutter test) | Face crop/align/normalise (output shape, pixel range, RGB order, rotation not contaminating the crop, face at the frame edge), cosine/averaging, the route gate's rule ordering, reason-code coverage, timezone rendering |
| `firebase/tests` (vitest + emulators) | Every §9 and §6 rule: who can read what, the field whitelists, settings validation, the marker secret being unreadable by everyone, attendance being client-read-only, photo immutability |

---

## Deploying

```bash
# Firebase (Blaze plan required for Functions and Storage — set a budget alert)
firebase use <your-project-id>
npm run build:functions
npm run deploy                 # functions, rules, indexes

# Portal on Vercel: root directory apps/portal
#   NEXT_PUBLIC_FIREBASE_API_KEY, ..._AUTH_DOMAIN, ..._PROJECT_ID,
#   ..._STORAGE_BUCKET, ..._MESSAGING_SENDER_ID, ..._APP_ID,
#   NEXT_PUBLIC_FUNCTIONS_REGION
#   (do NOT set NEXT_PUBLIC_USE_EMULATORS)
# Then add the Vercel domain to Firebase Auth -> Settings -> Authorised domains.

# Mobile
cd apps/mobile
flutterfire configure           # writes firebase_options.dart + google-services.json
flutter build apk --release
```

`apps/mobile/lib/firebase_options.dart` is committed with **placeholder** values
so the repo compiles against the emulators out of the box; `flutterfire
configure` overwrites it.

---

## Out of scope for v0.1

Payroll, shift scheduling beyond one start time per employee, multi-branch,
offline check-in, true liveness, push notifications, i18n.
