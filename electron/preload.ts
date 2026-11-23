import { contextBridge, ipcRenderer } from 'electron'
import type {
  AfficheItem,
  DuplicateResolveChoice,
  PrintRequest,
  ProductFilters,
  ProductInput,
  SellingUnit,
} from '../shared/types'

const api = {
  listProducts: (filters?: ProductFilters) => ipcRenderer.invoke('products:list', filters),
  getProduct: (id: number) => ipcRenderer.invoke('products:get', id),
  getProductImagePreview: (id: number) => ipcRenderer.invoke('products:getImagePreview', id),
  createProduct: (input: ProductInput) => ipcRenderer.invoke('products:create', input),
  updateProduct: (id: number, input: Partial<ProductInput>) =>
    ipcRenderer.invoke('products:update', id, input),
  archiveProduct: (id: number) => ipcRenderer.invoke('products:archive', id),
  reactivateProduct: (id: number) => ipcRenderer.invoke('products:reactivate', id),
  deleteProduct: (id: number) => ipcRenderer.invoke('products:delete', id),
  pickAndSetProductImage: (id: number) => ipcRenderer.invoke('products:pickImage', id),
  clearProductImage: (id: number) => ipcRenderer.invoke('products:clearImage', id),
  countProductsWithoutImage: () => ipcRenderer.invoke('products:countWithoutImage'),
  getReviewReport: () => ipcRenderer.invoke('review:report'),
  getPaths: () => ipcRenderer.invoke('app:paths'),
  backupDatabase: () => ipcRenderer.invoke('data:backup'),
  backupDatabaseQuick: () => ipcRenderer.invoke('data:backupQuick'),
  openBackupsFolder: () => ipcRenderer.invoke('data:openBackupsFolder'),
  restoreDatabase: () => ipcRenderer.invoke('data:restore'),
  exportCsv: () => ipcRenderer.invoke('data:exportCsv'),
  openPath: (target: string) => ipcRenderer.invoke('app:openPath', target),
  previewAffiches: (request: PrintRequest) => ipcRenderer.invoke('print:preview', request),
  printAffiches: (request: PrintRequest) => ipcRenderer.invoke('print:print', request),
  exportPdf: (request: PrintRequest) => ipcRenderer.invoke('print:exportPdf', request),
  getCategories: () => ipcRenderer.invoke('products:categories'),
  saveOverrides: (
    updates: Array<{ id: number; origin?: string; category?: string; sellingUnit?: SellingUnit }>
  ) => ipcRenderer.invoke('products:saveOverrides', updates),
  scanProductImages: () => ipcRenderer.invoke('images:scan'),
  selectProductImageFolder: () => ipcRenderer.invoke('images:selectFolder'),
  importProductImages: (options?: { replaceExisting?: boolean; folderPath?: string }) =>
    ipcRenderer.invoke('images:import', options),
  resolveDuplicateImages: (choices: DuplicateResolveChoice[]) =>
    ipcRenderer.invoke('images:resolveDuplicates', choices),
  openProductImagesFolder: () => ipcRenderer.invoke('images:openFolder'),
}

contextBridge.exposeInMainWorld('topFruit', api)

export type TopFruitApi = typeof api
void (null as unknown as AfficheItem)
