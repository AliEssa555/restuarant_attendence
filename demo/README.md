# Restaurant location-attendance demo

This package runs the owner portal and Firebase backend locally in Docker. The Android phone uses the same Wi-Fi network to record GPS attendance. There is no Firebase billing, cloud deployment, Firebase App Tester, face enrolment or face model setup in this demo.

## What to give your teammate

- The **restaurant-local-demo** APK artifact from GitHub Actions → **Local demo APK**. Extract `app-release.apk` from its ZIP.
- This repository ZIP (or the **local-demo-server-package** artifact from that same run). Extract it so `compose.yaml` is at the top of the working folder.
- These instructions. A normal cloud APK will not connect to this demo: use **Attendance Local Demo**.

## One-time laptop setup

Install Docker Desktop with Docker Compose, start Docker Desktop, and make sure Linux containers are enabled. On Windows, Docker Desktop requires a supported Windows version with virtualization/WSL 2 enabled. Your teammate does not need Flutter, Android Studio, Node.js, Java, a Firebase login or Git installed. Allow Docker on the laptop's **private** network when the firewall asks.

Internet is required for the first Docker build and first APK download. Once the images and emulator binaries are cached, the local attendance demo can run without a cloud connection. The phone may still use network-assisted GPS for a quicker fix.

## Start the demo

Open PowerShell/Terminal in the extracted folder containing `compose.yaml`:

```powershell
docker compose up --build -d
```

The first build can take several minutes. Check readiness:

```powershell
docker compose ps
docker compose logs -f backend
```

Wait until the backend is **healthy** and logs say **Demo ready**. Press Ctrl+C to leave log viewing; this does not stop the containers. If portal startup fails because the backend wasn't ready yet, run `docker compose up -d` again after the backend is healthy.

Open the portal on the laptop: **http://localhost:3000**. The local Firebase debugging UI is at http://localhost:4000.

## Demo accounts

All these accounts use password **demo1234**:

| Account | Where to sign in |
| --- | --- |
| `owner@demo.test` | Owner portal: employees, attendance and venue settings |
| `manager@demo.test` | Manager portal: employees and attendance |
| `employee@demo.test` | Android app: waiter demo |
| `chef@demo.test` | Android app: chef demo |

Seven days of sample attendance are included. Sample rows are labelled `sample-data` in their device evidence; new check-ins carry real GPS evidence. Initialization happens only once, so restarting keeps accounts, restaurant settings and saved attendance.

## Connect the phone

1. Install `app-release.apk` on an Android phone. Allow your browser/file manager to install this APK when prompted. The installed name is **Attendance Local Demo**; it can coexist with the normal app.
2. Connect phone and laptop to the same private Wi-Fi. Guest Wi-Fi often blocks communication between devices. A separate travel router is convenient at customer sites.
3. On Windows run `ipconfig`. Find **IPv4 Address** for the connected **Wi-Fi** adapter, e.g. `192.168.1.20`. Ignore Docker, WSL, VPN and disconnected adapter addresses. On macOS use Wi-Fi → Details → TCP/IP; on Linux use network settings.
4. Open **Attendance Local Demo**, enter that IPv4 address **without** `http://` or a port, and tap **Connect to local demo**.
5. Sign in as `employee@demo.test` / `demo1234`.

The APK remembers the last laptop IP. To enter another IP, fully close and reopen the app. Changing venue/Wi-Fi does not require rebuilding the APK. The phone cannot use `localhost` to reach the laptop. Keep the laptop awake and Docker running throughout the presentation.

## Set the venue location before a live check-in

1. In the laptop portal sign in as the owner and open **Settings**.
2. Leave **Require location** on. Click **Use my browser location**, allow access, and verify the map link. If laptop GPS is inaccurate, enter the venue latitude/longitude manually from a trusted map or the phone's coordinates.
3. Set a suitable fence radius (e.g. 200 metres), then **Save settings**. The initial coordinates are deliberately `0,0`; live check-ins fail until you set the venue location.
4. On the Android phone enable location services and grant **precise location** permission to the app. Move near a window or outdoors if accuracy is poor.

A phone fix with reported accuracy worse than 150 m or a mock-location flag is rejected. Increasing the fence radius does not bypass poor-accuracy or mock-location checks.

## Five-minute customer walkthrough

1. Portal **Dashboard**: show staff presence and the sample history.
2. Phone: tap **Check in with location**. The portal updates to show the employee in.
3. Portal **Attendance**: open the new row and show GPS distance, accuracy and the decision.
4. Phone: tap **Check out with location**. Confirm presence changes to out.
5. To demonstrate the fence without travelling, change the venue anchor in Settings to a distant location, then attempt another check-in. Show the rejected row and unchanged presence. Restore the correct venue location afterwards.
6. Show adding an employee, scheduled start time, and CSV export. New employee accounts receive a temporary password and must change it on first login.

Face recognition is deprecated in this version: no camera or face approval is needed. The backend retains legacy face code/data for compatibility, but the demo restaurant permits only location/tap attendance.

## Stop, resume and reset

Stop gracefully so the emulators export current data to the named Docker volume:

```powershell
docker compose down
```

Resume later with saved data:

```powershell
docker compose up -d
```

A crash or forced termination can lose changes since the last graceful export. Do not force-kill Docker during shutdown. Wait for `docker compose down` to finish before turning off the laptop.

For a completely fresh presentation **delete all local demo accounts and attendance**:

```powershell
docker compose down -v
docker compose up -d
```

## Connection troubleshooting

- **Cannot connect from the phone:** check the Wi-Fi IPv4 address, same network, Docker backend health and Windows private-network firewall. Disable guest/client isolation on the demo router. The required inbound laptop TCP ports are **9099, 8080 and 5001**.
- **Portal not reachable:** use `http://localhost:3000` on the laptop. The portal and emulator admin UI are deliberately published only on laptop loopback.
- **Phone connects but attendance fails:** confirm backend health, venue coordinates, location permission/accuracy and employee presence (alternate check-in/check-out).
- **Settings show the wrong restaurant:** confirm the portal is localhost and the phone is the Local Demo app. Both use the isolated project `demo-restaurant-attendance`.
- **Port already allocated:** close other Firebase emulators or programs using those ports, then restart Compose.
- **APK update fails:** test APKs use debug signing, which can differ between GitHub runners. Uninstall the prior Local Demo APK once, then install the new one. Uninstalling removes phone-local state; saved server data remains in Docker.

The emulator services trust local demo traffic and are not a production server. Use a private demo network; do not port-forward these services onto the internet or enter customer production data.

## Building the demo APK

The **Local demo APK** GitHub workflow builds it without any Firebase secrets. Merge this change and use the run's APK and server-package artifacts. A teammate downloading prebuilt artifacts does not need Flutter.

Developers with Flutter and the Android toolchain can build locally:

```powershell
$env:ORG_GRADLE_PROJECT_localDemo="true"
cd apps/mobile
flutter pub get
flutter build apk --release --dart-define=LOCAL_DEMO=true --dart-define=USE_EMULATORS=true --dart-define=FAKE_FACE=false
```

The Gradle property allows local HTTP traffic and gives the app a separate `.localdemo` package ID. Both flags are required when building outside the workflow. Normal APK builds do not enable local HTTP.
