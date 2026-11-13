// Übersetzt den Status des Versanddienstes (DPD/DHL) in die Fortschrittsanzeige im Kundenkonto.
const SHIPMENT_PHASES = ['Bestellt', 'Versendet', 'Unterwegs', 'Im Zustelldepot', 'In Zustellung', 'Zugestellt']

const describeShipmentPhase = ({ shipped = false, delivered = false, status = '', description = '' } = {}) => {
  const code = String(status || '').toUpperCase()
  const text = String(description || '').toLowerCase()
  let phase = 1
  if (delivered || /^(DELIVERED|DELIVERED_SHOP|DELIVERED_PARCELSHOP|PICKED_UP_BY_CONSIGNEE)$/.test(code) || /zugestellt|delivered/.test(text)) phase = 5
  else if (!shipped) phase = 0
  else if (/OUT_FOR_DELIVERY|^DELIVERY$|ON_DELIVERY/.test(code) || /in zustellung|zustellfahrzeug|heute zugestellt|wird zugestellt|out for delivery/.test(text)) phase = 4
  else if (/DELIVERY_DEPOT/.test(code) || /zustelldepot|zustellbasis|zustellstützpunkt/.test(text)) phase = 3
  else if (/ON_THE_ROAD|AT_SENDING_DEPOT|ACCEPTED|PICKUP|TRANSIT/.test(code) || /unterwegs|transit|übernommen|abgeholt|paketzentrum|sortier|depot/.test(text)) phase = 2
  return { phase, phaseLabel: SHIPMENT_PHASES[phase], phases: SHIPMENT_PHASES }
}

module.exports = { SHIPMENT_PHASES, describeShipmentPhase }
