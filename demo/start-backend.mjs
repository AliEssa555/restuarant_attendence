import { spawn } from 'node:child_process';
import { existsSync, writeFileSync, rmSync } from 'node:fs';
const project = 'demo-restaurant-attendance';
const readyFile = '/tmp/restaurant-demo-ready';
rmSync(readyFile, { force: true });
const args = ['--config', 'firebase.demo.json', '--project', project, 'emulators:start', '--only', 'auth,firestore,functions'];
if (existsSync('/data/firebase-export-metadata.json')) args.push('--import=/data');
const emulator = spawn('firebase', args, { stdio: 'inherit' });
let stopping = false;
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, async () => {
  if (stopping) return;
  stopping = true;
  console.log("Saving local demo data before shutdown...");
  rmSync(readyFile, { force: true });
  // Export explicitly before stopping the emulator. PID 1 / non-TTY signal
  // handling otherwise lets some CLI versions exit without their auto-export.
  const exporter = spawn('firebase', ['--config', 'firebase.demo.json', '--project', project,
    'emulators:export', '/data', '--force'], { stdio: 'inherit' });
  const timeout = setTimeout(() => exporter.kill('SIGTERM'), 45000);
  try {
    const code = await new Promise((resolve, reject) => { exporter.on('exit', resolve); exporter.on('error', reject); });
    if (code !== 0) console.error('Demo data export failed. Keep the laptop running and inspect the export log.');
  } catch (error) { console.error('Demo data export failed:', error); }
  finally { clearTimeout(timeout); emulator.kill('SIGINT'); }
});
emulator.on('exit', code => process.exit(stopping ? 0 : process.exitCode || code || 1));
emulator.on('error', error => { console.error(error); process.exit(1); });
async function initialize() {
  const probe = `http://127.0.0.1:5001/${project}/asia-south1/recordAttendance`;
  for (let i = 0; i < 180 && !stopping; i++) {
    try {
      const response = await fetch(probe, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"data":{}}',
        signal: AbortSignal.timeout(2500),
      });
      const data = await response.json();
      // The real handler must reject this unauthenticated request.
      if (data.error?.status === 'UNAUTHENTICATED') {
        const seed = spawn('npm', ['--prefix', 'scripts', 'run', 'seed:local'], {
          stdio: 'inherit', env: { ...process.env, GCLOUD_PROJECT: project,
            FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099' },
        });
        const code = await new Promise((resolve, reject) => { seed.on('exit', resolve); seed.on('error', reject); });
        if (code !== 0) throw new Error('Demo initialization failed; inspect the seed log.');
        writeFileSync(readyFile, 'ready');
        console.log('\nDemo ready. Portal: http://localhost:3000 | owner@demo.test / demo1234\n');
        return;
      }
    } catch (error) {
      if (i === 179) throw error;
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  if (!stopping) throw new Error('Emulators did not become ready.');
}
initialize().catch(error => { console.error(error); process.exitCode = 1; emulator.kill('SIGINT'); });
