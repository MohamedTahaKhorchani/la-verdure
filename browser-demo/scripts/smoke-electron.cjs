/**
 * Electron smoke: PDF generation works on this Mac.
 * Run: node scripts/ensure-electron.mjs && npx electron scripts/smoke-electron.cjs
 */
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const path = require('path')

const outDir = path.join(__dirname, '../.cache/smoke-output')
fs.mkdirSync(outDir, { recursive: true })

const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
@page { size: 210mm 297mm; margin: 0; }
.affiche-cell { page-break-inside: avoid; break-inside: avoid; width:210mm; height:297mm; border:1px solid #000; }
h1{font-size:28px;text-align:center}
.price{opacity:.4;font-size:40px;text-align:center}
</style></head><body>
<section class="affiche-cell"><h1>TOMATE RONDE</h1><div class="price">[8] € [8][8]</div></section>
</body></html>`

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 800, height: 1100 })
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
  const pdf = await win.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true })
  const pdfPath = path.join(outDir, 'smoke.pdf')
  fs.writeFileSync(pdfPath, pdf)
  console.log('SMOKE_PDF_OK', pdfPath, pdf.length)
  win.close()
  app.quit()
}).catch((e) => {
  console.error(e)
  app.exit(1)
})
