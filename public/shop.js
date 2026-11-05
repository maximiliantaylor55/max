import { getNextDiscountTarget } from './shop-discount-progress.js'
import { getShopQuantityOptions } from './shop-quantity-options.js'

(() => {
  const $ = (selector) => document.querySelector(selector)
  const euro = (cents) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(cents / 100)
  const formatDate = (date) => new Date(`${date}T00:00:00.000Z`).toLocaleDateString('de-DE', { timeZone: 'UTC' })
  const CART_KEY = 'zyro-shop-cart'
  const TOKEN_KEY = 'zyro-portal-token'
  const BUSINESS_SHOP_URL = '/brand.html?bereich=geschaeftskunden'
  const businessMode = new URLSearchParams(location.search).get('bereich') === 'geschaeftskunden'
  const gradients = ['#f47745,#ffb36b', '#642f48,#c57aa0', '#3d9a5b,#d7f36a', '#2b6cb0,#7fd0ff', '#b7791f,#f6e05e']

  let shop = { products: [], settings: {}, paymentMethods: [] }
  let cart = (() => { try { return JSON.parse(localStorage.getItem(CART_KEY)) || {} } catch { return {} } })()
  let appliedDiscount = null
  let businessAccountStatus = ''
  let authMode = 'login'
  let passwordResetContext = null
  let accountReturnFocus = null
  let accountReturnPanel = ''

  const el = (tag, className, text) => {
    const node = document.createElement(tag)
    if (className) node.className = className
    if (text !== undefined) node.textContent = text
    return node
  }
  const show = (node, visible = true) => { node.hidden = !visible }
  const notice = (node, text, ok = false) => {
    node.textContent = text
    node.classList.toggle('ok', ok)
    show(node, Boolean(text))
  }

  const api = async (path, options = {}) => {
    const response = await fetch(path, options)
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error || 'Anfrage fehlgeschlagen.')
    return data
  }

  const tierPercent = (product, quantity) => (product.tiers || [])
    .filter((tier) => quantity >= tier.minQuantity)
    .reduce((best, tier) => Math.max(best, tier.percent), 0)
  const crateCents = (product, quantity) => Math.round(product.cratePriceCents * (100 - tierPercent(product, quantity)) / 100)
  const lineCents = (product, quantity) => {
    const price = crateCents(product, quantity)
    return Math.floor(quantity / 24) * price + Math.round((quantity % 24) * price / 24)
  }
  const doseLabel = (quantity) => `${quantity} ${quantity === 1 ? 'Dose' : 'Dosen'}`
  const getBusinessDpdParcelWeights = (trayWeights) => {
    const parcelCount = Math.ceil(trayWeights.length / 2)
    const parcelWeights = Array(parcelCount).fill(0)
    const parcelTrayCounts = Array(parcelCount).fill(0)
    const sortedWeights = [...trayWeights].sort((a, b) => b - a)

    const placeTray = (trayIndex) => {
      if (trayIndex === sortedWeights.length) return true
      const trayWeight = sortedWeights[trayIndex]
      const seenParcels = new Set()
      for (let parcelIndex = 0; parcelIndex < parcelCount; parcelIndex += 1) {
        const currentWeight = parcelWeights[parcelIndex]
        const currentTrayCount = parcelTrayCounts[parcelIndex]
        const parcelKey = `${currentWeight}:${currentTrayCount}`
        if (seenParcels.has(parcelKey) || currentTrayCount >= 2 || currentWeight + trayWeight > 31500) continue
        seenParcels.add(parcelKey)
        parcelWeights[parcelIndex] += trayWeight
        parcelTrayCounts[parcelIndex] += 1
        if (placeTray(trayIndex + 1)) return true
        parcelWeights[parcelIndex] -= trayWeight
        parcelTrayCounts[parcelIndex] -= 1
      }
      return false
    }

    return placeTray(0) ? parcelWeights : null
  }

  const saveCart = () => {
    localStorage.setItem(CART_KEY, JSON.stringify(cart))
    const count = Object.values(cart).reduce((sum, quantity) => sum + quantity, 0)
    const displayedCount = shop.businessPricing?.active
      ? Object.values(cart).reduce((sum, quantity) => sum + Math.ceil(quantity / 24), 0)
      : count
    $('#cart-count').textContent = displayedCount
    $('#cart-bar-count').textContent = displayedCount
    const canAccessShop = !businessMode || shop.businessPricing?.active === true
    show($('#open-cart'), canAccessShop)
    show($('#cart-bar'), canAccessShop && count > 0)
    $('#cart-bar').classList.toggle('show', canAccessShop && count > 0)
  }
  const productById = (id) => shop.products.find((product) => product.id === id)

  const setQuantity = (id, quantity) => {
    const product = productById(id)
    if (!product) return
    let next = Math.max(0, Math.min(9999, Math.floor(Number(quantity) || 0)))
    if (shop.businessPricing?.active) {
      if (Number.isSafeInteger(product.stock) && !(product.stock === 0 && product.preorderEnabled)) {
        next = Math.min(next, Math.floor(product.stock / 24) * 24)
      }
      next = Math.floor(next / 24) * 24
    } else if (Number.isSafeInteger(product.stock) && !(product.stock === 0 && product.preorderEnabled)) {
      next = Math.min(next, product.stock)
    }
    if (next === 0) delete cart[id]
    else cart[id] = next
    if (appliedDiscount) {
      appliedDiscount = null
      notice($('#discount-message'), 'Warenkorb geändert. Bitte den Rabattcode erneut anwenden.')
    }
    saveCart()
    renderCart()
  }

  const canNode = (productName) => {
    const node = el('img', 'can-product')
    node.src = '/zyro-pfirsich-maracuja-can-transparent.png'
    node.alt = productName
      ? `Originaldose ${productName}, 500 ml`
      : 'Originaldose der erfrischenden ZYRO Pfirsich-Maracuja-Limonade, 500 ml'
    node.loading = 'lazy'
    return node
  }

  const displayImages = (product) => {
    if (product.id === 'zyr-pm-1') return []
    return Array.isArray(product.images) && product.images.length
      ? product.images
      : (product.image ? [product.image] : [])
  }

  const appendNutrition = (box, product) => {
    const values = product.nutritionValues || {}
    const hasStructuredValues = Object.values(values).some((value) => value !== '' && value !== null && value !== undefined)
    if (!hasStructuredValues) {
      if (product.nutrition) box.append(el('h4', 'detail-h', 'Nährwerte'), el('p', 'detail-text', product.nutrition))
      return
    }

    const format = (value, unit) => {
      const number = Number(value)
      return value === '' || value === null || value === undefined || !Number.isFinite(number) || number < 0
        ? `– ${unit}`
        : `${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 6 }).format(number)} ${unit}`
    }
    const rows = [
      ['Energie', `${format(values.energyKj, 'kJ')} / ${format(values.energyKcal, 'kcal')}`],
      ['Fett', format(values.fat, 'g')],
      ['davon gesättigte Fettsäuren', format(values.saturates, 'g')],
      ['Kohlenhydrate', format(values.carbohydrates, 'g')],
      ['davon Zucker', format(values.sugars, 'g')],
      ['Eiweiß', format(values.protein, 'g')],
      ['Salz', format(values.salt, 'g')],
    ]
    const table = el('table', 'detail-nutrition')
    const caption = document.createElement('caption')
    caption.textContent = 'Nährwerte je 100 ml'
    const body = document.createElement('tbody')
    rows.forEach(([name, value]) => {
      const row = document.createElement('tr')
      const label = document.createElement('th')
      label.scope = 'row'
      label.textContent = name
      row.append(label, el('td', '', value))
      body.append(row)
    })
    table.append(caption, body)
    box.append(table)
  }

  const appendReviewSummary = (box, product, detailed = false) => {
    const stats = shop.reviewStats?.[product.id]
    if (!stats?.count) return
    const average = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(stats.average)
    const summary = el('p', 'review-summary', `★ ${average} von 5 · ${stats.count} verifizierte ${stats.count === 1 ? 'Bewertung' : 'Bewertungen'}`)
    box.append(summary)
    const productReviews = (shop.reviews || [])
      .filter((review) => review.productId === product.id)
      .slice(0, detailed ? 3 : 1)
    productReviews.forEach((review) => {
      const card = el('blockquote', 'customer-review')
      card.append(el('strong', '', `${'★'.repeat(Math.max(0, Math.min(5, review.rating)))}${'☆'.repeat(5 - Math.max(0, Math.min(5, review.rating)))} · Verifizierter Kauf`))
      if (review.comment) card.append(el('p', '', review.comment))
      box.append(card)
    })
  }

  const showProductDetail = (product, index) => {
    $('#detail-title').textContent = product.name
    const box = $('#detail-body')
    box.replaceChildren()
    const images = displayImages(product)
    const visual = el('div', 'visual detail-visual')
    const [from, to] = gradients[index % gradients.length].split(',')
    visual.style.background = `linear-gradient(160deg, ${from}, ${to})`
    if (images[0] && images[0].startsWith('data:image/')) {
      const photo = el('img', 'photo')
      photo.src = images[0]
      photo.alt = product.name
      visual.classList.add('has-photo')
      visual.append(photo)
    } else {
      visual.append(canNode(product.name))
    }
    box.append(visual)
    if (images.length > 1) {
      const thumbnails = el('div', 'detail-thumbnails')
      images.forEach((image, imageIndex) => {
        const button = el('button', `detail-thumbnail${imageIndex === 0 ? ' active' : ''}`)
        button.type = 'button'
        button.setAttribute('aria-label', `${product.name}, Bild ${imageIndex + 1}`)
        const thumbnail = el('img')
        thumbnail.src = image
        thumbnail.alt = ''
        button.append(thumbnail)
        button.addEventListener('click', () => {
          const currentPhoto = visual.querySelector('.photo')
          if (currentPhoto) currentPhoto.src = image
          else {
            const replacement = el('img', 'photo')
            replacement.src = image
            replacement.alt = product.name
            visual.replaceChildren(replacement)
            visual.classList.add('has-photo')
          }
          thumbnails.querySelectorAll('.detail-thumbnail').forEach((item, currentIndex) => {
            item.classList.toggle('active', currentIndex === imageIndex)
          })
        })
        thumbnails.append(button)
      })
      box.append(thumbnails)
    }
    box.append(el('h3', '', product.name))
    appendReviewSummary(box, product, true)
    if (product.category) box.append(el('p', 'hint', product.category))
    if (product.stock === 0 && product.preorderEnabled) {
      box.append(el('p', 'badge warn', `Vorbestellung${product.expectedDeliveryDate ? ` · voraussichtliche Lieferung ${formatDate(product.expectedDeliveryDate)}` : ''}`))
    }
    box.append(el('p', 'detail-text', product.description || 'Zu diesem Artikel gibt es noch keine Beschreibung.'))
    if (product.ingredients) box.append(el('h4', 'detail-h', 'Zutaten'), el('p', 'detail-text', product.ingredients))
    appendNutrition(box, product)
    const facts = el('ul', 'detail-facts')
    facts.append(el('li', '', shop.businessPricing?.active
      ? `Geschäftskundenpreis: ${euro(product.cratePriceCents)} pro 24er-Tray`
      : `Preis: ${euro(Math.round(product.cratePriceCents / 24))} pro Dose · ${euro(product.cratePriceCents)} pro 24er-Tray`))
    if (product.depositCents > 0) facts.append(el('li', '', `Pfand: ${euro(product.depositCents)} pro Dose, zzgl. und ohne MwSt.`))
    if (!shop.businessPricing?.active) {
      product.tiers?.forEach((tier) => facts.append(el('li', '', `Ab ${doseLabel(tier.minQuantity)} −${tier.percent}% Mengenrabatt`)))
    }
    if (Number.isSafeInteger(product.stock)) {
      const availableStock = shop.businessPricing?.active
        ? `${Math.floor(product.stock / 24)} ${Math.floor(product.stock / 24) === 1 ? 'Tray' : 'Trays'} verfügbar`
        : `Auf Lager: ${doseLabel(product.stock)}`
      facts.append(el('li', '', product.stock < 1
        ? (product.preorderEnabled ? `Vorbestellung möglich${product.expectedDeliveryDate ? ` · voraussichtliche Lieferung ${formatDate(product.expectedDeliveryDate)}` : ''}` : 'Aktuell ausverkauft')
        : availableStock))
    }
    box.append(facts)
    const preorder = product.stock === 0 && product.preorderEnabled
    const businessCustomer = shop.businessPricing?.active === true
    const add = el('button', 'primary', businessCustomer ? '1 Tray in den Warenkorb' : preorder ? '1 Dose vorbestellen' : '1 Dose in den Warenkorb')
    add.type = 'button'
    const availableTrays = Number.isSafeInteger(product.stock) && !preorder
      ? Math.floor(Math.max(0, product.stock - (Number(cart[product.id]) || 0)) / 24)
      : 1
    add.disabled = businessCustomer
      ? availableTrays < 1
      : Number.isSafeInteger(product.stock) && product.stock < 1 && !preorder
    add.addEventListener('click', () => {
      setQuantity(product.id, businessCustomer ? (cart[product.id] || 0) + 24 : (cart[product.id] || 0) + 1)
      openPanel('#cart-panel')
    })
    if (businessCustomer) box.insertBefore(el('p', 'hint', `Geschäftskunden bestellen in vollen 24er-Trays · ${euro(product.cratePriceCents)} pro Tray`), box.querySelector('.detail-facts'))
    box.append(add)
    openPanel('#product-panel')
  }

  const renderProducts = () => {
    const grid = $('#product-grid')
    grid.replaceChildren()
    const businessCustomer = shop.businessPricing?.active === true
    show($('#business-shop-banner'), businessCustomer && !businessMode)
    if (businessMode) {
      show($('#business-hero'))
      show($('#business-access-gate'), !businessCustomer)
      const dpdMaxTrays = Number(shop.settings?.businessDpdMaxTrays) || 6
      const businessShippingCopy = `Bis zu ${dpdMaxTrays} 24er-Trays versenden wir aufgeteilt per DPD (maximal 2 Trays und 31,5 kg je Paket); größere oder nicht paketfähige Bestellungen kommen per Spedition.`
      $('#business-shop-link').textContent = 'Privatkundenshop'
      $('#business-shop-link').href = '/brand.html'
      $('#header-contact').textContent = 'Zum B2B-Sortiment'
      $('#shop-heading-kicker').textContent = 'Freigeschalteter Händlerbereich'
      $('#shop-title').replaceChildren(document.createTextNode('Dein ZYRO Sortiment.'))
      $('#shop-heading-description').textContent = `Individuelle Verkaufspreise pro 24er-Tray. ${businessShippingCopy}`
      $('#business-hero .business-hero-copy > p:not(.business-eyebrow)').textContent = `Dein direkter Zugang zu vereinbarten Traypreisen. ${businessShippingCopy}`
      $('#business-hero-facts-spedition').textContent = `Bis ${dpdMaxTrays} Trays in mehreren DPD-Paketen, darüber Spedition`
      $('#business-shop-banner p:last-child').textContent = `Bestelle bequem in 24er-Trays. ${businessShippingCopy}`
      if (!businessCustomer) {
        const signedIn = Boolean(sessionStorage.getItem(TOKEN_KEY))
        $('#business-access-message').textContent = businessAccountStatus === 'pending'
          ? 'Dein Geschäftskundenantrag wird geprüft. Sortiment und Preise werden nach der Freigabe sichtbar.'
          : businessAccountStatus === 'suspended'
            ? 'Der Zugang zu deinem Geschäftskundenkonto ist pausiert. Bitte wende dich an ZYRO.'
            : businessAccountStatus === 'rejected'
              ? 'Dein Antrag wurde nicht freigegeben. Du kannst dein Firmenprofil aktualisieren und erneut beantragen.'
              : signedIn
                ? 'Ergänze dein Firmenprofil und beantrage im Kundenkonto den Geschäftskundenstatus. Der Zugang wird nach manueller Prüfung freigeschaltet.'
                : 'Melde dich mit einem freigeschalteten Geschäftskundenkonto an. Neue Firmenkunden können ein Konto erstellen und anschließend die Freischaltung beantragen.'
        return
      }
    }
    shop.products.forEach((product, index) => {
      const card = el('article', 'card')
      const visual = el('div', 'visual')
      const [from, to] = gradients[index % gradients.length].split(',')
      visual.style.background = `linear-gradient(160deg, ${from}, ${to})`
      const images = displayImages(product)
      if (images[0] && images[0].startsWith('data:image/')) {
        const photo = el('img', 'photo')
        photo.src = images[0]
        photo.alt = product.name
        photo.loading = 'lazy'
        visual.classList.add('has-photo')
        visual.append(photo)
      } else {
        visual.append(canNode(product.name))
      }
      if (Number.isSafeInteger(product.stock)) {
        const businessTrays = Math.floor(product.stock / 24)
        const out = businessCustomer ? businessTrays < 1 : product.stock < 1
        const badgeText = out
          ? (product.preorderEnabled ? 'Vorbestellung' : 'Ausverkauft')
          : businessCustomer
            ? `${businessTrays} ${businessTrays === 1 ? 'Tray' : 'Trays'} verfügbar`
            : product.stock < 48 ? `Nur noch ${product.stock}` : 'Auf Lager'
        visual.append(el('span', `badge${out || (!businessCustomer && product.stock < 48) ? ' warn' : ''}`, badgeText))
      }
      const body = el('div', 'body')
      body.append(el('h3', '', product.name))
      appendReviewSummary(body, product)
      if (product.description) body.append(el('p', 'card-desc', product.description))
      if (businessCustomer) {
        body.append(el('div', 'price', `${euro(product.cratePriceCents)} pro 24er-Tray`))
        const quantityPicker = el('div', 'quantity-picker')
        quantityPicker.append(el('span', 'quantity-picker-label', 'Bestellmenge in 24er-Trays'))
        const maxTrays = Number.isSafeInteger(product.stock) && !(product.stock === 0 && product.preorderEnabled)
          ? Math.floor(product.stock / 24)
          : 416
        const existingQuantity = Number(cart[product.id]) || 0
        const trayInput = el('input')
        trayInput.type = 'number'
        trayInput.min = '1'
        trayInput.max = String(Math.max(1, maxTrays))
        trayInput.step = '1'
        trayInput.value = existingQuantity > 0 && existingQuantity % 24 === 0
          ? String(existingQuantity / 24)
          : '1'
        trayInput.setAttribute('aria-label', `Anzahl 24er-Trays ${product.name}`)
        const summary = el('p', 'quantity-summary', `${Number(trayInput.value) * 24} Dosen · ${euro(product.cratePriceCents * Number(trayInput.value))}`)
        trayInput.addEventListener('input', () => {
          const trays = Math.max(1, Math.min(maxTrays, Math.floor(Number(trayInput.value) || 1)))
          summary.textContent = `${trays * 24} Dosen · ${euro(product.cratePriceCents * trays)}`
        })
        const applyQuantity = el('button', 'primary', 'Menge übernehmen')
        applyQuantity.type = 'button'
        applyQuantity.disabled = maxTrays < 1
        applyQuantity.addEventListener('click', () => {
          const trays = Math.floor(Number(trayInput.value))
          if (!Number.isSafeInteger(trays) || trays < 1 || trays > maxTrays) {
            notice($('#shop-message'), `Bitte eine gültige Traymenge für ${product.name} eingeben.`)
            return
          }
          setQuantity(product.id, trays * 24)
          openPanel('#cart-panel')
        })
        const add = el('div', 'add')
        add.append(trayInput, applyQuantity)
        quantityPicker.append(summary)
        body.append(quantityPicker, add, el('p', 'hint', 'Nur volle 24er-Trays. Bis zur eingestellten Menge und 31,5 kg per DPD, darüber per Spedition.'))
        card.append(visual, body)
        const openDetail = () => showProductDetail(product, index)
        visual.classList.add('clickable')
        visual.addEventListener('click', openDetail)
        const title = body.querySelector('h3')
        title.tabIndex = 0
        title.setAttribute('role', 'button')
        title.classList.add('clickable')
        title.addEventListener('click', openDetail)
        title.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openDetail() } })
        const more = el('button', 'link', 'Details & Beschreibung')
        more.type = 'button'
        more.addEventListener('click', openDetail)
        body.insertBefore(more, add)
        grid.append(card)
        return
      }
      if (product.stock === 0 && product.preorderEnabled && product.expectedDeliveryDate) {
        body.append(el('p', 'hint', `Voraussichtliche Lieferung: ${formatDate(product.expectedDeliveryDate)}`))
      }
      const price = el('div', 'price', euro(Math.round(product.cratePriceCents / 24)))
      price.append(el('small', '', ' pro Dose'))
      price.append(el('small', '', ` · ${euro(product.cratePriceCents)} pro 24er-Tray`))
      body.append(price)
      if (product.tiers?.length) {
        const tiers = el('div', 'tiers')
        product.tiers.forEach((tier) =>         tiers.append(el('span', '', `ab ${doseLabel(tier.minQuantity)} −${tier.percent}%`)))
        body.append(tiers)
      }
      const quantityPicker = el('div', 'quantity-picker')
      quantityPicker.append(el('span', 'quantity-picker-label', 'Deine Bestellmenge'))
      const quantityOptions = el('div', 'quantity-options')
      const optionButtons = []
      const maxStock = Number.isSafeInteger(product.stock) && !(product.stock === 0 && product.preorderEnabled)
        ? Math.max(0, product.stock - (Number(cart[product.id]) || 0))
        : 9999
      const updateQuantityPreview = () => {
        const quantity = Math.min(Math.max(1, maxStock), Math.max(1, Math.floor(Number(input.value) || 1)))
        if (String(quantity) !== input.value) input.value = String(quantity)
        const discount = tierPercent(product, quantity)
        const total = lineCents(product, quantity)
        const regularTotal = lineCents({ ...product, tiers: [] }, quantity)
        const summary = discount > 0
          ? `${doseLabel(quantity)} · ${euro(total)} · ${discount}% Mengenrabatt, du sparst ${euro(regularTotal - total)}`
          : `${quantity} ${quantity === 1 ? 'Dose' : 'Dosen'} · ${euro(total)}`
        quantitySummary.textContent = summary
        optionButtons.forEach(({ button, option }) => {
          button.setAttribute('aria-pressed', String(option === quantity))
        })
      }
      const quantitySummary = el('p', 'quantity-summary')
      getShopQuantityOptions(product, Number(cart[product.id]) || 0).forEach((option) => {
        const discountAtOption = tierPercent(product, option)
        const label = option === 24 ? '24er-Tray' : option === 1 ? '1 Dose' : `${option} Dosen`
        const button = el('button', 'quantity-option', discountAtOption ? `${label} · ${discountAtOption}%` : label)
        button.type = 'button'
        button.setAttribute('aria-pressed', 'false')
        button.addEventListener('click', () => {
          input.value = String(option)
          updateQuantityPreview()
        })
        optionButtons.push({ button, option })
        quantityOptions.append(button)
      })
      const add = el('div', 'add')
      const input = el('input')
      input.type = 'number'; input.min = '1'; input.max = String(Math.max(1, maxStock)); input.value = '1'; input.step = '1'
      input.setAttribute('aria-label', `Dosen ${product.name}`)
      input.addEventListener('input', updateQuantityPreview)
      const preorder = product.stock === 0 && product.preorderEnabled
      const button = el('button', 'primary', preorder ? 'Vorbestellen' : 'In den Warenkorb')
      button.type = 'button'
      button.disabled = Number.isSafeInteger(product.stock) && product.stock < 1 && !preorder
      button.addEventListener('click', () => {
        setQuantity(product.id, (cart[product.id] || 0) + (Math.floor(Number(input.value)) || 1))
        openPanel('#cart-panel')
      })
      add.append(input, button)
      if (quantityOptions.childElementCount) quantityPicker.append(quantityOptions)
      quantityPicker.append(quantitySummary)
      body.append(quantityPicker, add, el('p', '', 'Bestellmenge in einzelnen Dosen'))
      updateQuantityPreview()
      card.append(visual, body)
      const openDetail = () => showProductDetail(product, index)
      visual.classList.add('clickable')
      visual.addEventListener('click', openDetail)
      const title = body.querySelector('h3')
      title.tabIndex = 0
      title.setAttribute('role', 'button')
      title.classList.add('clickable')
      title.addEventListener('click', openDetail)
      title.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openDetail() } })
      const more = el('button', 'link', 'Details & Beschreibung')
      more.type = 'button'
      more.addEventListener('click', openDetail)
      body.insertBefore(more, add)
      grid.append(card)
    })
  }

  const cartTotals = () => {
    const settings = shop.settings
    let subtotal = 0
    let weight = 0
    let deposit = 0
    let trayCount = 0
    const businessTrayWeights = []
    for (const [id, quantity] of Object.entries(cart)) {
      const product = productById(id)
      if (!product) continue
      deposit += (product.depositCents || 0) * quantity
      subtotal += lineCents(product, quantity)
      weight += quantity * product.unitWeightGrams + Math.floor(quantity / 24) * (settings.largeCartonTareGrams || 0) + (quantity % 24 ? (settings.smallCartonTareGrams || 0) : 0)
      trayCount += Math.ceil(quantity / 24)
      for (let tray = 0; tray < Math.floor(quantity / 24); tray += 1) {
        businessTrayWeights.push(product.unitWeightGrams * 24 + (settings.largeCartonTareGrams || 0))
      }
    }
    const businessCustomer = shop.businessPricing?.active === true
    const dpdMaxTrays = Number(settings.businessDpdMaxTrays) || 6
    const businessDpdParcelWeights = businessCustomer && trayCount <= dpdMaxTrays
      ? getBusinessDpdParcelWeights(businessTrayWeights)
      : null
    const businessShipping = businessCustomer && subtotal > 0 && !businessDpdParcelWeights
    const businessDpdShipping = businessCustomer && subtotal > 0 && !businessShipping
    let shippingPalletCount = 0
    const shippingTiers = Array.isArray(settings.shippingTiers) ? settings.shippingTiers : []
    const businessDpdShippingTiers = Array.isArray(settings.businessDpdShippingTiers) && settings.businessDpdShippingTiers.length
      ? settings.businessDpdShippingTiers
      : shippingTiers
    let shipping = 0
    let businessDpdParcelCount = 0
    let invalidBusinessDpdShipping = false
    if (businessShipping) {
      shippingPalletCount = Math.max(1, Math.ceil(trayCount / (settings.shippingTraysPerPallet || 64)))
      shipping = shippingPalletCount * (settings.shippingPricePerPalletCents ?? 8500)
    } else if (businessDpdShipping) {
      businessDpdParcelCount = businessDpdParcelWeights.length
      if (!businessDpdShippingTiers.length) {
        invalidBusinessDpdShipping = true
      } else {
        for (const parcelWeight of businessDpdParcelWeights) {
          const tier = businessDpdShippingTiers.find((entry) => parcelWeight <= entry.maxWeightGrams)
          if (!tier) {
            invalidBusinessDpdShipping = true
            break
          }
          shipping += tier.priceCents
        }
      }
    } else if (subtotal && shippingTiers.length) {
      const tier = shippingTiers.find((entry) => weight <= entry.maxWeightGrams) || shippingTiers[shippingTiers.length - 1]
      const parcelCount = Math.max(1, Math.ceil(weight / shippingTiers[shippingTiers.length - 1].maxWeightGrams))
      shipping = tier === shippingTiers[shippingTiers.length - 1] && weight > tier.maxWeightGrams
        ? tier.priceCents * parcelCount
        : tier.priceCents
    } else if (subtotal) {
      shipping = (settings.shippingPriceCents || 0) + Math.ceil(weight / 1000) * (settings.shippingPricePerKgCents || 0)
    }
    return { subtotal, shipping, deposit, weight, shippingPalletCount, businessShipping, businessDpdShipping, businessDpdParcelCount, invalidBusinessDpdShipping, total: settings.pricesIncludeVat === false ? null : subtotal + shipping + deposit }
  }

  const renderDiscountProgress = (cartIds) => {
    const panel = $('#discount-progress')
    panel.replaceChildren()
    if (shop.businessPricing?.active) {
      show(panel, false)
      return
    }

    const target = getNextDiscountTarget(shop.products, cart)

    if (!target) {
      const activeDiscount = cartIds.some((id) => tierPercent(productById(id), Number(cart[id]) || 0) > 0)
      if (activeDiscount) {
        panel.append(el('strong', '', 'Rabatt-Level erreicht!'))
        panel.append(el('span', '', 'Die verfügbaren Mengenrabatte für deinen Warenkorb sind aktiv.'))
        show(panel)
      } else {
        show(panel, false)
      }
      return
    }

    panel.append(el('strong', '', 'Rabatt-Boost'))
    panel.append(el('span', '', target.quantity
      ? `Noch ${doseLabel(target.remaining)} von ${target.product.name} bis zu ${target.tier.percent}% Mengenrabatt.`
      : `Starte mit ${doseLabel(target.remaining)} von ${target.product.name} und sichere dir ${target.tier.percent}% Mengenrabatt.`))
    const progressTrack = el('div', 'discount-progress-track')
    progressTrack.setAttribute('role', 'progressbar')
    progressTrack.setAttribute('aria-label', `Fortschritt zum ${target.tier.percent}% Mengenrabatt`)
    progressTrack.setAttribute('aria-valuemin', '0')
    progressTrack.setAttribute('aria-valuemax', '100')
    progressTrack.setAttribute('aria-valuenow', String(Math.round(target.progress * 100)))
    const progressFill = el('span', 'discount-progress-fill')
    progressFill.style.width = `${target.progress * 100}%`
    progressTrack.append(progressFill)
    const action = el('button', 'discount-progress-action', `+${doseLabel(target.remaining)} hinzufügen`)
    action.type = 'button'
    action.addEventListener('click', () => {
      setQuantity(target.product.id, target.tier.minQuantity)
    })
    panel.append(progressTrack, action)
    show(panel)
  }

  const renderCart = () => {
    const lines = $('#cart-lines')
    lines.replaceChildren()
    const ids = Object.keys(cart).filter((id) => productById(id))
    ids.forEach((id) => {
      const product = productById(id)
      const quantity = cart[id]
      const percent = tierPercent(product, quantity)
      const line = el('div', 'line')
      line.append(el('b', '', product.name))
      const businessCustomer = shop.businessPricing?.active === true
      if (businessCustomer) {
        const exactTrays = quantity % 24 === 0
        line.append(el('span', 'hint', exactTrays
          ? `${quantity / 24} ${quantity / 24 === 1 ? '24er-Tray' : '24er-Trays'} · ${doseLabel(quantity)}`
          : `${doseLabel(quantity)} · Bitte auf volle Trays ändern oder entfernen.`))
        const trayInput = el('input')
        const maxTrays = Number.isSafeInteger(product.stock) && !(product.stock === 0 && product.preorderEnabled)
          ? Math.floor(product.stock / 24)
          : 416
        trayInput.type = 'number'
        trayInput.min = '1'
        trayInput.max = String(Math.max(1, maxTrays))
        trayInput.step = '1'
        trayInput.value = exactTrays ? String(quantity / 24) : ''
        trayInput.placeholder = 'Trays'
        trayInput.setAttribute('aria-label', `Anzahl 24er-Trays ${product.name}`)
        const saveTrays = el('button', '', 'Übernehmen')
        saveTrays.type = 'button'
        saveTrays.addEventListener('click', () => {
          const trays = Math.floor(Number(trayInput.value))
          if (!Number.isSafeInteger(trays) || trays < 1 || trays > maxTrays) {
            notice($('#checkout-message'), `Bitte eine gültige Traymenge für ${product.name} eingeben. Verfügbar: ${maxTrays} Trays.`)
            return
          }
          setQuantity(id, trays * 24)
        })
        const remove = el('button', 'remove', 'Entfernen')
        remove.type = 'button'
        remove.addEventListener('click', () => setQuantity(id, 0))
        line.append(trayInput, saveTrays, remove, el('span', 'sum', euro(lineCents(product, quantity))))
        lines.append(line)
        return
      }
      if (product.stock === 0 && product.preorderEnabled) {
        line.append(el('small', 'hint', `Vorbestellung${product.expectedDeliveryDate ? ` · voraussichtliche Lieferung ${formatDate(product.expectedDeliveryDate)}` : ''}`))
      }
      const remove = el('button', 'remove', 'Entfernen')
      remove.type = 'button'
      remove.addEventListener('click', () => setQuantity(id, 0))
      const qty = el('div', 'qty')
      const minus = el('button', '', '−'); minus.type = 'button'
      const plus = el('button', '', '+'); plus.type = 'button'
      minus.addEventListener('click', () => setQuantity(id, quantity - 1))
      plus.addEventListener('click', () => setQuantity(id, quantity + 1))
      qty.append(minus, el('span', '', doseLabel(quantity)), plus)
      line.append(remove, qty, el('span', 'sum', euro(lineCents(product, quantity))))
      if (percent) line.append(el('small', '', `Mengenrabatt −${percent}% aktiv`))
      lines.append(line)
    })
    const totals = $('#cart-totals')
    totals.replaceChildren()
    const empty = ids.length === 0
    const invalidBusinessQuantity = shop.businessPricing?.active === true
      && ids.some((id) => Number(cart[id]) % 24 !== 0)
    if (empty) lines.append(el('p', 'hint', 'Dein Warenkorb ist leer.'))
    renderDiscountProgress(ids)
    const { subtotal, shipping, deposit, shippingPalletCount, businessShipping, businessDpdShipping, businessDpdParcelCount, invalidBusinessDpdShipping } = cartTotals()
    const discountCents = appliedDiscount?.subtotalCents === subtotal ? appliedDiscount.amountCents : 0
    const row = (label, value, className) => {
      const wrapper = el('div', className)
      wrapper.append(el('dt', '', label), el('dd', '', value))
      totals.append(wrapper)
    }
    if (!empty) {
      if (invalidBusinessQuantity) lines.append(el('p', 'notice', 'Für Geschäftskunden sind nur volle 24er-Trays erlaubt. Bitte passe jede Menge an oder entferne den Artikel.'))
      if (invalidBusinessDpdShipping) lines.append(el('p', 'notice', 'Für das Gewicht mindestens eines DPD-Pakets ist kein Tarif hinterlegt. Bitte den Shop-Administrator kontaktieren.'))
      row('Zwischensumme', euro(subtotal))
      if (discountCents > 0) row(`Rabattcode ${appliedDiscount.code}`, `−${euro(discountCents)}`)
      row(businessShipping
        ? `Spedition (${shippingPalletCount} Palette${shippingPalletCount === 1 ? '' : 'n'} à ${euro(shop.settings.shippingPricePerPalletCents ?? 8500)})`
        : businessDpdShipping
          ? `DPD-Paketversand (${businessDpdParcelCount} Paket${businessDpdParcelCount === 1 ? '' : 'e'})`
          : 'Versand (nach Gewicht)', euro(shipping))
      row(shop.settings.pricesIncludeVat === false ? 'Gesamt netto' : 'Gesamt inkl. MwSt.', euro(subtotal - discountCents + shipping), 'grand')
      if (deposit > 0) row('Pfand (zzgl., ohne MwSt.)', euro(deposit))
      if (deposit > 0) row('Zahlbetrag inkl. Pfand', euro(subtotal - discountCents + shipping + deposit), 'grand')
    }
    show($('#to-checkout'), !empty && $('#checkout-form').hidden)
    $('#to-checkout').disabled = invalidBusinessQuantity || invalidBusinessDpdShipping
    if (invalidBusinessQuantity || invalidBusinessDpdShipping) show($('#checkout-form'), false)
    show($('#discount-form'), !empty && !shop.businessPricing?.active)
    if (empty) show($('#checkout-form'), false)
  }

  const applyDiscount = async () => {
    const code = String($('#discount-code').value || '').trim()
    const message = $('#discount-message')
    if (!code) {
      notice(message, 'Bitte einen Rabattcode eingeben.')
      return
    }
    const subtotalCents = cartTotals().subtotal
    try {
      const result = await api(`/api/shop?discountCode=${encodeURIComponent(code)}&subtotalCents=${subtotalCents}`)
      appliedDiscount = { ...result.discount, subtotalCents }
      notice(message, appliedDiscount.amountCents > 0
        ? `Rabattcode ${appliedDiscount.code} angewendet: −${euro(appliedDiscount.amountCents)}.`
        : `Rabattcode ${appliedDiscount.code} ist gültig; auf diesen Warenkorb wird kein weiterer Rabatt berechnet.`, true)
      renderCart()
    } catch (error) {
      appliedDiscount = null
      notice(message, error.message)
      renderCart()
    }
  }

  const openPanel = (selector) => {
    document.querySelectorAll('.drawer').forEach((panel) => show(panel, false))
    show($(selector))
    show($('#scrim'))
    document.body.classList.add('shop-panel-open')
    if (selector === '#account-panel') {
      window.requestAnimationFrame(() => {
        const panel = $('#account-panel')
        const first = [...panel.querySelectorAll('input:not([type="hidden"]),button:not(:disabled),textarea:not(:disabled),summary')]
          .find((element) => !element.closest('[hidden]'))
        const focusTarget = first || panel
        focusTarget.focus()
      })
    }
  }
  const closePanels = () => {
    document.querySelectorAll('.drawer').forEach((panel) => show(panel, false))
    show($('#scrim'), false)
    document.body.classList.remove('shop-panel-open')
    const returnFocus = accountReturnFocus
    const returnPanel = accountReturnPanel
    accountReturnFocus = null
    accountReturnPanel = ''
    if (returnPanel) openPanel(returnPanel)
    if (returnFocus?.isConnected) returnFocus.focus()
  }

  const openAccountPanel = async (trigger) => {
    accountReturnFocus = trigger
    accountReturnPanel = trigger.id === 'checkout-account' ? '#cart-panel' : ''
    openPanel('#account-panel')
    const token = sessionStorage.getItem(TOKEN_KEY)
    if (!token) {
      setAuthMode('login')
      return
    }
    show($('#account-auth-form'), false)
    show($('#portal'))
    window.requestAnimationFrame(() => $('#portal .tab')?.focus())
    try {
      await loadOrders(token)
      await refreshShopPricing(token)
    } catch (error) {
      if (error.message === 'Bitte erneut anmelden.') {
        sessionStorage.removeItem(TOKEN_KEY)
        setAuthMode('login')
        $('#account-auth-form').elements.email.focus()
      }
      notice($('#account-message'), error.message)
    }
  }

  const submitOrder = async (event) => {
    event.preventDefault()
    const form = event.target
    const message = $('#checkout-message')
    const button = $('#submit-order')
    const data = new FormData(form)
    button.disabled = true
    notice(message, '')
    try {
      const token = sessionStorage.getItem(TOKEN_KEY)
      const result = await api('/api/shop/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          website: data.get('website'),
          name: data.get('name'),
          company: data.get('company'),
          email: data.get('email'),
          address: data.get('address'),
          postalCode: data.get('postalCode'),
          city: data.get('city'),
          phone: data.get('phone'),
          billingEmail: data.get('billingEmail'),
          billingCompany: data.get('billingCompany'),
          billingAddress: data.get('billingAddress'),
          billingPostalCode: data.get('billingPostalCode'),
          billingCity: data.get('billingCity'),
          vatId: data.get('vatId'),
          note: data.get('note'),
          paymentMethod: data.get('payment') || 'vorkasse',
          privacyNoticeAcknowledged: data.get('privacy') === 'on',
          businessPricingActive: shop.businessPricing?.active === true,
          businessPrices: shop.businessPricing?.prices || {},
          discountCode: appliedDiscount?.subtotalCents === cartTotals().subtotal ? appliedDiscount.code : '',
          items: shop.businessPricing?.active
            ? Object.entries(cart).map(([productId, quantity]) => {
              if (!Number.isSafeInteger(quantity) || quantity < 24 || quantity % 24 !== 0) {
                throw new Error('Geschäftskunden können nur volle 24er-Trays bestellen. Bitte den Warenkorb korrigieren.')
              }
              return { productId, trays: quantity / 24 }
            })
            : Object.entries(cart).map(([productId, quantity]) => ({ productId, quantity })),
        }),
      })
      if (result.checkoutUrl) {
        location.assign(result.checkoutUrl)
        return
      }
      const preorderItems = (result.items || []).filter((item) => item.isPreorder)
      cart = {}
      saveCart()
      renderCart()
      const panel = $('#cart-panel')
      panel.replaceChildren()
      const success = el('div', 'success')
      success.append(el('h3', '', 'Danke für deine Bestellung! 🎉'), el('p', '', `Bestellnummer: ${result.orderNumber}`))
      if (preorderItems.length) {
        success.append(el('p', 'hint', `Vorbestellung: ${preorderItems.map((item) => `${item.productName}${item.expectedDeliveryDate ? ` (voraussichtliche Lieferung ${formatDate(item.expectedDeliveryDate)})` : ''}`).join(', ')}`))
      }
      success.append(el('p', '', `Bitte überweise ${euro(result.totalPriceCents)} per Vorkasse.`))
      if (result.paymentInfo) {
        success.append(el('p', '', `Empfänger: ${result.paymentInfo.accountHolder}`), el('p', '', `IBAN: ${result.paymentInfo.iban}`), el('p', '', `Verwendungszweck: ${result.paymentInfo.reference}`))
      }
      success.append(el('p', 'hint', result.confirmationEmailSent ? 'Eine Bestätigung ist per E-Mail unterwegs. Status und Rechnung findest du unter „Mein Konto“.' : 'Die Bestätigungs-E-Mail konnte nicht gesendet werden. Bitte notiere dir die Daten oben.'))
      const close = el('button', 'primary', 'Schließen'); close.type = 'button'
      close.addEventListener('click', () => location.reload())
      success.append(close)
      panel.append(success)
    } catch (error) {
      notice(message, error.message)
      button.disabled = false
    }
  }

  const renderOrders = (orders, token) => {
    const container = $('#orders')
    container.replaceChildren()
    if (orders.length === 0) container.append(el('p', 'hint', 'Zu dieser E-Mail gibt es noch keine Bestellungen.'))
    orders.forEach((order) => {
      const card = el('article', 'order')
      const head = el('header')
      head.append(el('span', '', order.orderNumber), el('span', 'status', order.status))
      card.append(head)
      card.append(el('span', 'hint', `${new Date(order.createdAt).toLocaleDateString('de-DE')} · ${euro(order.totalPriceCents || 0)} · Zahlung: ${order.paymentStatus === 'paid' ? 'bezahlt' : 'offen'}`))
      order.items.forEach((item) => card.append(el('span', '', `${item.quantity} × ${item.productName}${item.isPreorder ? ` · VORBESTELLUNG${item.expectedDeliveryDate ? ` · voraussichtliche Lieferung ${formatDate(item.expectedDeliveryDate)}` : ''}` : ''}`)))
      if (order.trackingNumber) card.append(el('span', '', `Sendung: ${order.trackingProvider || ''} ${order.trackingNumber}`))
      const actions = el('div', 'actions')
      const again = el('button', '', 'Nochmal bestellen'); again.type = 'button'
      again.addEventListener('click', () => {
        order.items.forEach((item) => { if (productById(item.productId)) setQuantity(item.productId, (cart[item.productId] || 0) + item.quantity) })
        openPanel('#cart-panel')
      })
      actions.append(again)
      if (order.invoice) {
        const invoice = el('button', '', 'Rechnung (PDF)'); invoice.type = 'button'
        invoice.addEventListener('click', async () => {
          try {
            const file = await api('/api/portal/invoice', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ orderId: order.id }) })
            const bytes = Uint8Array.from(atob(file.contentBase64), (character) => character.charCodeAt(0))
            const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
            const link = el('a'); link.href = url; link.download = file.filename; link.click()
            setTimeout(() => URL.revokeObjectURL(url), 5000)
          } catch (error) { notice($('#account-message'), error.message) }
        })
        actions.append(invoice)
      }
      card.append(actions)
      container.append(card)
    })
    show(container)
  }

  const loadOrders = async (token) => {
    $('#account-title').textContent = 'Mein Konto'
    const { orders, invoices = [] } = await api('/api/portal/orders', { headers: { Authorization: `Bearer ${token}` } })
    show($('#account-auth-form'), false)
    show($('#password-reset-request-form'), false)
    show($('#password-reset-form'), false)
    renderOrders(orders, token)
    renderInvoices(invoices, token)
    show($('#portal'))
    selectTab('orders')
    await loadProfile(token)
  }

  const authHeaders = (token) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` })

  const downloadPdf = (file) => {
    const bytes = Uint8Array.from(atob(file.contentBase64), (character) => character.charCodeAt(0))
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
    const link = el('a'); link.href = url; link.download = file.filename; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  }

  const renderInvoices = (invoices, token) => {
    const container = $('#invoices')
    container.replaceChildren()
    if (invoices.length === 0) container.append(el('p', 'hint', 'Noch keine Rechnungen vorhanden. Neue Rechnungen erscheinen hier automatisch.'))
    invoices.forEach((invoice) => {
      const card = el('article', 'order')
      const head = el('header')
      head.append(el('span', '', `Rechnung ${invoice.number}`), el('span', 'hint', invoice.publishedAt ? new Date(invoice.publishedAt).toLocaleDateString('de-DE') : ''))
      const button = el('button', '', 'PDF herunterladen'); button.type = 'button'
      button.addEventListener('click', async () => {
        try {
          downloadPdf(await api('/api/portal/invoice', { method: 'POST', headers: authHeaders(token), body: JSON.stringify({ invoiceId: invoice.id }) }))
        } catch (error) { notice($('#account-message'), error.message) }
      })
      card.append(head, button)
      container.append(card)
    })
  }

  const profileFieldNames = [
    'name', 'company', 'contactRole', 'phone', 'address', 'postalCode', 'city',
    'billingEmail', 'billingCompany', 'billingAddress', 'billingPostalCode', 'billingCity',
    'vatId', 'deliveryNote',
  ]

  const prefillCheckout = (profile, email) => {
    const form = $('#checkout-form')
    const fill = (name, value) => { const input = form.elements[name]; if (input && !input.value && value) input.value = value }
    fill('name', profile.name); fill('company', profile.company); fill('email', email)
    fill('phone', profile.phone)
    fill('address', profile.address); fill('postalCode', profile.postalCode); fill('city', profile.city)
    fill('billingEmail', profile.billingEmail); fill('billingCompany', profile.billingCompany)
    fill('billingAddress', profile.billingAddress); fill('billingPostalCode', profile.billingPostalCode)
    fill('billingCity', profile.billingCity); fill('vatId', profile.vatId)
    form.elements.email.readOnly = Boolean(email)
    $('#checkout-account').textContent = email ? `Kundenkonto öffnen (${email})` : 'Mit Kundenkonto anmelden oder registrieren'
    if (profile.billingAddress || profile.billingEmail || profile.billingCompany || profile.vatId) {
      form.querySelector('.billing-details').open = true
    }
  }

  const loadProfile = async (token) => {
    const { profile, email, business = {} } = await api('/api/portal/profile', { headers: authHeaders(token) })
    businessAccountStatus = business.status || ''
    const form = $('#profile-form')
    profileFieldNames.forEach((name) => { form.elements[name].value = profile[name] || '' })
    prefillCheckout(profile, email)
    $('#portal-email').textContent = email || ''
    const status = business.status
    const statusText = status === 'approved'
      ? 'Geschäftskundenkonto freigeschaltet. Deine vereinbarten Geschäftskunden-Verkaufspreise werden im Shop angezeigt.'
      : status === 'pending'
        ? 'Dein Geschäftskundenantrag ist eingegangen und wird geprüft.'
        : status === 'rejected'
          ? 'Dein Antrag wurde nicht freigegeben. Du kannst deine Angaben aktualisieren und erneut beantragen.'
          : status === 'suspended'
            ? 'Dein Geschäftskundenkonto ist derzeit pausiert. Bitte wende dich an ZYRO.'
            : 'Mit einem vollständigen Firmenprofil kannst du Geschäftskundenkonditionen beantragen. Der Antrag wird manuell geprüft.'
    $('#business-status').textContent = statusText
    show($('#apply-business'), !['approved', 'pending', 'suspended'].includes(status))
    show($('#open-business-shop'), status === 'approved')
    if (businessMode) renderProducts()
  }

  const refreshShopPricing = async (token) => {
    const { products, businessPricing } = await api('/api/shop', { headers: { Authorization: `Bearer ${token}` } })
    if (!Array.isArray(products)) throw new Error('Geschäftskundenpreise konnten nicht geladen werden.')
    shop = { ...shop, products, businessPricing: businessPricing || { active: false, prices: {} } }
    saveCart()
    renderProducts()
    renderCart()
  }

  const selectTab = (name) => {
    document.querySelectorAll('#portal .tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.tab === name))
    document.querySelectorAll('#portal [data-pane]').forEach((pane) => show(pane, pane.dataset.pane === name))
  }

  const setAuthMode = (mode) => {
    authMode = mode
    const registering = mode === 'register'
    $('#account-title').textContent = registering ? 'Konto erstellen' : 'Mein Konto'
    $('#auth-description').textContent = registering
      ? businessMode
        ? 'Erstelle dein Konto. Bestätige deine E-Mail, ergänze dein Firmenprofil und beantrage die Geschäftskunden-Freischaltung.'
        : 'Erstelle dein Konto mit E-Mail-Adresse und Passwort. Du erhältst einen Bestätigungslink per E-Mail.'
      : businessMode
        ? 'Melde dich mit deinem freigeschalteten Geschäftskundenkonto an. Offene Anträge erhalten nach manueller Prüfung Zugang.'
        : 'Melde dich mit deiner E-Mail-Adresse und deinem Passwort an.'
    $('#auth-submit').textContent = registering ? 'Konto erstellen' : 'Anmelden'
    $('#account-auth-form').elements.password.autocomplete = registering ? 'new-password' : 'current-password'
    show($('#account-auth-form'))
    show($('#password-reset-request-form'), false)
    show($('#password-reset-form'), false)
    show($('#portal'), false)
  }

  const setupPortal = () => {
    document.querySelectorAll('#portal .tab').forEach((tab) => tab.addEventListener('click', () => selectTab(tab.dataset.tab)))
    $('#portal-logout').addEventListener('click', async () => {
      sessionStorage.removeItem(TOKEN_KEY)
      businessAccountStatus = ''
      shop = { ...shop, products: [], businessPricing: { active: false, prices: {} } }
      $('#checkout-form').elements.email.readOnly = false
      $('#checkout-account').textContent = 'Mit Kundenkonto anmelden oder registrieren'
      show($('#portal'), false)
      setAuthMode('login')
      notice($('#account-message'), 'Du wurdest abgemeldet.', true)
      saveCart()
      renderProducts()
      renderCart()
      try {
        const shopData = await api('/api/shop')
        shop = { ...shop, ...shopData, businessPricing: { active: false, prices: {} } }
        saveCart()
        renderProducts()
        renderCart()
      } catch (error) {
        notice($('#shop-message'), `Shop konnte nach dem Abmelden nicht aktualisiert werden: ${error.message}`)
      }
    })
    $('#profile-form').addEventListener('submit', async (event) => {
      event.preventDefault()
      const token = sessionStorage.getItem(TOKEN_KEY)
      const data = new FormData(event.target)
      try {
        await api('/api/portal/profile', { method: 'POST', headers: authHeaders(token), body: JSON.stringify({ profile: Object.fromEntries(profileFieldNames.map((name) => [name, data.get(name)])) }) })
        notice($('#profile-message'), 'Deine Daten wurden gespeichert.', true)
      } catch (error) { notice($('#profile-message'), error.message) }
    })
    $('#open-business-shop').addEventListener('click', () => {
      closePanels()
      if (!businessMode) {
        location.href = BUSINESS_SHOP_URL
        return
      }
      $('#sortiment').scrollIntoView({ behavior: 'smooth' })
    })
    $('#apply-business').addEventListener('click', async () => {
      const formData = new FormData($('#profile-form'))
      const profile = Object.fromEntries(profileFieldNames.map((name) => [name, formData.get(name)]))
      const button = $('#apply-business')
      button.disabled = true
      try {
        await api('/api/portal/profile', {
          method: 'POST',
          headers: authHeaders(sessionStorage.getItem(TOKEN_KEY)),
          body: JSON.stringify({ action: 'business-apply', profile }),
        })
        await loadProfile(sessionStorage.getItem(TOKEN_KEY))
        notice($('#profile-message'), 'Dein Geschäftskundenantrag wurde zur Prüfung eingereicht.', true)
      } catch (error) {
        notice($('#profile-message'), error.message)
      } finally {
        button.disabled = false
      }
    })
    $('#delete-profile').addEventListener('click', async () => {
      if (!confirm('Gespeicherte Daten wirklich löschen? Bestellungen und Rechnungen bleiben gesetzlich erhalten.')) return
      try {
        await api('/api/portal/profile', { method: 'POST', headers: authHeaders(sessionStorage.getItem(TOKEN_KEY)), body: JSON.stringify({ action: 'delete' }) })
        $('#profile-form').reset()
        notice($('#profile-message'), 'Gespeicherte Daten wurden gelöscht.', true)
      } catch (error) { notice($('#profile-message'), error.message) }
    })
  }

  const init = async () => {
    if (businessMode) {
      document.body.classList.add('business-mode')
      document.title = 'ZYRO® Geschäftskunden-Shop · Handel & Gastronomie'
      show($('#business-hero'))
      $('#business-shop-link').textContent = 'Privatkundenshop'
      $('#business-shop-link').href = '/brand.html'
      $('#header-contact').textContent = 'Zum B2B-Sortiment'
      renderProducts()
    }
    saveCart()
    try {
      const savedToken = sessionStorage.getItem(TOKEN_KEY)
      const shopData = await api('/api/shop', {
        headers: savedToken ? { Authorization: `Bearer ${savedToken}` } : {},
      })
      if (!Array.isArray(shopData.products) || !Array.isArray(shopData.paymentMethods)) {
        throw new Error('Shopdaten konnten nicht geladen werden. Bitte versuche es später erneut.')
      }
      shop = shopData
      const message = $('#shop-message')
      if (shop.products.length === 0) notice(message, 'Aktuell ist kein Artikel im Shop verfügbar.')
      else show(message, false)
      if (!shop.paymentMethods.includes('vorkasse') && !shop.paymentMethods.includes('stripe')) notice($('#shop-message'), 'Bestellen ist aktuell noch nicht freigeschaltet.')
      const methods = ['stripe', 'vorkasse'].filter((method) => shop.paymentMethods.includes(method))
      for (const method of ['stripe', 'vorkasse']) show($(`#pay-${method}`), methods.includes(method))
      const firstRadio = document.querySelector(`input[name="payment"][value="${methods[0]}"]`)
      if (firstRadio) firstRadio.checked = true
      const params = new URLSearchParams(location.search)
      if (params.get('paid')) {
        cart = {}
        saveCart()
        notice($('#shop-message'), `Danke! Deine Zahlung wird bestätigt. Bestellnummer: ${params.get('paid')}. Die Bestätigung kommt per E-Mail.`)
      }
      else if (params.get('cancelled')) notice($('#shop-message'), 'Zahlung abgebrochen. Dein Warenkorb ist noch da.')
      renderProducts()
      const validIds = new Set(shop.products.map((product) => product.id))
      cart = Object.fromEntries(Object.entries(cart).filter(([productId, quantity]) => validIds.has(productId) && Number(quantity) > 0))
      saveCart()
    } catch (error) {
      notice($('#shop-message'), error.message)
    }
    renderCart()

    $('#open-cart').addEventListener('click', () => openPanel('#cart-panel'))
    $('#cart-bar').addEventListener('click', () => openPanel('#cart-panel'))
    $('#open-account').addEventListener('click', (event) => openAccountPanel(event.currentTarget))
    $('#business-access-account').addEventListener('click', (event) => openAccountPanel(event.currentTarget))
    $('#business-hero-account').addEventListener('click', (event) => openAccountPanel(event.currentTarget))
    $('#checkout-account').addEventListener('click', (event) => {
      $('#account-auth-form').elements.email.value = $('#checkout-form').elements.email.value
      openAccountPanel(event.currentTarget)
    })
    document.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', closePanels))
    $('#scrim').addEventListener('click', closePanels)
    document.addEventListener('keydown', (event) => {
      const accountPanel = $('#account-panel')
      if (event.key === 'Escape') {
        closePanels()
        return
      }
      if (event.key !== 'Tab' || accountPanel.hidden) return
      const focusable = [...accountPanel.querySelectorAll('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), summary, a[href]')]
        .filter((element) => !element.closest('[hidden]'))
      if (!focusable.length) {
        event.preventDefault()
        accountPanel.focus()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    })
    $('#to-checkout').addEventListener('click', () => {
      show($('#checkout-form'))
      show($('#to-checkout'), false)
      $('#checkout-form').elements.name.focus()
    })
    $('#discount-form').addEventListener('submit', (event) => {
      event.preventDefault()
      applyDiscount()
    })
    $('#checkout-form').addEventListener('submit', submitOrder)
    setupPortal()
    const savedToken = sessionStorage.getItem(TOKEN_KEY)
    if (savedToken) {
      loadProfile(savedToken).then(() => refreshShopPricing(savedToken)).catch((error) => {
        if (error.message === 'Bitte erneut anmelden.') sessionStorage.removeItem(TOKEN_KEY)
        notice($('#shop-message'), error.message)
      })
    }

    document.querySelectorAll('[data-auth-mode]').forEach((button) => {
      button.addEventListener('click', () => setAuthMode(button.dataset.authMode))
    })
    $('#account-auth-form').addEventListener('submit', async (event) => {
      event.preventDefault()
      const values = new FormData(event.target)
      const email = String(values.get('email') || '').trim().toLowerCase()
      const submit = $('#auth-submit')
      submit.disabled = true
      try {
        if (authMode === 'register') {
          await api('/api/portal/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password: values.get('password') }),
          })
          setAuthMode('login')
          $('#account-auth-form').elements.email.value = email
          notice($('#account-message'), businessMode
            ? 'Falls für diese E-Mail ein Konto angelegt werden kann, kommt der Bestätigungslink ins Postfach. Bitte ergänze nach der Bestätigung dein Firmenprofil und beantrage die Freischaltung.'
            : 'Falls für diese E-Mail ein Konto angelegt werden kann, kommt der Bestätigungslink ins Postfach.', true)
          return
        }
        const { accessToken } = await api('/api/portal/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password: values.get('password') }),
        })
        sessionStorage.setItem(TOKEN_KEY, accessToken)
        notice($('#account-message'), '')
        await loadOrders(accessToken)
        await refreshShopPricing(accessToken)
      } catch (error) {
        notice($('#account-message'), error.message)
      } finally {
        submit.disabled = false
      }
    })
    $('#forgot-password').addEventListener('click', () => {
      const email = $('#account-auth-form').elements.email.value
      setAuthMode('login')
      $('#password-reset-request-form').elements.email.value = email
      $('#account-title').textContent = 'Passwort zurücksetzen'
      show($('#account-auth-form'), false)
      show($('#password-reset-request-form'))
    })
    $('#back-to-login').addEventListener('click', () => setAuthMode('login'))
    $('#back-from-reset').addEventListener('click', () => {
      const email = passwordResetContext?.email || $('#account-auth-form').elements.email.value
      passwordResetContext = null
      setAuthMode('login')
      $('#account-auth-form').elements.email.value = email
    })
    $('#password-reset-request-form').addEventListener('submit', async (event) => {
      event.preventDefault()
      const email = String(new FormData(event.target).get('email') || '').trim().toLowerCase()
      try {
        await api('/api/portal/password-reset/request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        })
        show($('#password-reset-request-form'), false)
        setAuthMode('login')
        notice($('#account-message'), 'Falls ein bestätigtes Konto besteht, erhältst du einen Link zum Zurücksetzen des Passworts.', true)
      } catch (error) {
        notice($('#account-message'), error.message)
      }
    })
    $('#password-reset-form').addEventListener('submit', async (event) => {
      event.preventDefault()
      const values = new FormData(event.target)
      const password = String(values.get('password') || '')
      if (password !== String(values.get('confirmPassword') || '')) {
        notice($('#account-message'), 'Die Passwörter stimmen nicht überein.')
        return
      }
      if (!passwordResetContext) {
        notice($('#account-message'), 'Der Passwort-Reset-Link ist ungültig oder abgelaufen.')
        return
      }
      try {
        await api('/api/portal/password-reset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...passwordResetContext, password }),
        })
        passwordResetContext = null
        show($('#password-reset-form'), false)
        setAuthMode('login')
        notice($('#account-message'), 'Dein Passwort wurde geändert. Du kannst dich jetzt anmelden.', true)
      } catch (error) {
        notice($('#account-message'), error.message)
      }
    })

    const accountLink = new URLSearchParams(location.hash.slice(1))
    const verificationToken = accountLink.get('verify')
    const resetToken = accountLink.get('reset')
    if (verificationToken || resetToken) {
      const email = accountLink.get('email') || ''
      history.replaceState(null, '', `${location.pathname}${location.search}`)
      accountReturnFocus = $('#open-account')
      openPanel('#account-panel')
      if (verificationToken) {
        try {
          const { accessToken } = await api('/api/portal/verify-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, token: verificationToken }),
          })
          sessionStorage.setItem(TOKEN_KEY, accessToken)
          notice($('#account-message'), 'E-Mail bestätigt. Dein Konto wird geöffnet …', true)
          try {
            await loadOrders(accessToken)
            await refreshShopPricing(accessToken)
            notice($('#account-message'), 'E-Mail bestätigt. Dein Kundenkonto ist jetzt bereit.', true)
          } catch (error) {
            notice($('#account-message'), `E-Mail bestätigt. Bitte melde dich an, um dein Konto zu öffnen. ${error.message}`)
            setAuthMode('login')
            $('#account-auth-form').elements.email.value = email
          }
        } catch (error) {
          notice($('#account-message'), error.message)
        }
      } else {
        passwordResetContext = { email, token: resetToken }
        $('#account-title').textContent = 'Neues Passwort festlegen'
        show($('#account-auth-form'), false)
        show($('#password-reset-request-form'), false)
        show($('#password-reset-form'))
      }
    }
  }

  init()
})()
