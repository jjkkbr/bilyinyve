import { spawn } from 'node:child_process';

const commands = [
  {
    name: 'api',
    command: 'node',
    args: ['server/index.js']
  },
  {
    name: 'web',
    command: 'vite',
    args: ['--host', '127.0.0.1']
  }
];

const children = commands.map(({ name, command, args }) => {
  const child = spawn(command, args, {
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
    if (code !== 0 && !isShuttingDown) {
      console.error(`[${name}] exited with code ${code}`);
      shutdown(code || 1);
    }
  });

  return child;
});

let isShuttingDown = false;

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

function shutdown(code) {
  isShuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill();
  }
  process.exit(code);
}
