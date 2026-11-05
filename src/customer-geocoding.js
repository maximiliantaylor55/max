export const getCustomerGeocodePlace = (address) => {
  const postalPlace = address.match(/\b\d{4,6}\s+[\p{L}][\p{L} .'’-]{1,60}/u)?.[0]
  return postalPlace?.trim() || ''
}

const normalize = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase()

export const selectCustomerMapLocation = (features, query) => {
  const match = query.match(/^(\d{4,6})\s+(.+)$/u)
  if (!match) return null
  const [, postalCode, city] = match
  const candidates = features.filter((feature) => {
    const [longitude, latitude] = feature?.geometry?.coordinates || []
    return Number.isFinite(latitude) && Number.isFinite(longitude)
      && latitude >= 34 && latitude <= 72 && longitude >= -25 && longitude <= 45
      && feature.properties?.type !== 'house'
  })
  const postalFeature = candidates.find((feature) => feature.properties?.osm_value === 'postcode'
    && normalize(feature.properties.name) === normalize(postalCode)
    && normalize(feature.properties.city) === normalize(city))
  const placeFeature = postalFeature || candidates.find((feature) =>
    ['city', 'locality'].includes(feature.properties?.type)
    && (normalize(feature.properties.name) === normalize(city) || normalize(feature.properties.city) === normalize(city)))
  if (!placeFeature) return null
  const [longitude, latitude] = placeFeature.geometry.coordinates
  return [latitude, longitude]
}
