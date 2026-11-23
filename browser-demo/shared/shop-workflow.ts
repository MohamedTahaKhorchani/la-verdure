import type { A5PdfDisposition, PaperFormat, SellingUnit } from './types'
import { categoryBadge, parseDisplayPrice } from './print-layout'

export type PaperSizeChoice = 'a4' | 'a5'
export type OrientationChoice = 'portrait' | 'landscape'

export const DEFAULT_A5_PDF_DISPOSITION: A5PdfDisposition = 'single-a5'

export const DEFAULT_CATEGORIES = [
  'Légumes',
  'Fruits',
  'Agrumes',
  'Exotiques',
  'Salades',
  'Herbes',
  'Champignons',
  'Pommes de terre',
  'Autre',
] as const

export const COMMON_ORIGINS = ['FRANCE', 'ESPAGNE', 'ITALIE', 'MAROC', 'PAYS-BAS', 'BELGIQUE'] as const

export function normalizeA5PdfDisposition(
  value: A5PdfDisposition | null | undefined
): A5PdfDisposition {
  return value === 'two-a5-on-a4' ? 'two-a5-on-a4' : 'single-a5'
}

/**
 * Resolve the printable/PDF paper format.
 * A4 ignores A5 disposition. Missing disposition defaults to single-a5.
 */
export function resolvePaperFormat(
  size: PaperSizeChoice,
  orientation: OrientationChoice,
  a5PdfDisposition?: A5PdfDisposition | null
): PaperFormat {
  if (size === 'a4') {
    return orientation === 'portrait' ? 'a4-portrait' : 'a4-landscape'
  }
  const disposition = normalizeA5PdfDisposition(a5PdfDisposition)
  if (disposition === 'two-a5-on-a4') {
    // Two A5 portrait posters → A4 landscape sheet
    // Two A5 landscape posters → A4 portrait sheet
    return orientation === 'portrait'
      ? '2x-a5-portrait-on-a4-landscape'
      : '2x-a5-landscape-on-a4-portrait'
  }
  return orientation === 'portrait' ? 'a5-portrait' : 'a5-landscape'
}

export function categoryOptionLabel(category: string): string {
  return `${categoryBadge(category)} — ${category}`
}

export interface EditableProductFields {
  name: string
  storeCode: string
  origin: string
  category: string
  sellingUnit: SellingUnit
}

export function catalogueSavePayload(fields: EditableProductFields) {
  return {
    name: fields.name.trim(),
    storeCode: fields.storeCode.trim(),
    origin: fields.origin.trim(),
    category: fields.category,
    sellingUnit: fields.sellingUnit,
  }
}

export function hasUnsavedCatalogueChanges(
  baseline: EditableProductFields | null,
  current: EditableProductFields
): boolean {
  if (!baseline) return false
  return (
    baseline.name !== current.name ||
    baseline.storeCode !== current.storeCode ||
    baseline.origin !== current.origin ||
    baseline.category !== current.category ||
    baseline.sellingUnit !== current.sellingUnit
  )
}

export function validateSessionPrice(
  input: string
): { ok: true; formatted: string | null } | { ok: false; error: string } {
  return parseDisplayPrice(input)
}

export function formatPriceHint(input: string): string | null {
  const result = parseDisplayPrice(input)
  if (!result.ok || !result.formatted) return null
  return `${result.formatted} €`
}

export function filterProductsByQuery<T extends { name: string; storeCode: string }>(
  products: T[],
  query: string
): T[] {
  const q = query.trim().toLocaleLowerCase('fr-FR')
  if (!q) return products
  return products.filter(
    (p) =>
      p.name.toLocaleLowerCase('fr-FR').includes(q) ||
      p.storeCode.toLocaleLowerCase('fr-FR').includes(q)
  )
}

/** Map technical errors to short French messages for shop employees. */
export function friendlyError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  const lower = raw.toLowerCase()
  if (lower.includes('annul')) return raw
  if (lower.includes('unique') || lower.includes('already') || lower.includes('existe')) {
    return 'Ce code produit existe déjà.'
  }
  if (lower.includes('sqlite') || lower.includes('constraint')) {
    return 'Impossible d’enregistrer le produit.'
  }
  if (lower.includes('enoent') || lower.includes('image') || lower.includes('photo')) {
    if (lower.includes('ouvrir') || lower.includes('read') || lower.includes('open')) {
      return 'Impossible d’ouvrir cette photo.'
    }
  }
  if (lower.includes('nom') && lower.includes('obligatoire')) {
    return 'Veuillez entrer un nom de produit.'
  }
  if (raw.length > 160 || /stack|undefined|null is not|typeerror|referenceerror/i.test(raw)) {
    return 'Une erreur est survenue. Réessayez.'
  }
  return raw
}
