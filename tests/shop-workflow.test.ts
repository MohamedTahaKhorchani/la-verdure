import { describe, expect, it } from 'vitest'
import {
  catalogueSavePayload,
  categoryOptionLabel,
  filterProductsByQuery,
  formatPriceHint,
  friendlyError,
  hasUnsavedCatalogueChanges,
  resolvePaperFormat,
  validateSessionPrice,
} from '../shared/shop-workflow'
import {
  assertNoStoreBranding,
  buildPrintHtml,
  metricsForFormat,
  type AfficheRenderModel,
} from '../shared/print-layout'
import type { PaperFormat } from '../shared/types'

const sampleProducts = [
  { id: 1, name: 'TOMATE COCKTAIL', storeCode: '43' },
  { id: 2, name: 'TOMATE RONDE', storeCode: '41' },
  { id: 3, name: 'AIL', storeCode: '10' },
]

describe('shop paper format mapping', () => {
  it('maps A4/A5 + orientation only by default', () => {
    expect(resolvePaperFormat('a4', 'portrait')).toBe('a4-portrait')
    expect(resolvePaperFormat('a4', 'landscape')).toBe('a4-landscape')
    expect(resolvePaperFormat('a5', 'portrait')).toBe('a5-portrait')
    expect(resolvePaperFormat('a5', 'landscape')).toBe('a5-landscape')
  })

  it('defaults missing A5 disposition to single-a5 and ignores disposition on A4', () => {
    expect(resolvePaperFormat('a5', 'portrait', undefined)).toBe('a5-portrait')
    expect(resolvePaperFormat('a5', 'portrait', null)).toBe('a5-portrait')
    expect(resolvePaperFormat('a4', 'portrait', 'two-a5-on-a4')).toBe('a4-portrait')
    expect(resolvePaperFormat('a4', 'landscape', 'two-a5-on-a4')).toBe('a4-landscape')
  })

  it('maps two-a5-on-a4 to the correct A4 sheet orientation', () => {
    expect(resolvePaperFormat('a5', 'portrait', 'two-a5-on-a4')).toBe('2x-a5-portrait-on-a4-landscape')
    expect(resolvePaperFormat('a5', 'landscape', 'two-a5-on-a4')).toBe('2x-a5-landscape-on-a4-portrait')
  })
})

describe('product search', () => {
  it('filters by name and code', () => {
    expect(filterProductsByQuery(sampleProducts, 'cocktail').map((p) => p.id)).toEqual([1])
    expect(filterProductsByQuery(sampleProducts, '41').map((p) => p.id)).toEqual([2])
    expect(filterProductsByQuery(sampleProducts, 'tomate')).toHaveLength(2)
    expect(filterProductsByQuery(sampleProducts, '')).toHaveLength(3)
  })
})

describe('catalogue save vs temporary price', () => {
  it('save payload excludes price', () => {
    const payload = catalogueSavePayload({
      name: 'TOMATE COCKTAIL',
      storeCode: '43',
      origin: 'FRANCE',
      category: 'Légumes',
      sellingUnit: 'kg',
    })
    expect(payload).toEqual({
      name: 'TOMATE COCKTAIL',
      storeCode: '43',
      origin: 'FRANCE',
      category: 'Légumes',
      sellingUnit: 'kg',
    })
    expect('price' in payload).toBe(false)
  })

  it('detects unsaved catalogue field changes', () => {
    const base = {
      name: 'TOMATE COCKTAIL',
      storeCode: '43',
      origin: 'ESPAGNE',
      category: 'Légumes',
      sellingUnit: 'kg' as const,
    }
    expect(hasUnsavedCatalogueChanges(base, base)).toBe(false)
    expect(hasUnsavedCatalogueChanges(base, { ...base, origin: 'FRANCE' })).toBe(true)
  })

  it('keeps session price temporary and formatted', () => {
    expect(validateSessionPrice('')).toEqual({ ok: true, formatted: null })
    expect(validateSessionPrice('3,95')).toEqual({ ok: true, formatted: '3,95' })
    expect(formatPriceHint('3,95')).toBe('3,95 €')
  })
})

describe('friendly errors', () => {
  it('hides technical noise', () => {
    expect(friendlyError(new Error('SQLITE_CONSTRAINT UNIQUE'))).toBe('Ce code produit existe déjà.')
    expect(friendlyError(new Error('ENOENT open image'))).toMatch(/photo|Impossible/i)
    expect(friendlyError(new Error('undefined is not a function'))).toBe(
      'Une erreur est survenue. Réessayez.'
    )
  })
})

describe('category labels', () => {
  it('shows category number with name', () => {
    expect(categoryOptionLabel('Légumes')).toContain('Cat 1')
  })
})

describe('generic affiche without store branding', () => {
  const model: AfficheRenderModel = {
    name: 'TOMATE COCKTAIL',
    storeCode: '43',
    origin: 'France',
    category: 'Légumes',
    sellingUnit: 'kg',
    imageSrc: null,
    imageIsPlaceholder: true,
    displayPrice: '3,95',
  }

  it('renders A4/A5 without LA VERDURE', () => {
    const formats: PaperFormat[] = [
      'a4-portrait',
      'a4-landscape',
      'a5-portrait',
      'a5-landscape',
    ]
    for (const format of formats) {
      const html = buildPrintHtml([model], 'modern', format)
      const m = metricsForFormat(format)
      expect(assertNoStoreBranding(html)).toBe(true)
      expect(html).not.toMatch(/la\s*verdure/i)
      expect(html).toContain('3,95')
      expect(html).toContain(`padding: ${m.titlePadTopMm}mm 14mm 1mm 14mm`)
    }
  })
})
