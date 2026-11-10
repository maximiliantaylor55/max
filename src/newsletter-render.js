// ZYRO Newsletter-Renderer: baut aus Bausteinen eine moderne, mailtaugliche HTML-E-Mail.
// Wird in der App (Live-Vorschau) und in der Cloud Function (Versand) genutzt.
// WICHTIG: Diese Datei existiert zweimal – src/newsletter-render.js und functions/newsletter-render.cjs.
// Bei Änderungen bitte beide anpassen (die .cjs-Datei ist eine Kopie mit module.exports am Ende).

const NEWSLETTER_THEME = {
  page: '#f5f0e8',
  card: '#ffffff',
  ink: '#241910',
  muted: '#726559',
  accent: '#754a2d',
  gold: '#b8892a',
  line: '#eadfce',
}

const escapeNewsletterHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]))

const safeNewsletterUrl = (value) => {
  const url = String(value || '').trim()
  return /^https:\/\/[^\s"'<>]+$/i.test(url) || /^mailto:[^\s"'<>]+$/i.test(url) ? url : ''
}

// **fett**, *kursiv* und [Linktext](https://…) im Fließtext; Zeilenumbrüche bleiben erhalten.
const formatNewsletterText = (value, theme = NEWSLETTER_THEME) => escapeNewsletterHtml(value)
  .replace(/\[([^\]]{1,200})\]\((https:\/\/[^\s)]+)\)/g, (_m, text, url) => `<a href="${url}" style="color:${theme.accent};text-decoration:underline">${text}</a>`)
  .replace(/\*\*([^*]{1,500})\*\*/g, '<strong>$1</strong>')
  .replace(/(^|[\s(])\*([^*\n]{1,300})\*/g, '$1<em>$2</em>')
  .replace(/\r?\n/g, '<br>')

const personalizeNewsletter = (text, subscriber = {}) => String(text || '')
  .replace(/\{\{\s*vorname\s*\}\}/gi, String(subscriber.name || '').trim().split(/\s+/)[0] || '')
  .replace(/\{\{\s*name\s*\}\}/gi, String(subscriber.name || '').trim())

const renderNewsletterBlock = (block, subscriber, theme) => {
  const type = String(block?.type || '')
  const align = ['left', 'center'].includes(block?.align) ? block.align : 'left'
  if (type === 'heading') {
    const size = block.size === 'large' ? 34 : block.size === 'small' ? 20 : 26
    return `<tr><td style="padding:8px 40px 4px;text-align:${align}"><h${block.size === 'large' ? 1 : 2} style="margin:0;font-family:Inter,Arial,Helvetica,sans-serif;font-size:${size}px;line-height:1.15;font-weight:800;letter-spacing:-0.02em;color:${theme.ink}">${formatNewsletterText(personalizeNewsletter(block.text, subscriber), theme)}</h${block.size === 'large' ? 1 : 2}></td></tr>`
  }
  if (type === 'text') {
    return `<tr><td style="padding:8px 40px;text-align:${align};font-family:Inter,Arial,Helvetica,sans-serif;font-size:16px;line-height:1.65;color:${theme.ink}">${formatNewsletterText(personalizeNewsletter(block.text, subscriber), theme)}</td></tr>`
  }
  if (type === 'image') {
    const src = safeNewsletterUrl(block.url)
    if (!src) return ''
    const link = safeNewsletterUrl(block.link)
    const full = block.width !== 'inset'
    const img = `<img src="${escapeNewsletterHtml(src)}" alt="${escapeNewsletterHtml(block.alt || '')}" width="${full ? 600 : 520}" style="display:block;width:100%;max-width:${full ? 600 : 520}px;height:auto;border:0;${full ? '' : 'border-radius:16px;'}">`
    const caption = block.caption ? `<div style="padding:10px 0 0;font-family:Inter,Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;color:${theme.muted};text-align:center">${formatNewsletterText(block.caption, theme)}</div>` : ''
    return `<tr><td style="padding:${full ? '8px 0' : '12px 40px'}">${link ? `<a href="${escapeNewsletterHtml(link)}">${img}</a>` : img}${caption}</td></tr>`
  }
  if (type === 'button') {
    const url = safeNewsletterUrl(block.url)
    if (!url) return ''
    const outline = block.style === 'outline'
    return `<tr><td style="padding:16px 40px;text-align:${align === 'left' ? 'left' : 'center'}"><a href="${escapeNewsletterHtml(url)}" style="display:inline-block;padding:15px 30px;border-radius:999px;font-family:Inter,Arial,Helvetica,sans-serif;font-size:16px;font-weight:700;text-decoration:none;${outline ? `color:${theme.accent};border:2px solid ${theme.accent};background:#ffffff` : `color:#ffffff;background:${theme.accent};border:2px solid ${theme.accent}`}">${escapeNewsletterHtml(block.text || 'Mehr erfahren')}</a></td></tr>`
  }
  if (type === 'divider') {
    return `<tr><td style="padding:18px 40px"><div style="height:1px;line-height:1px;font-size:1px;background:${theme.line}">&nbsp;</div></td></tr>`
  }
  if (type === 'spacer') {
    return `<tr><td style="height:${block.size === 'large' ? 48 : 24}px;line-height:1px;font-size:1px">&nbsp;</td></tr>`
  }
  if (type === 'highlight') {
    return `<tr><td style="padding:12px 40px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${theme.page};border-radius:18px"><tr><td style="padding:24px 26px;font-family:Inter,Arial,Helvetica,sans-serif;text-align:${align}">${block.title ? `<div style="font-size:12px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:${theme.gold};padding-bottom:8px">${escapeNewsletterHtml(block.title)}</div>` : ''}<div style="font-size:17px;line-height:1.6;color:${theme.ink}">${formatNewsletterText(personalizeNewsletter(block.text, subscriber), theme)}</div></td></tr></table></td></tr>`
  }
  return ''
}

const renderNewsletterHtml = (campaign = {}, { subscriber = {}, unsubscribeUrl = '#', webCompanyLine = 'Liberty Street Food GmbH · Birlenbacherstr. 59 · 57078 Siegen' } = {}) => {
  const theme = NEWSLETTER_THEME
  const blocks = Array.isArray(campaign.blocks) ? campaign.blocks.slice(0, 60) : []
  const preheader = escapeNewsletterHtml(personalizeNewsletter(campaign.preheader || '', subscriber))
  const body = blocks.map((block) => renderNewsletterBlock(block, subscriber, theme)).join('')
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeNewsletterHtml(campaign.subject || 'ZYRO Newsletter')}</title></head>`
    + `<body style="margin:0;padding:0;background:${theme.page};-webkit-text-size-adjust:100%">`
    + `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${preheader}&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;</div>`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${theme.page}"><tr><td align="center" style="padding:28px 12px 40px">`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px">`
    + `<tr><td style="padding:4px 8px 18px;text-align:center;font-family:Impact,'Arial Narrow',Arial,sans-serif;font-size:30px;letter-spacing:0.06em;color:${theme.ink}">ZYRO<sup style="font-family:Arial,sans-serif;font-size:10px">®</sup></td></tr>`
    + `<tr><td style="background:${theme.card};border-radius:24px;overflow:hidden"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">`
    + `<tr><td style="height:6px;line-height:6px;font-size:1px;background:${theme.gold};background:${theme.gold};background:linear-gradient(90deg,${theme.gold},${theme.accent})">&nbsp;</td></tr>`
    + `<tr><td style="height:24px;line-height:1px;font-size:1px">&nbsp;</td></tr>${body}<tr><td style="height:32px;line-height:1px;font-size:1px">&nbsp;</td></tr>`
    + '</table></td></tr>'
    + `<tr><td style="padding:24px 24px 0;text-align:center;font-family:Inter,Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:${theme.muted}">`
    + 'Du bekommst diese E-Mail, weil du dich für den ZYRO-Newsletter angemeldet hast.<br>'
    + `<a href="${escapeNewsletterHtml(unsubscribeUrl)}" style="color:${theme.muted};text-decoration:underline">Newsletter abbestellen</a> · <a href="https://xn--zyro-getrnke-ocb.de/" style="color:${theme.muted};text-decoration:underline">zyro-getränke.de</a> · <a href="https://xn--zyro-getrnke-ocb.de/impressum.html" style="color:${theme.muted};text-decoration:underline">Impressum</a><br>`
    + `${escapeNewsletterHtml(webCompanyLine)}</td></tr>`
    + '</table></td></tr></table></body></html>'
}

const renderNewsletterText = (campaign = {}, { subscriber = {}, unsubscribeUrl = '' } = {}) => {
  const lines = ['ZYRO', '']
  for (const block of Array.isArray(campaign.blocks) ? campaign.blocks : []) {
    if (['heading', 'text', 'highlight'].includes(block.type)) {
      if (block.title) lines.push(String(block.title).toUpperCase())
      lines.push(personalizeNewsletter(block.text, subscriber).replace(/\*\*|\*/g, '').replace(/\[([^\]]+)\]\((https:\/\/[^\s)]+)\)/g, '$1 ($2)'), '')
    } else if (block.type === 'button' && safeNewsletterUrl(block.url)) {
      lines.push(`${block.text || 'Mehr erfahren'}: ${block.url}`, '')
    } else if (block.type === 'image' && block.caption) {
      lines.push(block.caption, '')
    } else if (block.type === 'divider') {
      lines.push('———', '')
    }
  }
  lines.push('—', 'Du bekommst diese E-Mail, weil du dich für den ZYRO-Newsletter angemeldet hast.', `Abbestellen: ${unsubscribeUrl}`, 'Liberty Street Food GmbH · Birlenbacherstr. 59 · 57078 Siegen')
  return lines.join('\n')
}

export { NEWSLETTER_THEME, escapeNewsletterHtml, renderNewsletterHtml, renderNewsletterText, safeNewsletterUrl }
