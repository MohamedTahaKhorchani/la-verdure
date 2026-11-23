#!/usr/bin/env node
/**
 * Build and assemble the final Windows release ZIP:
 *   release-final/La-Verdure-Windows-Final.zip
 *
 * Structure:
 *   La-Verdure-Windows-Final/
 *   ├── 1 - Installer/La Verdure Setup.exe   (if NSIS build succeeds)
 *   ├── 2 - Version portable/La Verdure/…
 *   ├── 3 - Images produits/… (172 files)
 *   ├── 4 - Guide/…
 *   ├── RELEASE_INFO.txt
 *   └── SHA256SUMS.txt
 */
import { createHash } from 'node:crypto'
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const picsSource = path.join(process.env.HOME || '', 'Downloads', 'pics')
const packagingImages = path.join(root, 'packaging', 'default-product-images')
const releaseDir = path.join(root, 'release')
const finalRoot = path.join(
  root,
  process.env.TFA_RELEASE_DIR || 'release-final-a5-two-up'
)
const stageName = process.env.TFA_RELEASE_STAGE_NAME || 'La-Verdure-Windows-Final-A5-Two-Up'
const stageDir = path.join(finalRoot, stageName)
const zipName = process.env.TFA_RELEASE_ZIP_NAME || 'La-Verdure-Windows-Final-A5-Two-Up.zip'
const zipPath = path.join(finalRoot, zipName)
const zipChecksumPath = path.join(finalRoot, `${zipName}.sha256`)

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif'])
const REQUIRED_SAMPLES = [
  '1_AIL.png',
  '53_GOMEO.png',
  '53_GRELOT.png',
  '62_BROCOLIS.png',
  '62_POIS_GOURMAND.png',
  '172_FRAISES.png',
  'T904_RAISIN_SANS_PEPINS.png',
]

function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true })
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name === '.DS_Store' || entry.name.startsWith('._')) continue
    const from = path.join(src, entry.name)
    const to = path.join(dest, entry.name)
    if (entry.isDirectory()) copyDir(from, to)
    else fs.copyFileSync(from, to)
  }
}

function sha256File(filePath) {
  const hash = createHash('sha256')
  hash.update(fs.readFileSync(filePath))
  return hash.digest('hex')
}

function listProductImages(dir) {
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .filter((name) => {
      if (name.startsWith('.') || name === 'README.txt' || name === 'product-images.json') return false
      return IMAGE_EXTS.has(path.extname(name).toLowerCase())
    })
    .sort((a, b) => a.localeCompare(b, 'fr'))
}

function validateSourceImages() {
  if (!fs.existsSync(picsSource)) {
    throw new Error(`Dossier images source introuvable: ${picsSource}`)
  }
  const files = listProductImages(picsSource)
  if (files.length !== 172) {
    throw new Error(`Attendu 172 images, trouvé ${files.length} dans ${picsSource}`)
  }
  for (const name of files) {
    const full = path.join(picsSource, name)
    const st = fs.statSync(full)
    if (!st.isFile() || st.size <= 0) throw new Error(`Image invalide ou vide: ${name}`)
    fs.accessSync(full, fs.constants.R_OK)
  }
  for (const sample of REQUIRED_SAMPLES) {
    if (!files.includes(sample)) throw new Error(`Image requise manquante: ${sample}`)
  }
  console.log('IMAGE_VALIDATION_OK', files.length)
  return files
}

function stageDefaultImages(files) {
  rmrf(packagingImages)
  fs.mkdirSync(packagingImages, { recursive: true })
  for (const name of files) {
    fs.copyFileSync(path.join(picsSource, name), path.join(packagingImages, name))
  }
  // Keep packaging folder free of mac junk
  const staged = listProductImages(packagingImages)
  if (staged.length !== 172) throw new Error(`Staging incomplet: ${staged.length}`)
  console.log('STAGED_DEFAULT_IMAGES', packagingImages, staged.length)
}

function writeGuideTxt(dest) {
  const body = `LA VERDURE — GUIDE UTILISATEUR
================================

Application hors ligne pour créer, imprimer et enregistrer
des affiches prix (A4 / A5, portrait / paysage).


1. INSTALLATION
---------------
1. Ouvrez le dossier « 1 - Installer ».
2. Double-cliquez sur « La Verdure Setup.exe ».
3. Suivez les étapes d’installation.
4. Lancez « La Verdure » depuis le Bureau ou le menu Démarrer.

Si Windows affiche un message « Éditeur inconnu » (SmartScreen) :
- cliquez sur « Informations complémentaires » ;
- puis sur « Exécuter quand même » ;
- uniquement si vous avez reçu ce package depuis une source de confiance.


2. PREMIER LANCEMENT
--------------------
Les 172 photos produits sont déjà incluses dans l’application.
Elles doivent apparaître automatiquement, sans import manuel.


3. RÉIMPORTATION DES IMAGES (si besoin)
---------------------------------------
1. Cliquez sur « Importer un dossier d’images ».
2. Sélectionnez le dossier « 3 - Images produits » fourni dans ce package
   (ou une copie sur une clé USB).
3. Attendez le résumé d’import.
4. Vérifiez que 172 images ont bien été associées.
5. Vous pouvez ensuite retirer la clé USB ou le dossier source :
   les photos restent enregistrées sur l’ordinateur.


4. CRÉER UNE AFFICHE
--------------------
1. Sélectionnez un produit dans la liste (ou utilisez la recherche).
2. Indiquez l’origine.
3. Choisissez « kilo » ou « pièce ».
4. Saisissez le prix (exemple : 1,95).
5. Choisissez le format A4 ou A5.
6. Choisissez portrait ou paysage.
7. Vérifiez l’aperçu à droite.


5. IMPRIMER
-----------
1. Cliquez sur « Imprimer ».
2. Choisissez l’imprimante Windows.
3. Vérifiez le format de papier et l’orientation.
4. Lancez l’impression.


6. ENREGISTRER EN PDF
---------------------
1. Cliquez sur « Enregistrer en PDF ».
2. Choisissez l’emplacement (Bureau, Documents…).
3. Enregistrez le fichier.


7. IMPRIMER DEUX AFFICHES A5 SUR UNE FEUILLE A4
-----------------------------------------------
1. Sélectionnez le format A5.
2. Choisissez l’orientation de l’affiche (portrait ou paysage).
3. Dans « Disposition PDF », sélectionnez
   « 2 affiches A5 sur une page A4 ».
4. Cliquez sur « Enregistrer en PDF ».
5. Enregistrez le fichier sur la clé USB.
6. Ouvrez le PDF sur l’ordinateur relié à l’imprimante.
7. Sélectionnez du papier A4.
8. Imprimez en « Taille réelle » ou à 100 %.
9. Ne sélectionnez pas l’option « Plusieurs pages par feuille ».
10. Découpez la feuille en suivant la ligne centrale.

Notes :
- « 1 affiche A5 » crée un PDF A5 normal (une seule affiche).
- Deux affiches A5 portrait créent un PDF A4 paysage.
- Deux affiches A5 paysage créent un PDF A4 portrait.


8. VERSION PORTABLE
-------------------
1. Ouvrez « 2 - Version portable / La Verdure ».
2. Double-cliquez sur « La Verdure.exe ».
Les données de la version portable sont enregistrées dans :
  %APPDATA%\\Top Fruit Affiches


9. DÉPANNAGE
------------
- Redémarrez l’application.
- Réimportez le dossier « 3 - Images produits ».
- Vérifiez le dossier de données :
  %APPDATA%\\Top Fruit Affiches
- Les photos importées se trouvent dans :
  %APPDATA%\\Top Fruit Affiches\\images produits
- Si une photo manque, utilisez « Importer un dossier d’images ».
- La désinstallation ne doit normalement pas supprimer vos données
  utilisateur (sauf option contraire choisie).


10. CONTENU DU PACKAGE
----------------------
1 - Installer …………… programme d’installation Windows
2 - Version portable ……… application sans installation
3 - Images produits ……… copie de secours des 172 photos
4 - Guide ………………… ce guide (texte et PDF)
RELEASE_INFO.txt ……… informations de version
SHA256SUMS.txt ……… sommes de contrôle des fichiers


Besoin d’aide : contactez la personne qui vous a fourni ce package.
`
  fs.writeFileSync(dest, body, 'utf8')
}

function writeGuidePdf(txtPath, pdfPath) {
  // Prefer cupsfilter / cups if available; otherwise a minimal text PDF.
  try {
    execSync(`cupsfilter -m application/pdf "${txtPath}" > "${pdfPath}"`, {
      shell: '/bin/bash',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    if (fs.existsSync(pdfPath) && fs.statSync(pdfPath).size > 100) {
      console.log('GUIDE_PDF_OK cupsfilter')
      return
    }
  } catch {
    /* fall through */
  }

  // Minimal single-page-ish PDF with escaped Latin-1 text (simple content stream).
  const text = fs.readFileSync(txtPath, 'utf8')
  const lines = text.split('\n').slice(0, 90)
  const escaped = lines
    .map((line) =>
      line
        .replace(/\\/g, '\\\\')
        .replace(/\(/g, '\\(')
        .replace(/\)/g, '\\)')
        .replace(/[^\x20-\x7E\u00C0-\u00FF]/g, '?')
    )
    .join('\n')

  // Build a very small multi-line PDF using Helvetica.
  const contentLines = ['BT', '/F1 9 Tf', '50 780 Td', '11 TL']
  for (const line of escaped.split('\n')) {
    contentLines.push(`(${line}) Tj`, 'T*')
  }
  contentLines.push('ET')
  const stream = contentLines.join('\n')
  const objects = []
  objects.push('1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n')
  objects.push('2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n')
  objects.push(
    '3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>endobj\n'
  )
  objects.push(`4 0 obj<< /Length ${Buffer.byteLength(stream, 'utf8')} >>stream\n${stream}\nendstream\nendobj\n`)
  objects.push('5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n')

  let pdf = '%PDF-1.4\n'
  const offsets = [0]
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'))
    pdf += obj
  }
  const xref = Buffer.byteLength(pdf, 'utf8')
  pdf += `xref\n0 ${objects.length + 1}\n`
  pdf += '0000000000 65535 f \n'
  for (let i = 1; i < offsets.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`
  }
  pdf += `trailer<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  fs.writeFileSync(pdfPath, pdf, 'utf8')
  console.log('GUIDE_PDF_OK minimal')
}

function writeReleaseInfo(dest, { nsisBuilt, portableExe, imageCount, testSummary }) {
  const today = new Date().toISOString().slice(0, 10)
  const body = `RELEASE_INFO — LA VERDURE
===========================

Product: La Verdure
Release type: Final Windows test release
Release name: La-Verdure-Windows-Final-A5-Two-Up
Status: Release candidate
Release date: ${today}
Version number: 1.0.0
Target architecture: Windows x64

Installer filename: ${nsisBuilt ? '1 - Installer/La Verdure Setup.exe' : '(non généré sur cette machine — voir limitations)'}
Portable executable location: 2 - Version portable/La Verdure/La Verdure.exe

Number of catalogue products: 172
Number of supplied product images: ${imageCount}
Bundled default images: 172
External recovery images: 172

New in this candidate:
- A5 PDF disposition: 1 affiche A5
- A5 PDF disposition: 2 affiches A5 sur une page A4
- Portrait A5 ×2 → A4 paysage sheet with vertical cut line
- Landscape A5 ×2 → A4 portrait sheet with horizontal cut line

Test summary:
${testSummary}

Build environment:
- Host OS: macOS (Apple Silicon)
- Toolchain: Electron ${execSync('node -p "require(\'./node_modules/electron/package.json\').version"', { cwd: root }).toString().trim()} + electron-builder
- Cross-compiled Windows x64 artifacts

Code-signing status: NOT SIGNED
Windows SmartScreen may show “Unknown publisher”. This is expected without a code-signing certificate.

Known limitations:
- This package was built on macOS. The .exe was not launched on Windows yet.
- No Windows code-signing certificate was available.
- No custom .ico was present in the project; the default Electron/builder icon is used.
- Application data folder remains: %APPDATA%\\Top Fruit Affiches (stable, intentional).

macOS PDF verification status: completed for A5 single + two-up exports (see release notes / test folder)
Windows build status: packaged on macOS
Windows runtime verification status: PENDING
Do not treat this ZIP as “Final verified release” until the Windows test plan has passed on a real PC.
`
  fs.writeFileSync(dest, body, 'utf8')
}

function findNsisInstaller() {
  const candidates = [
    path.join(releaseDir, 'La Verdure Setup.exe'),
    ...fs
      .readdirSync(releaseDir)
      .filter((f) => f.toLowerCase().endsWith('.exe') && f.toLowerCase().includes('setup'))
      .map((f) => path.join(releaseDir, f)),
  ]
  return candidates.find((p) => fs.existsSync(p)) || null
}

function main() {
  console.log('=== La Verdure Windows final release ===')

  const files = validateSourceImages()
  stageDefaultImages(files)

  console.log('→ npm test')
  execSync('npm test', { cwd: root, stdio: 'inherit' })

  console.log('→ npm run build')
  execSync('npm run build', { cwd: root, stdio: 'inherit' })

  console.log('→ electron-builder --win --x64')
  let nsisBuilt = false
  try {
    execSync('npx electron-builder --win --x64', {
      cwd: root,
      stdio: 'inherit',
      env: {
        ...process.env,
        CSC_IDENTITY_AUTO_DISCOVERY: 'false',
        WIN_CSC_LINK: '',
      },
    })
  } catch (error) {
    console.warn('FULL_WIN_BUILD_FAILED — retrying unpacked dir only')
    execSync('npx electron-builder --win --x64 --dir', {
      cwd: root,
      stdio: 'inherit',
      env: {
        ...process.env,
        CSC_IDENTITY_AUTO_DISCOVERY: 'false',
      },
    })
  }

  const winUnpacked = path.join(releaseDir, 'win-unpacked')
  if (!fs.existsSync(winUnpacked)) {
    throw new Error(`Dossier manquant: ${winUnpacked}`)
  }

  const exeCandidates = ['La Verdure.exe', 'Top Fruit Affiches.exe']
  let exeName = exeCandidates.find((n) => fs.existsSync(path.join(winUnpacked, n)))
  if (!exeName) {
    const found = fs.readdirSync(winUnpacked).filter((f) => f.endsWith('.exe'))
    throw new Error(`EXE introuvable. Trouvé: ${found.join(', ') || 'rien'}`)
  }
  // Normalize display name if builder used an older name
  if (exeName !== 'La Verdure.exe') {
    fs.renameSync(path.join(winUnpacked, exeName), path.join(winUnpacked, 'La Verdure.exe'))
    exeName = 'La Verdure.exe'
  }

  const nsisPath = findNsisInstaller()
  nsisBuilt = Boolean(nsisPath)
  console.log('NSIS', nsisBuilt ? nsisPath : 'MISSING')

  // Assemble release-final staging tree
  rmrf(stageDir)
  fs.mkdirSync(stageDir, { recursive: true })

  const installerDir = path.join(stageDir, '1 - Installer')
  const portableDir = path.join(stageDir, '2 - Version portable', 'La Verdure')
  const imagesDir = path.join(stageDir, '3 - Images produits')
  const guideDir = path.join(stageDir, '4 - Guide')
  fs.mkdirSync(installerDir, { recursive: true })
  fs.mkdirSync(path.dirname(portableDir), { recursive: true })
  fs.mkdirSync(imagesDir, { recursive: true })
  fs.mkdirSync(guideDir, { recursive: true })

  if (nsisBuilt) {
    fs.copyFileSync(nsisPath, path.join(installerDir, 'La Verdure Setup.exe'))
  } else {
    fs.writeFileSync(
      path.join(installerDir, 'LISEZ-MOI.txt'),
      `L’installateur NSIS n’a pas pu être généré sur cette machine macOS (Wine souvent requis).\n` +
        `Utilisez la version portable dans « 2 - Version portable »,\n` +
        `ou reconstruisez sur un PC Windows avec :\n\n` +
        `  npm run build\n` +
        `  npx electron-builder --win --x64\n`,
      'utf8'
    )
  }

  copyDir(winUnpacked, portableDir)
  if (!fs.existsSync(path.join(portableDir, 'La Verdure.exe'))) {
    throw new Error('Portable EXE manquant après copie')
  }

  // Ensure packaged defaults exist under resources for first-run seed
  const resDefaults = path.join(portableDir, 'resources', 'default-product-images')
  if (!fs.existsSync(resDefaults) || listProductImages(resDefaults).length !== 172) {
    console.warn('Portable resources defaults incomplete — copying staged images')
    rmrf(resDefaults)
    copyDir(packagingImages, resDefaults)
  }

  for (const name of files) {
    fs.copyFileSync(path.join(picsSource, name), path.join(imagesDir, name))
  }
  if (listProductImages(imagesDir).length !== 172) {
    throw new Error('Dossier 3 - Images produits incomplet')
  }

  const guideTxt = path.join(guideDir, 'GUIDE_UTILISATEUR.txt')
  const guidePdf = path.join(guideDir, 'GUIDE_UTILISATEUR.pdf')
  writeGuideTxt(guideTxt)
  writeGuidePdf(guideTxt, guidePdf)

  const testSummary = [
    '- npm test: executed during packaging (must pass)',
    '- npm run build: executed during packaging (must pass)',
    '- Image validation: 172 readable non-empty files',
    '- Required samples present (1, 53×2, 62×2, 172, T904)',
    '- A5 single + two-up PDF exports verified on macOS before packaging',
    '- Windows UI/runtime tests: NOT YET RUN',
  ].join('\n')

  writeReleaseInfo(path.join(stageDir, 'RELEASE_INFO.txt'), {
    nsisBuilt,
    portableExe: path.join(portableDir, 'La Verdure.exe'),
    imageCount: 172,
    testSummary,
  })

  // Internal checksums (contents)
  const sums = []
  const portableExe = path.join(portableDir, 'La Verdure.exe')
  sums.push(`${sha256File(portableExe)}  2 - Version portable/La Verdure/La Verdure.exe`)
  if (nsisBuilt) {
    sums.push(
      `${sha256File(path.join(installerDir, 'La Verdure Setup.exe'))}  1 - Installer/La Verdure Setup.exe`
    )
  }
  // Manifest of image set
  const imageManifestHash = createHash('sha256')
  for (const name of listProductImages(imagesDir)) {
    imageManifestHash.update(name)
    imageManifestHash.update('\0')
    imageManifestHash.update(fs.readFileSync(path.join(imagesDir, name)))
  }
  sums.push(`${imageManifestHash.digest('hex')}  3 - Images produits/ (aggregate of 172 files)`)
  sums.push(`${sha256File(guideTxt)}  4 - Guide/GUIDE_UTILISATEUR.txt`)
  if (fs.existsSync(guidePdf)) {
    sums.push(`${sha256File(guidePdf)}  4 - Guide/GUIDE_UTILISATEUR.pdf`)
  }
  fs.writeFileSync(path.join(stageDir, 'SHA256SUMS.txt'), sums.join('\n') + '\n', 'utf8')

  // Zip
  fs.mkdirSync(finalRoot, { recursive: true })
  rmrf(zipPath)
  execSync(`zip -ry "${zipPath}" "${stageName}"`, { cwd: finalRoot, stdio: 'inherit' })

  const zipHash = sha256File(zipPath)
  fs.writeFileSync(zipChecksumPath, `${zipHash}  ${zipName}\n`, 'utf8')


  const zipSize = fs.statSync(zipPath).size
  console.log('ZIP_OK', zipPath)
  console.log('ZIP_BYTES', zipSize)
  console.log('ZIP_SHA256', zipHash)
  console.log('NSIS_INCLUDED', nsisBuilt)
  console.log('STRUCTURE_OK')
}

main()
