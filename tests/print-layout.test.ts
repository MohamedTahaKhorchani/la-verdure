import { describe, expect, it } from 'vitest'
import {
  CATEGORY_COLOR,
  PAPER_SPECS,
  PRICE_AMOUNT_COLOR,
  assertCleanPrintText,
  assertNoAffichePageSplit,
  assertNoLeakedMarkupInPrintHtml,
  assertNoStoreBranding,
  buildPrintHtml,
  buildAffichePdfFilename,
  extractPrintText,
  formatDisplayPrice,
  getUnitLabel,
  getUnitValue,
  metricsForFormat,
  parseDisplayPrice,
  sanitizeWindowsFilename,
  type AfficheRenderModel,
} from '../shared/print-layout'
import type { PaperFormat } from '../shared/types'

const sample: AfficheRenderModel = {
  name: 'TOMATE RONDE',
  storeCode: '41',
  origin: 'France',
  category: 'Légumes',
  sellingUnit: 'kg',
  imageSrc: null,
  imageIsPlaceholder: true,
  displayPrice: null,
}

const names = ['AIL', 'AIL FILET', 'TOMATE COCKTAIL', 'COURGETTE RONDE', 'RAISIN SANS PEPINS']
const formats = Object.keys(PAPER_SPECS) as PaperFormat[]

describe('price parsing and formatting', () => {
  it('treats blank input as marker-writing mode', () => {
    expect(parseDisplayPrice('')).toEqual({ ok: true, formatted: null })
    expect(parseDisplayPrice('   ')).toEqual({ ok: true, formatted: null })
    expect(parseDisplayPrice(null)).toEqual({ ok: true, formatted: null })
    expect(parseDisplayPrice(undefined)).toEqual({ ok: true, formatted: null })
  })

  it('normalises French and English decimals to two places', () => {
    expect(parseDisplayPrice('3,95')).toEqual({ ok: true, formatted: '3,95' })
    expect(parseDisplayPrice('3.95')).toEqual({ ok: true, formatted: '3,95' })
    expect(parseDisplayPrice('5')).toEqual({ ok: true, formatted: '5,00' })
    expect(parseDisplayPrice('12.5')).toEqual({ ok: true, formatted: '12,50' })
    expect(formatDisplayPrice(5)).toBe('5,00')
  })

  it('rejects invalid prices with a French error', () => {
    for (const bad of ['abc', '-1', '3,955', '3.955', '1,2,3', '€3']) {
      const result = parseDisplayPrice(bad)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error.toLowerCase()).toMatch(/prix|positif|décimal/)
    }
  })
})

describe('print layout generation', () => {
  it('exposes all required paper formats', () => {
    expect(formats).toHaveLength(6)
  })

  it('uses rebalanced metrics with a dominant image zone', () => {
    const a4l = metricsForFormat('a4-landscape')
    expect(a4l.imageMm).toBeGreaterThan(a4l.titleMm)
    expect(a4l.imageMm).toBeGreaterThanOrEqual(100)
    expect(a4l.imageMaxHMm).toBeGreaterThanOrEqual(100)

    const a4p = metricsForFormat('a4-portrait')
    expect(a4p.imageMm).toBeGreaterThan(130)
    expect(a4p.titleMm).toBeLessThan(45)
    expect(a4p.imageMaxHMm).toBeGreaterThanOrEqual(a4p.imageMm - 4)

    const a5l = metricsForFormat('a5-landscape')
    expect(a5l.imageMm).toBeGreaterThan(65)
    expect(a5l.titlePadTopMm).toBeLessThanOrEqual(4)

    expect(metricsForFormat('a5-portrait').priceMm).toBeGreaterThan(40)
  })

  it('centers ORIGINE and VENTE AU within equal info halves', () => {
    for (const format of ['a4-portrait', 'a4-landscape', 'a5-portrait', 'a5-landscape'] as const) {
      const html = buildPrintHtml([sample], 'modern', format)
      expect(html).toContain('grid-template-columns: 1fr 0.45mm 1fr')
      expect(html).toContain('.info-half.origin-half,')
      expect(html).toContain('justify-self: center; align-self: center')
      expect(html).not.toMatch(/\.info-half\.origin-half\s*\{[^}]*justify-self:\s*start/)
      expect(html).not.toMatch(/\.info-half\.unit-half\s*\{[^}]*justify-self:\s*end/)
    }
  })

  it('uses side-by-side layout for landscape affiches and stacked rows for portrait', () => {
    const landscape = buildPrintHtml([sample], 'modern', 'a4-landscape')
    expect(landscape).toContain('layout-landscape')
    expect(landscape).toContain('grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr)')
    expect(landscape).toContain('"image info"')
    expect(landscape).toContain('"image price"')

    const portrait = buildPrintHtml([sample], 'modern', 'a4-portrait')
    expect(portrait).toContain('layout-portrait')
    expect(portrait).toContain('"title"')
    expect(portrait).toContain('"image"')
  })

  it('uses pure white backgrounds and a print-safe double border', () => {
    const html = buildPrintHtml([sample], 'classic', 'a5-landscape')
    expect(html).toContain('background: #FFFFFF')
    expect(html).toContain('#1D4D36')
    expect(html).toContain('#A8C7A0')
    expect(html).toContain('1.2mm solid #1D4D36')
    expect(html).toContain('padding: 4mm')
    expect(html).toContain('object-fit: contain')
    expect(html).not.toContain('image-halo')
    expect(html).toContain('print-color-adjust: exact')
  })

  it('applies titlePadTopMm in the shared title zone CSS', () => {
    for (const format of formats) {
      const m = metricsForFormat(format)
      const html = buildPrintHtml([sample], 'classic', format)
      expect(html).toContain(`padding: ${m.titlePadTopMm}mm 14mm 1mm 14mm`)
    }
  })

  it('returns plain unit values with no HTML', () => {
    expect(getUnitValue('kg')).toBe('KILO')
    expect(getUnitValue('piece')).toBe('À LA PIÈCE')
    expect(getUnitLabel('kg')).toBe('KILO')
    expect(getUnitLabel('piece')).not.toMatch(/[<>]|span|class=/i)
  })

  it('never shows store branding and never leaks markup', () => {
    for (const template of ['classic', 'modern'] as const) {
      for (const format of formats) {
        for (const unit of ['kg', 'piece'] as const) {
          for (const name of names) {
            const html = buildPrintHtml(
              [{ ...sample, name, sellingUnit: unit, origin: 'France' }],
              template,
              format
            )
            expect(assertNoStoreBranding(html)).toBe(true)
            expect(html).not.toMatch(/la\s*verdure/i)
            expect(html).not.toContain('zone-brand')
            expect(html).not.toContain('brand-mark')
            expect(html).not.toContain('>TOP FRUIT<')
            expect(html).toContain('ORIGINE')
            expect(html).toContain('VENTE AU')
            expect(html).toContain('info-divider')
            expect(html).toContain('cat-pill')
            expect(html).toContain(CATEGORY_COLOR)
            expect(html).toContain('unit-label')
            expect(html).not.toContain('unit-short')
            expect(html).toContain('class="price-guides"')
            expect(html).toContain('opacity: 0.12')
            expect(html).toContain('class="digit-box"')
            expect(html).not.toContain('class="price-printed"')

            const text = extractPrintText(html)
            expect(assertCleanPrintText(text)).toBe(true)
            expect(assertNoLeakedMarkupInPrintHtml(html)).toBe(true)
            expect(text).toContain('ORIGINE')
            expect(text).toContain('VENTE AU')
            expect(text).toContain('FRANCE')
            expect(text.toLowerCase()).not.toContain('verdure')

            if (unit === 'kg') expect(text).toContain('KILO')
            else expect(text).toContain('À LA PIÈCE')
          }
        }
      }
    }
  })

  it('prints a formatted price instead of marker guides when set', () => {
    for (const template of ['classic', 'modern'] as const) {
      for (const format of formats) {
        const html = buildPrintHtml(
          [{ ...sample, name: 'TOMATE COCKTAIL', displayPrice: '3,95' }],
          template,
          format
        )
        expect(html).toContain('class="price-printed"')
        expect(html).toContain('>3,95<')
        expect(html).toContain(PRICE_AMOUNT_COLOR)
        expect(html).not.toContain('class="price-guides"')
        expect(assertNoStoreBranding(html)).toBe(true)
        const text = extractPrintText(html)
        expect(text).toContain('3,95')
        expect(assertCleanPrintText(text)).toBe(true)
      }
    }
  })

  it('formats whole euros with two decimals when printed', () => {
    const html = buildPrintHtml([{ ...sample, displayPrice: '5,00' }], 'classic', 'a4-portrait')
    expect(html).toContain('>5,00<')
    expect(html).not.toContain('class="digit-box"')
  })

  it('does not split an affiche across pages', () => {
    for (const format of formats) {
      const html = buildPrintHtml([sample, { ...sample, name: 'CAROTTE' }], 'classic', format)
      expect(assertNoAffichePageSplit(html)).toBe(true)
    }
  })

  it('places two affiches per page for 2-up formats', () => {
    const html = buildPrintHtml(
      [sample, { ...sample, name: 'AIL' }, { ...sample, name: 'AVOCAT', sellingUnit: 'piece' }],
      'modern',
      '2x-a5-landscape-on-a4-portrait'
    )
    expect((html.match(/class="print-page"/g) ?? []).length).toBe(2)
  })

  it('uses exact A5 slot sizes inside two-up A4 sheets', () => {
    const portraitSheet = PAPER_SPECS['2x-a5-portrait-on-a4-landscape']
    expect(portraitSheet.pageWidthMm).toBe(297)
    expect(portraitSheet.pageHeightMm).toBe(210)
    expect(portraitSheet.afficheWidthMm).toBe(148)
    expect(portraitSheet.afficheHeightMm).toBe(210)
    expect(portraitSheet.perPage).toBe(2)

    const landscapeSheet = PAPER_SPECS['2x-a5-landscape-on-a4-portrait']
    expect(landscapeSheet.pageWidthMm).toBe(210)
    expect(landscapeSheet.pageHeightMm).toBe(297)
    expect(landscapeSheet.afficheWidthMm).toBe(210)
    expect(landscapeSheet.afficheHeightMm).toBe(148)
  })

  it('duplicates one model into two identical A5 copies on two-up export', () => {
    const html = buildPrintHtml(
      [
        {
          ...sample,
          name: 'FENOUIL',
          displayPrice: '1,95',
          imageSrc: 'file:///tmp/fenouil.png',
          imageIsPlaceholder: false,
        },
      ],
      'modern',
      '2x-a5-portrait-on-a4-landscape'
    )
    expect(html).toContain('size: 297mm 210mm')
    expect(html).toContain('two-up')
    expect(html).toContain('class="cut-line cut-line-vertical"')
    expect((html.match(/class="affiche /g) ?? []).length).toBe(2)
    expect((html.match(/FENOUIL/g) ?? []).length).toBeGreaterThanOrEqual(2)
    expect((html.match(/file:\/\/\/tmp\/fenouil\.png/g) ?? []).length).toBe(2)
    expect((html.match(/>1,95</g) ?? []).length).toBe(2)
  })

  it('stacks two landscape A5 copies on an A4 portrait sheet with a horizontal cut line', () => {
    const html = buildPrintHtml(
      [{ ...sample, name: 'AUBERGINE', storeCode: '33', displayPrice: '2,50' }],
      'modern',
      '2x-a5-landscape-on-a4-portrait'
    )
    expect(html).toContain('size: 210mm 297mm')
    expect(html).toContain('class="cut-line cut-line-horizontal"')
    expect((html.match(/class="affiche /g) ?? []).length).toBe(2)
  })

  it('can hide the cutting guide when requested', () => {
    const html = buildPrintHtml([sample], 'modern', '2x-a5-portrait-on-a4-landscape', {
      showCutLine: false,
    })
    expect(html).not.toContain('class="cut-line cut-line-vertical"')
    expect(html).toContain('class="cut-gap"')
  })

  it('keeps single A5 page sizes unchanged', () => {
    expect(buildPrintHtml([sample], 'modern', 'a5-portrait')).toContain('size: 148mm 210mm')
    expect(buildPrintHtml([sample], 'modern', 'a5-landscape')).toContain('size: 210mm 148mm')
    expect(buildPrintHtml([sample], 'modern', 'a4-portrait')).toContain('size: 210mm 297mm')
  })

  it('builds safe Windows PDF filenames for single and two-up A5', () => {
    expect(buildAffichePdfFilename('33', 'AUBERGINE', 'a5-portrait')).toBe('AFFICHE_33_AUBERGINE_A5.pdf')
    expect(buildAffichePdfFilename('36', 'FENOUIL', '2x-a5-portrait-on-a4-landscape')).toBe(
      'AFFICHE_36_FENOUIL_2xA5_SUR_A4.pdf'
    )
    expect(buildAffichePdfFilename('T904', 'RAISIN SANS PÉPINS', '2x-a5-landscape-on-a4-portrait')).toBe(
      'AFFICHE_T904_RAISIN_SANS_PEPINS_2xA5_SUR_A4.pdf'
    )
    expect(buildAffichePdfFilename('53', 'GOMEO', 'a5-landscape')).toBe('AFFICHE_53_GOMEO_A5.pdf')
    expect(buildAffichePdfFilename('62', 'POIS GOURMAND', 'a5-portrait')).toBe(
      'AFFICHE_62_POIS_GOURMAND_A5.pdf'
    )
    expect(sanitizeWindowsFilename('A<B>:C/D\\|E?F*')).not.toMatch(/[<>:"/\\|?*]/)
  })
})
