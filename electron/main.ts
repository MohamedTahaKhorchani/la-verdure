import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  shell,
  protocol,
} from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  archiveProduct,
  backupDatabase,
  buildReviewReport,
  closeDatabase,
  createProduct,
  deleteProduct,
  exportProductsCsv,
  getCategories,
  getDb,
  getPaths,
  getProduct,
  initDatabase,
  listProducts,
  reactivateProduct,
  reopenAfterRestore,
  updateProduct,
} from './database'
import { buildPrintHtml, buildAffichePdfFilename, metricsForFormat, parseDisplayPrice, toRenderModel } from '../shared/print-layout'
import {
  PRODUCT_IMAGES_DIR_NAME,
  buildPreferredImageFilename,
  computeImageStatus,
  copyImageAtomic,
  filesAreByteIdentical,
  hasValidAssignedPhoto,
  isExternalProductImagePath,
  isSupportedImageFile,
  listImageFiles,
  manifestKey,
  planImageScan,
  readProductImagesManifest,
  relativeImageRef,
  uniqueBackupPath,
  uniqueDestinationPath,
  writeProductImagesManifest,
} from '../shared/image-scan'
import type {
  AfficheItem,
  DuplicateResolveChoice,
  ImageImportResult,
  ImageImportSummary,
  ImageScanResult,
  PathsInfo,
  PrintRequest,
  Product,
  ProductFilters,
  ProductInput,
  SellingUnit,
} from '../shared/types'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** Keep Windows/Mac userData stable across EXE display-name changes. */
const STABLE_USER_DATA_DIR = 'Top Fruit Affiches'
try {
  app.setPath('userData', path.join(app.getPath('appData'), STABLE_USER_DATA_DIR))
} catch {
  // setPath may fail if called too late in some environments; resolvePaths still uses getPath('userData')
}

/** Folder chosen for “Importer des photos” awaiting Conserver/Remplacer. */
let pendingImportFolder: string | null = null

const IMPORT_IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp'])

process.env.DIST = path.join(__dirname, '../dist')
process.env.VITE_PUBLIC = app.isPackaged
  ? process.env.DIST
  : path.join(__dirname, '../public')

let mainWindow: BrowserWindow | null = null
let printWindow: BrowserWindow | null = null

const PRODUCT_IMAGES_README = `IMAGES PRODUITS

Placez ici les photos de vos fruits et légumes.

Le nom du fichier doit commencer par le code produit.

Exemples :

1.png
001_AIL.png
43_TOMATE_COCKTAIL.jpg
134_ORANGE_A_JUS.webp

Ensuite, ouvrez l’application et cliquez sur :
“Importer un dossier d’images”

L’application associera automatiquement chaque image au produit ayant le même code.

Formats acceptés : PNG, JPG, JPEG, WEBP, GIF.
`

/**
 * Folder containing the portable EXE (or project root in development).
 * Used for bundled/fallback "images produits" next to the app.
 */
function resolveAppRoot(): string {
  if (process.env.TFA_PORTABLE_ROOT) {
    return path.resolve(process.env.TFA_PORTABLE_ROOT)
  }
  if (app.isPackaged) {
    return path.dirname(process.execPath)
  }
  return path.join(__dirname, '..')
}

function resolvePaths(): PathsInfo {
  const userData = app.getPath('userData')
  const resourcesPath = app.isPackaged
    ? process.resourcesPath
    : path.join(__dirname, '../resources')
  const appRoot = resolveAppRoot()
  // Writable persistent destination (Windows: %APPDATA%\Top Fruit Affiches\images produits)
  const productImagesDir = path.join(userData, PRODUCT_IMAGES_DIR_NAME)
  // Optional bundled/portable sibling folder (fallback lookup only)
  const bundledProductImagesDir = path.join(appRoot, PRODUCT_IMAGES_DIR_NAME)
  // Packaged defaults (electron-builder extraResources → resources/default-product-images)
  const defaultProductImagesDir = path.join(resourcesPath, 'default-product-images')

  return {
    userData,
    database: path.join(userData, 'top-fruit.sqlite'),
    backups: path.join(userData, 'backups'),
    images: path.join(userData, 'product-images'),
    placeholders: path.join(resourcesPath, 'placeholders'),
    productImagesDir,
    bundledProductImagesDir,
    defaultProductImagesDir,
    appRoot,
  }
}

function productImagesManifestPath(info: PathsInfo = getPaths()): string {
  return path.join(info.productImagesDir, 'product-images.json')
}

function ensureProductImagesFolder(dir: string): void {
  fs.mkdirSync(dir, { recursive: true })
  const readme = path.join(dir, 'README.txt')
  if (!fs.existsSync(readme)) {
    fs.writeFileSync(readme, PRODUCT_IMAGES_README, 'utf8')
  }
}

/**
 * First-run / recovery: copy packaged default images into writable userData
 * without overwriting any existing user-managed files, then associate them.
 */
function seedDefaultProductImagesIfNeeded(): void {
  const info = getPaths()
  ensureProductImagesFolder(info.productImagesDir)

  const existing = listImageFiles(info.productImagesDir)
  if (existing.length === 0) {
    const sources = [info.defaultProductImagesDir, info.bundledProductImagesDir]
    for (const source of sources) {
      if (!source || !fs.existsSync(source)) continue
      const files = listImageFiles(source)
      if (files.length === 0) continue
      for (const file of files) {
        const dest = path.join(info.productImagesDir, path.basename(file))
        if (fs.existsSync(dest)) continue
        try {
          fs.copyFileSync(file, dest)
        } catch (error) {
          console.warn('DEFAULT_IMAGE_COPY_SKIP', path.basename(file), error)
        }
      }
      break
    }
  }

  // Associate placeholders with available userData images (never overwrites assigned photos).
  try {
    if (listImageFiles(info.productImagesDir).length > 0 && countWithoutValidImage() > 0) {
      const result = scanProductImagesFolder()
      console.log('DEFAULT_IMAGES_ASSOCIATED', {
        automaticAssignments: result.automaticAssignments,
        unmatched: result.unmatchedImages.length,
        pendingDuplicates: result.pendingDuplicates.length,
      })
    }
  } catch (error) {
    console.warn('DEFAULT_IMAGES_ASSOCIATE_SKIP', error)
  }
}

function resolveAbsoluteImagePath(imagePath: string | null): string | null {
  if (!imagePath) return null
  const info = getPaths()
  if (path.isAbsolute(imagePath)) return imagePath
  const normalized = imagePath.replace(/\\/g, '/')
  if (normalized.startsWith('placeholders')) {
    return path.join(info.placeholders, path.basename(imagePath))
  }
  if (isExternalProductImagePath(imagePath)) {
    const rel = normalized
      .replace(/^images produits\/?/, '')
      .replace(/^images-produits\/?/, '')
    // 1) user-data imported images
    const inUserData = path.join(info.productImagesDir, rel)
    if (fs.existsSync(inUserData)) return inUserData
    // 2) packaged default images (resources/default-product-images)
    const inDefaults = path.join(info.defaultProductImagesDir, rel)
    if (fs.existsSync(inDefaults)) return inDefaults
    // 3) bundled / portable sibling folder next to the EXE
    const inBundled = path.join(info.bundledProductImagesDir, rel)
    if (fs.existsSync(inBundled)) return inBundled
    // Prefer user-data path for missing files (import destination)
    return inUserData
  }
  return path.join(info.userData, imagePath)
}

/** In-memory cache: avoid re-reading/encoding 1–2 MB PNGs on every preview IPC. */
const imageDataUrlCache = new Map<string, { mtimeMs: number; dataUrl: string }>()

function resolveImageSrc(imagePath: string | null): string | null {
  const absolute = resolveAbsoluteImagePath(imagePath)
  if (!absolute || !fs.existsSync(absolute)) return null
  try {
    const st = fs.statSync(absolute)
    const cached = imageDataUrlCache.get(absolute)
    if (cached && cached.mtimeMs === st.mtimeMs) return cached.dataUrl
  } catch {
    /* fall through */
  }
  const ext = path.extname(absolute).toLowerCase()
  const mime =
    ext === '.png'
      ? 'image/png'
      : ext === '.jpg' || ext === '.jpeg'
        ? 'image/jpeg'
        : ext === '.webp'
          ? 'image/webp'
          : ext === '.gif'
            ? 'image/gif'
            : 'image/svg+xml'
  const buf = fs.readFileSync(absolute)
  const dataUrl = `data:${mime};base64,${buf.toString('base64')}`
  try {
    const st = fs.statSync(absolute)
    imageDataUrlCache.set(absolute, { mtimeMs: st.mtimeMs, dataUrl })
  } catch {
    /* ignore cache write */
  }
  return dataUrl
}

/** Prefer file:// for print/PDF temp HTML (avoids multi-MB base64 documents). */
function resolveImageSrcForPrint(imagePath: string | null): string | null {
  const absolute = resolveAbsoluteImagePath(imagePath)
  if (!absolute || !fs.existsSync(absolute)) return null
  return pathToFileURL(absolute).href
}

function enrichProduct(
  product: Product,
  options: { includePreview?: boolean } = {}
): Product {
  const absolute = resolveAbsoluteImagePath(product.imagePath)
  const exists = Boolean(absolute && fs.existsSync(absolute))
  const imageStatus = computeImageStatus(product, exists)
  // Never base64-encode all catalogue images during list loads — that was the main lag source.
  const imagePreview =
    options.includePreview && exists ? resolveImageSrc(product.imagePath) : null
  return { ...product, imageStatus, imagePreview }
}

function listEnrichedProducts(filters: ProductFilters = {}): Product[] {
  let list = listProducts(filters).map((p) => enrichProduct(p, { includePreview: false }))
  if (filters.withoutValidImage) {
    list = list.filter((p) => !hasValidAssignedPhoto(p.imageStatus ?? 'missing'))
  }
  return list
}

function countWithoutValidImage(): number {
  return listEnrichedProducts({ activeOnly: true, withoutValidImage: true }).length
}

function emptyScanExtras(): Pick<
  ImageScanResult,
  | 'automaticAssignments'
  | 'pendingDuplicates'
  | 'skippedExisting'
  | 'duplicateCodeWarnings'
> {
  return {
    automaticAssignments: 0,
    pendingDuplicates: [],
    skippedExisting: [],
    duplicateCodeWarnings: [],
  }
}

function scanProductImagesFolder(): ImageScanResult {
  const info = getPaths()
  ensureProductImagesFolder(info.productImagesDir)
  const errors: string[] = []
  const files = listImageFiles(info.productImagesDir)
  const products = listProducts({ includeArchived: true })
  const plan = planImageScan(files, products, info.productImagesDir)

  const updatedIds = new Set<number>()
  for (const assignment of plan.autoAssignments) {
    const ref = relativeImageRef(info.productImagesDir, assignment.file)
    try {
      updateProduct(assignment.productId, {
        imagePath: ref,
        imageSource: `Dossier images produits · ${path.basename(assignment.file)}`,
        imageIsPlaceholder: false,
      })
      updatedIds.add(assignment.productId)
    } catch (error) {
      errors.push(
        error instanceof Error ? error.message : `Échec mise à jour produit #${assignment.productId}`
      )
    }
  }

  const pendingDuplicates = plan.pendingDuplicates.map((d, index) => ({
    key: `${d.code}::${path.basename(d.file)}::${index}`,
    file: path.basename(d.file),
    code: d.code,
    relativePath: d.relativePath,
    preview: resolveImageSrc(d.relativePath),
    candidates: d.candidates,
  }))

  const after = listEnrichedProducts({ activeOnly: true })
  const productsWithoutImage = after
    .filter((p) => !hasValidAssignedPhoto(p.imageStatus ?? 'missing'))
    .map((p) => ({ id: p.id, storeCode: p.storeCode, name: p.name }))

  return {
    imagesFolder: info.productImagesDir,
    imagesFound: files.length,
    productsUpdated: updatedIds.size,
    updatedProductIds: [...updatedIds],
    automaticAssignments: updatedIds.size,
    pendingDuplicates,
    skippedExisting: plan.skippedExisting,
    productsWithoutImage,
    unmatchedImages: plan.unmatchedImages,
    duplicateCodeWarnings: pendingDuplicates.map((d) => ({
      code: d.code,
      names: d.candidates.map((c) => c.name),
      ids: d.candidates.map((c) => c.id),
    })),
    errors,
  }
}

function applyDuplicateChoices(choices: DuplicateResolveChoice[]): ImageScanResult {
  const info = getPaths()
  const errors: string[] = []
  const updatedIds = new Set<number>()

  for (const choice of choices) {
    if (!choice.productIds.length) continue
    // key format: code::filename::index — recover relative path from pending isn't stored;
    // relative path is passed as choice key payload... we'll look up file in images folder by basename
    const parts = choice.key.split('::')
    const basename = parts[1]
    if (!basename) {
      errors.push(`Décision invalide: ${choice.key}`)
      continue
    }
    const files = listImageFiles(info.productImagesDir)
    const match = files.find((f) => path.basename(f) === basename)
    if (!match) {
      errors.push(`Image introuvable pour ${basename}`)
      continue
    }
    const ref = relativeImageRef(info.productImagesDir, match)
    for (const productId of choice.productIds) {
      try {
        updateProduct(productId, {
          imagePath: ref,
          imageSource: `Dossier images produits · ${basename} (choix manuel)`,
          imageIsPlaceholder: false,
        })
        updatedIds.add(productId)
      } catch (error) {
        errors.push(
          error instanceof Error ? error.message : `Échec attribution produit #${productId}`
        )
      }
    }
  }

  const after = listEnrichedProducts({ activeOnly: true })
  return {
    imagesFolder: info.productImagesDir,
    imagesFound: 0,
    productsUpdated: updatedIds.size,
    updatedProductIds: [...updatedIds],
    ...emptyScanExtras(),
    productsWithoutImage: after
      .filter((p) => !hasValidAssignedPhoto(p.imageStatus ?? 'missing'))
      .map((p) => ({ id: p.id, storeCode: p.storeCode, name: p.name })),
    unmatchedImages: [],
    errors,
  }
}

function listImportableImages(folder: string): string[] {
  return listImageFiles(folder).filter((f) =>
    IMPORT_IMAGE_EXTS.has(path.extname(f).toLowerCase())
  )
}

function isReadableImageFile(filePath: string): boolean {
  try {
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return false
    if (!isSupportedImageFile(filePath)) return false
    const buf = fs.readFileSync(filePath)
    if (buf.length < 24) return false
    // Reject obvious non-images (HTML/text) without needing sharp.
    const head = buf.subarray(0, 16).toString('utf8').toLowerCase()
    if (head.includes('<!doctype') || head.includes('<html')) return false
    return true
  } catch {
    return false
  }
}

/**
 * Copy matched source into userData images folder under CODE_PRODUCT_NAME.ext.
 * Returns relative ref + whether a new copy was written / identical skip.
 */
function ensureImageInProductFolder(
  srcFile: string,
  product: Product,
  options: { replaceExisting: boolean } = { replaceExisting: false }
): { ref: string; copied: boolean; unchangedIdentical: boolean } {
  const info = getPaths()
  ensureProductImagesFolder(info.productImagesDir)
  const normalizedRoot = path.resolve(info.productImagesDir)
  const normalizedSrc = path.resolve(srcFile)
  if (
    normalizedSrc === normalizedRoot ||
    normalizedSrc.startsWith(normalizedRoot + path.sep)
  ) {
    return {
      ref: relativeImageRef(info.productImagesDir, normalizedSrc),
      copied: false,
      unchangedIdentical: true,
    }
  }
  const ext = path.extname(srcFile) || '.png'
  const preferred = buildPreferredImageFilename(product.storeCode, product.name, ext)
  const dest = path.join(info.productImagesDir, preferred)

  if (fs.existsSync(dest) && filesAreByteIdentical(srcFile, dest)) {
    return {
      ref: relativeImageRef(info.productImagesDir, dest),
      copied: false,
      unchangedIdentical: true,
    }
  }

  if (fs.existsSync(dest) && !options.replaceExisting) {
    // Keep existing dest file; still point product at it if needed.
    // Caller decides replace via plan; if we land here without replace, use unique name only when forced.
    const unique = uniqueDestinationPath(info.productImagesDir, preferred)
    if (unique !== dest) {
      copyImageAtomic(srcFile, unique)
      return {
        ref: relativeImageRef(info.productImagesDir, unique),
        copied: true,
        unchangedIdentical: false,
      }
    }
  }

  copyImageAtomic(srcFile, dest)
  return {
    ref: relativeImageRef(info.productImagesDir, dest),
    copied: true,
    unchangedIdentical: false,
  }
}

function runImageImport(
  sourceFolder: string,
  replaceExisting: boolean,
  options: { confirmIfConflicts?: boolean } = {}
): ImageImportResult {
  const info = getPaths()
  ensureProductImagesFolder(info.productImagesDir)
  const allFiles = listImportableImages(sourceFolder)
  const invalidFiles: string[] = []
  const files: string[] = []
  for (const f of allFiles) {
    if (isReadableImageFile(f)) files.push(f)
    else invalidFiles.push(path.basename(f))
  }

  const products = listProducts({ includeArchived: true })
  const activeProducts = products.filter((p) => p.isActive)
  const dryPlan = planImageScan(files, products, info.productImagesDir, {
    replaceExisting: false,
  })

  if (options.confirmIfConflicts && dryPlan.skippedExisting.length > 0) {
    return {
      phase: 'needs_confirm',
      selectedFolder: sourceFolder,
      imagesFound: files.length,
      conflictCount: dryPlan.skippedExisting.length,
      message: 'Certains produits ont déjà une photo. Voulez-vous les remplacer ?',
    }
  }

  const plan = planImageScan(files, products, info.productImagesDir, { replaceExisting })
  let associated = 0
  let replaced = 0
  let copied = 0
  let unchangedIdentical = 0
  const collisions: Array<{ file: string; code: string; productName: string }> = []
  const errors: string[] = []
  const byId = new Map(products.map((p) => [p.id, p]))
  const claimedInThisPass = new Set<number>()
  const manifest = readProductImagesManifest(productImagesManifestPath(info))

  for (const assignment of plan.autoAssignments) {
    const product = byId.get(assignment.productId)
    if (!product) continue
    if (claimedInThisPass.has(product.id)) {
      collisions.push({
        file: path.basename(assignment.file),
        code: assignment.code,
        productName: product.name,
      })
      continue
    }
    const hadPhoto = !product.imageIsPlaceholder && Boolean(product.imagePath)
    try {
      const result = ensureImageInProductFolder(assignment.file, product, { replaceExisting })
      updateProduct(assignment.productId, {
        imagePath: result.ref,
        imageSource: `Import dossier · ${path.basename(assignment.file)}`,
        imageIsPlaceholder: false,
      })
      claimedInThisPass.add(product.id)
      associated += 1
      if (result.copied) copied += 1
      if (result.unchangedIdentical) unchangedIdentical += 1
      if (replaceExisting && hadPhoto && result.copied) replaced += 1
      const key = manifestKey(product.storeCode, product.name)
      manifest[key] = path.basename(result.ref)
    } catch (error) {
      errors.push(
        error instanceof Error
          ? `${path.basename(assignment.file)}: ${error.message}`
          : `Échec copie ${path.basename(assignment.file)}`
      )
    }
  }

  try {
    writeProductImagesManifest(productImagesManifestPath(info), manifest)
  } catch (error) {
    errors.push(
      error instanceof Error ? `Manifeste: ${error.message}` : 'Échec écriture manifeste'
    )
  }

  const after = listEnrichedProducts({ activeOnly: true })
  const missingProducts = after
    .filter((p) => !hasValidAssignedPhoto(p.imageStatus ?? 'missing'))
    .map((p) => ({ storeCode: p.storeCode, name: p.name }))

  const keptExisting = replaceExisting ? 0 : dryPlan.skippedExisting.length
  const ambiguousMatches = plan.pendingDuplicates.map((d) => ({
    file: path.basename(d.file),
    code: d.code,
    candidates: d.candidates.map((c) => `${c.storeCode} | ${c.name}`),
  }))

  const summary: ImageImportSummary = {
    phase: 'done',
    selectedFolder: sourceFolder,
    imagesFound: files.length,
    catalogueProducts: activeProducts.length,
    associated,
    copied,
    unchangedIdentical,
    unmatched: plan.unmatchedImages.length + invalidFiles.length + ambiguousMatches.length,
    skippedExisting: keptExisting,
    replaced,
    missingProducts,
    unmatchedFiles: plan.unmatchedImages,
    ambiguousMatches,
    collisions,
    invalidFiles,
    errors,
  }

  console.log('IMAGE_IMPORT_REPORT', JSON.stringify(summary, null, 2))
  return summary
}

async function selectProductImageFolderDialog(): Promise<string> {
  const pick = await dialog.showOpenDialog(mainWindow!, {
    title: 'Choisir un dossier d’images produits',
    properties: ['openDirectory'],
  })
  if (pick.canceled || !pick.filePaths[0]) {
    throw new Error('Sélection annulée')
  }
  return pick.filePaths[0]
}

async function importProductImagesFlow(options?: {
  replaceExisting?: boolean
  folderPath?: string
}): Promise<ImageImportResult> {
  const replaceExisting = options?.replaceExisting
  const explicitFolder =
    (options?.folderPath && options.folderPath.trim()) ||
    (process.env.TFA_IMPORT_FOLDER && process.env.TFA_IMPORT_FOLDER.trim()) ||
    null

  if (replaceExisting === undefined) {
    const folder = explicitFolder || (await selectProductImageFolderDialog())
    if (explicitFolder) {
      // Dev/test path: never persist as production default; just use once.
      pendingImportFolder = folder
    } else {
      pendingImportFolder = folder
    }
    const preview = runImageImport(pendingImportFolder, false, { confirmIfConflicts: true })
    if (preview.phase === 'needs_confirm') {
      return preview
    }
    pendingImportFolder = null
    return preview
  }

  if (!pendingImportFolder) {
    throw new Error('Aucun dossier d’import en cours. Recommencez l’import.')
  }
  const folder = pendingImportFolder
  pendingImportFolder = null
  return runImageImport(folder, replaceExisting, { confirmIfConflicts: false })
}

async function copyPickedImageToProductFolder(productId: number): Promise<Product> {
  const product = getProduct(productId)
  if (!product) throw new Error('Produit introuvable')
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: 'Choisir une image pour ce produit',
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
  })
  if (result.canceled || !result.filePaths[0]) {
    throw new Error('Sélection annulée')
  }
  const src = result.filePaths[0]
  const ext = path.extname(src).toLowerCase()
  if (!isSupportedImageFile(src)) {
    throw new Error('Format non supporté. Utilisez PNG, JPG, JPEG, WEBP ou GIF.')
  }
  const info = getPaths()
  ensureProductImagesFolder(info.productImagesDir)
  const preferred = buildPreferredImageFilename(product.storeCode, product.name, ext || '.png')
  const dest = uniqueDestinationPath(info.productImagesDir, preferred)
  try {
    copyImageAtomic(src, dest)
  } catch {
    throw new Error(
      `Impossible de copier l’image vers le dossier « ${PRODUCT_IMAGES_DIR_NAME} ». Vérifiez les droits d’écriture.`
    )
  }
  const ref = relativeImageRef(info.productImagesDir, dest)
  const updated = updateProduct(productId, {
    imagePath: ref,
    imageSource: `Choix manuel · ${path.basename(dest)}`,
    imageIsPlaceholder: false,
  })
  return enrichProduct(updated, { includePreview: true })
}

function createMainWindow(): void {
  const preloadCandidates = [
    path.join(__dirname, 'preload.mjs'),
    path.join(__dirname, 'preload.js'),
    path.join(__dirname, 'preload.cjs'),
  ]
  const preload = preloadCandidates.find((p) => fs.existsSync(p))
  if (!preload) {
    throw new Error(`Preload introuvable dans ${__dirname}`)
  }

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 1024,
    minHeight: 700,
    title: 'La Verdure',
    backgroundColor: '#f4f7f0',
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(process.env.DIST!, 'index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

async function ensurePrintWindow(): Promise<BrowserWindow> {
  if (printWindow && !printWindow.isDestroyed()) return printWindow
  printWindow = new BrowserWindow({
    show: false,
    width: 900,
    height: 1200,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // Needed so print HTML can load local temp files reliably on macOS/Windows.
      webSecurity: true,
    },
  })
  printWindow.on('closed', () => {
    printWindow = null
  })
  return printWindow
}

/**
 * Load print/PDF HTML via a temp file (not a data: URL).
 * Large product photos (base64) blow past Chromium data-URL limits and break
 * Imprimer / Enregistrer en PDF after image import.
 */
async function loadHtmlIntoPrintWindow(win: BrowserWindow, html: string): Promise<string> {
  const dir = path.join(app.getPath('temp'), 'top-fruit-print')
  fs.mkdirSync(dir, { recursive: true })
  const htmlPath = path.join(dir, `affiche-${Date.now()}-${process.pid}.html`)
  fs.writeFileSync(htmlPath, html, 'utf8')

  try {
    await win.loadURL(pathToFileURL(htmlPath).href)
  } catch (error) {
    cleanupPrintHtml(htmlPath)
    throw new Error(
      error instanceof Error
        ? `Chargement impression échoué: ${error.message}`
        : 'Chargement impression échoué'
    )
  }

  // Wait for images / layout fit script embedded in the print HTML.
  await win.webContents.executeJavaScript(`
    new Promise((resolve) => {
      const done = () => resolve(true)
      const imgs = Array.from(document.images || [])
      if (!imgs.length) {
        requestAnimationFrame(() => setTimeout(done, 50))
        return
      }
      let pending = imgs.length
      const tick = () => {
        pending -= 1
        if (pending <= 0) requestAnimationFrame(() => setTimeout(done, 80))
      }
      imgs.forEach((img) => {
        if (img.complete) tick()
        else {
          img.addEventListener('load', tick, { once: true })
          img.addEventListener('error', tick, { once: true })
        }
      })
      setTimeout(done, 4000)
    })
  `)

  return htmlPath
}

function cleanupPrintHtml(htmlPath: string | null | undefined): void {
  if (!htmlPath) return
  try {
    if (fs.existsSync(htmlPath)) fs.unlinkSync(htmlPath)
  } catch {
    /* ignore */
  }
}

function buildModels(items: AfficheItem[], options: { forPrint?: boolean } = {}) {
  return items.map((item) => {
    const product = getProduct(item.productId)
    if (!product) throw new Error(`Produit #${item.productId} introuvable`)
    const priceCheck = parseDisplayPrice(item.overrides?.price)
    if (!priceCheck.ok) {
      throw new Error(`${product.name} : ${priceCheck.error}`)
    }
    const imageSrc = options.forPrint
      ? resolveImageSrcForPrint(product.imagePath)
      : resolveImageSrc(product.imagePath)
    return toRenderModel(product, item.overrides, imageSrc)
  })
}

function registerIpc(): void {
  const wrap = <T>(fn: () => T) => {
    try {
      return { ok: true as const, data: fn() }
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  const wrapAsync = async <T>(fn: () => Promise<T>) => {
    try {
      return { ok: true as const, data: await fn() }
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  ipcMain.handle('products:list', (_e, filters?: ProductFilters) =>
    wrap(() => listEnrichedProducts(filters ?? {}))
  )
  ipcMain.handle('products:get', (_e, id: number) =>
    wrap(() => {
      const p = getProduct(id)
      if (!p) throw new Error('Produit introuvable')
      return enrichProduct(p, { includePreview: true })
    })
  )
  ipcMain.handle('products:getImagePreview', (_e, id: number) =>
    wrap(() => {
      const product = getProduct(id)
      if (!product) throw new Error('Produit introuvable')
      const enriched = enrichProduct(product, { includePreview: true })
      return {
        imagePreview: enriched.imagePreview ?? null,
        imageStatus: enriched.imageStatus ?? 'missing',
        imageIsPlaceholder: enriched.imageIsPlaceholder,
      }
    })
  )
  ipcMain.handle('products:create', (_e, input: ProductInput) =>
    wrap(() => enrichProduct(createProduct(input), { includePreview: true }))
  )
  ipcMain.handle('products:update', (_e, id: number, input: Partial<ProductInput>) =>
    wrap(() => enrichProduct(updateProduct(id, input), { includePreview: true }))
  )
  ipcMain.handle('products:archive', (_e, id: number) =>
    wrap(() => enrichProduct(archiveProduct(id), { includePreview: false }))
  )
  ipcMain.handle('products:reactivate', (_e, id: number) =>
    wrap(() => enrichProduct(reactivateProduct(id), { includePreview: false }))
  )
  ipcMain.handle('products:delete', (_e, id: number) =>
    wrap(() => {
      deleteProduct(id)
    })
  )
  ipcMain.handle('products:categories', () => wrap(() => getCategories()))
  ipcMain.handle('products:countWithoutImage', () => wrap(() => countWithoutValidImage()))

  ipcMain.handle('products:pickImage', async (_e, id: number) => {
    try {
      const updated = await copyPickedImageToProductFolder(id)
      return { ok: true, data: updated }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle('products:clearImage', (_e, id: number) =>
    wrap(() => {
      const product = getProduct(id)
      if (!product) throw new Error('Produit introuvable')
      const keyGuess = 'legumes'
      return enrichProduct(
        updateProduct(id, {
          imagePath: path.join('placeholders', `${keyGuess}.svg`),
          imageSource: 'Illustration vectorielle placeholder locale (domaine public / générée)',
          imageIsPlaceholder: true,
        }),
        { includePreview: false }
      )
    })
  )

  ipcMain.handle('review:report', () => wrap(() => buildReviewReport()))
  ipcMain.handle('app:paths', () => wrap(() => getPaths()))
  ipcMain.handle('app:openPath', async (_e, target: string) => {
    try {
      await shell.openPath(target)
      return { ok: true }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle('images:scan', () => wrap(() => scanProductImagesFolder()))
  ipcMain.handle(
    'images:import',
    (_e, options?: { replaceExisting?: boolean; folderPath?: string }) =>
      wrapAsync(() => importProductImagesFlow(options))
  )
  ipcMain.handle('images:selectFolder', () =>
    wrapAsync(async () => {
      const folder = await selectProductImageFolderDialog()
      return { path: folder }
    })
  )
  ipcMain.handle('images:resolveDuplicates', (_e, choices: DuplicateResolveChoice[]) =>
    wrap(() => applyDuplicateChoices(choices ?? []))
  )
  ipcMain.handle('images:openFolder', async () => {
    try {
      const info = getPaths()
      ensureProductImagesFolder(info.productImagesDir)
      const err = await shell.openPath(info.productImagesDir)
      if (err) return { ok: false, error: err }
      return { ok: true, data: { path: info.productImagesDir } }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle('data:backupQuick', () =>
    wrap(() => {
      const info = getPaths()
      fs.mkdirSync(info.backups, { recursive: true })
      const dest = uniqueBackupPath(info.backups)
      backupDatabase(dest)
      return { path: dest }
    })
  )
  ipcMain.handle('data:openBackupsFolder', async () => {
    try {
      const info = getPaths()
      fs.mkdirSync(info.backups, { recursive: true })
      const err = await shell.openPath(info.backups)
      if (err) return { ok: false, error: err }
      return { ok: true, data: { path: info.backups } }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle('data:backup', async () => {
    try {
      const destQuick = uniqueBackupPath(getPaths().backups)
      const result = await dialog.showSaveDialog(mainWindow!, {
        title: 'Sauvegarder la base de données',
        defaultPath: destQuick,
        filters: [{ name: 'SQLite', extensions: ['sqlite', 'db'] }],
      })
      if (result.canceled || !result.filePath) return { ok: false, error: 'Sauvegarde annulée' }
      if (fs.existsSync(result.filePath)) {
        // Never silently overwrite: append -copy before extension
        const dir = path.dirname(result.filePath)
        const base = path.basename(result.filePath)
        const safe = uniqueDestinationPath(dir, base)
        backupDatabase(safe)
        return { ok: true, data: { path: safe } }
      }
      backupDatabase(result.filePath)
      return { ok: true, data: { path: result.filePath } }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle('data:restore', async () => {
    try {
      const result = await dialog.showOpenDialog(mainWindow!, {
        title: 'Restaurer une sauvegarde',
        properties: ['openFile'],
        filters: [{ name: 'SQLite', extensions: ['sqlite', 'db'] }],
      })
      if (result.canceled || !result.filePaths[0]) return { ok: false, error: 'Restauration annulée' }
      const src = result.filePaths[0]
      const info = getPaths()
      const safety = path.join(
        info.backups,
        `pre-restore-${new Date().toISOString().replaceAll(':', '-')}.sqlite`
      )
      fs.mkdirSync(info.backups, { recursive: true })
      if (fs.existsSync(info.database)) fs.copyFileSync(info.database, safety)
      closeDatabase()
      fs.copyFileSync(src, info.database)
      await reopenAfterRestore(info)
      return { ok: true, data: { path: src } }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle('data:exportCsv', async () => {
    try {
      const { csv, count } = exportProductsCsv()
      const result = await dialog.showSaveDialog(mainWindow!, {
        title: 'Exporter les produits en CSV',
        defaultPath: path.join(app.getPath('documents'), 'top-fruit-produits.csv'),
        filters: [{ name: 'CSV', extensions: ['csv'] }],
      })
      if (result.canceled || !result.filePath) return { ok: false, error: 'Export annulé' }
      fs.writeFileSync(result.filePath, `\uFEFF${csv}`, 'utf8')
      return { ok: true, data: { path: result.filePath, count } }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle('print:preview', (_e, request: PrintRequest) =>
    wrap(() => {
      const models = buildModels(request.items)
      const html = buildPrintHtml(models, request.template, request.paperFormat, {
        showCutLine: request.showCutLine !== false,
      })
      return { html }
    })
  )

  ipcMain.handle('print:print', async (_e, request: PrintRequest) => {
    let htmlPath: string | null = null
    try {
      if (request.saveOverridesToCatalogue) {
        for (const item of request.items) {
          if (!item.overrides) continue
          updateProduct(item.productId, {
            origin: item.overrides.origin,
            category: item.overrides.category,
            sellingUnit: item.overrides.sellingUnit,
          })
        }
      }
      const models = buildModels(request.items, { forPrint: true })
      const html = buildPrintHtml(models, request.template, request.paperFormat, {
        showCutLine: request.showCutLine !== false,
      })
      const win = await ensurePrintWindow()
      htmlPath = await loadHtmlIntoPrintWindow(win, html)

      // macOS often fails to present the system print dialog from a fully hidden window.
      if (process.platform === 'darwin') {
        win.showInactive()
      }

      await new Promise<void>((resolve, reject) => {
        win.webContents.print(
          {
            silent: false,
            printBackground: true,
            copies: Math.max(1, request.copies || 1),
          },
          (success, failureReason) => {
            if (!success) {
              const reason = failureReason || 'Impression annulée ou échouée'
              // User cancelled the dialog — treat as soft cancel, not a crash.
              if (/cancel/i.test(reason)) reject(new Error('Impression annulée'))
              else reject(new Error(reason))
            } else resolve()
          }
        )
      })
      return { ok: true }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    } finally {
      if (printWindow && !printWindow.isDestroyed()) {
        try {
          printWindow.hide()
        } catch {
          /* ignore */
        }
      }
      cleanupPrintHtml(htmlPath)
    }
  })

  ipcMain.handle('print:exportPdf', async (_e, request: PrintRequest) => {
    let htmlPath: string | null = null
    try {
      const models = buildModels(request.items, { forPrint: true })
      const html = buildPrintHtml(models, request.template, request.paperFormat, {
        showCutLine: request.showCutLine !== false,
      })
      const first = models[0]
      const defaultName = first
        ? buildAffichePdfFilename(first.storeCode, first.name, request.paperFormat)
        : 'affiche.pdf'
      const result = await dialog.showSaveDialog(mainWindow!, {
        title: 'Exporter les affiches en PDF',
        defaultPath: path.join(app.getPath('documents'), defaultName),
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      })
      if (result.canceled || !result.filePath) return { ok: false, error: 'Export PDF annulé' }

      const win = await ensurePrintWindow()
      htmlPath = await loadHtmlIntoPrintWindow(win, html)
      const pdf = await win.webContents.printToPDF({
        printBackground: true,
        preferCSSPageSize: true,
        margins: { marginType: 'none' },
      })
      fs.writeFileSync(result.filePath, pdf)
      return { ok: true, data: { path: result.filePath } }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    } finally {
      cleanupPrintHtml(htmlPath)
    }
  })

  ipcMain.handle(
    'products:saveOverrides',
    (
      _e,
      updates: Array<{ id: number; origin?: string; category?: string; sellingUnit?: SellingUnit }>
    ) =>
      wrap(() => {
        for (const u of updates) {
          updateProduct(u.id, {
            origin: u.origin,
            category: u.category,
            sellingUnit: u.sellingUnit,
          })
        }
      })
  )
}

app.whenReady().then(async () => {
  const info = resolvePaths()
  ensureProductImagesFolder(info.productImagesDir)
  await initDatabase(info)
  getDb()
  seedDefaultProductImagesIfNeeded()
  registerIpc()

  // Silent automatic backup on launch (employee UI does not expose this).
  try {
    fs.mkdirSync(info.backups, { recursive: true })
    const autoDest = uniqueBackupPath(info.backups)
    backupDatabase(autoDest)
  } catch (error) {
    console.warn('AUTO_BACKUP_SKIP', error)
  }

  // One-shot image-folder scan smoke (same code path as the UI button).
  if (process.env.TFA_SMOKE_IMAGE_SCAN === '1') {
    try {
      const result = scanProductImagesFolder()
      console.log('IMAGE_SCAN_RESULT', JSON.stringify(result, null, 2))
      const wanted = [
        { name: 'AIL', code: '1' },
        { name: 'TOMATE COCKTAIL', code: '43' },
        { name: 'ORANGE A JUS', code: '134' },
      ]
      for (const w of wanted) {
        const p = listProducts({ includeArchived: true }).find((x) => x.name === w.name)
        if (!p) throw new Error(`Produit manquant: ${w.name}`)
        if (p.imageIsPlaceholder) throw new Error(`${w.name} still placeholder`)
        if (!p.imagePath || !isExternalProductImagePath(p.imagePath)) {
          throw new Error(`${w.name} imagePath not external: ${p.imagePath}`)
        }
        const src = resolveImageSrc(p.imagePath)
        if (!src) throw new Error(`${w.name} image file missing on disk`)
        console.log('IMAGE_OK', w.name, p.imagePath)
      }
      if (!result.unmatchedImages.some((u) => u.code === '999')) {
        throw new Error('Expected unmatched code 999')
      }
      for (const warn of result.pendingDuplicates) {
        console.log(
          'DUP_PENDING',
          `Code ${warn.code} en attente de choix : ${warn.candidates.map((c) => c.name).join(', ')}`
        )
      }
      if (result.pendingDuplicates.some((d) => d.code === '62')) {
        console.log('DUP_SAFE_OK code 62 not auto-assigned')
      }
      console.log('IMAGE_SCAN_SMOKE_OK')
      app.quit()
      return
    } catch (error) {
      console.error('IMAGE_SCAN_SMOKE_FAIL', error)
      app.exit(1)
      return
    }
  }

  // One-shot bulk folder import (development/Mac verification).
  // Usage: TFA_SMOKE_IMPORT=1 TFA_IMPORT_FOLDER=/path/to/pics
  // Never uses a hard-coded production default.
  if (process.env.TFA_SMOKE_IMPORT === '1') {
    try {
      const folder = process.env.TFA_IMPORT_FOLDER?.trim()
      if (!folder) throw new Error('TFA_IMPORT_FOLDER is required for smoke import')
      if (!fs.existsSync(folder)) throw new Error(`Import folder missing: ${folder}`)
      const result = runImageImport(folder, true, { confirmIfConflicts: false })
      if (result.phase !== 'done') throw new Error('Unexpected import phase')
      console.log('IMAGE_IMPORT_SMOKE_RESULT', JSON.stringify(result, null, 2))
      const info = getPaths()
      const ail = listProducts({ includeArchived: true }).find((p) => p.name === 'AIL' && p.storeCode === '1')
      if (!ail || ail.imageIsPlaceholder) throw new Error('AIL not associated after import')
      const abs = resolveAbsoluteImagePath(ail.imagePath)
      if (!abs || !fs.existsSync(abs)) throw new Error('AIL image missing in userData')
      if (!abs.startsWith(info.productImagesDir)) {
        throw new Error(`AIL image not under userData images dir: ${abs}`)
      }
      // Persistence check: resolve still works (simulates USB removed — source unused)
      const preview = resolveImageSrc(ail.imagePath)
      if (!preview) throw new Error('AIL preview failed after import')
      console.log('IMAGE_IMPORT_SMOKE_OK', {
        associated: result.associated,
        imagesFound: result.imagesFound,
        missing: result.missingProducts.length,
        unmatched: result.unmatchedFiles.length,
        dest: info.productImagesDir,
      })
      app.quit()
      return
    } catch (error) {
      console.error('IMAGE_IMPORT_SMOKE_FAIL', error)
      app.exit(1)
      return
    }
  }

  // One-shot export using the SAME bundled print path as the UI (preview/print/PDF).
  if (process.env.TFA_SMOKE_EXPORT === '1') {
    try {
      const outDir = process.env.TFA_SMOKE_OUT || path.join(app.getPath('documents'), 'TopFruitAffiches-app-exports')
      fs.mkdirSync(outDir, { recursive: true })

      const wanted = ['AIL', 'AIL FILET', 'TOMATE COCKTAIL', 'COURGETTE RONDE', 'RAISIN SANS PEPINS']
      const all = listProducts({ includeArchived: true })
      const picked = wanted.map((name, idx) => {
        const found = all.find((p) => p.name === name)
        if (found) return found
        // Synthetic fallback for names not in the legacy seed list
        return createProduct({
          storeCode: `T${900 + idx}`,
          name,
          origin: idx % 2 === 0 ? 'France' : 'Espagne',
          category: 'Fruits',
          sellingUnit: idx === 1 ? 'piece' : 'kg',
          imagePath: 'placeholders/fruits.svg',
          imageSource: 'placeholder',
          imageIsPlaceholder: true,
          warningNote: null,
          isActive: true,
        })
      })

      const formats: PrintRequest['paperFormat'][] = [
        'a5-landscape',
        'a5-portrait',
        'a4-landscape',
        'a4-portrait',
        '2x-a5-landscape-on-a4-portrait',
        '2x-a5-portrait-on-a4-landscape',
      ]

      const win = await ensurePrintWindow()

      for (const template of ['classic', 'modern'] as const) {
        for (const paperFormat of formats) {
          const items = picked.map((p, idx) => ({
            productId: p.id,
            overrides: {
              origin: p.origin || (idx % 2 === 0 ? 'France' : 'Espagne'),
              sellingUnit: (idx === 4 ? 'piece' : p.sellingUnit) as 'kg' | 'piece',
              price: idx === 2 ? '3,95' : idx === 3 ? '5' : undefined,
            },
          }))
          // Force at least one piece sample
          if (items[0]) items[0].overrides!.sellingUnit = 'kg'
          if (items[1]) items[1].overrides!.sellingUnit = 'piece'

          const models = buildModels(items)
          const html = buildPrintHtml(models, template, paperFormat)
          if (/la\s*verdure/i.test(html) || /brochant/i.test(html)) {
            throw new Error(`Store branding still present in ${template}/${paperFormat}`)
          }
          if (!html.includes('#C62828')) {
            throw new Error(`Category/price red missing in ${template}/${paperFormat}`)
          }
          if (!html.includes('class="price-printed"') || !html.includes('>3,95<')) {
            throw new Error(`Printed price missing in ${template}/${paperFormat}`)
          }
          if (!html.includes('class="price-guides"')) {
            throw new Error(`Blank marker guides missing in ${template}/${paperFormat}`)
          }
          if (html.includes('unit-short') || /span class=/i.test(extractVisible(html))) {
            throw new Error(`Markup leak in ${template}/${paperFormat}`)
          }

          const htmlPath = path.join(outDir, `${paperFormat}__${template}.html`)
          fs.writeFileSync(htmlPath, html, 'utf8')
          await win.loadURL(pathToFileURL(htmlPath).href)
          await win.webContents.executeJavaScript(`
            new Promise((resolve) => {
              const fit = () => {
                document.querySelectorAll('.affiche .name').forEach((el) => {
                  const box = el.getBoundingClientRect();
                  if (!box.width || !box.height) return;
                  let maxPx = Math.min(box.height * 0.92, box.width * 0.18);
                  const minPx = Math.max(12, box.height * 0.55);
                  el.style.whiteSpace = 'nowrap';
                  el.style.fontSize = maxPx + 'px';
                  let g = 0;
                  while ((el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1) && g < 70) {
                    const n = parseFloat(el.style.fontSize) * 0.92;
                    if (n < minPx) { el.style.fontSize = minPx + 'px'; el.style.whiteSpace = 'normal'; break; }
                    el.style.fontSize = n + 'px'; g++;
                  }
                });
              };
              fit();
              requestAnimationFrame(() => { fit(); setTimeout(resolve, 150); });
            })
          `)
          const pdf = await win.webContents.printToPDF({
            printBackground: true,
            preferCSSPageSize: true,
            margins: { marginType: 'none' },
          })
          const pdfPath = path.join(outDir, `${paperFormat}__${template}.pdf`)
          fs.writeFileSync(pdfPath, pdf)
          console.log('APP_EXPORT', pdfPath, pdf.length)
        }
      }

      // Prove the running bundle no longer contains the old bug string
      const mainPath = path.join(__dirname, 'main.js')
      const mainSrc = fs.readFileSync(mainPath, 'utf8')
      const forbiddenClass = ['class=', '"', 'unit', '-', 'short', '"'].join('')
      // forbiddenClass === class="unit-short" without embedding that literal in a naive way above
      const oldBug = 'class=' + '"' + 'unit-short' + '"'
      if (mainSrc.split(oldBug).length > 2) {
        // More than the verification occurrence means the old template remains
        throw new Error('Running dist-electron/main.js still embeds old unit-short class template')
      }
      // Ensure generated HTML files from this run are clean
      for (const file of fs.readdirSync(outDir)) {
        if (!file.endsWith('.html')) continue
        const html = fs.readFileSync(path.join(outDir, file), 'utf8')
        if (html.includes(oldBug) || html.includes('Code magasin') || html.includes('PRIX À ÉCRIRE')) {
          throw new Error('Exported HTML still dirty: ' + file)
        }
        const visible = extractVisible(html)
        for (const token of ['span', 'class=', '/>', 'unit-short', 'placeholder', 'prix à écrire', 'code magasin']) {
          if (visible.toLowerCase().includes(token.toLowerCase())) {
            throw new Error(`Visible text leak "${token}" in ${file}`)
          }
        }
        // Angle brackets only if they appear as leaked markup words, not euro etc.
        if (/<\s*span|class\s*=/i.test(visible)) {
          throw new Error(`Visible markup leak in ${file}`)
        }
      }
      if (!mainSrc.includes('KILO') || !mainSrc.includes('unit-label') || !mainSrc.includes('À LA PIÈCE')) {
        throw new Error('Running bundle missing unit label implementation')
      }
      void forbiddenClass
      console.log('APP_BUNDLE_OK', mainPath)
      console.log('APP_EXPORT_DONE', outDir)
      app.quit()
      return
    } catch (error) {
      console.error('APP_EXPORT_FAIL', error)
      app.exit(1)
      return
    }
  }

  // One-shot PDF path used by Imprimer/Enregistrer en PDF (temp-file load, large images).
  // Usage: TFA_SMOKE_PRINT_PDF=1
  if (process.env.TFA_SMOKE_PRINT_PDF === '1') {
    try {
      const products = listProducts({ activeOnly: true })
      const ail = products.find((p) => p.storeCode === '1' && p.name === 'AIL')
      if (!ail) throw new Error('AIL missing from catalogue')
      const abs = resolveAbsoluteImagePath(ail.imagePath)
      if (!abs || !fs.existsSync(abs)) throw new Error('AIL image missing — run image import first')
      const models = buildModels([
        {
          productId: ail.id,
          overrides: { price: '2,50', origin: ail.origin || 'France' },
        },
      ])
      const html = buildPrintHtml(models, 'modern', 'a4-portrait')
      if (!html.includes('data:image')) throw new Error('Expected embedded product image in HTML')
      if (html.length < 500_000) {
        console.warn('PRINT_SMOKE_WARN html smaller than expected', html.length)
      }
      const win = await ensurePrintWindow()
      const htmlPath = await loadHtmlIntoPrintWindow(win, html)
      const pdf = await win.webContents.printToPDF({
        printBackground: true,
        preferCSSPageSize: true,
        margins: { marginType: 'none' },
      })
      const outDir = path.join(app.getPath('temp'), 'top-fruit-print-smoke')
      fs.mkdirSync(outDir, { recursive: true })
      const pdfPath = path.join(outDir, 'ail-a4-portrait.pdf')
      fs.writeFileSync(pdfPath, pdf)
      cleanupPrintHtml(htmlPath)
      if (pdf.length < 10_000) throw new Error(`PDF too small: ${pdf.length}`)
      console.log('PRINT_PDF_SMOKE_OK', {
        htmlBytes: html.length,
        pdfBytes: pdf.length,
        pdfPath,
        imagePath: abs,
      })
      app.quit()
      return
    } catch (error) {
      console.error('PRINT_PDF_SMOKE_FAIL', error)
      app.exit(1)
      return
    }
  }

  // One-shot A5 single + two-up PDF smoke (FENOUIL).
  // Usage: TFA_SMOKE_A5_TWO_UP=1
  if (process.env.TFA_SMOKE_A5_TWO_UP === '1') {
    try {
      const products = listProducts({ activeOnly: true })
      const product =
        products.find((p) => p.name === 'FENOUIL') ||
        products.find((p) => p.name === 'AUBERGINE')
      if (!product) throw new Error('FENOUIL/AUBERGINE missing from catalogue')
      const outDir =
        process.env.TFA_SMOKE_A5_OUT ||
        path.join(app.getPath('documents'), 'TopFruitAffiches-a5-export-tests')
      fs.mkdirSync(outDir, { recursive: true })
      const jobs: Array<{ key: PrintRequest['paperFormat']; file: string }> = [
        { key: 'a5-portrait', file: 'A5_PORTRAIT_SINGLE_TEST.pdf' },
        { key: 'a5-landscape', file: 'A5_LANDSCAPE_SINGLE_TEST.pdf' },
        { key: '2x-a5-portrait-on-a4-landscape', file: 'A5_PORTRAIT_2x_ON_A4_TEST.pdf' },
        { key: '2x-a5-landscape-on-a4-portrait', file: 'A5_LANDSCAPE_2x_ON_A4_TEST.pdf' },
      ]
      const win = await ensurePrintWindow()
      const paths: string[] = []
      for (const job of jobs) {
        const models = buildModels(
          [
            {
              productId: product.id,
              overrides: { price: '1,95', origin: product.origin || 'France' },
            },
          ],
          { forPrint: true }
        )
        const html = buildPrintHtml(models, 'modern', job.key, { showCutLine: true })
        if (job.key.startsWith('2x-') && (html.match(/class="affiche /g) ?? []).length !== 2) {
          throw new Error(`${job.key}: expected two poster instances`)
        }
        const htmlPath = await loadHtmlIntoPrintWindow(win, html)
        const pdf = await win.webContents.printToPDF({
          printBackground: true,
          preferCSSPageSize: true,
          margins: { marginType: 'none' },
        })
        const pdfPath = path.join(outDir, job.file)
        fs.writeFileSync(pdfPath, pdf)
        cleanupPrintHtml(htmlPath)
        paths.push(pdfPath)
        console.log('A5_PDF', job.key, pdfPath, pdf.length)
      }
      console.log('A5_TWO_UP_OK', paths)
      app.quit()
      return
    } catch (error) {
      console.error('A5_TWO_UP_FAIL', error)
      app.exit(1)
      return
    }
  }

  // One-shot layout comparison PDFs for FENOUIL (4 formats).
  // Usage: TFA_SMOKE_LAYOUT_PDFS=1
  if (process.env.TFA_SMOKE_LAYOUT_PDFS === '1') {
    try {
      const products = listProducts({ activeOnly: true })
      const fenouil = products.find((p) => p.name === 'FENOUIL')
      if (!fenouil) throw new Error('FENOUIL missing from catalogue')
      const outDir = path.join(app.getPath('documents'), 'TopFruitAffiches-layout-compare')
      fs.mkdirSync(outDir, { recursive: true })
      const formats: Array<{ key: PrintRequest['paperFormat']; file: string }> = [
        { key: 'a4-portrait', file: 'FENOUIL_A4_PORTRAIT_NEW.pdf' },
        { key: 'a4-landscape', file: 'FENOUIL_A4_LANDSCAPE_NEW.pdf' },
        { key: 'a5-portrait', file: 'FENOUIL_A5_PORTRAIT_NEW.pdf' },
        { key: 'a5-landscape', file: 'FENOUIL_A5_LANDSCAPE_NEW.pdf' },
      ]
      const win = await ensurePrintWindow()
      const paths: string[] = []
      for (const fmt of formats) {
        const models = buildModels(
          [{ productId: fenouil.id, overrides: { price: '1,95', origin: fenouil.origin || 'France' } }],
          { forPrint: true }
        )
        const html = buildPrintHtml(models, 'modern', fmt.key)
        const m = metricsForFormat(fmt.key)
        if (m.imageMm <= m.titleMm) {
          throw new Error(`${fmt.key}: image zone not larger than title`)
        }
        const htmlPath = await loadHtmlIntoPrintWindow(win, html)
        const pdf = await win.webContents.printToPDF({
          printBackground: true,
          preferCSSPageSize: true,
          margins: { marginType: 'none' },
        })
        const pdfPath = path.join(outDir, fmt.file)
        fs.writeFileSync(pdfPath, pdf)
        cleanupPrintHtml(htmlPath)
        paths.push(pdfPath)
        console.log('LAYOUT_PDF', fmt.key, pdfPath, pdf.length)
      }
      console.log('LAYOUT_PDFS_OK', paths)
      app.quit()
      return
    } catch (error) {
      console.error('LAYOUT_PDFS_FAIL', error)
      app.exit(1)
      return
    }
  }

  createMainWindow()


  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

function extractVisible(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  closeDatabase()
})

// Silence unused import if protocol unused
void protocol
