import { spawn } from 'node:child_process';
import { existsSync, writeFileSync, rmSync } from 'node:fs';
const project = 'demo-restaurant-attendance';
const readyFile = '/tmp/restaurant-demo-ready';
rmSync(readyFile, { force: true });
const args = ['--config', 'firebase.demo.json', '--project', project, 'emulators:start', '--only', 'auth,firestore,functions', '--export-on-exit=/data'];
if (existsSync('/data/firebase-export-metadata.json')) args.push('--import=/data');
const emulator = spawn('firebase', args, { stdio: 'inherit' });
let stopping = false;
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => {
  stopping = true;
  rmSync(readyFile, { force: true });
  // Firebase handles SIGINT by exporting before shutting down.
  emulator.kill('SIGINT');
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
