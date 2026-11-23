import initSqlJs, { type Database as SqlJsDatabase, type SqlValue } from 'sql.js'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import {
  ABSENT_STORE_CODES,
  EXPECTED_SEED_COUNT,
  KNOWN_DATA_WARNINGS,
  QUESTIONABLE_NAME_REASONS,
  SEED_PRODUCTS,
} from '../shared/seed-data'
import type {
  PathsInfo,
  Product,
  ProductFilters,
  ProductInput,
  ReviewReport,
  SellingUnit,
} from '../shared/types'

const require = createRequire(import.meta.url)

let db: SqlJsDatabase | null = null
let paths: PathsInfo | null = null
let persistTimer: NodeJS.Timeout | null = null

function nowIso(): string {
  return new Date().toISOString()
}

function schedulePersist(): void {
  if (!db || !paths) return
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    try {
      persistNow()
    } catch (error) {
      console.error('Échec de sauvegarde SQLite:', error)
    }
  }, 150)
}

export function persistNow(): void {
  if (!db || !paths) return
  const data = db.export()
  fs.writeFileSync(paths.database, Buffer.from(data))
}

function resolveWasmPath(): string {
  if (paths) {
    // Packaged: resources/sql-wasm.wasm (placeholders lives in resources/placeholders)
    const candidate = path.join(path.dirname(paths.placeholders), 'sql-wasm.wasm')
    if (fs.existsSync(candidate)) return candidate
  }
  try {
    return require.resolve('sql.js/dist/sql-wasm.wasm')
  } catch {
    return path.join(process.cwd(), 'node_modules/sql.js/dist/sql-wasm.wasm')
  }
}

export async function initDatabase(info: PathsInfo): Promise<SqlJsDatabase> {
  paths = info
  fs.mkdirSync(path.dirname(info.database), { recursive: true })
  fs.mkdirSync(info.backups, { recursive: true })
  fs.mkdirSync(info.images, { recursive: true })
  fs.mkdirSync(info.productImagesDir, { recursive: true })

  const SQL = await initSqlJs({
    locateFile: () => resolveWasmPath(),
  })

  if (fs.existsSync(info.database)) {
    const fileBuffer = fs.readFileSync(info.database)
    db = new SQL.Database(fileBuffer)
  } else {
    db = new SQL.Database()
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_code TEXT NOT NULL,
      name TEXT NOT NULL,
      origin TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL,
      selling_unit TEXT NOT NULL CHECK (selling_unit IN ('kg', 'piece')),
      image_path TEXT,
      image_source TEXT NOT NULL DEFAULT '',
      image_is_placeholder INTEGER NOT NULL DEFAULT 1,
      warning_note TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
    CREATE INDEX IF NOT EXISTS idx_products_store_code ON products(store_code);
    CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
    CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active);

    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `)

  seedIfNeeded()
  persistNow()
  return db
}

export function getDb(): SqlJsDatabase {
  if (!db) throw new Error('Base de données non initialisée')
  return db
}

export function getPaths(): PathsInfo {
  if (!paths) throw new Error('Chemins non initialisés')
  return paths
}

function rowToProduct(row: Record<string, unknown>): Product {
  return {
    id: Number(row.id),
    storeCode: String(row.store_code),
    name: String(row.name),
    origin: String(row.origin ?? ''),
    category: String(row.category),
    sellingUnit: row.selling_unit as SellingUnit,
    imagePath: row.image_path ? String(row.image_path) : null,
    imageSource: String(row.image_source ?? ''),
    imageIsPlaceholder: Boolean(row.image_is_placeholder),
    warningNote: row.warning_note ? String(row.warning_note) : null,
    isActive: Boolean(row.is_active),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

function queryAll(sql: string, params: SqlValue[] = []): Record<string, unknown>[] {
  const database = getDb()
  const stmt = database.prepare(sql)
  stmt.bind(params)
  const rows: Record<string, unknown>[] = []
  while (stmt.step()) {
    rows.push(stmt.getAsObject())
  }
  stmt.free()
  return rows
}

function queryOne(sql: string, params: SqlValue[] = []): Record<string, unknown> | undefined {
  return queryAll(sql, params)[0]
}

function run(sql: string, params: SqlValue[] = []): void {
  getDb().run(sql, params)
  schedulePersist()
}

function placeholderRelativePath(key: string): string {
  return path.join('placeholders', `${key}.svg`)
}

function seedIfNeeded(): void {
  const seeded = queryOne(`SELECT value FROM meta WHERE key = 'seeded_v1'`)
  const countRow = queryOne(`SELECT COUNT(*) as c FROM products`)
  const count = Number(countRow?.c ?? 0)

  if (seeded && count > 0) return

  if (SEED_PRODUCTS.length !== EXPECTED_SEED_COUNT) {
    throw new Error(
      `Seed invalide: ${SEED_PRODUCTS.length} produits au lieu de ${EXPECTED_SEED_COUNT}`
    )
  }

  run(`DELETE FROM products`)
  const ts = nowIso()
  for (const p of SEED_PRODUCTS) {
    run(
      `INSERT INTO products (
        store_code, name, origin, category, selling_unit,
        image_path, image_source, image_is_placeholder, warning_note,
        is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [
        p.storeCode,
        p.name,
        p.origin,
        p.category,
        p.sellingUnit,
        placeholderRelativePath(p.placeholderKey),
        'Illustration vectorielle placeholder locale (domaine public / générée)',
        1,
        p.warningNote,
        ts,
        ts,
      ]
    )
  }
  run(
    `INSERT INTO meta (key, value) VALUES ('seeded_v1', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [ts]
  )
}

export function listProducts(filters: ProductFilters = {}): Product[] {
  const clauses: string[] = []
  const params: SqlValue[] = []

  if (filters.includeArchived) {
    // all
  } else if (filters.activeOnly === false) {
    clauses.push('is_active = 0')
  } else {
    clauses.push('is_active = 1')
  }

  if (filters.category) {
    clauses.push('category = ?')
    params.push(filters.category)
  }

  if (filters.query?.trim()) {
    clauses.push(
      `(name LIKE ? OR store_code LIKE ? OR origin LIKE ? OR category LIKE ? OR IFNULL(warning_note,'') LIKE ?)`
    )
    const q = `%${filters.query.trim()}%`
    params.push(q, q, q, q, q)
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
  return queryAll(
    `SELECT * FROM products ${where} ORDER BY name COLLATE NOCASE ASC, id ASC`,
    params
  ).map(rowToProduct)
}

export function getProduct(id: number): Product | null {
  const row = queryOne(`SELECT * FROM products WHERE id = ?`, [id])
  return row ? rowToProduct(row) : null
}

export function createProduct(input: ProductInput): Product {
  const ts = nowIso()
  run(
    `INSERT INTO products (
      store_code, name, origin, category, selling_unit,
      image_path, image_source, image_is_placeholder, warning_note,
      is_active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.storeCode,
      input.name.trim(),
      input.origin ?? '',
      input.category,
      input.sellingUnit,
      input.imagePath,
      input.imageSource ?? '',
      input.imageIsPlaceholder ? 1 : 0,
      input.warningNote,
      input.isActive === false ? 0 : 1,
      ts,
      ts,
    ]
  )
  const idRow = queryOne(`SELECT last_insert_rowid() as id`)
  return getProduct(Number(idRow!.id))!
}

export function updateProduct(id: number, input: Partial<ProductInput>): Product {
  const existing = getProduct(id)
  if (!existing) throw new Error(`Produit #${id} introuvable`)

  const merged = { ...existing, ...input }
  run(
    `UPDATE products SET
      store_code = ?,
      name = ?,
      origin = ?,
      category = ?,
      selling_unit = ?,
      image_path = ?,
      image_source = ?,
      image_is_placeholder = ?,
      warning_note = ?,
      is_active = ?,
      updated_at = ?
    WHERE id = ?`,
    [
      merged.storeCode,
      merged.name.trim(),
      merged.origin ?? '',
      merged.category,
      merged.sellingUnit,
      merged.imagePath,
      merged.imageSource ?? '',
      merged.imageIsPlaceholder ? 1 : 0,
      merged.warningNote,
      merged.isActive ? 1 : 0,
      nowIso(),
      id,
    ]
  )
  return getProduct(id)!
}

export function archiveProduct(id: number): Product {
  return updateProduct(id, { isActive: false })
}

export function reactivateProduct(id: number): Product {
  return updateProduct(id, { isActive: true })
}

export function deleteProduct(id: number): void {
  const product = getProduct(id)
  if (!product) throw new Error(`Produit #${id} introuvable`)
  if (product.imagePath && !product.imageIsPlaceholder && path.isAbsolute(product.imagePath)) {
    try {
      if (fs.existsSync(product.imagePath)) fs.unlinkSync(product.imagePath)
    } catch {
      // ignore
    }
  }
  run(`DELETE FROM products WHERE id = ?`, [id])
}

export function getCategories(): string[] {
  return queryAll(`SELECT DISTINCT category FROM products ORDER BY category COLLATE NOCASE`).map(
    (r) => String(r.category)
  )
}

export function buildReviewReport(): ReviewReport {
  const all = queryAll(`SELECT * FROM products ORDER BY id`).map(rowToProduct)

  const codeMap = new Map<string, Product[]>()
  for (const p of all) {
    const list = codeMap.get(p.storeCode) ?? []
    list.push(p)
    codeMap.set(p.storeCode, list)
  }

  const duplicateStoreCodes = [...codeMap.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([storeCode, list]) => ({
      storeCode,
      names: list.map((p) => p.name),
      ids: list.map((p) => p.id),
    }))

  const questionableNames = all
    .filter((p) => QUESTIONABLE_NAME_REASONS[p.name])
    .map((p) => ({
      id: p.id,
      name: p.name,
      storeCode: p.storeCode,
      reason: QUESTIONABLE_NAME_REASONS[p.name],
    }))

  return {
    totalProducts: all.length,
    activeProducts: all.filter((p) => p.isActive).length,
    archivedProducts: all.filter((p) => !p.isActive).length,
    missingImages: all.filter((p) => !p.imagePath).length,
    placeholderImages: all.filter((p) => p.imageIsPlaceholder).length,
    duplicateStoreCodes,
    questionableNames,
    knownWarnings: KNOWN_DATA_WARNINGS,
    absentCodes: [...ABSENT_STORE_CODES],
  }
}

export function exportProductsCsv(): { csv: string; count: number } {
  const products = queryAll(`SELECT * FROM products ORDER BY id`).map(rowToProduct)
  const header = [
    'id',
    'store_code',
    'name',
    'origin',
    'category',
    'selling_unit',
    'image_path',
    'image_source',
    'image_is_placeholder',
    'warning_note',
    'is_active',
    'created_at',
    'updated_at',
  ]

  const escape = (v: unknown) => {
    const s = v == null ? '' : String(v)
    if (/[",\n;]/.test(s)) return `"${s.replaceAll('"', '""')}"`
    return s
  }

  const lines = [
    header.join(';'),
    ...products.map((p) =>
      [
        p.id,
        p.storeCode,
        p.name,
        p.origin,
        p.category,
        p.sellingUnit,
        p.imagePath ?? '',
        p.imageSource,
        p.imageIsPlaceholder ? 1 : 0,
        p.warningNote ?? '',
        p.isActive ? 1 : 0,
        p.createdAt,
        p.updatedAt,
      ]
        .map(escape)
        .join(';')
    ),
  ]

  return { csv: lines.join('\n'), count: products.length }
}

export function backupDatabase(destPath: string): void {
  persistNow()
  fs.copyFileSync(getPaths().database, destPath)
}

export function closeDatabase(): void {
  if (persistTimer) {
    clearTimeout(persistTimer)
    persistTimer = null
  }
  if (db) {
    try {
      persistNow()
    } catch {
      // ignore
    }
    db.close()
    db = null
  }
}

export async function reopenAfterRestore(info: PathsInfo): Promise<void> {
  closeDatabase()
  await initDatabase(info)
}
