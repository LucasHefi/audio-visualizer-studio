#!/usr/bin/env node

const base = (process.argv.find((arg) => arg.startsWith('--base='))?.slice(7) ?? 'http://127.0.0.1:4174').replace(/\/$/, '');
const extraPath = process.argv.find((arg) => arg.startsWith('--path='))?.slice(7);
const expectUnhealthy = process.argv.includes('--expect-unhealthy');

const fetchText = async (path) => {
  const response = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(5000) });
  return { response, text: await response.text() };
};

const failures = [];
const probe = async (path, label, expectedStatus = 200, expectAsset = false) => {
  try {
    const { response, text } = await fetchText(path);
    if (response.status !== expectedStatus) failures.push(`${label}: HTTP ${response.status}, expected ${expectedStatus}`);
    if (expectAsset && response.ok && response.headers.get('content-type')?.includes('text/html')) {
      failures.push(`${label}: HTML SPA fallback returned for an asset path`);
    }
    return { response, text };
  } catch (error) {
    failures.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
};

const healthResult = await probe('/health.json', 'health endpoint');
if (healthResult?.response.ok) {
  try {
    const health = JSON.parse(healthResult.text);
    if (health.status !== 'ok' || health.readiness !== 'ready') failures.push('health endpoint: status/readiness is not ok/ready');
    else console.log(`HEALTH PASS status=${health.status} readiness=${health.readiness}`);
  } catch {
    failures.push('health endpoint: invalid JSON');
  }
}

const indexResult = await probe('/', 'application root');
if (indexResult?.response.ok) {
  if (!indexResult.text.includes('Audio Visualizer Studio')) failures.push('application root: expected app title missing');
  const assets = [...indexResult.text.matchAll(/(?:src|href)="(\/assets\/[^"?#]+)(?:[?#][^"]*)?"/g)].map((match) => match[1]);
  for (const asset of [...new Set(assets)]) await probe(asset, `asset ${asset}`, 200, true);
  console.log(`APPLICATION PASS assets=${new Set(assets).size}`);
}

if (extraPath) await probe(extraPath, `explicit probe ${extraPath}`, 200, extraPath.startsWith('/assets/'));

if (expectUnhealthy) {
  if (failures.length === 0) {
    console.error('UNHEALTHY probe FAIL: the probe unexpectedly stayed healthy');
    process.exit(1);
  }
  console.log(`UNHEALTHY probe PASS failures=${failures.length}`);
  for (const failure of failures) console.log(`  ${failure}`);
  process.exit(0);
}

if (failures.length > 0) {
  console.error('READINESS FAIL');
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}

console.log(`READINESS PASS base=${base}`);
