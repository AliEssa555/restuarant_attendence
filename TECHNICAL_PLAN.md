# Restaurant Attendance — Demo v0.1 Technical Plan

> Instructions for Claude Code: build this milestone by milestone (Section 12). Finish each milestone's acceptance criteria before starting the next. Ask before deviating from the stack or data model. Keep everything runnable locally against the Firebase Emulator Suite.

---

## 1. Product summary

A demo attendance system for small restaurants.

- **Employees** use a Flutter mobile app to check in and check out.
- **Managers/owners** use a web portal (Next.js on Vercel) to manage employees, see who is in, review flagged check-ins, and export attendance.
- **Backend** is Firebase: Auth, Firestore, Cloud Storage, Cloud Functions.

### Two attendance methods

| Method | How it works | Trust level |
|---|---|---|
| **Manual** | Employee taps "Check in" / "Check out". | Low — easy to fake. Demo only. |
| **Face + location marker** | Employee takes a live selfie *in the restaurant* with the restaurant's printed **check-in poster** (contains a QR code) visible behind them. The **phone** computes a face embedding on-device (free, no external API); the **server** compares it with the employee's manager-approved enrolment embedding and verifies the poster's QR code in the uploaded photo. | Medium-low — proves "this person" + "at this physical spot" against casual cheating; a determined attacker with a modified app could fake the embedding (see 7.7). |

The manager chooses per restaurant whether `manual`, `face`, or `both` methods are allowed.

### Out of scope for v0.1
Payroll, shift scheduling beyond one "scheduled start time" per employee, multi-branch restaurants, offline check-in, true liveness detection, push notifications, i18n.

---

## 2. Architecture

```
┌──────────────────────────┐  ┌──────────────────────────────┐
│ Flutter app (employees)  │  │ Next.js portal (Vercel)      │
│  ML Kit face detection   │  │ (owners / managers)          │
│  TFLite face embeddings  │  │                              │
└───────┬──────────────────┘  └──────────────┬───────────────┘
        │ Firebase client SDKs             │ Firebase JS SDK
        ▼                                  ▼
┌─────────────────────────────────────────────────────────────┐
│ Firebase                                                    │
│  Auth (email/password + custom claims: role, rid, eid)      │
│  Firestore (data, guarded by security rules)                │
│  Storage (enrolment + check-in photos)                      │
│  Cloud Functions v2 (callables: all privileged writes)      │
│        └── Embedding similarity check (cosine)              │
│        └── MarkerVerifier (QR decode from photo)            │
└─────────────────────────────────────────────────────────────┘
```

Key principles:
- **Clients never write attendance records directly.** All attendance writes go through the `recordAttendance` callable so the server controls timestamps, state transitions and verification.
- **Server time only.** Never trust device time or photo EXIF.
- **The portal holds no secrets.** Vercel only has public `NEXT_PUBLIC_FIREBASE_*` config.
- **Zero paid APIs.** Face detection and embedding run on the phone. The only costs are Firebase usage, which should stay within free quotas for a demo.
- **Never trust the client's score.** The app sends the raw embedding; the server computes the similarity itself against the stored enrolment embedding.

---

## 3. Tech stack

### Repo layout (monorepo)
```
/apps/mobile        Flutter app
/apps/portal        Next.js portal
/firebase
  /functions        Cloud Functions (TypeScript, Node 20+)
  firestore.rules
  firestore.indexes.json
  storage.rules
  firebase.json
  .firebaserc
/scripts            seed + utility scripts
/docs               this plan, setup notes
```

### Mobile (Flutter, latest stable)
- `firebase_core`, `firebase_auth`, `cloud_firestore`, `firebase_storage`, `cloud_functions`
- `camera` (in-app capture only — **no gallery picker anywhere**)
- `google_mlkit_face_detection` (face count, bounding box, eye landmarks for alignment, eyes-open probability)
- `tflite_flutter` + a **MobileFaceNet-style TFLite model** bundled in `assets/models/` (112×112 RGB input, 128- or 192-d embedding output). Claude Code: pick a publicly available pretrained model whose licence allows this use, and record its source, licence, input size, normalisation and output size in `apps/mobile/assets/models/MODEL.md`.
- `flutter_image_compress` (resize to max 1600px long edge, JPEG q≈85)
- `flutter_riverpod` (state), `go_router` (navigation)
- `--dart-define=USE_EMULATORS=true` switches all Firebase services to the local emulators.
- Configure with `flutterfire configure`.

### Portal (Next.js App Router, TypeScript)
- Tailwind CSS + shadcn/ui
- Firebase JS SDK (client-side only; no `firebase-admin` in the portal)
- `qrcode.react` for the printable poster
- `date-fns` + `date-fns-tz` for restaurant-timezone display
- Client-side auth guard on all routes except `/login` and `/signup`.
- Env: `NEXT_PUBLIC_FIREBASE_*`, `NEXT_PUBLIC_USE_EMULATORS`.

### Backend (Firebase)
- Plan: **Blaze (pay-as-you-go) is required** for Cloud Functions and Storage. Set a budget alert.
- Functions v2, TypeScript, region `asia-south1` (closest to Pakistan; change if needed).
- Libraries: `firebase-admin`, `firebase-functions`, `sharp` (image decode/flip/resize), `jsqr` (QR decode), `zod` (input validation).
- No external secrets needed.

---

## 4. Roles & authentication

Roles: `owner`, `manager`, `employee`. Stored as **custom claims** `{ role, rid, eid? }` (rid = restaurantId, eid = employeeId) and mirrored in `users/{uid}`.

- **Owner signup (portal):** Firebase email/password signup → onboarding form → `createRestaurant` callable creates the restaurant, sets claims `{role:'owner', rid}`. Client then force-refreshes the ID token.
- **Employees:** created by owner/manager in the portal via `createEmployee` callable, which creates the Auth user with a generated temporary password (shown **once** in the portal for the manager to hand over) and sets claims `{role:'employee', rid, eid}`. App forces a password change on first login (`users/{uid}.mustChangePassword`).
- **Managers (optional in v0.1):** owner can create a manager via `createStaff({role:'manager'})`. Managers can do everything except change restaurant settings and manage other managers.
- Employees cannot log into the portal; owners/managers cannot use the mobile app's check-in.

---

## 5. Data model (Firestore)

```
users/{uid}
  role: 'owner' | 'manager' | 'employee'
  restaurantId: string
  employeeId?: string
  displayName: string
  email: string
  mustChangePassword: boolean
  createdAt: Timestamp

restaurants/{rid}
  name: string
  timezone: string                 // IANA, e.g. 'Asia/Karachi'
  ownerUid: string
  createdAt: Timestamp
  settings: {
    attendanceMode: 'manual' | 'face' | 'both'   // default 'both'
    faceVerifyThreshold: number    // cosine similarity 0–1; starting value 0.75 (≥ → verified)
    faceReviewThreshold: number    // starting value 0.60 (≥ review, < verified → pending_review)
                                   // calibrate both during M5 with real test photos and update defaults
    requireMarker: boolean         // default true
    lateGraceMinutes: number       // default 10
  }

restaurants/{rid}/private/checkin            // functions-only, no client access
  markerSecret: string             // random 32 bytes, base64url
  markerVersion: number
  rotatedAt: Timestamp

restaurants/{rid}/employees/{eid}
  name: string
  email: string
  phone?: string
  position?: string                // 'Waiter', 'Chef', …
  uid: string
  active: boolean
  scheduledStart?: string          // 'HH:mm' in restaurant timezone, for late flag
  face: {
    status: 'none' | 'pending' | 'approved' | 'rejected'
    enrolPhotoPath?: string
    embedding?: number[]           // L2-normalised mean of enrolment embeddings
    modelVersion?: string          // e.g. 'mobilefacenet-v1'; mismatch → re-enrol
    submittedAt?: Timestamp
    reviewedBy?: string
    reviewedAt?: Timestamp
  }
  presence: {
    status: 'in' | 'out'           // default 'out'
    lastEventAt?: Timestamp
    lastRecordId?: string
  }
  createdAt: Timestamp

restaurants/{rid}/attendance/{recordId}
  employeeId: string
  employeeName: string             // denormalised for tables
  type: 'check_in' | 'check_out'
  method: 'manual' | 'face'
  status: 'verified' | 'pending_review' | 'rejected'
  rejectReason?: string            // see 7.5 reason codes
  createdAt: Timestamp             // server timestamp
  localDate: string                // 'YYYY-MM-DD' in restaurant tz (for querying)
  late?: boolean
  minutesLate?: number
  face?: {
    photoPath: string
    modelVersion: string
    similarity: number | null      // computed by the server
    facesDetected: number          // reported by the app (ML Kit)
    markerFound: boolean
    markerValid: boolean
  }
  review?: { by: string, at: Timestamp, decision: 'approve' | 'reject', note?: string }
  device?: { platform: string, appVersion: string }
  clientRequestId: string          // idempotency

restaurants/{rid}/photoHashes/{sha256}       // functions-only; blocks photo reuse
  recordId: string
  createdAt: Timestamp
```

### Indexes (`firestore.indexes.json`)
- `attendance`: `localDate ASC, createdAt DESC`
- `attendance`: `employeeId ASC, createdAt DESC`
- `attendance`: `status ASC, createdAt DESC`
- `attendance`: `employeeId ASC, localDate ASC, createdAt DESC`

---

## 6. Storage layout & rules

```
faces/{rid}/{eid}/enrol-{timestamp}.jpg
checkins/{rid}/{eid}/{timestamp}.jpg
```

Storage rules:
- Write (`create` only, no update/delete): only the employee whose claims match `rid` and `eid`; `contentType == 'image/jpeg'`; size < 3 MB.
- Read: owner/manager with matching `rid`. Employees can read their own enrolment photo only.

---

## 7. Face + marker verification (core feature)

### 7.1 The check-in poster
- Generated in the portal (`/settings/poster`): printable A4 page with the restaurant name, short instructions, and a large QR code.
- QR payload: `ATTN1|{rid}|{markerVersion}|{markerSecret}`.
- The portal gets the payload via a manager-only callable `getMarkerPayload` (the secret is never readable through Firestore).
- "Rotate code" button → `rotateMarker` callable → new secret + version; old posters stop working immediately. Portal prompts to reprint.
- Mounting guidance printed on the poster page: at shoulder height on a wall near the entrance/staff area, good lighting, employee stands ~50–80 cm in front of it.

### 7.2 On-device face pipeline (`FaceEmbedder` in Dart)
Used by both enrolment and check-in:
1. Run ML Kit face detection on the captured image (landmarks + classification enabled).
2. Require exactly one face, bounding box reasonably large and centred, both eyes open (probability > 0.5).
3. Align: rotate so the eye line is horizontal, crop the face box with ~20% margin, resize to the model's input (e.g. 112×112).
4. Normalise pixels as the model expects (commonly `(x − 127.5) / 128`).
5. Run the TFLite model → embedding → L2-normalise.
6. Run inference in an isolate so the UI doesn't freeze.

Debug aid: `--dart-define=FAKE_FACE=true` makes `FaceEmbedder` return a fixed embedding so flows can be tested on emulators/simulators without a working camera.

### 7.3 Face enrolment
1. On first login (if mode is `face` or `both`) the app shows the enrolment screen.
2. Capture **3 photos** (prompt: look straight, slight left, slight right). Each must pass the pipeline in 7.2.
3. Average the 3 embeddings and L2-normalise. Reject the enrolment locally if any two of the 3 have cosine similarity below 0.6 (likely a bad capture).
4. Upload the straight-on photo to `faces/{rid}/{eid}/enrol-{ts}.jpg` → call `submitFaceEnrolment({ photoPath, embedding, modelVersion })`.
5. Function validates path ownership, embedding length and that it is roughly unit-length, stores it, sets `face.status = 'pending'`.
6. Manager sees it in the portal Review queue, compares with the real person, approves or rejects (`reviewFaceEnrolment`). **Manager approval is the anti-fraud anchor:** nobody can enrol someone else's face.
7. Until approved, face check-in is disabled for that employee (manual still works if mode is `both`).

### 7.4 Face check-in flow
**App:**
1. Employee taps "Check in with face".
2. Camera screen (front camera, `ResolutionPreset.high`) with overlay: face oval + instruction "Make sure the check-in poster is visible behind you".
3. Capture → run the 7.2 pipeline (if it fails, show a hint and don't upload).
4. Show preview → "Use photo" / "Retake".
5. Compress (≤1600px, JPEG), upload to `checkins/{rid}/{eid}/{ts}.jpg`.
6. Call `recordAttendance({ type, method:'face', photoPath, embedding, facesDetected, modelVersion, clientRequestId, device })`. The app does **not** send a similarity score.
7. Result screen: ✅ Verified / ⏳ Sent for manager review / ❌ Rejected (+ human-readable reason + Retry).

**Server (`recordAttendance`, method = face):**
1. Validate input (zod), claims (`role == 'employee'`, rid, eid), employee `active`.
2. Restaurant `attendanceMode` must allow `face`.
3. Idempotency: if a record with this `clientRequestId` exists, return it.
4. Rate limit: max 5 face attempts per employee per 10 minutes.
5. State check: `check_in` requires `presence.status == 'out'`; `check_out` requires `'in'`.
6. Photo checks: path must be `checkins/{rid}/{eid}/…`; object `timeCreated` within the last 3 minutes; size/content-type OK. Download bytes.
7. Reuse check: sha256 of bytes must not exist in `photoHashes`.
8. **Marker check:** decode QR with `jsqr` on the image (via `sharp` raw RGBA). If not found, retry on a **horizontally flipped** image (front cameras may mirror) and on a 2× upscaled centre crop. Parse payload; valid only if `rid` matches, `markerVersion` is current, and secret matches (constant-time compare).
9. **Face check:** employee `face.status` must be `approved` and `modelVersion` must match the enrolment's. Validate the embedding (correct length, finite numbers, roughly unit-length). Reject if it is (near-)identical to the stored enrolment embedding (cosine > 0.999), which means it was copied rather than computed from a new photo. Server computes `similarity = cosine(stored, submitted)`. Require `facesDetected == 1`.
10. Decision via a pure function `decideStatus(...)` (unit-tested):
    - marker invalid/missing and `requireMarker` → `rejected` (`MARKER_NOT_FOUND` / `MARKER_INVALID`)
    - face not enrolled/approved → `rejected` (`FACE_NOT_ENROLLED`)
    - facesDetected == 0 → `rejected` (`NO_FACE`); > 1 → `rejected` (`MULTIPLE_FACES`)
    - similarity ≥ `faceVerifyThreshold` → `verified`
    - similarity ≥ `faceReviewThreshold` → `pending_review`
    - else → `rejected` (`FACE_MISMATCH`)
11. Firestore transaction: write attendance record, write photo hash, and — if status is not `rejected` — update `presence`. Compute `late`/`minutesLate` for `check_in` using `scheduledStart`, `lateGraceMinutes`, restaurant timezone.
12. Return `{ recordId, status, rejectReason?, similarity? }`.

Rejected attempts are still stored (audit trail of possible fraud) but do not change presence.

### 7.5 Reject reason codes (shown in app and portal)
`MARKER_NOT_FOUND`, `MARKER_INVALID`, `FACE_NOT_ENROLLED`, `FACE_MODEL_MISMATCH`, `NO_FACE`, `MULTIPLE_FACES`, `FACE_MISMATCH`, `EMBEDDING_INVALID`, `PHOTO_STALE`, `PHOTO_REUSED`, `RATE_LIMITED`, `ALREADY_CHECKED_IN`, `NOT_CHECKED_IN`, `METHOD_NOT_ALLOWED`, `EMPLOYEE_INACTIVE`.

App maps each to a friendly message, e.g. `MARKER_NOT_FOUND` → "We couldn't see the check-in poster. Stand in front of it and try again."

### 7.6 Manual check-in
`recordAttendance({ type, method:'manual', clientRequestId, device })`: same steps 1–5 and 11; status is always `verified`; no photo.

### 7.7 Known limitations (document in README)
- **Client-side trust:** the embedding comes from the phone, so someone who reverse-engineers the app could submit a forged embedding. Mitigations in v0.1: server computes the score, copied-embedding check, the photo (with the poster) is always uploaded and visible to managers, and every check-in can be audited in the portal. Upgrade path: move matching server-side (self-hosted model in a Cloud Run container, or a paid face API), plus Play Integrity / App Attest.
- On-device models are less accurate than commercial APIs; lighting, glasses and masks matter. Thresholds must be calibrated with real photos.
- No true liveness: a high-quality printed photo of the employee held in front of the poster could pass. Mitigations for later: blink/head-turn challenge via ML Kit, rotating QR shown on a tablet in the restaurant, GPS/Wi-Fi checks.
- A photo of the poster could be taken home. Mitigation now: "Rotate code" button; later: rotating on-screen QR.

---

## 8. Cloud Functions (callables)

| Function | Caller | Purpose |
|---|---|---|
| `createRestaurant` | new owner | Create restaurant + private marker doc, set claims |
| `createEmployee` | owner/manager | Create Auth user + employee doc, set claims, return temp password once |
| `createStaff` | owner | Create a manager account |
| `setEmployeeActive` | owner/manager | Enable/disable; disabling also disables the Auth user |
| `submitFaceEnrolment` | employee | Validate photo path + embedding, store embedding, set face.status = pending |
| `reviewFaceEnrolment` | owner/manager | Approve/reject enrolment |
| `recordAttendance` | employee | Manual or face check-in/out (Section 7) |
| `reviewAttendance` | owner/manager | Approve/reject a `pending_review` record; on reject, if it was the latest record, revert presence |
| `getMarkerPayload` | owner/manager | Return QR payload for poster |
| `rotateMarker` | owner | Rotate marker secret |

Shared helpers: `assertRole(ctx, roles)`, `getRestaurantTz`, `toLocalDate`, `decideStatus`, `decodeMarker`, `computeLateness`, `validateEmbedding`, `cosineSimilarity`.

Errors: throw `HttpsError` with `details.code` set to the reason codes above.

---

## 9. Security rules (summary)

Helpers: `isSignedIn()`, `rid()`, `role()`, `isStaffOf(r)` (owner/manager of r), `isEmployeeSelf(r, e)`.

- `users/{uid}`: read own; staff can read users of their restaurant; no client writes except `mustChangePassword: false` on own doc.
- `restaurants/{rid}`: read by any member of rid; owner can update `name`, `timezone`, `settings` only (validate types/ranges).
- `restaurants/{rid}/private/**`: **deny all** client access.
- `restaurants/{rid}/employees/{eid}`: staff read/update (`name`, `phone`, `position`, `scheduledStart` only); employee reads own doc. Create/delete only via functions. `face` and `presence` fields never client-writable.
- `restaurants/{rid}/attendance/{id}`: staff read; employee reads own records (`resource.data.employeeId == eid`). **No client writes.**
- `restaurants/{rid}/photoHashes/**`: deny all.

Write rules tests with `@firebase/rules-unit-testing` covering every bullet.

---

## 10. Mobile app (Flutter) screens

1. **Splash/auth gate** → routes by auth state and claims.
2. **Login** (email + password). Error if account isn't an employee.
3. **Change password** (forced on first login).
4. **Face enrolment** (if required and `face.status` is `none` or `rejected`) → then "Waiting for manager approval" state (listens to employee doc).
5. **Home**
   - Greeting, restaurant name, current status ("In since 9:04 AM" / "Out").
   - Primary button: Check in / Check out (label follows presence).
   - If mode `both`: two buttons — "With face" (primary) and "Manual" (secondary). If face isn't approved yet, "With face" is disabled with a hint.
6. **Face capture** → **Preview** → **Uploading/verifying** → **Result** (Section 7.4).
7. **My history**: last 30 records with status chips (Verified / Pending / Rejected).
8. **Profile**: name, position, logout.

Notes: request camera permission with a clear rationale; handle permission-denied; lock face capture screen to portrait; show upload progress; all times shown in the restaurant timezone.

---

## 11. Portal (Next.js) pages

| Route | Content |
|---|---|
| `/login`, `/signup` | Email/password; signup → onboarding (restaurant name, timezone default `Asia/Karachi`) |
| `/dashboard` | Today (restaurant tz): cards for *In now*, *Checked in today*, *Late*, *Not in yet*, *Pending reviews*. Live list of employees with status, check-in time, method icon, late badge. Real-time via `onSnapshot`. |
| `/employees` | Table: name, position, status, face enrolment status, active toggle. "Add employee" button. |
| `/employees/new` | Form → shows temp password once with copy button. |
| `/employees/[id]` | Details edit, scheduled start, enrolment photo with Approve/Reject, recent attendance. |
| `/attendance` | Log table with filters (date range, employee, method, status). Row click → side panel with photo, similarity, marker result, reject reason, review actions. CSV export of filtered rows (client-side). |
| `/reviews` | Two tabs: pending face enrolments, pending attendance reviews. Side-by-side enrolment photo vs check-in photo. |
| `/settings` | Owner only: restaurant name, timezone, attendance mode, thresholds, grace minutes, require marker. |
| `/settings/poster` | Printable poster (print CSS), "Rotate code" button with confirmation. |

UI: clean, mobile-responsive (managers often use phones). Sidebar on desktop, bottom nav or hamburger on mobile.

---

## 12. Milestones & acceptance criteria

**M0 — Scaffold**
- Monorepo layout from Section 3; Flutter app, Next.js app, Firebase project config, functions package.
- `firebase emulators:start` runs Auth, Firestore, Storage, Functions.
- Both apps connect to emulators via env flags.
- ✅ README explains setup end to end; both apps launch and show a placeholder screen against emulators.

**M1 — Auth, roles, restaurant onboarding**
- `createRestaurant`, `createEmployee`, `createStaff`; custom claims; forced password change.
- Security rules + rules tests for users/restaurants/employees.
- ✅ Owner signs up in the portal, creates an employee, employee logs into the app and changes password. Rules tests pass.

**M2 — Employee management (portal)**
- `/employees`, `/employees/new`, `/employees/[id]`, `setEmployeeActive`.
- ✅ CRUD works; inactive employee cannot log in.

**M3 — Manual attendance**
- `recordAttendance` (manual path), presence state machine, lateness, idempotency.
- App Home + History; portal `/dashboard` and `/attendance` (without photo panel).
- ✅ Check in → dashboard updates live; double check-in rejected with `ALREADY_CHECKED_IN`; late flag correct across timezone.

**M4 — Face enrolment**
- Bundle the TFLite model + `MODEL.md`; implement `FaceEmbedder` (7.2) with `FAKE_FACE` debug mode.
- App enrolment flow (3 captures, averaged embedding); `submitFaceEnrolment`, `reviewFaceEnrolment`; portal review tab and employee detail approval.
- Storage rules + tests.
- ✅ On a real Android phone: enrol → manager approves → app unlocks face check-in. With `FAKE_FACE=true` the same flow works on an emulator.

**M5 — Marker + face check-in**
- Poster page, `getMarkerPayload`, `rotateMarker`, `decodeMarker` (with flip/crop fallbacks), photo hash, staleness, rate limit, embedding validation, `decideStatus`.
- App capture/preview/result screens.
- Unit tests: `decideStatus` table tests; `cosineSimilarity`/`validateEmbedding`; `decodeMarker` against fixture images (normal, mirrored, small QR, no QR, wrong restaurant, old version).
- **Threshold calibration:** add a hidden debug screen in the app that shows the live similarity against the enrolled embedding. Test with 3+ people (same person in different light, different people) and set `faceVerifyThreshold` / `faceReviewThreshold` defaults from the results; note the numbers in `MODEL.md`.
- ✅ All reason codes reachable in tests; end-to-end works on emulators with `FAKE_FACE`; on a real phone it verifies a real employee in front of a printed poster and rejects a different person.

**M6 — Review & reporting**
- `/reviews`, attendance side panel with photos, `reviewAttendance`, CSV export.
- ✅ Pending record can be approved/rejected; rejected latest record reverts presence.

**M7 — Settings, polish, deploy**
- `/settings`; empty states, loading states, error toasts; friendly reason messages in app.
- `scripts/seed.ts`: demo restaurant, owner (`owner@demo.test`), 6 employees, 7 days of mixed attendance (incl. late, pending, rejected).
- Deploy: `firebase deploy` (functions, rules, indexes); Vercel project with root `apps/portal` and env vars; Android build (APK) for demo.
- ✅ Fresh clone → README steps → working demo in under 30 minutes.

---

## 13. Testing summary
- Functions: Jest/Vitest unit tests for pure logic; integration tests against emulators using synthetic embeddings.
- Flutter: unit tests for `FaceEmbedder` preprocessing (crop/align/normalise) and cosine similarity on fixture images.
- Rules: `@firebase/rules-unit-testing` for Firestore and Storage.
- Flutter: widget tests for Home state logic and reason-code messages; manual device test checklist for camera flows.
- Portal: basic Playwright smoke test (login → dashboard renders) — optional.

## 14. Configuration checklist
- Firebase project on Blaze plan, budget alert set.
- Functions region `asia-south1`.
- TFLite model file committed under `apps/mobile/assets/models/` and declared in `pubspec.yaml`.
- Vercel env: `NEXT_PUBLIC_FIREBASE_API_KEY`, `..._AUTH_DOMAIN`, `..._PROJECT_ID`, `..._STORAGE_BUCKET`, `..._APP_ID`, `..._MESSAGING_SENDER_ID`, `NEXT_PUBLIC_FUNCTIONS_REGION`.
- Add the Vercel domain to Firebase Auth authorised domains.

## 15. Future ideas (not v0.1)
Liveness challenge (blink/turn), rotating QR on an in-restaurant tablet, GPS geofence, shift schedules & overtime, payroll export, push reminders, multi-branch, iOS build, Urdu localisation, offline queue.
