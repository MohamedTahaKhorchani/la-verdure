import { describe, expect, it } from 'vitest'
import {
  ABSENT_STORE_CODES,
  EXPECTED_SEED_COUNT,
  KNOWN_DATA_WARNINGS,
  QUESTIONABLE_NAME_REASONS,
  SEED_PRODUCTS,
} from '../shared/seed-data'

describe('catalogue seed data', () => {
  it(`contains exactly ${EXPECTED_SEED_COUNT} products`, () => {
    expect(SEED_PRODUCTS).toHaveLength(EXPECTED_SEED_COUNT)
  })

  it('keeps photographed duplicate store codes', () => {
    const byCode = new Map<string, string[]>()
    for (const p of SEED_PRODUCTS) {
      byCode.set(p.storeCode, [...(byCode.get(p.storeCode) ?? []), p.name])
    }
    expect(byCode.get('53')?.sort()).toEqual(['GOMEO', 'GRELOT'].sort())
    expect(byCode.get('62')?.sort()).toEqual(['BROCOLIS', 'POIS GOURMAND'].sort())
    const choux = SEED_PRODUCTS.filter((p) => p.name === 'CHOUX BRUXELLES').map((p) => p.storeCode)
    expect(choux.sort()).toEqual(['18', '68'])
  })

  it('does not silently rename GOMEO to GOMBO', () => {
    expect(SEED_PRODUCTS.some((p) => p.name === 'GOMEO' && p.storeCode === '53')).toBe(true)
    expect(SEED_PRODUCTS.some((p) => p.name === 'GOMBO')).toBe(false)
  })

  it('documents absent codes 3, 9, 52', () => {
    expect(ABSENT_STORE_CODES).toEqual(['3', '9', '52'])
    const codes = new Set(SEED_PRODUCTS.map((p) => p.storeCode))
    for (const code of ABSENT_STORE_CODES) {
      expect(codes.has(code)).toBe(false)
    }
  })

  it('flags questionable spellings without correcting them', () => {
    for (const name of Object.keys(QUESTIONABLE_NAME_REASONS)) {
      expect(SEED_PRODUCTS.some((p) => p.name === name)).toBe(true)
    }
    expect(KNOWN_DATA_WARNINGS.length).toBeGreaterThanOrEqual(5)
  })

  it('assigns unique ordering identity via list position and non-empty fields', () => {
    for (const p of SEED_PRODUCTS) {
      expect(p.name.length).toBeGreaterThan(0)
      expect(p.storeCode.length).toBeGreaterThan(0)
      expect(['kg', 'piece']).toContain(p.sellingUnit)
      expect(p.category.length).toBeGreaterThan(0)
    }
  })
})
