import type { AfficheOverrides, AfficheTemplate, PaperFormat, Product, SellingUnit } from './types'

export interface AfficheRenderModel {
  name: string
  storeCode: string
  origin: string
  category: string
  sellingUnit: SellingUnit
  imageSrc: string | null
  imageIsPlaceholder: boolean
  /** Formatted French price for print (e.g. "3,95"), or null for marker guides. */
  displayPrice: string | null
}

export interface PageSpec {
  pageWidthMm: number
  pageHeightMm: number
  afficheWidthMm: number
  afficheHeightMm: number
  perPage: 1 | 2
  orientation: 'portrait' | 'landscape'
  label: string
}

/** Vertical zone heights in mm (inside outer margin). No store-branding band. */
export interface AfficheMetrics {
  marginMm: number
  titleMm: number
  imageMm: number
  infoMm: number
  priceMm: number
  /** Top padding inside the title zone. */
  titlePadTopMm: number
  namePtMin: number
  namePtMax: number
  catPt: number
  infoLabelPt: number
  infoValuePt: number
  imageMaxWMm: number
  imageMaxHMm: number
  digitWMm: number
  digitHMm: number
  euroPt: number
  printedPricePt: number
}

export const PAPER_SPECS: Record<PaperFormat, PageSpec> = {
  'a4-portrait': {
    pageWidthMm: 210,
    pageHeightMm: 297,
    afficheWidthMm: 210,
    afficheHeightMm: 297,
    perPage: 1,
    orientation: 'portrait',
    label: 'A4 portrait',
  },
  'a4-landscape': {
    pageWidthMm: 297,
    pageHeightMm: 210,
    afficheWidthMm: 297,
    afficheHeightMm: 210,
    perPage: 1,
    orientation: 'landscape',
    label: 'A4 paysage',
  },
  'a5-portrait': {
    pageWidthMm: 148,
    pageHeightMm: 210,
    afficheWidthMm: 148,
    afficheHeightMm: 210,
    perPage: 1,
    orientation: 'portrait',
    label: 'A5 portrait',
  },
  'a5-landscape': {
    pageWidthMm: 210,
    pageHeightMm: 148,
    afficheWidthMm: 210,
    afficheHeightMm: 148,
    perPage: 1,
    orientation: 'landscape',
    label: 'A5 paysage',
  },
  '2x-a5-landscape-on-a4-portrait': {
    // A4 portrait sheet: two exact A5 landscape (210×148) stacked; 1 mm center for cut line
    pageWidthMm: 210,
    pageHeightMm: 297,
    afficheWidthMm: 210,
    afficheHeightMm: 148,
    perPage: 2,
    orientation: 'portrait',
    label: '2 × A5 paysage sur A4 portrait',
  },
  '2x-a5-portrait-on-a4-landscape': {
    // A4 landscape sheet: two exact A5 portrait (148×210) side by side; 1 mm center for cut line
    pageWidthMm: 297,
    pageHeightMm: 210,
    afficheWidthMm: 148,
    afficheHeightMm: 210,
    perPage: 2,
    orientation: 'landscape',
    label: '2 × A5 portrait sur A4 paysage',
  },
}

export const BORDER_INSET_MM = 4
export const BORDER_OUTER_MM = 1.2
export const BORDER_OUTER_COLOR = '#1D4D36'
export const BORDER_GAP_MM = 2
export const BORDER_INNER_MM = 0.45
export const BORDER_INNER_COLOR = '#A8C7A0'
export const PAGE_WHITE = '#FFFFFF'
export const CATEGORY_COLOR = '#C62828'
export const PRICE_AMOUNT_COLOR = '#C62828'

/**
 * Format-specific zone metrics.
 * Portrait: stacked rows — title ~13–15%, image ~50–53%, info ~10–12%, price ~22–27%.
 * Landscape: side-by-side — image column ~56–58% width × (full height − title);
 *   right column stacks compact info + price (avoids letterboxing tall product photos).
 * imageMax* must fill the zone (shrinking them was the main cause of tiny photos).
 */
/** Side-by-side layout when the affiche itself is wider than tall. */
export function isLandscapeFormat(format: PaperFormat): boolean {
  const spec = PAPER_SPECS[format]
  return spec.afficheWidthMm > spec.afficheHeightMm
}

export function isTwoUpA5Format(format: PaperFormat): boolean {
  return format === '2x-a5-landscape-on-a4-portrait' || format === '2x-a5-portrait-on-a4-landscape'
}

/** Duplicate a single model when exporting two identical A5 posters on one A4 sheet. */
export function expandModelsForPaperFormat(
  models: AfficheRenderModel[],
  paperFormat: PaperFormat
): AfficheRenderModel[] {
  const spec = PAPER_SPECS[paperFormat]
  if (spec.perPage === 2 && models.length === 1) {
    return [models[0], models[0]]
  }
  return models
}

export function sanitizeWindowsFilename(raw: string): string {
  return String(raw)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120) || 'AFFICHE'
}

export function buildAffichePdfFilename(
  storeCode: string,
  productName: string,
  paperFormat: PaperFormat
): string {
  const code = sanitizeWindowsFilename(storeCode || 'X')
  const name = sanitizeWindowsFilename(productName || 'PRODUIT')
  const base = `AFFICHE_${code}_${name}`
  if (isTwoUpA5Format(paperFormat)) return `${base}_2xA5_SUR_A4.pdf`
  if (paperFormat.startsWith('a5-')) return `${base}_A5.pdf`
  if (paperFormat.startsWith('a4-')) return `${base}_A4.pdf`
  return `${base}.pdf`
}

export interface BuildPrintHtmlOptions {
  /** Center cutting guide on two-up sheets. Default true. */
  showCutLine?: boolean
}

export function metricsForFormat(format: PaperFormat): AfficheMetrics {
  switch (format) {
    case 'a4-landscape':
      // Side-by-side: usable ≈ 194mm tall × 281mm wide
      return {
        marginMm: 4,
        titleMm: 24,
        imageMm: 170,
        infoMm: 40,
        priceMm: 130,
        titlePadTopMm: 2,
        namePtMin: 32,
        namePtMax: 44,
        catPt: 13,
        infoLabelPt: 8,
        infoValuePt: 22,
        imageMaxWMm: 168,
        imageMaxHMm: 168,
        digitWMm: 30,
        digitHMm: 28,
        euroPt: 34,
        printedPricePt: 52,
      }
    case 'a4-portrait':
      // usable ≈ 282mm — image-dominant stacked rows
      return {
        marginMm: 3.5,
        titleMm: 30,
        imageMm: 158,
        infoMm: 24,
        priceMm: 70,
        titlePadTopMm: 2,
        namePtMin: 40,
        namePtMax: 52,
        catPt: 14,
        infoLabelPt: 8.5,
        infoValuePt: 24,
        imageMaxWMm: 196,
        imageMaxHMm: 156,
        digitWMm: 40,
        digitHMm: 46,
        euroPt: 44,
        printedPricePt: 68,
      }
    case 'a5-portrait':
    case '2x-a5-portrait-on-a4-landscape':
      // usable ≈ 196mm
      return {
        marginMm: 3,
        titleMm: 20,
        imageMm: 110,
        infoMm: 17,
        priceMm: 49,
        titlePadTopMm: 1.5,
        namePtMin: 24,
        namePtMax: 34,
        catPt: 10,
        infoLabelPt: 6.5,
        infoValuePt: 17,
        imageMaxWMm: 136,
        imageMaxHMm: 108,
        digitWMm: 26,
        digitHMm: 32,
        euroPt: 28,
        printedPricePt: 44,
      }
    case 'a5-landscape':
    case '2x-a5-landscape-on-a4-portrait':
    default:
      // Side-by-side: usable ≈ 132mm tall × 195mm wide
      return {
        marginMm: 3.5,
        titleMm: 16,
        imageMm: 116,
        infoMm: 36,
        priceMm: 80,
        titlePadTopMm: 1.5,
        namePtMin: 22,
        namePtMax: 32,
        catPt: 10,
        infoLabelPt: 6.5,
        infoValuePt: 15,
        imageMaxWMm: 118,
        imageMaxHMm: 114,
        digitWMm: 20,
        digitHMm: 20,
        euroPt: 22,
        printedPricePt: 36,
      }
  }
}

export function getUnitValue(unit: SellingUnit): string {
  return unit === 'kg' ? 'KILO' : 'À LA PIÈCE'
}

export function getUnitLabel(unit: SellingUnit): string {
  return getUnitValue(unit)
}

export function unitLabel(unit: SellingUnit, style: 'long' | 'short' = 'long'): string {
  if (unit === 'kg') return style === 'long' ? 'Le kilo' : 'Kg'
  return 'La pièce'
}

export function unitPrintText(unit: SellingUnit): string {
  return getUnitValue(unit)
}

export function unitPrintLines(unit: SellingUnit): string[] {
  return [getUnitValue(unit)]
}

export function categoryBadge(category: string): string {
  const map: Record<string, string> = {
    Légumes: 'Cat 1',
    Fruits: 'Cat 2',
    Agrumes: 'Cat 3',
    Exotiques: 'Cat 4',
    Salades: 'Cat 5',
    Herbes: 'Cat 6',
    Champignons: 'Cat 7',
    'Pommes de terre': 'Cat 8',
    Autre: 'Cat 9',
  }
  return map[category] ?? `Cat · ${category}`
}

export function parseDisplayPrice(
  input: string | null | undefined
): { ok: true; formatted: string | null } | { ok: false; error: string } {
  if (input == null) return { ok: true, formatted: null }
  const raw = String(input).trim()
  if (!raw) return { ok: true, formatted: null }

  const normalized = raw.replace(/\s/g, '').replace(',', '.')
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    return {
      ok: false,
      error: 'Prix invalide. Saisissez un montant positif avec au plus 2 décimales (ex. 3,95 ou 5).',
    }
  }
  const value = Number(normalized)
  if (!Number.isFinite(value) || value < 0) {
    return { ok: false, error: 'Le prix doit être un nombre positif (ex. 3,95).' }
  }
  if (value > 9999.99) {
    return { ok: false, error: 'Le prix saisi est trop élevé.' }
  }
  return { ok: true, formatted: formatDisplayPrice(value) }
}

export function formatDisplayPrice(value: number): string {
  return value.toFixed(2).replace('.', ',')
}

export function toRenderModel(
  product: Product,
  overrides?: AfficheOverrides,
  imageDataUrl?: string | null
): AfficheRenderModel {
  const priceResult = parseDisplayPrice(overrides?.price)
  const displayPrice = priceResult.ok ? priceResult.formatted : null
  return {
    name: product.name,
    storeCode: product.storeCode,
    origin: overrides?.origin ?? product.origin ?? '',
    category: overrides?.category ?? product.category,
    sellingUnit: overrides?.sellingUnit ?? product.sellingUnit,
    imageSrc: imageDataUrl ?? null,
    imageIsPlaceholder: product.imageIsPlaceholder,
    displayPrice,
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function ptToMm(pt: number): number {
  return (pt / 72) * 25.4
}

function afficheInner(
  model: AfficheRenderModel,
  template: AfficheTemplate,
  paperFormat: PaperFormat
): string {
  const originRaw = model.origin?.trim() ? model.origin.trim() : 'À compléter'
  const origin = originRaw.toLocaleUpperCase('fr-FR')
  const unitValue = getUnitValue(model.sellingUnit)
  const variant = template === 'modern' ? 'modern' : 'classic'
  const layout = isLandscapeFormat(paperFormat) ? 'layout-landscape' : 'layout-portrait'
  const showPhoto = Boolean(model.imageSrc) && !model.imageIsPlaceholder

  const imageInner = showPhoto
    ? ['<img class="product-image" src="', model.imageSrc as string, '" alt="', escapeHtml(model.name), '" />'].join(
        ''
      )
    : '<div class="product-image missing"></div>'

  const parts: string[] = []
  parts.push('<div class="affiche ' + variant + ' ' + layout + '">')

  // 1) Title + category (no store branding)
  parts.push('<div class="zone zone-title">')
  parts.push('<div class="cat-pill">' + escapeHtml(categoryBadge(model.category)) + '</div>')
  parts.push('<h1 class="name">' + escapeHtml(model.name) + '</h1>')
  parts.push('</div>')

  // 2) Image
  parts.push('<div class="zone zone-image">')
  parts.push('<div class="image-frame">' + imageInner + '</div>')
  parts.push('</div>')

  // 3) Info bar
  parts.push('<div class="zone zone-info">')
  parts.push('<div class="info-half origin-half">')
  parts.push('<div class="info-label">ORIGINE</div>')
  parts.push('<div class="info-value">' + escapeHtml(origin) + '</div>')
  parts.push('</div>')
  parts.push('<div class="info-divider"></div>')
  parts.push('<div class="info-half unit-half">')
  parts.push('<div class="info-label">VENTE AU</div>')
  parts.push('<div class="info-value unit-label">' + escapeHtml(unitValue) + '</div>')
  parts.push('</div>')
  parts.push('</div>')

  // 4) Price
  parts.push('<div class="zone zone-price">')
  if (model.displayPrice) {
    parts.push('<div class="price-printed">')
    parts.push('<div class="price-amount">' + escapeHtml(model.displayPrice) + '</div>')
    parts.push('<div class="price-euro">€</div>')
    parts.push('</div>')
  } else {
    parts.push('<div class="price-guides">')
    parts.push('<div class="digit-box">8</div>')
    parts.push('<div class="euro">€</div>')
    parts.push('<div class="digit-box">8</div>')
    parts.push('<div class="digit-box">8</div>')
    parts.push('</div>')
  }
  parts.push('</div>')

  parts.push('</div>')
  return parts.join('')
}

export function buildPrintHtml(
  models: AfficheRenderModel[],
  template: AfficheTemplate,
  paperFormat: PaperFormat,
  options: BuildPrintHtmlOptions = {}
): string {
  const spec = PAPER_SPECS[paperFormat]
  const m = metricsForFormat(paperFormat)
  const showCutLine = options.showCutLine !== false
  const expanded = expandModelsForPaperFormat(models, paperFormat)
  const pages: string[] = []

  for (let i = 0; i < expanded.length; i += spec.perPage) {
    const slice = expanded.slice(i, i + spec.perPage)
    const cellHtml = (model: AfficheRenderModel) =>
      '<div class="affiche-cell" style="width:' +
      spec.afficheWidthMm +
      'mm;height:' +
      spec.afficheHeightMm +
      'mm;">' +
      afficheInner(model, template, paperFormat) +
      '</div>'

    let gridInner = ''
    if (spec.perPage === 2) {
      const first = slice[0]
      const second = slice[1] ?? null
      const cutClass =
        spec.orientation === 'landscape' ? 'cut-line cut-line-vertical' : 'cut-line cut-line-horizontal'
      gridInner =
        (first ? cellHtml(first) : '') +
        (showCutLine ? '<div class="' + cutClass + '" aria-hidden="true"></div>' : '<div class="cut-gap" aria-hidden="true"></div>') +
        (second
          ? cellHtml(second)
          : '<div class="affiche-cell empty" style="width:' +
            spec.afficheWidthMm +
            'mm;height:' +
            spec.afficheHeightMm +
            'mm;"></div>')
    } else {
      gridInner = slice.map(cellHtml).join('')
    }

    const twoUpClass = spec.perPage === 2 ? ' two-up' : ''
    pages.push(
      '<section class="print-page" style="width:' +
        spec.pageWidthMm +
        'mm;height:' +
        spec.pageHeightMm +
        'mm;"><div class="page-grid per-' +
        spec.perPage +
        ' ' +
        spec.orientation +
        twoUpClass +
        '">' +
        gridInner +
        '</div></section>'
    )
  }

  const nameMaxMm = ptToMm(m.namePtMax).toFixed(2)
  const catMm = ptToMm(m.catPt).toFixed(2)
  const labelMm = ptToMm(m.infoLabelPt).toFixed(2)
  const valueMm = ptToMm(m.infoValuePt).toFixed(2)
  const euroMm = ptToMm(m.euroPt).toFixed(2)
  const printedPriceMm = ptToMm(m.printedPricePt).toFixed(2)
  const printedEuroMm = ptToMm(m.printedPricePt * 0.72).toFixed(2)
  const landscape = isLandscapeFormat(paperFormat)

  const innerShadow = BORDER_GAP_MM + BORDER_INNER_MM
  const gridCss = landscape
    ? [
        '.affiche.layout-landscape {',
        '  grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr);',
        '  grid-template-rows: ' + m.titleMm + 'mm ' + m.infoMm + 'mm minmax(0, 1fr);',
        '  grid-template-areas:',
        '    "title title"',
        '    "image info"',
        '    "image price";',
        '}',
        '.affiche.layout-landscape .zone-title { grid-area: title; }',
        '.affiche.layout-landscape .zone-image { grid-area: image; border-right: 0.35mm solid ' +
          BORDER_OUTER_COLOR +
          '; }',
        '.affiche.layout-landscape .zone-info { grid-area: info; border-top: none; }',
        '.affiche.layout-landscape .zone-price { grid-area: price; border-top: 0.35mm solid ' +
          BORDER_OUTER_COLOR +
          '; }',
        '.affiche.layout-landscape .zone-info {',
        '  padding: 1.5mm 2mm;',
        '  border-top: none;',
        '}',
        '.affiche.layout-landscape .image-frame {',
        '  max-width: ' + m.imageMaxWMm + 'mm; max-height: ' + m.imageMaxHMm + 'mm;',
        '}',
      ].join('\n')
    : [
        '.affiche.layout-portrait {',
        '  grid-template-columns: 1fr;',
        '  grid-template-rows: ' +
          m.titleMm +
          'mm ' +
          m.imageMm +
          'mm ' +
          m.infoMm +
          'mm ' +
          m.priceMm +
          'mm;',
        '  grid-template-areas:',
        '    "title"',
        '    "image"',
        '    "info"',
        '    "price";',
        '}',
        '.affiche.layout-portrait .zone-title { grid-area: title; }',
        '.affiche.layout-portrait .zone-image { grid-area: image; }',
        '.affiche.layout-portrait .zone-info { grid-area: info; }',
        '.affiche.layout-portrait .zone-price { grid-area: price; }',
      ].join('\n')

  const css = [
    '@page { size: ' + spec.pageWidthMm + 'mm ' + spec.pageHeightMm + 'mm; margin: 0; }',
    '* { box-sizing: border-box; }',
    'html, body { margin: 0; padding: 0; background: ' + PAGE_WHITE + '; color: #111111;',
    '  -webkit-print-color-adjust: exact; print-color-adjust: exact; }',
    '.print-page { page-break-after: always; break-after: page; overflow: hidden;',
    '  background: ' + PAGE_WHITE + ';',
    '  -webkit-print-color-adjust: exact; print-color-adjust: exact; }',
    '.print-page:last-child { page-break-after: auto; break-after: auto; }',
    '.page-grid { width: 100%; height: 100%; display: flex; flex-wrap: nowrap;',
    '  background: ' + PAGE_WHITE + '; }',
    '.page-grid.per-2.two-up.landscape {',
    '  display: grid;',
    '  grid-template-columns: ' + spec.afficheWidthMm + 'mm 1mm ' + spec.afficheWidthMm + 'mm;',
    '  grid-template-rows: ' + spec.afficheHeightMm + 'mm;',
    '  width: ' + spec.pageWidthMm + 'mm; height: ' + spec.pageHeightMm + 'mm;',
    '  justify-content: start; align-content: start;',
    '}',
    '.page-grid.per-2.two-up.portrait {',
    '  display: grid;',
    '  grid-template-columns: ' + spec.afficheWidthMm + 'mm;',
    '  grid-template-rows: ' + spec.afficheHeightMm + 'mm 1mm ' + spec.afficheHeightMm + 'mm;',
    '  width: ' + spec.pageWidthMm + 'mm; height: ' + spec.pageHeightMm + 'mm;',
    '  justify-content: start; align-content: start;',
    '}',
    '.cut-line {',
    '  background: transparent;',
    '  box-sizing: border-box;',
    '  -webkit-print-color-adjust: exact; print-color-adjust: exact;',
    '}',
    '.cut-line-vertical {',
    '  width: 1mm; height: 100%;',
    '  border-left: 0.35mm dashed #9A9A9A;',
    '  margin-left: 0.3mm;',
    '}',
    '.cut-line-horizontal {',
    '  width: 100%; height: 1mm;',
    '  border-top: 0.35mm dashed #9A9A9A;',
    '  margin-top: 0.3mm;',
    '}',
    '.cut-gap { width: 1mm; height: 1mm; }',
    '.affiche-cell { page-break-inside: avoid; break-inside: avoid; overflow: hidden;',
    '  flex: 0 0 auto; width: ' + spec.afficheWidthMm + 'mm; height: ' + spec.afficheHeightMm + 'mm;',
    '  padding: ' + BORDER_INSET_MM + 'mm;',
    '  background: ' + PAGE_WHITE + ';',
    '  -webkit-print-color-adjust: exact; print-color-adjust: exact; }',
    '.affiche-cell.empty { visibility: hidden; }',

    '.affiche {',
    '  position: relative;',
    '  width: 100%; height: 100%;',
    '  padding: ' + m.marginMm + 'mm;',
    '  display: grid;',
    '  gap: 0;',
    '  background: ' + PAGE_WHITE + ';',
    '  border: ' + BORDER_OUTER_MM + 'mm solid ' + BORDER_OUTER_COLOR + ';',
    '  box-shadow: inset 0 0 0 ' + BORDER_GAP_MM + 'mm ' + PAGE_WHITE + ',',
    '              inset 0 0 0 ' + innerShadow + 'mm ' + BORDER_INNER_COLOR + ';',
    '  -webkit-print-color-adjust: exact; print-color-adjust: exact;',
    '}',
    gridCss,
    '.affiche.classic, .affiche.modern { background: ' + PAGE_WHITE + '; }',

    '.zone-title {',
    '  position: relative;',
    '  display: flex; align-items: center; justify-content: center;',
    '  min-height: 0; padding: ' + m.titlePadTopMm + 'mm 14mm 1mm 14mm;',
    '  background: ' + PAGE_WHITE + ';',
    '  border-bottom: 0.35mm solid ' + BORDER_OUTER_COLOR + ';',
    '}',
    '.cat-pill {',
    '  position: absolute; right: 1mm; top: 1.5mm;',
    '  font-family: "Avenir Next", "Helvetica Neue", Arial, sans-serif;',
    '  font-weight: 900; font-size: ' + catMm + 'mm; letter-spacing: 0.04em;',
    '  line-height: 1; padding: 1.4mm 3mm; border-radius: 999px;',
    '  border: 0.45mm solid ' + CATEGORY_COLOR + '; background: ' + PAGE_WHITE + ';',
    '  color: ' + CATEGORY_COLOR + ';',
    '}',
    '.name {',
    '  margin: 0; width: 100%; height: 100%;',
    '  display: flex; align-items: center; justify-content: center;',
    '  text-align: center; text-transform: uppercase;',
    '  font-size: ' + nameMaxMm + 'mm; line-height: 0.92;',
    '  letter-spacing: 0.02em; color: #111111; overflow: hidden;',
    '  font-weight: 700;',
    '}',
    '.affiche.classic .name {',
    '  font-family: "Bodoni 72", Didot, Georgia, "Times New Roman", serif;',
    '  font-weight: 700;',
    '}',
    '.affiche.modern .name {',
    '  font-family: "Avenir Next", "Helvetica Neue", Arial, sans-serif;',
    '  font-weight: 800; letter-spacing: 0.01em;',
    '  color: ' + BORDER_OUTER_COLOR + ';',
    '}',

    '.zone-image {',
    '  position: relative; display: flex; align-items: center; justify-content: center;',
    '  min-height: 0; min-width: 0; padding: 0.5mm;',
    '  background: ' + PAGE_WHITE + ';',
    '  overflow: hidden;',
    '}',
    '.image-frame {',
    '  position: relative; z-index: 1;',
    '  width: 100%; height: 100%;',
    '  max-width: ' + m.imageMaxWMm + 'mm; max-height: ' + m.imageMaxHMm + 'mm;',
    '  display: flex; align-items: center; justify-content: center;',
    '  background: ' + PAGE_WHITE + ';',
    '  border: none; box-shadow: none;',
    '}',
    '.product-image {',
    '  width: 98%; height: 98%; object-fit: contain; object-position: center;',
    '  display: block; background: ' + PAGE_WHITE + ';',
    '  border: none; box-shadow: none;',
    '}',
    '.product-image.missing {',
    '  width: 100%; height: 100%; background: ' + PAGE_WHITE + '; border: none;',
    '}',

    '.zone-info {',
    '  display: grid; grid-template-columns: 1fr 0.45mm 1fr;',
    '  align-items: center; min-height: 0;',
    '  border-top: 0.35mm solid ' + BORDER_OUTER_COLOR + ';',
    '  padding: 0 1.5mm;',
    '  background: ' + PAGE_WHITE + ';',
    '}',
    '.info-half {',
    '  display: flex; flex-direction: column; align-items: center; justify-content: center;',
    '  text-align: center; gap: 0.8mm; padding: 0 1.5mm; min-width: 0;',
    '}',
    '.info-half.origin-half,',
    '.info-half.unit-half {',
    '  justify-self: center; align-self: center; width: 100%; max-width: 100%;',
    '}',
    '.info-divider {',
    '  width: 0.35mm; height: 70%; background: ' + BORDER_OUTER_COLOR + ';',
    '  justify-self: center; align-self: center;',
    '}',
    '.info-label {',
    '  font-family: "Avenir Next", "Helvetica Neue", Arial, sans-serif;',
    '  font-weight: 700; font-size: ' + labelMm + 'mm; letter-spacing: 0.14em;',
    '  color: #555555; text-transform: uppercase;',
    '}',
    '.affiche.classic .info-label { color: #111111; }',
    '.info-value {',
    '  font-family: "Avenir Next", "Helvetica Neue", Arial, sans-serif;',
    '  font-weight: 800; font-size: ' + valueMm + 'mm; color: #111111;',
    '  line-height: 1.05; word-break: break-word;',
    '}',

    '.zone-price {',
    '  display: flex; align-items: center; justify-content: center;',
    '  border-top: 0.45mm solid ' + BORDER_OUTER_COLOR + '; min-height: 0;',
    '  background: ' + PAGE_WHITE + ';',
    '  padding: 5mm 4mm 3mm 4mm;',
    '}',
    '.affiche.layout-landscape .zone-price {',
    '  padding: 3mm 3mm 4mm 3mm;',
    '}',
    '.price-guides {',
    '  display: flex; align-items: center; justify-content: center; gap: 2.5mm; height: auto;',
    '}',
    '.digit-box {',
    '  display: flex; align-items: center; justify-content: center;',
    '  width: ' + m.digitWMm + 'mm; height: ' + m.digitHMm + 'mm;',
    '  border: 0.45mm solid #B0B0B0; border-radius: 1.2mm;',
    '  font-family: "Avenir Next", "Helvetica Neue", Arial, sans-serif;',
    '  font-weight: 700; font-size: ' + (m.digitHMm * 0.66).toFixed(2) + 'mm;',
    '  color: #B0B0B0; background: ' + PAGE_WHITE + ';',
    '}',
    '.euro {',
    '  font-family: "Avenir Next", "Helvetica Neue", Arial, sans-serif;',
    '  font-weight: 800; font-size: ' + euroMm + 'mm; color: #A8A8A8; line-height: 1;',
    '}',
    '.price-printed {',
    '  display: inline-flex; align-items: baseline; justify-content: center; gap: 2.5mm;',
    '}',
    '.price-amount {',
    '  font-family: "Avenir Next", "Helvetica Neue", Arial, sans-serif;',
    '  font-weight: 900; font-size: ' + printedPriceMm + 'mm;',
    '  color: ' + PRICE_AMOUNT_COLOR + '; line-height: 0.95;',
    '}',
    '.price-euro {',
    '  font-family: "Avenir Next", "Helvetica Neue", Arial, sans-serif;',
    '  font-weight: 800; font-size: ' + printedEuroMm + 'mm;',
    '  color: #111111; line-height: 0.95;',
    '}',
    '.price-guides { opacity: 0.12; }',

    '@media screen { body { background: #dddddd; padding: 8px; }',
    '  .print-page { margin: 0 auto 12px; background: ' + PAGE_WHITE + ';',
    '    box-shadow: 0 2px 8px rgba(0,0,0,.12); } }',
  ].join('\n')

  const fitScript = [
    '(function(){',
    'function fit(){',
    'document.querySelectorAll(".affiche .name").forEach(function(el){',
    'var box=el.getBoundingClientRect(); if(!box.width||!box.height) return;',
    'var maxPx=Math.min(box.height*0.88, box.width*0.16);',
    'var minPx=Math.max(14, box.height*0.5);',
    'el.style.whiteSpace="nowrap"; el.style.fontSize=maxPx+"px"; el.style.lineHeight="0.92";',
    'var g=0;',
    'while((el.scrollWidth>el.clientWidth+1||el.scrollHeight>el.clientHeight+1)&&g<70){',
    'var n=parseFloat(el.style.fontSize)*0.92;',
    'if(n<minPx){el.style.fontSize=minPx+"px"; el.style.whiteSpace="normal"; el.style.lineHeight="0.88"; break;}',
    'el.style.fontSize=n+"px"; g++;',
    '}});}',
    'function run(){fit(); requestAnimationFrame(fit); setTimeout(fit,50); setTimeout(fit,200);}',
    'if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",run); else run();',
    'window.addEventListener("load",run);',
    '})();',
  ].join('')

  return [
    '<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8" />',
    '<title>Affiche prix</title>',
    '<style>',
    css,
    '</style>',
    '<script>',
    fitScript,
    '</script>',
    '</head><body>',
    pages.join(''),
    '</body></html>',
  ].join('')
}

export function assertNoAffichePageSplit(html: string): boolean {
  return (
    html.includes('page-break-inside: avoid') &&
    html.includes('break-inside: avoid') &&
    html.includes('affiche-cell')
  )
}

export function extractPrintText(html: string): string {
  const body = html.split(/<body[^>]*>/i)[1]?.split(/<\/body>/i)[0] ?? html
  return body
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

export function assertCleanPrintText(text: string): boolean {
  const forbidden = [
    'span',
    'class=',
    'unit-short',
    '/>',
    'code magasin',
    'prix à écrire',
    'placeholder',
    'la verdure',
  ]
  const lower = text.toLowerCase()
  if (forbidden.some((token) => lower.includes(token.toLowerCase()))) return false
  if (/<\s*span/i.test(text)) return false
  return true
}

export function assertNoLeakedMarkupInPrintHtml(html: string): boolean {
  if (html.includes('unit-short')) return false
  if (!html.includes('unit-label')) return false
  if (!html.includes('ORIGINE') || !html.includes('VENTE AU')) return false
  if (/la\s*verdure/i.test(html)) return false
  return assertCleanPrintText(extractPrintText(html))
}

export function assertNoStoreBranding(html: string): boolean {
  return !/la\s*verdure/i.test(html) && !/brochant/i.test(extractPrintText(html))
}
