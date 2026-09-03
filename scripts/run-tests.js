#!/usr/bin/env node
// Local `npm test` convenience wrapper — CI (.github/workflows/ci.yml) calls
// `npx ng test` directly and never goes through this, so nothing here can
// ever affect it. Exists purely to fix a real, concrete piece of local-dev
// friction: Karma's ChromeHeadless launcher looks for an actual chrome.exe
// by default and fails outright ("Cannot find the binary... Please set env
// variable CHROME_BIN") on a Windows machine that only has Edge installed,
// rather than falling back to any other Chromium browser — caught firsthand
// while working in this repo. Edge is Chromium-based and works identically
// with karma-chrome-launcher's ChromeHeadless launcher, so this just points
// CHROME_BIN at it when nothing better is already available.
//
// Respects an explicit CHROME_BIN the caller already set (never overrides
// it), prefers a real Chrome install if one exists, and only ever looks for
// a fallback on win32 — every other platform (including CI's own
// ubuntu-latest runners, which ship Chrome preinstalled) is completely
// unaffected. Any extra args (`npm test -- --watch=false`) pass straight
// through to `ng test` unchanged.
const { spawnSync } = require('node:child_process');
const { existsSync } = require('node:fs');

function findWindowsChromeBin() {
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA ? `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe` : null,
    // Edge fallback — only tried once no real Chrome install was found.
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
  ];
  return candidates.find(path => path && existsSync(path));
}

const env = { ...process.env };
if (!env.CHROME_BIN && process.platform === 'win32') {
  const found = findWindowsChromeBin();
  if (found) {
    env.CHROME_BIN = found;
    console.log(`[run-tests] CHROME_BIN not set — using ${found}`);
  }
}

const result = spawnSync('npx', ['ng', 'test', ...process.argv.slice(2)], {
  env,
  stdio: 'inherit',
  shell: true
});
process.exit(result.status ?? 1);
