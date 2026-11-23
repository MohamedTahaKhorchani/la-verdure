export type SellingUnit = 'kg' | 'piece'

export type ProductCategory =
  | 'Légumes'
  | 'Fruits'
  | 'Herbes'
  | 'Champignons'
  | 'Salades'
  | 'Pommes de terre'
  | 'Agrumes'
  | 'Exotiques'
  | 'Autre'

export type ImageStatus = 'assigned' | 'missing' | 'placeholder'

export interface Product {
  id: number
  storeCode: string
  name: string
  origin: string
  category: ProductCategory | string
  sellingUnit: SellingUnit
  imagePath: string | null
  imageSource: string
  imageIsPlaceholder: boolean
  warningNote: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
  /** Enriched by main process when listing/getting products. */
  imageStatus?: ImageStatus
  /** data: URL preview when available (not stored in SQLite). */
  imagePreview?: string | null
}

export type ProductInput = Omit<
  Product,
  'id' | 'createdAt' | 'updatedAt' | 'imageStatus' | 'imagePreview'
> & {
  id?: number
}

export interface ProductFilters {
  query?: string
  category?: string
  activeOnly?: boolean
  includeArchived?: boolean
  /** Only products without a valid assigned photo file. */
  withoutValidImage?: boolean
}

export type PaperFormat =
  | 'a4-portrait'
  | 'a4-landscape'
  | 'a5-portrait'
  | 'a5-landscape'
  | '2x-a5-landscape-on-a4-portrait'
  | '2x-a5-portrait-on-a4-landscape'

/** PDF disposition when the poster format is A5. Ignored for A4. */
export type A5PdfDisposition = 'single-a5' | 'two-a5-on-a4'

export type AfficheTemplate = 'classic' | 'modern'

export interface AfficheOverrides {
  origin?: string
  category?: string
  sellingUnit?: SellingUnit
  /** Session-only printed price (not stored in catalogue). Raw user input or empty. */
  price?: string
}

export interface AfficheItem {
  productId: number
  overrides?: AfficheOverrides
}

export interface PrintRequest {
  items: AfficheItem[]
  template: AfficheTemplate
  paperFormat: PaperFormat
  copies: number
  saveOverridesToCatalogue?: boolean
  /** A5 only. Missing value defaults to single-a5. Ignored for A4 formats. */
  a5PdfDisposition?: A5PdfDisposition
  /** Show center cutting guide on two-up A5 sheets. Default true. */
  showCutLine?: boolean
}

export interface DataWarning {
  id: string
  severity: 'info' | 'warning' | 'error'
  title: string
  detail: string
  relatedCodes?: string[]
  relatedNames?: string[]
}

export interface ReviewReport {
  totalProducts: number
  activeProducts: number
  archivedProducts: number
  missingImages: number
  placeholderImages: number
  duplicateStoreCodes: Array<{ storeCode: string; names: string[]; ids: number[] }>
  questionableNames: Array<{ id: number; name: string; storeCode: string; reason: string }>
  knownWarnings: DataWarning[]
  absentCodes: string[]
}

export interface PathsInfo {
  userData: string
  database: string
  backups: string
  images: string
  placeholders: string
  productImagesDir: string
  /** Optional bundled/portable folder next to the app (fallback lookup). */
  bundledProductImagesDir: string
  /** Packaged default catalogue images under resources/ (read-only fallback + first-run seed). */
  defaultProductImagesDir: string
  appRoot: string
}

export interface DuplicateScanCandidate {
  id: number
  name: string
  storeCode: string
  hasExistingPhoto: boolean
}

export interface PendingDuplicateImage {
  key: string
  file: string
  code: string
  relativePath: string
  preview: string | null
  candidates: DuplicateScanCandidate[]
}

export interface ImageScanResult {
  imagesFolder: string
  imagesFound: number
  productsUpdated: number
  updatedProductIds: number[]
  automaticAssignments: number
  pendingDuplicates: PendingDuplicateImage[]
  skippedExisting: Array<{ file: string; code: string; productId: number; name: string }>
  productsWithoutImage: Array<{ id: number; storeCode: string; name: string }>
  unmatchedImages: Array<{ file: string; code: string }>
  /** @deprecated Prefer pendingDuplicates — kept for older UI summaries. */
  duplicateCodeWarnings: Array<{ code: string; names: string[]; ids: number[] }>
  errors: string[]
}

/** Result of folder photo import (employee-facing). */
export interface ImageImportSummary {
  phase: 'done'
  selectedFolder: string
  imagesFound: number
  catalogueProducts: number
  associated: number
  copied: number
  unchangedIdentical: number
  unmatched: number
  skippedExisting: number
  replaced: number
  missingProducts: Array<{ storeCode: string; name: string }>
  unmatchedFiles: Array<{ file: string; code: string }>
  ambiguousMatches: Array<{ file: string; code: string; candidates: string[] }>
  collisions: Array<{ file: string; code: string; productName: string }>
  invalidFiles: string[]
  errors: string[]
}

export interface ImageImportNeedsConfirm {
  phase: 'needs_confirm'
  selectedFolder: string
  imagesFound: number
  conflictCount: number
  message: string
}

export type ImageImportResult = ImageImportSummary | ImageImportNeedsConfirm


export interface DuplicateResolveChoice {
  key: string
  productIds: number[]
}

export interface ApiResult<T = void> {
  ok: boolean
  data?: T
  error?: string
}

declare global {
  interface Window {
    topFruit: {
      listProducts: (filters?: ProductFilters) => Promise<ApiResult<Product[]>>
      getProduct: (id: number) => Promise<ApiResult<Product>>
      getProductImagePreview: (
        id: number
      ) => Promise<
        ApiResult<{
          imagePreview: string | null
          imageStatus: string
          imageIsPlaceholder: boolean
        }>
      >
      createProduct: (input: ProductInput) => Promise<ApiResult<Product>>
      updateProduct: (id: number, input: Partial<ProductInput>) => Promise<ApiResult<Product>>
      archiveProduct: (id: number) => Promise<ApiResult<Product>>
      reactivateProduct: (id: number) => Promise<ApiResult<Product>>
      deleteProduct: (id: number) => Promise<ApiResult>
      pickAndSetProductImage: (id: number) => Promise<ApiResult<Product>>
      clearProductImage: (id: number) => Promise<ApiResult<Product>>
      countProductsWithoutImage: () => Promise<ApiResult<number>>
      getReviewReport: () => Promise<ApiResult<ReviewReport>>
      getPaths: () => Promise<ApiResult<PathsInfo>>
      backupDatabase: () => Promise<ApiResult<{ path: string }>>
      backupDatabaseQuick: () => Promise<ApiResult<{ path: string }>>
      openBackupsFolder: () => Promise<ApiResult<{ path: string }>>
      restoreDatabase: () => Promise<ApiResult<{ path: string }>>
      exportCsv: () => Promise<ApiResult<{ path: string; count: number }>>
      openPath: (target: string) => Promise<ApiResult>
      previewAffiches: (request: PrintRequest) => Promise<ApiResult<{ html: string }>>
      printAffiches: (request: PrintRequest) => Promise<ApiResult>
      exportPdf: (request: PrintRequest) => Promise<ApiResult<{ path: string }>>
      getCategories: () => Promise<ApiResult<string[]>>
      saveOverrides: (
        updates: Array<{ id: number; origin?: string; category?: string; sellingUnit?: SellingUnit }>
      ) => Promise<ApiResult>
      scanProductImages: () => Promise<ApiResult<ImageScanResult>>
      selectProductImageFolder: () => Promise<ApiResult<{ path: string }>>
      importProductImages: (options?: {
        replaceExisting?: boolean
        folderPath?: string
      }) => Promise<ApiResult<ImageImportResult>>
      resolveDuplicateImages: (
        choices: DuplicateResolveChoice[]
      ) => Promise<ApiResult<ImageScanResult>>
      openProductImagesFolder: () => Promise<ApiResult<{ path: string }>>
    }
  }
}

export {}
