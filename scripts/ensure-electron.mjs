#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'

const require = createRequire(import.meta.url)
const electronDir = path.dirname(require.resolve('electron/package.json'))
const version = JSON.parse(fs.readFileSync(path.join(electronDir, 'package.json'), 'utf8')).version
const binary = path.join(electronDir, 'dist/Electron.app/Contents/MacOS/Electron')
const pathTxt = path.join(electronDir, 'path.txt')

fs.writeFileSync(pathTxt, 'Electron.app/Contents/MacOS/Electron')

if (fs.existsSync(binary)) {
  console.log('Electron already present:', binary)
  process.exit(0)
}

const cacheDir = path.resolve('.cache/electron')
const zip = path.join(cacheDir, `electron-v${version}-darwin-arm64.zip`)
fs.mkdirSync(cacheDir, { recursive: true })

if (!fs.existsSync(zip)) {
  const url = `https://github.com/electron/electron/releases/download/v${version}/electron-v${version}-darwin-arm64.zip`
  console.log('Downloading', url)
  execFileSync('curl', ['-L', '--fail', '-o', zip, url], { stdio: 'inherit' })
}

const dist = path.join(electronDir, 'dist')
fs.mkdirSync(dist, { recursive: true })
execFileSync('unzip', ['-qo', zip, '-d', dist], { stdio: 'inherit' })
fs.writeFileSync(path.join(dist, 'version'), version)
console.log('Electron ready')
