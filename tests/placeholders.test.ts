import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { SEED_PRODUCTS } from '../shared/seed-data'

describe('placeholder assets', () => {
  it('ships offline SVG placeholders for every seed category key', () => {
    const dir = path.join(__dirname, '../resources/placeholders')
    const keys = [...new Set(SEED_PRODUCTS.map((p) => p.placeholderKey))]
    for (const key of keys) {
      const file = path.join(dir, `${key}.svg`)
      expect(fs.existsSync(file), `missing ${file}`).toBe(true)
      const svg = fs.readFileSync(file, 'utf8')
      expect(svg).toContain('PLACEHOLDER')
      expect(svg).toContain('<svg')
    }
  })
})
