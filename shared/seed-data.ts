import type { ProductCategory, SellingUnit } from './types'

export interface SeedProduct {
  name: string
  storeCode: string
  category: ProductCategory
  sellingUnit: SellingUnit
  origin: string
  warningNote: string | null
  placeholderKey: string
}

/** Heuristic category / unit assignment for the legacy photographed list. */
function inferMeta(name: string): { category: ProductCategory; sellingUnit: SellingUnit; placeholderKey: string } {
  const n = name.toUpperCase()

  const herbs = ['ANETH', 'BASILIC', 'CERFEUIL', 'CIBOULETTE', 'CORIANDRE', 'ESTRAGON', 'LAURIER', 'MENTHE', 'PERSIL', 'ROMARIN', 'THYM', 'OSEILLE']
  const mushrooms = ['CEPES', 'CHAMPIGNON', 'CHANTERELLE', 'GIROLLES', 'PIED DE MOUTON', 'PLEUROTTES']
  const salads = ['BATAVIA', 'CRESSON', 'FEUILLE', 'FRISE', 'ISBERG', 'LAITUE', 'MACHE', 'MESCLIN', 'ROMAINE', 'ROQUETTE', 'ROUGETTE', 'SALADE', 'SCAROLE', 'TREVISSSE']
  const potatoes = ['PDT', 'PATATE', 'RATTES', 'TOPINAMBOURG']
  const citrus = ['CITRON', 'CLEMENT', 'CLEM.', 'CLEMENVILLA', 'ORANGE', 'ORANGUE', 'POMELOS']
  const exotic = ['ANANAS', 'ANONE', 'AVOCAT', 'BANANE', 'COCO', 'GINGEMBRE', 'KAKI', 'KIWI', 'LITCHIS', 'MANGUE', 'MANIOC', 'PAPAYES', 'PHYSALIS']
  const fruits = [
    'CERISES', 'COING', 'FRAISES', 'MARRONS', 'NOISETTE', 'NOIX', 'POIRE', 'POM ', 'POMME', 'RAISIN',
  ]

  if (herbs.some((x) => n.includes(x))) return { category: 'Herbes', sellingUnit: 'piece', placeholderKey: 'herbes' }
  if (mushrooms.some((x) => n.includes(x))) return { category: 'Champignons', sellingUnit: 'kg', placeholderKey: 'champignons' }
  if (salads.some((x) => n.includes(x))) return { category: 'Salades', sellingUnit: 'piece', placeholderKey: 'salades' }
  if (potatoes.some((x) => n.includes(x))) return { category: 'Pommes de terre', sellingUnit: 'kg', placeholderKey: 'pommes-de-terre' }
  if (citrus.some((x) => n.includes(x))) return { category: 'Agrumes', sellingUnit: 'kg', placeholderKey: 'agrumes' }
  if (exotic.some((x) => n.includes(x))) {
    const pieceExotic = ['ANANAS', 'AVOCAT', 'BANANE', 'COCO', 'KIWI', 'MANGUE', 'PAPAYES', 'PHYSALIS', 'ANONE']
    const unit: SellingUnit = pieceExotic.some((x) => n.includes(x)) ? 'piece' : 'kg'
    return { category: 'Exotiques', sellingUnit: unit, placeholderKey: 'exotiques' }
  }
  if (fruits.some((x) => n.includes(x))) return { category: 'Fruits', sellingUnit: 'kg', placeholderKey: 'fruits' }

  // Piece-like vegetables
  if (['AIL', 'ECHALOTTE', 'CONCOMBRE', 'CHOUX FLEUR', 'MELON'].some((x) => n.includes(x))) {
    return { category: 'Légumes', sellingUnit: n.includes('FILET') ? 'piece' : n.startsWith('AIL') || n.startsWith('ECHALOTTE') ? 'kg' : 'piece', placeholderKey: 'legumes' }
  }

  return { category: 'Légumes', sellingUnit: 'kg', placeholderKey: 'legumes' }
}

/**
 * Legacy store list — codes kept exactly as photographed, including duplicates.
 * Internal DB ids remain unique; storeCode is intentionally non-unique.
 */
const RAW_SEED: Array<[string, string]> = [
  ['AIL', '1'],
  ['AIL FILET', '8'],
  ['ANANAS', '119'],
  ['ANANAS AVION', '118'],
  ['ANANAS VICTORIA', '120'],
  ['ANETH', '104'],
  ['ANONE', '124'],
  ['ARTICHAUD VERT', '57'],
  ['ARTICHAUX VIOLET', '58'],
  ['AUBERGINE', '33'],
  ['AVOCAT', '113'],
  ['AVOCAT 3', '114'],
  ['BANANE', '125'],
  ['BANANE MINI', '126'],
  ['BASILIC', '103'],
  ['BATAVIA', '80'],
  ['BETTRAVE CUITE', '65'],
  ['BETTRAVE S/VIDE', '66'],
  ['BLETTES', '22'],
  ['BROCOLIS', '62'],
  ['CARDE', '79'],
  ['CAROTTE', '28'],
  ['CAROTTE BOTTE', '98'],
  ['CELERI BRANCHE', '20'],
  ['CELERI RAVE', '19'],
  ['CEPES', '49'],
  ['CERFEUIL', '108'],
  ['CERISES', '171'],
  ['CHAMPIGNON', '50'],
  ['CHANTERELLE', '48'],
  ['CHOUX BRUXELLES', '18'],
  ['CHOUX BRUXELLES', '68'],
  ['CHOUX FLEUR', '24'],
  ['CHOUX VERT', '21'],
  ['CIBOULETTE', '105'],
  ['CITRONS', '70'],
  ['CITRONS VERT', '71'],
  ['CLEMENTINE BRIO', '129'],
  ['CLEMENTINE CORSE', '127'],
  ['CLEMENTINE ESPAGNE', '128'],
  ['CLEM. SOCCULENTE', '130'],
  ['CLEMENVILLA', '131'],
  ['COCO', '51'],
  ['COING', '166'],
  ['CONCOMBRE', '55'],
  ['CONCOMBRE SAUVAGE', '56'],
  ['CORIANDRE', '101'],
  ['CORNE BOEUF', '34'],
  ['COURGETTE', '29'],
  ['COURGETTE RONDE', '39'],
  ['CRESSON', '92'],
  ['ECHALOTTE', '6'],
  ['ECHALOTTE FILET', '7'],
  ['ENDIVES', '35'],
  ['EPINARD', '23'],
  ['ESTRAGON', '107'],
  ['FENOUIL', '36'],
  ['FEUILLE ROUGE', '83'],
  ['FEUILLE VERTE', '82'],
  ['FEVE', '72'],
  ['FRAISES', '172'],
  ['FRISE', '87'],
  ['GINGEMBRE', '10'],
  ['GIROLLES', '45'],
  ['GOMEO', '53'],
  ['GRELOT', '53'],
  ['HARICOT BAR', '73'],
  ['HARICOT ECOSSE', '63'],
  ['HARICOT EXTRA FIN', '61'],
  ['HARICOT M.TOUT', '60'],
  ['ISBERG', '89'],
  ['KAKI', '170'],
  ['KIWI 5', '115'],
  ['LAITUE', '81'],
  ['LAURIER', '111'],
  ['LITCHIS', '165'],
  ['MACHE B', '90'],
  ['MACHE VRAC', '91'],
  ['MANGUE', '116'],
  ['MANGUE 2', '117'],
  ['MANIOC', '17'],
  ['MARRONS', '169'],
  ['MENTHE', '102'],
  ['MESCLIN', '94'],
  ['MINI COMBRE', '54'],
  ['NAVET', '27'],
  ['NAVET BOTTES', '97'],
  ['NOISETTE', '168'],
  ['NOIX', '167'],
  ['OIGNON BLANC', '2'],
  ['OIGNON BOTTE', '96'],
  ['OIGNON DOUX', '4'],
  ['OIGNON VRAC', '5'],
  ['ORANGE A JUS', '134'],
  ['ORANGE SANGUINE', '135'],
  ['ORANGUE SOCULLENTE', '132'],
  ['ORANGE TABLE', '133'],
  ['OSEILLE', '109'],
  ['PAPAYES 2', '121'],
  ['PATATE DOUCE', '15'],
  ['PDT BINJ', '12'],
  ['PDT CHARLOTTE', '14'],
  ['PDT POMPADOUR', '11'],
  ['PDT ROSVAL', '13'],
  ['PERSIL FRISE', '100'],
  ['PERSIL PLAT', '99'],
  ['PETIT POIS', '64'],
  ['PHYSALIS', '123'],
  ['PIED DE MOUTON', '47'],
  ['PIMENTS BLANC', '38'],
  ['PIMENT VERT', '37'],
  ['PLEUROTTES', '46'],
  ['POIRE COMICE', '136'],
  ['POIRE COMEXTRA', '137'],
  ['POIRE CONFERENCE', '138'],
  ['POIRE GUIYOT', '141'],
  ['POIRE LUISE BONNE', '140'],
  ['POIRE WILLIAMS', '139'],
  ['POIREAUX', '25'],
  ['POIS GOURMAND', '62'],
  ['POIS GOURM BAR', '74'],
  ['POIVRADE', '59'],
  ['POIVRON JAUNE', '32'],
  ['POIVRON ROUGE', '30'],
  ['POIVRON VERT', '31'],
  ['POMELOS 3', '122'],
  ['POM BEURRE HARDY', '142'],
  ['POMME BREABERNE', '150'],
  ['POMME BSCOOP', '153'],
  ['POMME CHANTE', '157'],
  ['POMME REINETTE', '152'],
  ['POMME ELSTAR', '151'],
  ['POMME FUJI', '154'],
  ['POMME GALA EX', '145'],
  ['POMME GOLDEN', '143'],
  ['POMME GOLDEN EX', '144'],
  ['POMME GRA SMITH', '148'],
  ['POMME JONAGORED', '149'],
  ['POMME PINK LADY', '155'],
  ['POMME POIRE', '158'],
  ['POMME ROUGE', '147'],
  ['POMME ROYAL EX', '146'],
  ['POMME TENTATION', '156'],
  ['POTIRONS', '26'],
  ['RADIS NOIR', '77'],
  ['RADIS ROSE', '75'],
  ['RADIS ROUGE', '76'],
  ['RAISIN BLANC', '159'],
  ['RAISIN CHASSLAS', '161'],
  ['RAISIN MUSCAT', '162'],
  ['RAISIN MUSCATELLE', '164'],
  ['RAISIN NOIR', '163'],
  ['RAISIN ROSE', '160'],
  ['RATTES', '16'],
  ['ROMAINE', '85'],
  ['ROMANESCO', '78'],
  ['ROMARIN', '106'],
  ['ROQUETTE', '95'],
  ['ROUGETTE', '84'],
  ['SALADE SUCRINE', '88'],
  ['SCAROLE', '86'],
  ['SOJA', '69'],
  ['THYM', '112'],
  ['THYM ET LAURIER', '110'],
  ['TOMATE CERISE', '44'],
  ['TOMATE COCKTAIL', '43'],
  ['TOMATE GRAPPE', '40'],
  ['TOMATE OLIVETTE', '42'],
  ['TOMATE RONDE', '41'],
  ['TOPINAMBOURG', '67'],
  ['TREVISSSE', '93'],
]

const SPELLING_WARNINGS: Record<string, string> = {
  'ARTICHAUX VIOLET': 'Orthographe possible : ARTICHAUT VIOLET (au singulier).',
  'CLEM. SOCCULENTE': 'Orthographe possible : CLÉMENTINE SUCCULENTE.',
  'ORANGUE SOCULLENTE': 'Orthographe possible : ORANGE SUCCULENTE.',
  'POMME BREABERNE': 'Orthographe possible : POMME BRAEBURN.',
  'POMME BSCOOP': 'Orthographe possible : POMME BOSKOOP.',
  GOMEO: '« GOMEO 53 » pourrait être « GOMBO 52 » — non corrigé automatiquement.',
  'ARTICHAUD VERT': 'Orthographe possible : ARTICHAUT VERT.',
  BETTRAVE: 'Orthographe possible : BETTERAVE.',
  'MINI COMBRE': 'Orthographe possible : MINI CONCOMBRE.',
  ISBERG: 'Orthographe possible : ICEBERG.',
  MESCLIN: 'Orthographe possible : MESCLUN.',
  TREVISSSE: 'Orthographe possible : TRÉVISE.',
  PLEUROTTES: 'Orthographe possible : PLEUROTES.',
  'POIRE GUIYOT': 'Orthographe possible : POIRE GUYOT.',
  'POIRE LUISE BONNE': 'Orthographe possible : POIRE LOUISE BONNE.',
  'POM BEURRE HARDY': 'Orthographe possible : POIRE BEURRÉ HARDY.',
}

function warningFor(name: string, storeCode: string): string | null {
  const notes: string[] = []
  if (SPELLING_WARNINGS[name]) notes.push(SPELLING_WARNINGS[name])
  for (const [key, msg] of Object.entries(SPELLING_WARNINGS)) {
    if (key !== name && name.includes(key)) notes.push(msg)
  }
  if (storeCode === '53' && name === 'GOMEO') {
    notes.push('Code 53 partagé avec GRELOT. Hypothèse GOMBO 52 non appliquée.')
  }
  if (storeCode === '53' && name === 'GRELOT') {
    notes.push('Code 53 partagé avec GOMEO.')
  }
  if (storeCode === '62') {
    notes.push('Code 62 partagé entre BROCOLIS et POIS GOURMAND.')
  }
  if (name === 'CHOUX BRUXELLES') {
    notes.push('CHOUX BRUXELLES apparaît aux codes 18 et 68.')
  }
  return notes.length ? [...new Set(notes)].join(' ') : null
}

export const SEED_PRODUCTS: SeedProduct[] = RAW_SEED.map(([name, storeCode]) => {
  const meta = inferMeta(name)
  return {
    name,
    storeCode,
    category: meta.category,
    sellingUnit: meta.sellingUnit,
    origin: '',
    warningNote: warningFor(name, storeCode),
    placeholderKey: meta.placeholderKey,
  }
})

export const EXPECTED_SEED_COUNT = 171

export const ABSENT_STORE_CODES = ['3', '9', '52'] as const

export const KNOWN_DATA_WARNINGS = [
  {
    id: 'dup-53',
    severity: 'warning' as const,
    title: 'Code magasin 53 en double',
    detail: 'GOMEO et GRELOT partagent le code 53 sur la liste photographiée. Les IDs internes restent uniques.',
    relatedCodes: ['53'],
    relatedNames: ['GOMEO', 'GRELOT'],
  },
  {
    id: 'dup-62',
    severity: 'warning' as const,
    title: 'Code magasin 62 en double',
    detail: 'BROCOLIS et POIS GOURMAND partagent le code 62.',
    relatedCodes: ['62'],
    relatedNames: ['BROCOLIS', 'POIS GOURMAND'],
  },
  {
    id: 'choux-bruxelles',
    severity: 'info' as const,
    title: 'CHOUX BRUXELLES à deux codes',
    detail: 'Le produit CHOUX BRUXELLES apparaît aux codes 18 et 68.',
    relatedCodes: ['18', '68'],
    relatedNames: ['CHOUX BRUXELLES'],
  },
  {
    id: 'absent-codes',
    severity: 'info' as const,
    title: 'Codes absents de la liste photographiée',
    detail: 'Les codes 3, 9 et 52 ne figurent pas sur la liste source.',
    relatedCodes: ['3', '9', '52'],
  },
  {
    id: 'gomeo-gombo',
    severity: 'warning' as const,
    title: 'GOMEO 53 — hypothèse GOMBO 52',
    detail: '« GOMEO 53 » pourrait être « GOMBO 52 ». Aucune correction automatique n’a été appliquée.',
    relatedCodes: ['53', '52'],
    relatedNames: ['GOMEO'],
  },
  {
    id: 'spelling',
    severity: 'warning' as const,
    title: 'Orthographes à vérifier',
    detail:
      'ARTICHAUX VIOLET, CLEM. SOCCULENTE, ORANGUE SOCULLENTE, POMME BREABERNE, POMME BSCOOP (et d’autres abréviations legacy).',
    relatedNames: [
      'ARTICHAUX VIOLET',
      'CLEM. SOCCULENTE',
      'ORANGUE SOCULLENTE',
      'POMME BREABERNE',
      'POMME BSCOOP',
    ],
  },
]

export const QUESTIONABLE_NAME_REASONS: Record<string, string> = {
  'ARTICHAUX VIOLET': 'Possible ARTICHAUT VIOLET',
  'CLEM. SOCCULENTE': 'Possible CLÉMENTINE SUCCULENTE',
  'ORANGUE SOCULLENTE': 'Possible ORANGE SUCCULENTE',
  'POMME BREABERNE': 'Possible POMME BRAEBURN',
  'POMME BSCOOP': 'Possible POMME BOSKOOP',
  GOMEO: 'Possible GOMBO (code 52 ?)',
}
