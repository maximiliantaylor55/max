const toNumber = (value) => Number(String(value ?? '').trim().replace(',', '.'))

const slugify = (value) => String(value || '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 48)

// Gleiche Regeln wie der Shop-Katalog in der Cloud: liefert die Gründe, warum ein Artikel nicht im Shop erscheint.
export const getShopIssues = (product, allProducts = []) => {
  if (!product?.shopActive) return []
  const issues = []
  if (product.status === 'Inaktiv') issues.push('Artikel ist inaktiv')
  if (!String(product.name || '').trim()) issues.push('Name fehlt')
  const id = slugify(product.sku || product.name)
  if (!/^[a-z0-9][a-z0-9-]{1,48}$/.test(id)) issues.push('Artikelnummer/Name ergibt keine gültige Shop-ID')
  else if (allProducts.some((other) => other !== product && other.shopActive && other.status !== 'Inaktiv' && slugify(other.sku || other.name) === id && String(other.id) < String(product.id))) {
    issues.push('Artikelnummer ist doppelt vergeben')
  }
  if (!(toNumber(product.unitPrice) > 0) && !(Math.round(toNumber(product.shopCratePrice) * 100) >= 1)) issues.push('Einzelpreis netto fehlt')
  if (!(Math.round(toNumber(product.weightKg) * 1000) >= 1)) issues.push('Gewicht pro Dose fehlt')
  return issues
}

export const getShopStock = (product) => {
  const raw = String(product?.availableBottles ?? '').trim()
  const value = raw === '' ? NaN : toNumber(raw)
  return Number.isSafeInteger(value) && value >= 0 ? value : null
}
