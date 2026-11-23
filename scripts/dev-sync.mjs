#!/usr/bin/env node
/**
 * `npm run dev:sync`: run the app and keep it up to date with GitHub.
 *
 * Every 30 seconds (SYNC_SECONDS to change it) this checks GitHub for a newer
 * version of the current branch and, if there is one, applies it. The app
 * reloads code changes by itself; when packages or the Next.js config change,
 * it installs and restarts. Changes are only applied when they don't clash
 * with edits made here: otherwise it says so and leaves the files alone.
 */
import { execFileSync, spawn } from 'node:child_process';

const INTERVAL = Math.max(10, Number(process.env.SYNC_SECONDS) || 30) * 1000;
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const log = (msg) => console.log(`\x1b[36m[sync]\x1b[0m ${msg}`);
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

let server = null;
let stopping = false;
let busy = false;
let reportedClash = '';

function start() {
  stopping = false;
  // Its own process group, so stopping it also stops the server it starts.
  server = spawn(npx, ['next', 'dev'], { stdio: 'inherit', detached: process.platform !== 'win32' });
  server.on('exit', (code) => {
    if (stopping) return;
    log(
      code === 0
        ? 'The app stopped.'
        : 'The app stopped with an error. If it says another server is already running, stop that one ' +
            '(kill <PID>) and run "npm run dev:sync" again.',
    );
    process.exit(code ?? 1);
  });
}

const groupAlive = (pid) => {
  try {
    process.kill(-pid, 0);
    return true;
  } catch {
    return false;
  }
};

async function stop() {
  if (!server) return;
  stopping = true;
  const pid = server.pid;
  if (process.platform === 'win32') {
    server.kill('SIGTERM');
    return;
  }
  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    return; // Already gone.
  }
  // Wait for every process in the group to finish, so the port is free to start again.
  for (let i = 0; i < 50 && groupAlive(pid); i++) await new Promise((r) => setTimeout(r, 200));
  if (groupAlive(pid)) process.kill(-pid, 'SIGKILL');
}

async function sync() {
  if (busy) return;
  busy = true;
  try {
    let branch;
    let before;
    try {
      branch = git('rev-parse', '--abbrev-ref', 'HEAD');
      before = git('rev-parse', 'HEAD');
      git('fetch', '--quiet', 'origin', branch);
    } catch {
      return; // Offline or GitHub unreachable: try again next time.
    }
    const behind = Number(git('rev-list', '--count', `HEAD..origin/${branch}`));
    if (!behind) return;
    try {
      git('merge', '--ff-only', '--quiet', `origin/${branch}`);
    } catch {
      const latest = git('rev-parse', `origin/${branch}`);
      if (latest === reportedClash) return; // Already said so for this version.
      reportedClash = latest;
      log(
        'A newer version is on GitHub but could not be applied, because files changed here clash with it. ' +
          'Run "git status" to see which files, then commit or undo those changes.',
      );
      return;
    }
    const changed = git('diff', '--name-only', before, 'HEAD').split('\n').filter(Boolean);
    log(`Updated to the latest version from GitHub (${changed.length} file${changed.length === 1 ? '' : 's'} changed).`);

    if (changed.some((f) => f === 'package.json' || f === 'package-lock.json')) {
      log('New packages are needed. Installing them and restarting the app…');
      await stop();
      execFileSync(npm, ['install', '--no-audit', '--no-fund'], { stdio: 'inherit' });
      start();
    } else if (changed.some((f) => /^next\.config\./.test(f) || f.startsWith('.env'))) {
      log('Settings changed. Restarting the app…');
      await stop();
      start();
    }
  } catch (err) {
    log(`Could not check for updates: ${err.message}`);
  } finally {
    busy = false;
  }
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    await stop();
    process.exit(0);
  });
}

log(`Starting the app. Checking GitHub for updates every ${INTERVAL / 1000} seconds.`);
await sync();
if (!server) start();
setInterval(sync, INTERVAL);
