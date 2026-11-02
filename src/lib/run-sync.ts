import { spawn } from 'node:child_process';

let running = false;

/** Runs the IDFG sync (all steps, or the named ones) in a background child process of the web server. */
export function startSync(steps: string[]): boolean {
  if (running) return false;
  running = true;
  const child = spawn('npx', ['tsx', 'src/sync/index.ts', ...steps], { cwd: process.cwd(), env: process.env, stdio: 'inherit' });
  child.on('exit', (code) => {
    running = false;
    console.log(`[sync] finished with exit code ${code}`);
  });
  return true;
}

export const syncRunning = () => running;
