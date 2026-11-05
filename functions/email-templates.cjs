const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character])

const formatCurrency = (cents) => new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
}).format(Number(cents || 0) / 100)

const buildOrderConfirmationEmail = ({ order, orderNumber, paymentInfo }) => {
  const total = formatCurrency(order.totalPriceCents)
  const subtotal = formatCurrency(order.subtotalCents)
  const shipping = formatCurrency(order.shippingPriceCents)
  const actualWeightKg = (Number(order.shippingWeightGrams || 0) / 1000).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const shippingDetails = order.shippingPalletCount
    ? `${order.shippingMethod || 'Spedition'} · ${order.shippingPalletCount} Palette(n)`
    : `${order.shippingMethod || 'DPD Paket (bis 31,5 kg)'} · Versandgewicht: ${actualWeightKg} kg (berechnet: ${order.shippingBillableWeightKg} kg)`
  const vat = formatCurrency(order.vatCents)
  const paymentLines = order.paymentMethod === 'vorkasse'
    ? [
      ['Empfänger', paymentInfo.accountHolder],
      ['IBAN', paymentInfo.iban],
      ['Verwendungszweck', paymentInfo.reference],
    ]
    : [
      ['Zahlung', order.paymentMethod === 'stripe' ? (order.paymentStatus === 'paid' ? 'Online-Zahlung erhalten' : 'Online-Zahlung (Karte, Apple Pay, SEPA)') : (order.paymentStatus === 'paid' ? 'PayPal-Zahlung erhalten' : 'PayPal')],
      ['Verwendungszweck', paymentInfo.reference],
    ]
  const itemsText = order.items.map((item) => (
    `${item.productName} · ${item.quantity} Dosen · ${item.largeCartonCount} 24er-Trays · ${item.smallCartonCount} Einzeldosen · ${formatCurrency(item.lineTotalCents)}${item.isPreorder ? `\n  VORBESTELLUNG${item.expectedDeliveryDate ? ` · voraussichtliche Lieferung: ${new Date(`${item.expectedDeliveryDate}T00:00:00.000Z`).toLocaleDateString('de-DE', { timeZone: 'UTC' })}` : ''}` : ''}`
  )).join('\n')
  const paymentText = paymentLines.map(([label, value]) => `${label}: ${value}`).join('\n')
  const itemRows = order.items.map((item) => `
    <tr>
      <td style="padding:16px 12px;border-bottom:1px solid #e5e9e1;font-family:Arial,sans-serif;color:#18231d;font-size:14px;line-height:20px;">
        <strong style="display:block;font-size:15px;">${escapeHtml(item.productName)}</strong>
        <span style="display:block;margin-top:5px;color:#657269;font-size:12px;">${item.quantity} Dosen</span>
        <span style="display:block;margin-top:3px;color:#657269;font-size:12px;">${item.largeCartonCount} 24er-Trays · ${item.smallCartonCount} Einzeldosen</span>
        ${item.isPreorder ? `<span style="display:block;margin-top:5px;color:#a3411d;font-size:12px;font-weight:bold;">VORBESTELLUNG${item.expectedDeliveryDate ? ` · voraussichtliche Lieferung ${escapeHtml(new Date(`${item.expectedDeliveryDate}T00:00:00.000Z`).toLocaleDateString('de-DE', { timeZone: 'UTC' }))}` : ''}</span>` : ''}
      </td>
      <td align="right" style="padding:16px 12px;border-bottom:1px solid #e5e9e1;font-family:Arial,sans-serif;color:#18231d;font-size:14px;font-weight:bold;white-space:nowrap;">${formatCurrency(item.lineTotalCents)}</td>
    </tr>`).join('')
  const paymentRows = paymentLines.map(([label, value]) => `
    <tr>
      <td style="padding:6px 0;color:#d7dfd5;font-family:Arial,sans-serif;font-size:12px;">${escapeHtml(label)}</td>
      <td align="right" style="padding:6px 0;color:#ffffff;font-family:Arial,sans-serif;font-size:13px;font-weight:bold;overflow-wrap:anywhere;">${escapeHtml(value)}</td>
    </tr>`).join('')
  const date = new Date().toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' })

  return {
    text: `Hallo ${order.name},\n\nwir haben deine Bestellung ${orderNumber} erhalten.${order.hasPreorderItems ? '\n\nHinweis: Deine Bestellung enthält Vorbestellartikel. Die voraussichtlichen Liefertermine stehen direkt bei den Artikeln.' : ''}\n\n${itemsText}\n\nVersandart: ${shippingDetails}\nZwischensumme: ${subtotal}\nVersand: ${shipping}\n${order.depositCents > 0 ? `Pfand (zzgl., nicht steuerbar): ${formatCurrency(order.depositCents)}\n` : ''}${order.pricesIncludeVat ? `Enthaltene MwSt. (${order.vatRate}%): ${vat}` : `MwSt. (${order.vatRate}%): ${vat}`}\nGesamtbetrag: ${total}\n\n${paymentText}\nBitte nutze die Bestellnummer als Verwendungszweck.\n\nVielen Dank für deine Bestellung.\nZYRO · Liberty Street Food GmbH`,
    html: `<!doctype html>
<html lang="de">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background-color:#edf0e9;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">Deine Bestellung ${escapeHtml(orderNumber)} ist eingegangen. Gesamtbetrag: ${escapeHtml(total)}.</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#edf0e9;">
    <tr><td align="center" style="padding:32px 12px;">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background-color:#ffffff;border-collapse:collapse;">
        <tr><td style="height:7px;background-color:#f26a43;font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td style="padding:26px 30px;background-color:#18231d;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>
            <td style="font-family:Arial,sans-serif;color:#ffffff;font-size:28px;font-weight:900;letter-spacing:2px;">ZYRO<span style="color:#c9ed4f;">®</span></td>
            <td align="right" style="font-family:Arial,sans-serif;color:#cbd5ca;font-size:10px;font-weight:bold;letter-spacing:1px;">BESTELLBESTÄTIGUNG</td>
          </tr></table>
          <p style="margin:24px 0 5px;color:#c9ed4f;font-family:Arial,sans-serif;font-size:11px;font-weight:bold;letter-spacing:1px;">BESTELLUNG EINGEGANGEN</p>
          <p style="margin:0;color:#ffffff;font-family:Arial,sans-serif;font-size:24px;font-weight:bold;line-height:31px;">Danke, ${escapeHtml(order.name)}.</p>
          <p style="margin:9px 0 0;color:#d7dfd5;font-family:Arial,sans-serif;font-size:13px;line-height:20px;">Wir haben deine Bestellung erhalten.${order.hasPreorderItems ? ' Sie enthält Vorbestellartikel; die voraussichtlichen Liefertermine stehen direkt bei den Artikeln.' : ' Wir bereiten sie für dich vor.'}</p>
        </td></tr>
        <tr><td style="padding:20px 30px;background-color:#f6f7f2;border-bottom:1px solid #e5e9e1;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>
            <td style="font-family:Arial,sans-serif;color:#657269;font-size:11px;font-weight:bold;letter-spacing:.5px;">BESTELLNUMMER</td>
            <td align="right" style="font-family:Arial,sans-serif;color:#18231d;font-size:13px;font-weight:bold;">${escapeHtml(orderNumber)}</td>
          </tr><tr>
            <td style="padding-top:7px;font-family:Arial,sans-serif;color:#657269;font-size:11px;">Bestellnummer</td>
            <td align="right" style="padding-top:7px;font-family:Arial,sans-serif;color:#18231d;font-size:12px;">${escapeHtml(orderNumber)}</td>
          </tr><tr>
            <td style="padding-top:7px;font-family:Arial,sans-serif;color:#657269;font-size:11px;">Bestelldatum</td>
            <td align="right" style="padding-top:7px;font-family:Arial,sans-serif;color:#18231d;font-size:12px;">${date}</td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:26px 30px 8px;">
          <p style="margin:0 0 12px;color:#18231d;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;">Deine Artikel</p>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;">
            <tr><td style="padding:9px 12px;background-color:#f6f7f2;color:#657269;font-family:Arial,sans-serif;font-size:10px;font-weight:bold;letter-spacing:.5px;">ARTIKEL &amp; VERPACKUNG</td><td align="right" style="padding:9px 12px;background-color:#f6f7f2;color:#657269;font-family:Arial,sans-serif;font-size:10px;font-weight:bold;">BETRAG</td></tr>
            ${itemRows}
          </table>
        </td></tr>
        <tr><td style="padding:16px 30px 24px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;">
            <tr><td style="padding:5px 0;color:#657269;font-family:Arial,sans-serif;font-size:12px;">Zwischensumme</td><td align="right" style="padding:5px 0;color:#18231d;font-family:Arial,sans-serif;font-size:12px;">${subtotal}</td></tr>
            <tr><td style="padding:5px 0;color:#657269;font-family:Arial,sans-serif;font-size:12px;">Versand</td><td align="right" style="padding:5px 0;color:#18231d;font-family:Arial,sans-serif;font-size:12px;">${shipping}</td></tr>${order.depositCents > 0 ? `<tr><td style="padding:5px 0;color:#657269;font-family:Arial,sans-serif;font-size:12px;">Pfand (zzgl., nicht steuerbar)</td><td align="right" style="padding:5px 0;color:#18231d;font-family:Arial,sans-serif;font-size:12px;">${formatCurrency(order.depositCents)}</td></tr>` : ''}
            <tr><td style="padding:5px 0;color:#657269;font-family:Arial,sans-serif;font-size:12px;">Versandart</td><td align="right" style="padding:5px 0;color:#18231d;font-family:Arial,sans-serif;font-size:12px;">${escapeHtml(shippingDetails)}</td></tr>
            <tr><td style="padding:5px 0;color:#657269;font-family:Arial,sans-serif;font-size:12px;">${order.pricesIncludeVat ? `Enthaltene MwSt. (${order.vatRate}%)` : `MwSt. (${order.vatRate}%)`}</td><td align="right" style="padding:5px 0;color:#18231d;font-family:Arial,sans-serif;font-size:12px;">${vat}</td></tr>
            <tr><td style="padding:13px 0 0;border-top:1px solid #cbd2c6;color:#18231d;font-family:Arial,sans-serif;font-size:15px;font-weight:bold;">Gesamtbetrag</td><td align="right" style="padding:13px 0 0;border-top:1px solid #cbd2c6;color:#18231d;font-family:Arial,sans-serif;font-size:18px;font-weight:bold;">${total}</td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:0 30px 28px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#18231d;">
            <tr><td style="padding:19px 20px 7px;color:#c9ed4f;font-family:Arial,sans-serif;font-size:10px;font-weight:bold;letter-spacing:1px;">${order.paymentMethod === 'vorkasse' ? 'ZAHLUNG PER VORKASSE' : order.paymentMethod === 'stripe' ? 'ONLINE-ZAHLUNG' : 'ZAHLUNG PER PAYPAL'}</td></tr>
            <tr><td style="padding:0 20px 16px;color:#d7dfd5;font-family:Arial,sans-serif;font-size:12px;line-height:18px;">Bitte nutze die Bestellnummer als Verwendungszweck.</td></tr>
            <tr><td style="padding:0 20px 19px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">${paymentRows}</table></td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:19px 30px;background-color:#f6f7f2;border-top:1px solid #e5e9e1;">
          <p style="margin:0;color:#657269;font-family:Arial,sans-serif;font-size:11px;line-height:17px;">Fragen zu deiner Bestellung? Antworte einfach auf diese E-Mail.</p>
          <p style="margin:8px 0 0;color:#18231d;font-family:Arial,sans-serif;font-size:11px;font-weight:bold;">ZYRO · Liberty Street Food GmbH</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  }
}

module.exports = { buildOrderConfirmationEmail }