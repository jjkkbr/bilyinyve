import { spawn } from 'node:child_process';

let isShuttingDown = false;
const children = [];

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

const webProcess = start({
  name: 'web',
  command: 'vite',
  args: ['--host', '127.0.0.1']
});
children.push(webProcess);

let rendererUrl;
try {
  rendererUrl = await waitForRendererUrl(webProcess);
} catch (error) {
  console.error(`[desktop] ${error.message || error}`);
  shutdown(1);
}

children.push(
  start({
    name: 'desktop',
    command: 'electron',
    args: ['electron/main.cjs'],
    env: {
      ELECTRON_DEV: 'true',
      ELECTRON_RENDERER_URL: rendererUrl
    }
  })
);

function start({ name, command, args, env }) {
  const child = spawn(command, args, {
    env: {
      ...process.env,
      ...env
    },
    shell: true,
    stdio: ['inherit', 'pipe', 'pipe']
  });

  child.stdout.on('data', (chunk) => {
    process.stdout.write(`[${name}] ${chunk}`);
  });

  child.stderr.on('data', (chunk) => {
    process.stderr.write(`[${name}] ${chunk}`);
  });

  child.on('exit', (code) => {
    if (!isShuttingDown && code !== 0) {
      console.error(`[${name}] exited with code ${code}`);
      shutdown(code || 1);
    }
  });

  return child;
}

function waitForRendererUrl(child, timeoutMs = 15_000) {
  return new Promise((resolve, reject) => {
    let output = '';
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Timed out waiting for Vite dev server URL.'));
    }, timeoutMs);

    const handleOutput = (chunk) => {
      output += stripAnsi(String(chunk));
      const match = output.match(/http:\/\/127\.0\.0\.1:\d+\/?/);
      if (!match) return;

      cleanup();
      const url = match[0].endsWith('/') ? match[0] : `${match[0]}/`;
      process.stdout.write(`[desktop] Renderer URL: ${url}\n`);
      resolve(url);
    };

    const handleExit = (code) => {
      cleanup();
      reject(new Error(`Vite dev server exited before becoming ready, code ${code}.`));
    };

    const cleanup = () => {
      clearTimeout(timeout);
      child.stdout.off('data', handleOutput);
      child.stderr.off('data', handleOutput);
      child.off('exit', handleExit);
    };

    child.stdout.on('data', handleOutput);
    child.stderr.on('data', handleOutput);
    child.once('exit', handleExit);
  });
}

function stripAnsi(value) {
  return value.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '');
}

function shutdown(code) {
  isShuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill();
  }
  process.exit(code);
}
