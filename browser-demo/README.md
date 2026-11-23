# Top Fruit Affiches

Application **bureau macOS** (Apple Silicon) pour gérer le catalogue fruits & légumes et imprimer des **affiches prix** avec zone de prix vide (écriture au feutre).

100 % hors ligne : SQLite local (via sql.js / WASM), pas de compte, pas de serveur cloud.

## Prérequis

- macOS sur Apple Silicon (M1 / M2 / M3…)
- Node.js 20+ (arm64) pour le développement
- Xcode Command Line Tools recommandés

> Astuce : si le binaire Electron n’est pas téléchargé automatiquement (réseau / DNS), lancez `npm run ensure-electron`.

## Installation

```bash
cd TopFruitAffiches
npm install
```

## Lancer en développement

```bash
npm run dev
```

Ouvre l’app Electron (pas seulement le navigateur). L’interface est en français.

## Tests

```bash
npm test
```

Vérifie notamment :

- présence des **171** produits seed
- conservation des codes en double / orthographes legacy
- génération HTML/CSS d’impression sans coupure d’affiche (`page-break-inside: avoid`)

## Build production & packageur macOS arm64

```bash
# Build Vite + compilation Electron
npm run build

# Créer .app + .dmg + .zip (arm64, non signé)
npm run dist
```

Les artefacts sont dans `release/` :

- `Top Fruit Affiches-1.0.0-arm64.dmg`
- `Top Fruit Affiches-1.0.0-arm64.zip`
- `mac-arm64/Top Fruit Affiches.app`

### Première ouverture (app non signée)

macOS Gatekeeper peut bloquer l’app non signée :

1. Clic droit sur l’app → **Ouvrir** → confirmer  
   **ou**
2. Réglages Système → Confidentialité et sécurité → autoriser l’ouverture  
   **ou**
3. En terminal : `xattr -dr com.apple.quarantine "/chemin/vers/Top Fruit Affiches.app"`

## Fonctions principales

1. **Catalogue** — CRUD, archive/réactivation, recherche, import d’image locale
2. **Studio affiches** — modèles classique / moderne, formats A4/A5 + 2-up, aperçu, impression macOS, export PDF
3. **Revue images / données** — placeholders, doublons de codes, orthographes douteuses, codes absents (3, 9, 52)
4. **Sauvegarde** — backup / restauration SQLite, export CSV, chemins affichés dans l’UI

## Emplacement des données

Sous le dossier userData Electron, typiquement :

`~/Library/Application Support/Top Fruit Affiches/`

- `top-fruit.sqlite` — base
- `backups/` — sauvegardes
- `product-images/` — photos importées

Les illustrations placeholder (SVG libres générées pour l’app) sont dans les ressources de l’application.

## Scripts npm

| Script | Description |
|--------|-------------|
| `npm run dev` | Développement Electron + Vite |
| `npm test` | Tests Vitest |
| `npm run build` | Build renderer + main |
| `npm run dist` | Package DMG/ZIP arm64 |
| `npm run ensure-electron` | Télécharge/répare le binaire Electron arm64 |
| `npm run pack` | Package dossier `.app` seulement |
| `npx electron scripts/smoke-electron.cjs` | Smoke test PDF Electron |

## Notes

- Les codes magasin photographiés sont **conservés tels quels** (y compris doublons). Seul l’ID interne SQLite est unique.
- « GOMEO 53 » n’est **pas** corrigé en « GOMBO 52 ».
- Aucune dépendance réseau au runtime.
