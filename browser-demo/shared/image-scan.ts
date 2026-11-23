import fs from 'node:fs'
import path from 'node:path'
import type { ImageScanResult, Product } from '../shared/types'

export const PRODUCT_IMAGES_DIR_NAME = 'images produits'

export const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif'])

export type ImageStatus = 'assigned' | 'missing' | 'placeholder'

export type { ImageScanResult }

/** Normalize store/legacy codes for matching (ignore leading zeroes on pure numeric codes). */
export function normalizeStoreCode(code: string): string {
  const trimmed = String(code).trim()
  const match = trimmed.match(/^0*(\d+)$/)
  if (match) return String(parseInt(match[1], 10))
  return trimmed.toUpperCase()
}

/**
 * Extract product code from the start of a filename (without path).
 * Supports numeric codes and alphanumeric codes such as T904.
 * Examples: 1.png → "1"; 001_AIL.png → "1"; 53_GOMEO.png → "53"; T904_RAISIN_SANS_PEPINS.png → "T904"
 */
export function extractCodeFromFilename(filename: string): string | null {
  const base = path.basename(filename, path.extname(filename))
  const match = base.match(/^([A-Za-z]*\d+)/)
  if (!match) return null
  return normalizeStoreCode(match[1])
}

export function isSupportedImageFile(filePath: string): boolean {
  return IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase())
}

/** Recursively list image files under a directory. */
export function listImageFiles(rootDir: string): string[] {
  if (!fs.existsSync(rootDir)) return []
  const results: string[] = []

  const walk = (dir: string) => {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      if (entry.name.toLowerCase() === 'readme.txt') continue
      if (entry.name.toLowerCase() === 'thumbs.db') continue
      if (entry.name.toLowerCase() === 'product-images.json') continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.isFile() && isSupportedImageFile(full)) results.push(full)
    }
  }

  walk(rootDir)
  return results.sort((a, b) => a.localeCompare(b, 'fr'))
}

export function relativeImageRef(imagesRoot: string, absoluteFile: string): string {
  const rel = path.relative(imagesRoot, absoluteFile)
  return path.join(PRODUCT_IMAGES_DIR_NAME, rel).replace(/\\/g, '/')
}

export function isExternalProductImagePath(imagePath: string | null | undefined): boolean {
  if (!imagePath) return false
  const normalized = imagePath.replace(/\\/g, '/')
  return (
    normalized === PRODUCT_IMAGES_DIR_NAME ||
    normalized.startsWith(PRODUCT_IMAGES_DIR_NAME + '/') ||
    normalized.startsWith('images-produits/')
  )
}

export function isPlaceholderImagePath(imagePath: string | null | undefined): boolean {
  if (!imagePath) return false
  return imagePath.replace(/\\/g, '/').includes('placeholders/')
}

/** True when the product already has a real (non-placeholder) assignment. */
export function hasProtectedAssignedImage(
  product: Pick<Product, 'imagePath' | 'imageIsPlaceholder'>
): boolean {
  return !product.imageIsPlaceholder && Boolean(product.imagePath)
}

/**
 * Derive catalogue image status.
 * - assigned: real photo path and file exists
 * - placeholder: intentional fallback illustration
 * - missing: no usable photo (absent path, or assigned path not found on disk)
 */
export function computeImageStatus(
  product: Pick<Product, 'imagePath' | 'imageIsPlaceholder'>,
  fileExists: boolean
): ImageStatus {
  if (product.imageIsPlaceholder || isPlaceholderImagePath(product.imagePath)) {
    return fileExists || !product.imagePath ? 'placeholder' : 'missing'
  }
  if (!product.imagePath) return 'missing'
  return fileExists ? 'assigned' : 'missing'
}

export function hasValidAssignedPhoto(status: ImageStatus): boolean {
  return status === 'assigned'
}

/** Normalize names for unambiguous filename matching (ignore case, accents, separators). */
export function normalizeNameKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '')
}

/**
 * Remaining filename text after the leading product code (normalized name key).
 * Examples: 53_GOMEO.png → "GOMEO"; 143.png → null; 62_POIS_GOURMAND.png → "POISGOURMAND"
 */
export function nameSuffixKeyFromFilename(filename: string): string | null {
  const stem = path.basename(filename, path.extname(filename))
  const match = stem.match(/^[A-Za-z]*\d+[_\-\s.]+(.+)$/)
  if (!match?.[1]) return null
  const key = normalizeNameKey(match[1])
  return key || null
}

export function slugifyProductName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'PRODUIT'
}

/**
 * Standard final image filename: CODE_PRODUCT_NAME.ext
 * Preserves the catalogue code as-is (after trim); does not pad with zeros.
 * Examples: 1_AIL.png, 143_POMME_GOLDEN.png, T904_RAISIN_SANS_PEPINS.png
 */
export function buildPreferredImageFilename(
  storeCode: string,
  productName: string,
  ext: string
): string {
  const code = String(storeCode).trim().toUpperCase()
  const safeExt = ext.toLowerCase().startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`
  return `${code}_${slugifyProductName(productName)}${safeExt}`
}

/** Folder / stem key used by the image pipeline (no extension). */
export function productImageStem(storeCode: string, productName: string): string {
  return `${String(storeCode).trim().toUpperCase()}_${slugifyProductName(productName)}`
}

/** Never overwrite: add -2, -3… before extension if needed. */
export function uniqueDestinationPath(dir: string, filename: string): string {
  const ext = path.extname(filename)
  const stem = path.basename(filename, ext)
  let candidate = path.join(dir, filename)
  let n = 2
  while (fs.existsSync(candidate)) {
    candidate = path.join(dir, `${stem}-${n}${ext}`)
    n += 1
  }
  return candidate
}

export interface ScanCandidate {
  id: number
  name: string
  storeCode: string
  hasExistingPhoto: boolean
}

export interface PlannedAutoAssignment {
  file: string
  code: string
  productId: number
  name: string
}

export interface PlannedDuplicateDecision {
  file: string
  code: string
  relativePath: string
  candidates: ScanCandidate[]
}

export interface PlannedScan {
  autoAssignments: PlannedAutoAssignment[]
  pendingDuplicates: PlannedDuplicateDecision[]
  skippedExisting: Array<{ file: string; code: string; productId: number; name: string }>
  unmatchedImages: Array<{ file: string; code: string }>
}

export interface PlanImageScanOptions {
  /** When true, overwrite products that already have a real photo. */
  replaceExisting?: boolean
}

/** Name key from a filename stem, stripping a leading product code when present. */
export function nameKeyFromFilename(filename: string): string | null {
  const suffix = nameSuffixKeyFromFilename(filename)
  if (suffix) return suffix
  const stem = path.basename(filename, path.extname(filename))
  // Pure code-only stem (e.g. 143.png) has no name key.
  if (/^[A-Za-z]*\d+$/.test(stem)) return null
  const key = normalizeNameKey(stem)
  return key || null
}

/**
 * Safe scan planner for CODE_PRODUCT_NAME and legacy CODE-only filenames.
 * Priority:
 * 1. Exact normalized code + normalized product name
 * 2. Code-only when exactly one catalogue entry has that code
 * 3. Unambiguous name-only match when no usable code match
 * Never guess for duplicate codes (53, 62, …) without a unique name suffix.
 */
export function planImageScan(
  files: string[],
  products: Array<Pick<Product, 'id' | 'storeCode' | 'name' | 'isActive' | 'imagePath' | 'imageIsPlaceholder'>>,
  imagesRoot?: string,
  options: PlanImageScanOptions = {}
): PlannedScan {
  const replaceExisting = Boolean(options.replaceExisting)
  const active = products.filter((p) => p.isActive)
  const byCode = new Map<string, typeof active>()
  const byName = new Map<string, typeof active>()
  for (const p of active) {
    const codeKey = normalizeStoreCode(p.storeCode)
    const codeList = byCode.get(codeKey) ?? []
    codeList.push(p)
    byCode.set(codeKey, codeList)

    const nameKey = normalizeNameKey(p.name)
    if (nameKey) {
      const nameList = byName.get(nameKey) ?? []
      nameList.push(p)
      byName.set(nameKey, nameList)
    }
  }

  const autoAssignments: PlannedAutoAssignment[] = []
  const pendingDuplicates: PlannedDuplicateDecision[] = []
  const skippedExisting: Array<{ file: string; code: string; productId: number; name: string }> = []
  const unmatchedImages: Array<{ file: string; code: string }> = []
  const claimedProductIds = new Set<number>()

  const pushAuto = (file: string, code: string, product: (typeof active)[number]) => {
    if (claimedProductIds.has(product.id)) {
      unmatchedImages.push({ file: path.basename(file), code })
      return
    }
    if (!replaceExisting && hasProtectedAssignedImage(product)) {
      skippedExisting.push({
        file: path.basename(file),
        code,
        productId: product.id,
        name: product.name,
      })
      return
    }
    claimedProductIds.add(product.id)
    autoAssignments.push({
      file,
      code,
      productId: product.id,
      name: product.name,
    })
  }

  for (const file of files) {
    const code = extractCodeFromFilename(file)
    const suffix = nameSuffixKeyFromFilename(file)

    if (code != null) {
      const matches = byCode.get(code) ?? []

      // 1) Exact code + name (required for duplicate codes; preferred otherwise)
      if (suffix && matches.length >= 1) {
        const filtered = matches.filter((p) => normalizeNameKey(p.name) === suffix)
        if (filtered.length === 1) {
          pushAuto(file, code, filtered[0]!)
          continue
        }
        if (filtered.length > 1) {
          pendingDuplicates.push({
            file,
            code,
            relativePath: imagesRoot ? relativeImageRef(imagesRoot, file) : path.basename(file),
            candidates: filtered.map((p) => ({
              id: p.id,
              name: p.name,
              storeCode: p.storeCode,
              hasExistingPhoto: hasProtectedAssignedImage(p),
            })),
          })
          continue
        }
        // Name suffix present but no product match — do not fall back to code-only
        // when multiple products share the code (would guess).
        if (matches.length > 1) {
          pendingDuplicates.push({
            file,
            code,
            relativePath: imagesRoot ? relativeImageRef(imagesRoot, file) : path.basename(file),
            candidates: matches.map((p) => ({
              id: p.id,
              name: p.name,
              storeCode: p.storeCode,
              hasExistingPhoto: hasProtectedAssignedImage(p),
            })),
          })
          continue
        }
      }

      // 2) Code-only when exactly one catalogue entry
      if (matches.length === 1) {
        pushAuto(file, code, matches[0]!)
        continue
      }

      if (matches.length > 1) {
        // Ambiguous duplicate code without a unique name suffix — never guess.
        pendingDuplicates.push({
          file,
          code,
          relativePath: imagesRoot ? relativeImageRef(imagesRoot, file) : path.basename(file),
          candidates: matches.map((p) => ({
            id: p.id,
            name: p.name,
            storeCode: p.storeCode,
            hasExistingPhoto: hasProtectedAssignedImage(p),
          })),
        })
        continue
      }
      // Unknown code — fall through to optional name-only match
    }

    const nameKey = nameKeyFromFilename(file)
    if (nameKey) {
      const nameMatches = byName.get(nameKey) ?? []
      if (nameMatches.length === 1) {
        pushAuto(file, code ?? 'name', nameMatches[0]!)
        continue
      }
    }

    unmatchedImages.push({ file: path.basename(file), code: code ?? '?' })
  }

  return { autoAssignments, pendingDuplicates, skippedExisting, unmatchedImages }
}

/** Byte-identical file comparison (size first, then contents). */
export function filesAreByteIdentical(a: string, b: string): boolean {
  try {
    const sa = fs.statSync(a)
    const sb = fs.statSync(b)
    if (!sa.isFile() || !sb.isFile() || sa.size !== sb.size) return false
    return fs.readFileSync(a).equals(fs.readFileSync(b))
  } catch {
    return false
  }
}

export function manifestKey(storeCode: string, productName: string): string {
  return `${normalizeStoreCode(storeCode)}|${slugifyProductName(productName)}`
}

export function readProductImagesManifest(manifestPath: string): Record<string, string> {
  try {
    if (!fs.existsSync(manifestPath)) return {}
    const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as unknown
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof v === 'string' && v.trim()) out[k] = v
    }
    return out
  } catch {
    return {}
  }
}

export function writeProductImagesManifest(
  manifestPath: string,
  entries: Record<string, string>
): void {
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true })
  const tmp = `${manifestPath}.tmp-${process.pid}`
  fs.writeFileSync(tmp, JSON.stringify(entries, null, 2), 'utf8')
  fs.renameSync(tmp, manifestPath)
}

/** Copy image via temp file + rename when practical. */
export function copyImageAtomic(src: string, dest: string): void {
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  const tmp = `${dest}.tmp-${process.pid}-${Date.now()}`
  try {
    fs.copyFileSync(src, tmp)
    fs.renameSync(tmp, dest)
  } catch (error) {
    try {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp)
    } catch {
      /* ignore cleanup */
    }
    throw error
  }
}

/** @deprecated Use planImageScan — kept for transitional callers/tests. */
export function planImageAssignments(
  files: string[],
  products: Array<Pick<Product, 'id' | 'storeCode' | 'name' | 'isActive' | 'imagePath' | 'imageIsPlaceholder'>>
): {
  assignments: Array<{ file: string; code: string; productIds: number[]; names: string[] }>
  unmatchedImages: Array<{ file: string; code: string }>
  duplicateCodeWarnings: Array<{ code: string; names: string[]; ids: number[] }>
} {
  const plan = planImageScan(files, products)
  return {
    assignments: plan.autoAssignments.map((a) => ({
      file: a.file,
      code: a.code,
      productIds: [a.productId],
      names: [a.name],
    })),
    unmatchedImages: plan.unmatchedImages,
    duplicateCodeWarnings: plan.pendingDuplicates.map((d) => ({
      code: d.code,
      names: d.candidates.map((c) => c.name),
      ids: d.candidates.map((c) => c.id),
    })),
  }
}

export function formatBackupFilename(date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `top-fruit-backup-${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}.sqlite`
}

export function uniqueBackupPath(backupsDir: string, date = new Date()): string {
  fs.mkdirSync(backupsDir, { recursive: true })
  let base = formatBackupFilename(date)
  let dest = path.join(backupsDir, base)
  if (!fs.existsSync(dest)) return dest
  // Same minute collision: append seconds, then counter
  const withSec = base.replace(/\.sqlite$/, `${pSec(date)}.sqlite`)
  dest = path.join(backupsDir, withSec)
  let n = 2
  while (fs.existsSync(dest)) {
    dest = path.join(backupsDir, base.replace(/\.sqlite$/, `-${n}.sqlite`))
    n += 1
  }
  return dest
}

function pSec(date: Date): string {
  return String(date.getSeconds()).padStart(2, '0')
}
