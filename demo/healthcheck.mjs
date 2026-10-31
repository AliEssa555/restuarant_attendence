import { existsSync } from 'node:fs';
if (!existsSync('/tmp/restaurant-demo-ready')) process.exit(1);
try {
  const response = await fetch('http://127.0.0.1:9099/emulator/v1/projects/demo-restaurant-attendance/config', { signal: AbortSignal.timeout(2000) });
  if (!response.ok) process.exit(1);
} catch { process.exit(1); }
