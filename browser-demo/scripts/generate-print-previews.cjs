/**
 * Generate preview PDFs for all required paper formats (classic + modern samples).
 * Usage: ./node_modules/electron/dist/Electron.app/Contents/MacOS/Electron scripts/generate-print-previews.cjs
 */
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const path = require('path')
const { pathToFileURL } = require('url')

const root = path.join(__dirname, '..')
const outDir = path.join(root, '.cache/print-previews')

async function loadPrintModule() {
  // Prefer compiled shared via dynamic import of TS through Vite-less path:
  // Use a tiny inline rebuild by requiring the vitest/vite transform is heavy —
  // instead spawn node with --experimental-strip-types if available, else write temp JS.
  const src = fs.readFileSync(path.join(root, 'shared/print-layout.ts'), 'utf8')
  // Strip types enough for Function evaluation: not safe — use child with strip-types
  const { execFileSync } = require('child_process')
  const helper = path.join(root, '.cache/print-export.mjs')
  fs.mkdirSync(path.dirname(helper), { recursive: true })
  fs.writeFileSync(
    helper,
    `
import { buildPrintHtml } from '../shared/print-layout.ts'
import fs from 'fs'
import path from 'path'
const modelsKg = [
  { name: 'AIL', storeCode: '1', origin: 'France', category: 'Légumes', sellingUnit: 'kg', imageSrc: null, imageIsPlaceholder: true },
  { name: 'TOMATE COCKTAIL', storeCode: '43', origin: 'Espagne', category: 'Légumes', sellingUnit: 'kg', imageSrc: null, imageIsPlaceholder: true },
]
const modelsPiece = [
  { name: 'AVOCAT', storeCode: '113', origin: 'Pérou', category: 'Exotiques', sellingUnit: 'piece', imageSrc: null, imageIsPlaceholder: true },
]
const formats = [
  'a5-landscape',
  'a5-portrait',
  '2x-a5-landscape-on-a4-portrait',
  '2x-a5-portrait-on-a4-landscape',
  'a4-landscape',
  'a4-portrait',
]
const out = {}
for (const format of formats) {
  const models = format.includes('2x') ? [...modelsKg, ...modelsPiece] : modelsKg.slice(0, 1)
  out[format] = {
    classic: buildPrintHtml(models, 'classic', format),
    modern: buildPrintHtml(models, 'modern', format),
  }
}
fs.writeFileSync(process.argv[2], JSON.stringify(out))
`
  )
  const jsonOut = path.join(root, '.cache/print-html-bundle.json')
  const nodeBin = process.env.npm_node_execpath || process.env.NODE_BINARY || 'node'
  execFileSync(nodeBin, ['--experimental-strip-types', helper, jsonOut], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined },
  })
  return JSON.parse(fs.readFileSync(jsonOut, 'utf8'))
}

app.whenReady().then(async () => {
  try {
    fs.mkdirSync(outDir, { recursive: true })
    const bundle = await loadPrintModule()
    const win = new BrowserWindow({
      show: false,
      width: 1200,
      height: 1600,
      webPreferences: { sandbox: true },
    })

    for (const [format, templates] of Object.entries(bundle)) {
      for (const [template, html] of Object.entries(templates)) {
        // Guard against leaked markup before PDF
        if (/Le kilo\s*<span/i.test(html) || /Le kilo[^<]*span class=/i.test(html)) {
          throw new Error(`Leaked unit HTML in ${format}/${template}`)
        }
        if (/unit-short/.test(html)) {
          throw new Error(`unit-short still present in ${format}/${template}`)
        }
        const htmlPath = path.join(outDir, `${format}__${template}.html`)
        fs.writeFileSync(htmlPath, html, 'utf8')
        await win.loadURL(pathToFileURL(htmlPath).href)
        // Allow name-fit script to run (needs layout)
        await win.webContents.executeJavaScript(`
          new Promise((resolve) => {
            const run = () => {
              document.querySelectorAll('.affiche .name').forEach((el) => {
                const box = el.getBoundingClientRect();
                if (!box.width || !box.height) return;
                let maxPx = Math.min(box.height * 0.9, box.width * 0.2);
                const minPx = Math.max(14, box.height * 0.38);
                el.style.whiteSpace = 'nowrap';
                el.style.fontSize = maxPx + 'px';
                el.style.lineHeight = '0.98';
                let guard = 0;
                while ((el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1) && guard < 60) {
                  const next = parseFloat(el.style.fontSize) * 0.92;
                  if (next < minPx) {
                    el.style.fontSize = minPx + 'px';
                    el.style.whiteSpace = 'normal';
                    el.style.lineHeight = '0.88';
                    break;
                  }
                  el.style.fontSize = next + 'px';
                  guard += 1;
                }
              });
            };
            run();
            requestAnimationFrame(() => { run(); setTimeout(resolve, 120); });
          })
        `)
        const pdf = await win.webContents.printToPDF({
          printBackground: true,
          preferCSSPageSize: true,
          margins: { marginType: 'none' },
        })
        const pdfPath = path.join(outDir, `${format}__${template}.pdf`)
        fs.writeFileSync(pdfPath, pdf)
        console.log('WROTE', pdfPath, pdf.length)
      }
    }

    win.close()
    console.log('PREVIEWS_OK', outDir)
    app.quit()
  } catch (err) {
    console.error(err)
    app.exit(1)
  }
})
