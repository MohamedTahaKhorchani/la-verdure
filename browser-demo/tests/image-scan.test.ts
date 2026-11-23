import { describe, expect, it } from 'vitest'
import {
  buildPreferredImageFilename,
  computeImageStatus,
  copyImageAtomic,
  extractCodeFromFilename,
  filesAreByteIdentical,
  formatBackupFilename,
  manifestKey,
  nameSuffixKeyFromFilename,
  normalizeNameKey,
  normalizeStoreCode,
  planImageScan,
  productImageStem,
  readProductImagesManifest,
  uniqueDestinationPath,
  writeProductImagesManifest,
} from '../shared/image-scan'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

describe('image filename matching', () => {
  it('extracts codes and ignores leading zeroes', () => {
    expect(extractCodeFromFilename('1.png')).toBe('1')
    expect(extractCodeFromFilename('001_AIL.png')).toBe('1')
    expect(extractCodeFromFilename('043_TOMATE_COCKTAIL.png')).toBe('43')
    expect(extractCodeFromFilename('071_CITRONS_VERT.png')).toBe('71')
    expect(extractCodeFromFilename('091_MACHE_VRAC.png')).toBe('91')
    expect(extractCodeFromFilename('092_CRESSON.png')).toBe('92')
    expect(extractCodeFromFilename('099_PERSIL_PLAT.png')).toBe('99')
    expect(extractCodeFromFilename('T904_RAISIN_SANS_PEPINS.png')).toBe('T904')
    expect(extractCodeFromFilename('t904_raisin.png')).toBe('T904')
    expect(extractCodeFromFilename('readme.txt')).toBeNull()
  })

  it('reads the name suffix after the code', () => {
    expect(nameSuffixKeyFromFilename('53_GOMEO.png')).toBe('GOMEO')
    expect(nameSuffixKeyFromFilename('62_POIS_GOURMAND.png')).toBe('POISGOURMAND')
    expect(nameSuffixKeyFromFilename('091_MACHE_VRAC.png')).toBe('MACHEVRAC')
    expect(nameSuffixKeyFromFilename('143.png')).toBeNull()
  })

  it('normalizes store codes', () => {
    expect(normalizeStoreCode('043')).toBe('43')
    expect(normalizeStoreCode('071')).toBe('71')
    expect(normalizeStoreCode('091')).toBe('91')
    expect(normalizeStoreCode('1')).toBe('1')
    expect(normalizeStoreCode('T904')).toBe('T904')
    expect(normalizeStoreCode('t904')).toBe('T904')
  })

  it('normalizes accented and punctuated names', () => {
    expect(normalizeNameKey('POIS GOURMAND')).toBe('POISGOURMAND')
    expect(normalizeNameKey('pois-gourmand')).toBe('POISGOURMAND')
    expect(normalizeNameKey('Échalotte')).toBe('ECHALOTTE')
    expect(normalizeNameKey("BETTRAVE S/VIDE")).toBe('BETTRAVESVIDE')
  })
})

describe('image status', () => {
  it('distinguishes assigned, placeholder and missing', () => {
    expect(
      computeImageStatus({ imagePath: 'images produits/1.png', imageIsPlaceholder: false }, true)
    ).toBe('assigned')
    expect(
      computeImageStatus({ imagePath: 'images produits/1.png', imageIsPlaceholder: false }, false)
    ).toBe('missing')
    expect(
      computeImageStatus({ imagePath: 'placeholders/legumes.svg', imageIsPlaceholder: true }, true)
    ).toBe('placeholder')
    expect(computeImageStatus({ imagePath: null, imageIsPlaceholder: true }, false)).toBe(
      'placeholder'
    )
  })
})

describe('safe scan planning', () => {
  const products = [
    {
      id: 1,
      storeCode: '1',
      name: 'AIL',
      isActive: true,
      imagePath: 'placeholders/legumes.svg',
      imageIsPlaceholder: true,
    },
    {
      id: 2,
      storeCode: '43',
      name: 'TOMATE COCKTAIL',
      isActive: true,
      imagePath: 'images produits/043_manual.jpg',
      imageIsPlaceholder: false,
    },
    {
      id: 3,
      storeCode: '62',
      name: 'BROCOLIS',
      isActive: true,
      imagePath: 'placeholders/legumes.svg',
      imageIsPlaceholder: true,
    },
    {
      id: 4,
      storeCode: '62',
      name: 'POIS GOURMAND',
      isActive: true,
      imagePath: 'placeholders/legumes.svg',
      imageIsPlaceholder: true,
    },
    {
      id: 5,
      storeCode: '53',
      name: 'GOMEO',
      isActive: true,
      imagePath: 'placeholders/legumes.svg',
      imageIsPlaceholder: true,
    },
    {
      id: 6,
      storeCode: '53',
      name: 'GRELOT',
      isActive: true,
      imagePath: 'placeholders/legumes.svg',
      imageIsPlaceholder: true,
    },
  ]

  it('auto-assigns unique codes without existing photo', () => {
    const plan = planImageScan(['1_AIL.png'], products)
    expect(plan.autoAssignments).toEqual([
      { file: '1_AIL.png', code: '1', productId: 1, name: 'AIL' },
    ])
    expect(plan.pendingDuplicates).toHaveLength(0)
  })

  it('still recognizes legacy code-only filenames when unique', () => {
    const plan = planImageScan(['1.png'], products)
    expect(plan.autoAssignments[0]?.productId).toBe(1)
  })

  it('does not overwrite an existing manual assignment', () => {
    const plan = planImageScan(['43_TOMATE_COCKTAIL.jpg'], products)
    expect(plan.autoAssignments).toHaveLength(0)
    expect(plan.skippedExisting.some((s) => s.name === 'TOMATE COCKTAIL')).toBe(true)
  })

  it('disambiguates duplicate codes with CODE_PRODUCT_NAME filenames', () => {
    const plan = planImageScan(
      ['53_GOMEO.png', '53_GRELOT.png', '62_BROCOLIS.png', '62_POIS_GOURMAND.png'],
      products
    )
    expect(plan.autoAssignments.map((a) => a.name).sort()).toEqual([
      'BROCOLIS',
      'GOMEO',
      'GRELOT',
      'POIS GOURMAND',
    ])
    expect(plan.pendingDuplicates).toHaveLength(0)
  })

  it('does not guess when a duplicate code has no name suffix', () => {
    const plan = planImageScan(['62.png'], products)
    expect(plan.autoAssignments).toHaveLength(0)
    expect(plan.pendingDuplicates).toHaveLength(1)
  })

  it('reports unknown codes without crashing', () => {
    const plan = planImageScan(['999_UNKNOWN.png'], products)
    expect(plan.unmatchedImages).toEqual([{ file: '999_UNKNOWN.png', code: '999' }])
  })

  it('can replace existing photos when requested', () => {
    const plan = planImageScan(['43_TOMATE_COCKTAIL.jpg'], products, undefined, {
      replaceExisting: true,
    })
    expect(plan.autoAssignments).toEqual([
      {
        file: '43_TOMATE_COCKTAIL.jpg',
        code: '43',
        productId: 2,
        name: 'TOMATE COCKTAIL',
      },
    ])
  })

  it('matches unambiguous product names when no code match', () => {
    const plan = planImageScan(['ail.jpg'], products)
    expect(plan.autoAssignments).toEqual([
      {
        file: 'ail.jpg',
        code: 'name',
        productId: 1,
        name: 'AIL',
      },
    ])
  })

  it('matches zero-padded filenames to unpadded catalogue codes', () => {
    const withPad = [
      ...products,
      {
        id: 7,
        storeCode: '91',
        name: 'MACHE VRAC',
        isActive: true,
        imagePath: 'placeholders/legumes.svg',
        imageIsPlaceholder: true,
      },
      {
        id: 8,
        storeCode: '92',
        name: 'CRESSON',
        isActive: true,
        imagePath: 'placeholders/legumes.svg',
        imageIsPlaceholder: true,
      },
      {
        id: 9,
        storeCode: 'T904',
        name: 'RAISIN SANS PEPINS',
        isActive: true,
        imagePath: 'placeholders/legumes.svg',
        imageIsPlaceholder: true,
      },
    ]
    const plan = planImageScan(
      ['091_MACHE_VRAC.png', '092_CRESSON.PNG', 'T904_RAISIN_SANS_PEPINS.jpeg'],
      withPad
    )
    expect(plan.autoAssignments.map((a) => a.name).sort()).toEqual([
      'CRESSON',
      'MACHE VRAC',
      'RAISIN SANS PEPINS',
    ])
    expect(plan.unmatchedImages).toHaveLength(0)
  })

  it('reports unmatched files without guessing', () => {
    const plan = planImageScan(['zzz_unknown.webp'], products)
    expect(plan.autoAssignments).toHaveLength(0)
    expect(plan.unmatchedImages[0]?.file).toBe('zzz_unknown.webp')
  })

  it('does not silently assign a second file to the same product', () => {
    const plan = planImageScan(['1_AIL.png', '1_AIL_ALT.png'], products)
    expect(plan.autoAssignments).toHaveLength(1)
    expect(plan.unmatchedImages.some((u) => u.file === '1_AIL_ALT.png')).toBe(true)
  })
})

describe('manual filename helpers', () => {
  it('builds CODE_PRODUCT_NAME filenames without zero-padding', () => {
    expect(buildPreferredImageFilename('43', 'TOMATE COCKTAIL', '.png')).toBe(
      '43_TOMATE_COCKTAIL.png'
    )
    expect(buildPreferredImageFilename('1', 'AIL', '.png')).toBe('1_AIL.png')
    expect(buildPreferredImageFilename('T904', 'RAISIN SANS PEPINS', '.png')).toBe(
      'T904_RAISIN_SANS_PEPINS.png'
    )
    expect(productImageStem('62', 'POIS GOURMAND')).toBe('62_POIS_GOURMAND')
    expect(manifestKey('091', 'MACHE VRAC')).toBe('91|MACHE_VRAC')
  })

  it('avoids overwriting existing files', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tfa-img-'))
    const first = path.join(dir, '43_TOMATE_COCKTAIL.png')
    fs.writeFileSync(first, 'x')
    const second = uniqueDestinationPath(dir, '43_TOMATE_COCKTAIL.png')
    expect(path.basename(second)).toBe('43_TOMATE_COCKTAIL-2.png')
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('copies atomically into a userData-like folder and detects identical bytes', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tfa-userdata-'))
    const src = path.join(dir, 'src.png')
    const dest = path.join(dir, 'images produits', '1_AIL.png')
    fs.writeFileSync(src, 'png-bytes-demo')
    copyImageAtomic(src, dest)
    expect(fs.existsSync(dest)).toBe(true)
    expect(filesAreByteIdentical(src, dest)).toBe(true)
    const manifestPath = path.join(dir, 'images produits', 'product-images.json')
    writeProductImagesManifest(manifestPath, { '1|AIL': '1_AIL.png' })
    expect(readProductImagesManifest(manifestPath)['1|AIL']).toBe('1_AIL.png')
    fs.rmSync(dir, { recursive: true, force: true })
  })
})

describe('backup filename', () => {
  it('includes date and time stamp', () => {
    const name = formatBackupFilename(new Date('2026-07-31T14:30:00'))
    expect(name).toBe('top-fruit-backup-2026-07-31-1430.sqlite')
  })
})
