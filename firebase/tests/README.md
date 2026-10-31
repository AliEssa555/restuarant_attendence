# Security rules tests

These assert every bullet in TECHNICAL_PLAN.md §9 and §6 against the real rules
files, using the Firestore and Storage emulators.

**Requires Java 11+** — the Firestore and Storage emulators are JVM processes.
Check with `java -version`; if it is missing, install a JDK (Temurin, or the one
bundled with Android Studio) before running these.

```bash
cd firebase/tests
npm install
npm run test:emulated   # starts the emulators, runs the tests, shuts them down
```

To run them against emulators you already have up (`firebase emulators:start`):

```bash
npm test
```
