(() => {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const grid = document.getElementById('product-grid')

  const reveal = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return
      entry.target.classList.add('in')
      reveal.unobserve(entry.target)
    })
  }, { threshold: 0.12 })

  const watch = (node) => {
    if (node.nodeType !== 1 || node.dataset.fx) return
    node.dataset.fx = '1'
    node.classList.add('fx-reveal')
    if (grid) node.style.transitionDelay = `${Math.min([...grid.children].indexOf(node), 8) * 70}ms`
    reveal.observe(node)
    if (reduce) return
    node.addEventListener('pointermove', (event) => {
      if (event.pointerType !== 'mouse') return
      const box = node.getBoundingClientRect()
      const x = (event.clientX - box.left) / box.width - 0.5
      const y = (event.clientY - box.top) / box.height - 0.5
      node.style.setProperty('--rx', `${(-y * 7).toFixed(2)}deg`)
      node.style.setProperty('--ry', `${(x * 9).toFixed(2)}deg`)
      node.style.setProperty('--mx', `${((x + 0.5) * 100).toFixed(0)}%`)
      node.style.setProperty('--my', `${((y + 0.5) * 100).toFixed(0)}%`)
    })
    node.addEventListener('pointerleave', () => {
      node.style.setProperty('--rx', '0deg')
      node.style.setProperty('--ry', '0deg')
    })
  }

  if (grid) {
    [...grid.children].forEach(watch)
    new MutationObserver((records) => records.forEach((record) => record.addedNodes.forEach(watch))).observe(grid, { childList: true })
  }
  document.querySelectorAll('.about > .eyebrow, .about > h2, .about-grid > div').forEach(watch)

  document.querySelectorAll('.hero-inner > *, .perks li').forEach((node, index) => {
    node.classList.add('fx-reveal')
    node.style.transitionDelay = `${index * 80}ms`
    requestAnimationFrame(() => requestAnimationFrame(() => node.classList.add('in')))
  })

  const hero = document.querySelector('.hero')
  if (hero && !reduce) {
    window.addEventListener('scroll', () => {
      const offset = Math.min(window.scrollY, 600)
      hero.style.setProperty('--parallax', `${(offset * 0.18).toFixed(1)}px`)
    }, { passive: true })
  }

  const cartCount = document.getElementById('cart-count')
  const bar = document.getElementById('cart-bar')
  const barCount = document.getElementById('cart-bar-count')
  const openCart = document.getElementById('open-cart')
  if (cartCount && bar && barCount && openCart) {
    const sync = () => {
      const count = Number(cartCount.textContent) || 0
      const previous = barCount.textContent
      barCount.textContent = String(count)
      bar.classList.toggle('show', count > 0)
      if (previous !== String(count)) {
        cartCount.classList.remove('bump')
        void cartCount.offsetWidth
        cartCount.classList.add('bump')
      }
    }
    new MutationObserver(sync).observe(cartCount, { childList: true, characterData: true, subtree: true })
    bar.addEventListener('click', () => openCart.click())
    sync()
  }
})()

;(() => {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const bar = document.createElement('div')
  bar.className = 'progress'
  const glow = document.createElement('div')
  glow.className = 'glow'
  document.body.append(bar, glow)
  const onScroll = () => {
    const max = document.documentElement.scrollHeight - innerHeight
    bar.style.setProperty('--p', max > 0 ? (scrollY / max).toFixed(4) : 0)
  }
  addEventListener('scroll', onScroll, { passive: true })
  onScroll()
  if (reduce) return
  addEventListener('pointermove', (event) => {
    if (event.pointerType !== 'mouse') return
    glow.style.setProperty('--gx', `${event.clientX}px`)
    glow.style.setProperty('--gy', `${event.clientY}px`)
  }, { passive: true })
  document.querySelectorAll('.cta, .cart-button').forEach((button) => {
    button.addEventListener('pointermove', (event) => {
      if (event.pointerType !== 'mouse') return
      const box = button.getBoundingClientRect()
      button.style.transform = `translate(${((event.clientX - box.left) / box.width - 0.5) * 12}px,${((event.clientY - box.top) / box.height - 0.5) * 10}px)`
    })
    button.addEventListener('pointerleave', () => { button.style.transform = '' })
  })
})()
