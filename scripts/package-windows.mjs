#!/usr/bin/env node
/**
 * Build portable Windows x64 release:
 *   TopFruitAffiches.zip
 *   └── Top-Fruit-Affiches/
 *       ├── Top Fruit Affiches.exe
 *       ├── images produits/README.txt
 *       └── …
 */
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const releaseDir = path.join(root, 'release')
const winUnpacked = path.join(releaseDir, 'win-unpacked')
const stagedName = 'Top-Fruit-Affiches'
const stagedDir = path.join(releaseDir, stagedName)
const zipPath = path.join(releaseDir, 'TopFruitAffiches.zip')
const imagesDirName = 'images produits'
const exeName = 'Top Fruit Affiches.exe'

const README = `IMAGES PRODUITS

Placez ici les photos de vos fruits et légumes.

Le nom du fichier doit commencer par le code produit.

Exemples :

1.png
001_AIL.png
43_TOMATE_COCKTAIL.jpg
134_ORANGE_A_JUS.webp

Formats acceptés : PNG, JPG, JPEG, WEBP, GIF.
`

function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true })
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name)
    const to = path.join(dest, entry.name)
    if (entry.isDirectory()) copyDir(from, to)
    else fs.copyFileSync(from, to)
  }
}

console.log('→ npm run build')
execSync('npm run build', { cwd: root, stdio: 'inherit' })

console.log('→ electron-builder --win --x64 --dir')
execSync('npx electron-builder --win --x64 --dir', {
  cwd: root,
  stdio: 'inherit',
  env: {
    ...process.env,
    CSC_IDENTITY_AUTO_DISCOVERY: 'false',
  },
})

if (!fs.existsSync(winUnpacked)) {
  throw new Error(`Dossier manquant: ${winUnpacked}`)
}

if (!fs.existsSync(path.join(winUnpacked, exeName))) {
  const found = fs.readdirSync(winUnpacked).filter((f) => f.endsWith('.exe'))
  throw new Error(`EXE introuvable (${exeName}). Trouvé: ${found.join(', ') || 'rien'}`)
}

rmrf(stagedDir)
copyDir(winUnpacked, stagedDir)

const imagesDir = path.join(stagedDir, imagesDirName)
fs.mkdirSync(imagesDir, { recursive: true })
for (const entry of fs.readdirSync(imagesDir)) {
  if (entry !== 'README.txt') {
    fs.rmSync(path.join(imagesDir, entry), { recursive: true, force: true })
  }
}
fs.writeFileSync(path.join(imagesDir, 'README.txt'), README, 'utf8')

rmrf(zipPath)
rmrf(path.join(releaseDir, 'VerdureFinal.zip'))
rmrf(path.join(releaseDir, 'Top-Fruit-Affiches-Windows.zip'))

console.log('→ zip', zipPath)
execSync(`zip -ry "${zipPath}" "${stagedName}"`, { cwd: releaseDir, stdio: 'inherit' })

const size = fs.statSync(zipPath).size
const mb = (size / (1024 * 1024)).toFixed(1)
console.log('OK', zipPath)
console.log('SIZE_BYTES', size)
console.log('SIZE_MB', mb)

const must = [path.join(stagedDir, exeName), path.join(imagesDir, 'README.txt')]
for (const p of must) {
  if (!fs.existsSync(p)) throw new Error(`Structure invalide, manquant: ${p}`)
}
console.log('STRUCTURE_OK')
