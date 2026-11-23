import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import type { ImageImportResult, Product, SellingUnit } from '@shared/types'
import {
  COMMON_ORIGINS,
  DEFAULT_CATEGORIES,
  DEFAULT_A5_PDF_DISPOSITION,
  categoryOptionLabel,
  formatPriceHint,
  friendlyError,
  hasUnsavedCatalogueChanges,
  normalizeA5PdfDisposition,
  resolvePaperFormat,
  validateSessionPrice,
  type EditableProductFields,
  type OrientationChoice,
  type PaperSizeChoice,
} from '@shared/shop-workflow'
import { buildPrintHtml, toRenderModel } from '@shared/print-layout'
import type { A5PdfDisposition } from '@shared/types'
import { callApi } from '../lib/api'

function toFields(p: Product): EditableProductFields {
  return {
    name: p.name,
    storeCode: p.storeCode,
    origin: p.origin ?? '',
    category: p.category,
    sellingUnit: p.sellingUnit,
  }
}

function unitShort(unit: SellingUnit): string {
  return unit === 'kg' ? 'kg' : 'pièce'
}

const emptyFields: EditableProductFields = {
  name: '',
  storeCode: '',
  origin: '',
  category: 'Légumes',
  sellingUnit: 'kg',
}

type ProductRowProps = {
  product: Product
  selected: boolean
  onSelect: (product: Product) => void
}

const ProductRow = memo(function ProductRow({ product, selected, onSelect }: ProductRowProps) {
  return (
    <tr tabIndex={0} aria-selected={selected} aria-label={`Sélectionner ${product.name}`} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelect(product)}}} className={selected ? 'row-selected' : ''} onClick={() => onSelect(product)}>
      <td>{product.storeCode}</td>
      <td>
        <strong>{product.name}</strong>
      </td>
      <td>{product.origin || '—'}</td>
      <td>{product.category}</td>
      <td>{unitShort(product.sellingUnit)}</td>
      <td>
        {product.imageStatus === 'assigned' ? (
          <span className="thumb-dot" title="Photo associée" aria-label="Photo associée">
            ●
          </span>
        ) : (
          <span className="muted">—</span>
        )}
      </td>
    </tr>
  )
})

export default function MainWorkspacePage() {
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<string[]>([...DEFAULT_CATEGORIES])
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [fields, setFields] = useState<EditableProductFields | null>(null)
  const [baseline, setBaseline] = useState<EditableProductFields | null>(null)
  const [price, setPrice] = useState('')
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [hasRealImage, setHasRealImage] = useState(false)
  const [paperSize, setPaperSize] = useState<PaperSizeChoice>('a4')
  const [orientation, setOrientation] = useState<OrientationChoice>('portrait')
  const [a5PdfDisposition, setA5PdfDisposition] = useState<A5PdfDisposition>(DEFAULT_A5_PDF_DISPOSITION)
  const [showCutLine, setShowCutLine] = useState(true)
  const [previewHtml, setPreviewHtml] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [importing, setImporting] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [newForm, setNewForm] = useState<EditableProductFields>(emptyFields)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [withoutPhotoOnly, setWithoutPhotoOnly] = useState(false)
  const [importConfirm, setImportConfirm] = useState<Extract<
    ImageImportResult,
    { phase: 'needs_confirm' }
  > | null>(null)
  const [importSummary, setImportSummary] = useState<Extract<
    ImageImportResult,
    { phase: 'done' }
  > | null>(null)
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const imageCacheRef = useRef<Map<number, string>>(new Map())

  const paperFormat = useMemo(
    () => resolvePaperFormat(paperSize, orientation, a5PdfDisposition),
    [paperSize, orientation, a5PdfDisposition]
  )

  const dirty = hasUnsavedCatalogueChanges(baseline, fields ?? emptyFields)

  const searchableProducts = useMemo(
    () =>
      products.map((p) => ({
        product: p,
        haystack: `${p.name} ${p.storeCode}`.toLocaleLowerCase('fr-FR'),
      })),
    [products]
  )

  const loadProducts = useCallback(async () => {
    const [list, cats] = await Promise.all([
      callApi(() => window.topFruit.listProducts({ activeOnly: true })),
      callApi(() => window.topFruit.getCategories()),
    ])
    setProducts(list)
    setCategories([...new Set([...DEFAULT_CATEGORIES, ...cats])])
    return list
  }, [])

  useEffect(() => {
    void loadProducts().catch((e) => setError(friendlyError(e)))
  }, [loadProducts])

  const filtered = useMemo(() => {
    const q = deferredQuery.trim().toLocaleLowerCase('fr-FR')
    let list = q
      ? searchableProducts.filter((row) => row.haystack.includes(q)).map((row) => row.product)
      : products
    if (withoutPhotoOnly) {
      list = list.filter((p) => p.imageStatus !== 'assigned')
    }
    return list
  }, [products, searchableProducts, deferredQuery, withoutPhotoOnly])

  const withoutPhotoCount = useMemo(
    () => products.filter((p) => p.imageStatus !== 'assigned').length,
    [products]
  )

  async function finishImport(result: ImageImportResult) {
    if (result.phase === 'needs_confirm') {
      setImportConfirm(result)
      return
    }
    setImportConfirm(null)
    setImportSummary(result)
    await loadProducts()
    if (selectedId) {
      const fresh = (await loadProducts()).find((p) => p.id === selectedId)
      if (fresh) applySelection(fresh)
    }
  }

  async function onImportPhotos() {
    setBusy(true)
    setImporting(true)
    setError(null)
    setImportSummary(null)
    try {
      const result = await callApi(() => window.topFruit.importProductImages())
      await finishImport(result)
    } catch (e) {
      const msg = friendlyError(e)
      if (!msg.toLowerCase().includes('annul')) setError(msg)
    } finally {
      setBusy(false)
      setImporting(false)
    }
  }

  async function onImportConfirm(replaceExisting: boolean) {
    setBusy(true)
    setImporting(true)
    setError(null)
    try {
      const result = await callApi(() =>
        window.topFruit.importProductImages({ replaceExisting })
      )
      await finishImport(result)
    } catch (e) {
      setImportConfirm(null)
      setError(friendlyError(e))
    } finally {
      setBusy(false)
      setImporting(false)
    }
  }

  function confirmLeaveIfDirty(): boolean {
    if (!dirty) return true
    return window.confirm('Des modifications n’ont pas été enregistrées. Continuer sans enregistrer ?')
  }

  function applySelection(product: Product) {
    setSelectedId(product.id)
    const f = toFields(product)
    setFields(f)
    setBaseline(f)
    setPrice('')
    setConfirmDelete(false)
    setError(null)
    setMessage(null)

    const cached = imageCacheRef.current.get(product.id)
    if (cached) {
      setImagePreview(cached)
      setHasRealImage(true)
      return
    }

    if (product.imageStatus !== 'assigned' || product.imageIsPlaceholder) {
      setImagePreview(null)
      setHasRealImage(false)
      return
    }

    void callApi(() => window.topFruit.getProductImagePreview(product.id))
      .then((data) => {
        const src = data.imagePreview
        if (src) imageCacheRef.current.set(product.id, src)
        setImagePreview(src)
        setHasRealImage(Boolean(src) && !data.imageIsPlaceholder)
      })
      .catch((e) => setError(friendlyError(e)))
  }

  const onSelectProduct = useCallback(
    (product: Product) => {
      if (selectedId === product.id) return
      if (!confirmLeaveIfDirty()) return
      applySelection(product)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedId, dirty]
  )

  function updateField<K extends keyof EditableProductFields>(key: K, value: EditableProductFields[K]) {
    setFields((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  // Local preview: no IPC / no base64 re-encode on every price keystroke.
  useEffect(() => {
    if (previewTimer.current) clearTimeout(previewTimer.current)
    previewTimer.current = setTimeout(() => {
      if (!selectedId || !fields) {
        setPreviewHtml('')
        return
      }
      const priceCheck = validateSessionPrice(price)
      if (!priceCheck.ok) {
        setError(priceCheck.error)
        return
      }
      try {
        const productStub: Product = {
          id: selectedId,
          name: fields.name,
          storeCode: fields.storeCode,
          origin: fields.origin,
          category: fields.category,
          sellingUnit: fields.sellingUnit,
          imagePath: null,
          imageSource: '',
          imageIsPlaceholder: !hasRealImage,
          warningNote: null,
          isActive: true,
          createdAt: '',
          updatedAt: '',
        }
        const model = toRenderModel(
          productStub,
          {
            origin: fields.origin,
            category: fields.category,
            sellingUnit: fields.sellingUnit,
            price: price.trim() || undefined,
          },
          hasRealImage ? imagePreview : null
        )
        setPreviewHtml(buildPrintHtml([model], 'modern', paperFormat, { showCutLine }))
        setError(null)
      } catch (e) {
        setError(friendlyError(e))
      }
    }, 280)
    return () => {
      if (previewTimer.current) clearTimeout(previewTimer.current)
    }
  }, [selectedId, fields, price, paperFormat, imagePreview, hasRealImage, showCutLine])

  async function onSave() {
    if (!selectedId || !fields) return
    setBusy(true)
    setError(null)
    try {
      if (!fields.name.trim()) throw new Error('Veuillez entrer un nom de produit.')
      if (!fields.storeCode.trim()) throw new Error('Veuillez entrer un code produit.')
      const updated = await callApi(() =>
        window.topFruit.updateProduct(selectedId, {
          name: fields.name.trim(),
          storeCode: fields.storeCode.trim(),
          origin: fields.origin.trim(),
          category: fields.category,
          sellingUnit: fields.sellingUnit,
        })
      )
      await loadProducts()
      applySelection(updated)
      setMessage('Modifications enregistrées')
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setBusy(false)
    }
  }

  async function onPickImage(sample=false) {
    if (!selectedId) return
    setBusy(true)
    setError(null)
    try {
      const updated = await callApi(() => sample ? window.topFruit.useSampleImage(selectedId) : window.topFruit.pickAndSetProductImage(selectedId))
      if (updated.imagePreview) {
        imageCacheRef.current.set(selectedId, updated.imagePreview)
      } else {
        imageCacheRef.current.delete(selectedId)
      }
      await loadProducts()
      applySelection(updated)
      setMessage('Photo enregistrée')
    } catch (e) {
      const msg = friendlyError(e)
      if (!msg.toLowerCase().includes('annul')) setError(msg)
    } finally {
      setBusy(false)
    }
  }

  async function onClearImage() {
    if (!selectedId) return
    setBusy(true)
    try {
      imageCacheRef.current.delete(selectedId)
      const updated = await callApi(() => window.topFruit.clearProductImage(selectedId))
      await loadProducts()
      applySelection(updated)
      setMessage('Photo retirée')
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setBusy(false)
    }
  }

  function buildPrintRequest() {
    if (!selectedId || !fields) throw new Error('Sélectionnez un produit.')
    const priceCheck = validateSessionPrice(price)
    if (!priceCheck.ok) throw new Error(priceCheck.error)
    return {
      items: [
        {
          productId: selectedId,
          overrides: {
            origin: fields.origin,
            category: fields.category,
            sellingUnit: fields.sellingUnit,
            price: price.trim() || undefined,
          },
        },
      ],
      template: 'modern' as const,
      paperFormat,
      copies: 1,
      saveOverridesToCatalogue: false,
      a5PdfDisposition: normalizeA5PdfDisposition(a5PdfDisposition),
      showCutLine,
    }
  }

  // Soft cancel should not surface as a hard error in the employee UI.
  async function onPrint() {
    setBusy(true)
    setError(null)
    try {
      await callApi(() => window.topFruit.printAffiches(buildPrintRequest()))
      setMessage('Dialogue d’impression ouvert')
    } catch (e) {
      const msg = friendlyError(e)
      if (!msg.toLowerCase().includes('annul')) setError(msg)
    } finally {
      setBusy(false)
    }
  }

  async function onPdf() {
    setBusy(true)
    setError(null)
    try {
      const { path: savedPath } = await callApi(() =>
        window.topFruit.exportPdf(buildPrintRequest())
      )
      setMessage(savedPath || 'Dialogue d’impression ouvert : choisissez Enregistrer au format PDF')
    } catch (e) {
      const msg = friendlyError(e)
      if (!msg.toLowerCase().includes('annul')) setError(msg)
    } finally {
      setBusy(false)
    }
  }

  async function onCreate() {
    setBusy(true)
    setError(null)
    try {
      if (!newForm.name.trim()) throw new Error('Veuillez entrer un nom de produit.')
      if (!newForm.storeCode.trim()) throw new Error('Veuillez entrer un code produit.')
      const created = await callApi(() =>
        window.topFruit.createProduct({
          name: newForm.name.trim(),
          storeCode: newForm.storeCode.trim(),
          origin: newForm.origin.trim(),
          category: newForm.category,
          sellingUnit: newForm.sellingUnit,
          imagePath: null,
          imageSource: '',
          imageIsPlaceholder: true,
          warningNote: null,
          isActive: true,
        })
      )
      setShowAdd(false)
      setNewForm(emptyFields)
      await loadProducts()
      applySelection(created)
      setMessage('Produit ajouté')
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setBusy(false)
    }
  }

  async function onDelete() {
    if (!selectedId || !fields) return
    setBusy(true)
    setError(null)
    try {
      await callApi(() => window.topFruit.deleteProduct(selectedId))
      setConfirmDelete(false)
      setSelectedId(null)
      setFields(null)
      setBaseline(null)
      setPrice('')
      setImagePreview(null)
      setPreviewHtml('')
      await loadProducts()
      setMessage('Produit supprimé')
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setBusy(false)
    }
  }

  const priceHint = formatPriceHint(price)

  return (
    <div className="workspace">
      <header className="workspace-top">
        <input
          className="workspace-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher un produit..."
          aria-label="Rechercher un produit"
        />
        <button
          type="button"
          className={`filter-chip ${withoutPhotoOnly ? 'active' : ''}`}
          onClick={() => setWithoutPhotoOnly((v) => !v)}
        >
          Sans photo ({withoutPhotoCount})
        </button>
        <button
          type="button"
          className="btn"
          disabled
          onClick={() => void onImportPhotos()}
         title="Import de dossier : application de bureau uniquement">
          {importing ? 'Importation en cours…' : 'Importer un dossier d’images'}
        </button>
        <button type="button" className="btn btn-primary btn-lg" onClick={() => setShowAdd(true)}>
          + Ajouter un produit
        </button>
      </header>

      {error && <div className="alert error">{error}</div>}
      {message && <div className="alert success">{message}</div>}

      <div className="workspace-grid">
        <section className="workspace-panel">
          <h2 className="workspace-h2">Produits ({filtered.length})</h2>
          <div className="table-wrap workspace-table">
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Produit</th>
                  <th>Origine</th>
                  <th>Catégorie</th>
                  <th>Unité</th>
                  <th>Photo</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <ProductRow
                    key={`${p.storeCode}|${p.name}|${p.id}`}
                    product={p}
                    selected={p.id === selectedId}
                    onSelect={onSelectProduct}
                  />
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="empty-hint">
                      Aucun produit trouvé
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="workspace-panel workspace-right">
          {!fields ? (
            <div className="empty-hint large">Cliquez sur un produit dans la liste</div>
          ) : (
            <>
              <h2 className="workspace-h2">Produit sélectionné</h2>

              <div className="photo-stage compact">
                {hasRealImage && imagePreview ? (
                  <img src={imagePreview} alt="" className="photo-preview" />
                ) : (
                  <div className="photo-missing">Aucune photo</div>
                )}
              </div>
              <div className="inline">
                <button type="button" className="btn" disabled={busy} onClick={() => void onPickImage()}>
                  Choisir une photo
                </button><button type="button" className="btn" disabled={busy} onClick={()=>void onPickImage(true)}>Utiliser une illustration exemple</button>
                <button type="button" className="btn btn-ghost" disabled={busy || !hasRealImage} onClick={() => void onClearImage()}>
                  Supprimer la photo
                </button>
              </div>

              <div className="shop-form">
                <div className="field">
                  <label>Nom du produit</label>
                  <input aria-label="Nom du produit" value={fields.name} onChange={(e) => updateField('name', e.target.value)} />
                </div>
                <div className="field">
                  <label>Code</label>
                  <input aria-label="Code produit" value={fields.storeCode} onChange={(e) => updateField('storeCode', e.target.value)} />
                </div>
                <div className="field">
                  <label>Origine</label>
                  <input
                    aria-label="Origine" list="origin-suggestions"
                    value={fields.origin}
                    onChange={(e) => updateField('origin', e.target.value)}
                  />
                  <datalist id="origin-suggestions">
                    {COMMON_ORIGINS.map((o) => (
                      <option key={o} value={o} />
                    ))}
                  </datalist>
                </div>
                <div className="field">
                  <label>Catégorie</label>
                  <select aria-label="Catégorie" value={fields.category} onChange={(e) => updateField('category', e.target.value)}>
                    {categories.map((c) => (
                      <option key={c} value={c}>
                        {categoryOptionLabel(c)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Unité</label>
                  <div className="unit-toggle">
                    <button
                      type="button"
                      className={fields.sellingUnit === 'kg' ? 'active' : ''}
                      onClick={() => updateField('sellingUnit', 'kg')}
                    >
                      Kilo
                    </button>
                    <button
                      type="button"
                      className={fields.sellingUnit === 'piece' ? 'active' : ''}
                      onClick={() => updateField('sellingUnit', 'piece')}
                    >
                      À la pièce
                    </button>
                  </div>
                </div>
              </div>

              <div className="inline">
                <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void onSave()}>
                  Enregistrer
                </button>
                <button type="button" className="btn btn-danger" disabled={busy} onClick={() => setConfirmDelete(true)}>
                  Supprimer le produit
                </button>
              </div>

              <hr className="workspace-sep" />

              <div className="field">
                <label>Prix (pour l’affiche)</label>
                <input
                  className="price-input"
                  aria-label="Prix pour l’affiche" value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="2,99"
                  inputMode="decimal"
                />
                {priceHint && <span className="price-hint">{priceHint}</span>}
              </div>

              <div className="field">
                <label>Format</label>
                <div className="choice-row">
                  <button
                    type="button"
                    className={`choice-btn ${paperSize === 'a4' ? 'active' : ''}`}
                    onClick={() => setPaperSize('a4')}
                  >
                    A4
                  </button>
                  <button
                    type="button"
                    className={`choice-btn ${paperSize === 'a5' ? 'active' : ''}`}
                    onClick={() => setPaperSize('a5')}
                  >
                    A5
                  </button>
                </div>
              </div>
              <div className="field">
                <label>Orientation</label>
                <div className="choice-row">
                  <button
                    type="button"
                    className={`choice-btn ${orientation === 'portrait' ? 'active' : ''}`}
                    onClick={() => setOrientation('portrait')}
                  >
                    Portrait
                  </button>
                  <button
                    type="button"
                    className={`choice-btn ${orientation === 'landscape' ? 'active' : ''}`}
                    onClick={() => setOrientation('landscape')}
                  >
                    Paysage
                  </button>
                </div>
              </div>

              {paperSize === 'a5' && (
                <>
                  <div className="field">
                    <label>Disposition PDF</label>
                    <div className="choice-row choice-row-stack">
                      <button
                        type="button"
                        className={`choice-btn ${a5PdfDisposition === 'single-a5' ? 'active' : ''}`}
                        onClick={() => setA5PdfDisposition('single-a5')}
                      >
                        1 affiche A5
                      </button>
                      <button
                        type="button"
                        className={`choice-btn ${a5PdfDisposition === 'two-a5-on-a4' ? 'active' : ''}`}
                        onClick={() => setA5PdfDisposition('two-a5-on-a4')}
                      >
                        2 affiches A5 sur une page A4
                      </button>
                    </div>
                  </div>
                  {a5PdfDisposition === 'two-a5-on-a4' && (
                    <label className="check-inline">
                      <input
                        type="checkbox"
                        checked={showCutLine}
                        onChange={(e) => setShowCutLine(e.target.checked)}
                      />
                      Afficher la ligne de découpe
                    </label>
                  )}
                </>
              )}

              <h3 className="workspace-h3">Aperçu affiche</h3>
              {previewHtml ? (
                <iframe title="Aperçu" className="preview-frame workspace-preview" srcDoc={previewHtml} />
              ) : (
                <div className="empty-hint">L’aperçu apparaîtra ici</div>
              )}

              <div className="inline print-actions">
                <button type="button" className="btn btn-primary btn-lg" disabled={busy} onClick={() => void onPrint()}>
                  Imprimer
                </button>
                <button type="button" className="btn btn-lg" disabled={busy} onClick={() => void onPdf()}>
                  Enregistrer en PDF
                </button>
              </div>
            </>
          )}
        </section>
      </div>

      {showAdd && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal">
            <h2>Ajouter un produit</h2>
            <div className="shop-form">
              <div className="field">
                <label>Nom du produit</label>
                <input value={newForm.name} onChange={(e) => setNewForm({ ...newForm, name: e.target.value })} />
              </div>
              <div className="field">
                <label>Code</label>
                <input
                  value={newForm.storeCode}
                  onChange={(e) => setNewForm({ ...newForm, storeCode: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Origine</label>
                <input value={newForm.origin} onChange={(e) => setNewForm({ ...newForm, origin: e.target.value })} />
              </div>
              <div className="field">
                <label>Catégorie</label>
                <select
                  value={newForm.category}
                  onChange={(e) => setNewForm({ ...newForm, category: e.target.value })}
                >
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {categoryOptionLabel(c)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Unité</label>
                <div className="unit-toggle">
                  <button
                    type="button"
                    className={newForm.sellingUnit === 'kg' ? 'active' : ''}
                    onClick={() => setNewForm({ ...newForm, sellingUnit: 'kg' })}
                  >
                    Kilo
                  </button>
                  <button
                    type="button"
                    className={newForm.sellingUnit === 'piece' ? 'active' : ''}
                    onClick={() => setNewForm({ ...newForm, sellingUnit: 'piece' })}
                  >
                    À la pièce
                  </button>
                </div>
              </div>
            </div>
            <div className="inline" style={{ marginTop: 16 }}>
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void onCreate()}>
                Ajouter
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setShowAdd(false)}>
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && fields && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal">
            <h2>Supprimer « {fields.name} » ?</h2>
            <p className="page-sub">Cette action retire le produit du catalogue.</p>
            <div className="inline">
              <button type="button" className="btn btn-ghost" onClick={() => setConfirmDelete(false)}>
                Annuler
              </button>
              <button type="button" className="btn btn-danger" disabled={busy} onClick={() => void onDelete()}>
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}

      {importConfirm && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal">
            <h2>Certains produits ont déjà une photo. Voulez-vous les remplacer ?</h2>
            <p className="page-sub">
              {importConfirm.conflictCount} produit(s) concernés · {importConfirm.imagesFound} photo(s)
              trouvée(s)
            </p>
            <div className="inline">
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() => void onImportConfirm(false)}
              >
                Conserver
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy}
                onClick={() => void onImportConfirm(true)}
              >
                Remplacer
              </button>
            </div>
          </div>
        </div>
      )}

      {importSummary && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal">
            <h2>Importation terminée</h2>
            <p>
              {importSummary.catalogueProducts} produits trouvés
              <br />
              {importSummary.associated} images associées
              <br />
              {importSummary.missingProducts.length} image
              {importSummary.missingProducts.length === 1 ? '' : 's'} manquante
              {importSummary.missingProducts.length === 1 ? '' : 's'}
              <br />
              {importSummary.unmatchedFiles.length + importSummary.invalidFiles.length} fichier
              {importSummary.unmatchedFiles.length + importSummary.invalidFiles.length === 1
                ? ''
                : 's'}{' '}
              non reconnu
              {importSummary.unmatchedFiles.length + importSummary.invalidFiles.length === 1
                ? ''
                : 's'}
            </p>
            {(importSummary.unmatchedFiles.length > 0 ||
              importSummary.ambiguousMatches.length > 0 ||
              importSummary.invalidFiles.length > 0 ||
              importSummary.missingProducts.length > 0) && (
              <div className="page-sub" style={{ maxHeight: 220, overflow: 'auto', textAlign: 'left' }}>
                {importSummary.unmatchedFiles.length > 0 && (
                  <>
                    <strong>Fichiers non reconnus</strong>
                    <ul>
                      {importSummary.unmatchedFiles.map((u) => (
                        <li key={u.file}>
                          {u.file} (code {u.code})
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                {importSummary.ambiguousMatches.length > 0 && (
                  <>
                    <strong>Correspondances ambiguës</strong>
                    <ul>
                      {importSummary.ambiguousMatches.map((a) => (
                        <li key={a.file}>
                          {a.file} → {a.candidates.join(' / ')}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                {importSummary.invalidFiles.length > 0 && (
                  <>
                    <strong>Fichiers invalides</strong>
                    <ul>
                      {importSummary.invalidFiles.map((f) => (
                        <li key={f}>{f}</li>
                      ))}
                    </ul>
                  </>
                )}
                {importSummary.missingProducts.length > 0 && (
                  <>
                    <strong>Produits sans image</strong>
                    <ul>
                      {importSummary.missingProducts.slice(0, 40).map((p) => (
                        <li key={`${p.storeCode}-${p.name}`}>
                          {p.storeCode} — {p.name}
                        </li>
                      ))}
                      {importSummary.missingProducts.length > 40 && (
                        <li>… et {importSummary.missingProducts.length - 40} autres</li>
                      )}
                    </ul>
                  </>
                )}
              </div>
            )}
            <button type="button" className="btn btn-primary" onClick={() => setImportSummary(null)}>
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
