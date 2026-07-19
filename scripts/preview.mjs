#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const viteCli = resolve(root, 'node_modules/vite/bin/vite.js');
const args = process.argv.slice(2);

console.log(`[preview] starting static server from ${root}`);
console.log(`[preview] loopback-only contract: pass --host 127.0.0.1 explicitly`);
console.log(`[preview] readiness endpoint: /health.json`);

const child = spawn(process.execPath, [viteCli, 'preview', ...args], {
  cwd: root,
  env: process.env,
  stdio: ['inherit', 'pipe', 'pipe'],
});

const forward = (stream, target) => {
  stream.on('data', (chunk) => {
    const text = chunk.toString();
    target.write(text);
    if (text.includes('Local:')) console.log('[preview] startup diagnostics: server reported Local URL');
  });
};
forward(child.stdout, process.stdout);
forward(child.stderr, process.stderr);

const stop = (signal) => {
  if (!child.killed) child.kill(signal);
};
process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));
child.on('exit', (code, signal) => {
  console.log(`[preview] stopped code=${code ?? 'null'} signal=${signal ?? 'none'}`);
  process.exit(code ?? 1);
});
