import { useEffect, useMemo, useState } from 'react'
import { CircleMarker, MapContainer, Popup, TileLayer, Tooltip, useMap } from 'react-leaflet'
import { getCustomerGeocodePlace, selectCustomerMapLocation } from './customer-geocoding.js'
import 'leaflet/dist/leaflet.css'

const cacheKey = 'zyro-customer-geocodes-v2'
const geocodeEndpoint = 'https://photon.komoot.io/api/'

const readCache = () => {
  try {
    const value = JSON.parse(window.localStorage.getItem(cacheKey) || '{}')
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  } catch {
    return {}
  }
}

const CustomerMapBounds = ({ positions }) => {
  const map = useMap()

  useEffect(() => {
    if (positions.length === 1) {
      map.setView(positions[0], 6)
    } else if (positions.length > 1) {
      map.fitBounds(positions, { padding: [28, 28], maxZoom: 7 })
    }
  }, [map, positions])

  return null
}

const CustomerMap = ({ customers }) => {
  const [locations, setLocations] = useState(readCache)
  const [progress, setProgress] = useState({ queryKey: '', done: 0, total: 0 })
  const [mapError, setMapError] = useState({ queryKey: '', message: '' })

  const addressEntries = useMemo(() => customers
    .map((customer) => ({
      customer,
      place: getCustomerGeocodePlace(String(customer.address || '')),
    }))
    .filter(({ place }) => place)
    .map(({ customer, place }) => ({ customer, place, query: place })), [customers])
  const queryKey = addressEntries.map(({ query }) => query).sort().join('|')

  useEffect(() => {
    let active = true
    const controller = new AbortController()
    const cached = readCache()
    const uniqueQueries = [...new Set(addressEntries.map(({ query }) => query))]
    const missingQueries = uniqueQueries.filter((query) => !Object.hasOwn(cached, query))

    if (missingQueries.length === 0) return () => { active = false }

    const geocodeMissingPlaces = async () => {
      await Promise.resolve()
      if (!active) return
      setMapError({ queryKey, message: '' })
      setProgress({ queryKey, done: 0, total: missingQueries.length })

      for (const [index, query] of missingQueries.entries()) {
        if (index > 0) await new Promise((resolve) => window.setTimeout(resolve, 1100))
        if (!active) return

        try {
          const url = new URL(geocodeEndpoint)
          url.searchParams.set('q', query)
          url.searchParams.set('limit', '10')
          url.searchParams.set('lang', 'de')
          const response = await fetch(url, { signal: controller.signal })
          if (!response.ok) throw new Error(`Geocoding fehlgeschlagen (${response.status}).`)
          const result = await response.json()
          if (!active) return
          cached[query] = selectCustomerMapLocation(result.features || [], query)
          setLocations({ ...cached })
          try {
            window.localStorage.setItem(cacheKey, JSON.stringify(cached))
          } catch {
            setMapError({ queryKey, message: 'Orte konnten nicht lokal zwischengespeichert werden.' })
          }
        } catch (error) {
          if (active) setMapError({ queryKey, message: error.message || 'Kundenorte konnten nicht geladen werden.' })
        } finally {
          if (active) setProgress({ queryKey, done: index + 1, total: missingQueries.length })
        }
      }
    }

    geocodeMissingPlaces()
    return () => {
      active = false
      controller.abort()
    }
  }, [addressEntries, queryKey])

  const groups = useMemo(() => {
    const grouped = new Map()
    addressEntries.forEach(({ customer, query }) => {
      const position = locations[query]
      if (!Array.isArray(position)) return
      const key = position.map((coordinate) => coordinate.toFixed(3)).join(',')
      const group = grouped.get(key) || { position, customers: [] }
      group.customers.push(customer)
      grouped.set(key, group)
    })
    return [...grouped.values()]
  }, [addressEntries, locations])
  const positions = useMemo(() => groups.map((group) => group.position), [groups])
  const currentProgress = progress.queryKey === queryKey ? progress : { done: 0, total: 0 }
  const currentError = mapError.queryKey === queryKey ? mapError.message : ''
  const placesPending = addressEntries.some(({ query }) => !Object.hasOwn(locations, query))
  const customersWithAddress = customers.filter((customer) => String(customer.address || '').trim()).length

  return (
    <section className="panel customer-map-panel">
      <div className="panel-header">
        <div>
          <h2>Kunden in Europa</h2>
          <p className="meta">Markierungen zeigen Orte, keine genauen Straßenadressen.</p>
        </div>
        <span>{groups.reduce((total, group) => total + group.customers.length, 0)} markiert</span>
      </div>
      <div className="customer-map">
        <MapContainer center={[51, 10]} zoom={4} minZoom={3} maxZoom={12} scrollWheelZoom>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap-Mitwirkende</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <CustomerMapBounds positions={positions} />
          {groups.map((group) => (
            <CircleMarker
              key={group.position.join(',')}
              center={group.position}
              radius={Math.min(15, 7 + group.customers.length)}
              pathOptions={{ color: '#67e8f9', fillColor: '#0ea5e9', fillOpacity: 0.82, weight: 2 }}
            >
              {group.customers.length > 1 && <Tooltip permanent>{group.customers.length}</Tooltip>}
              <Popup>
                <strong>{group.customers.length === 1 ? 'Kunde' : `${group.customers.length} Kunden`}</strong>
                <ul>
                  {group.customers.map((customer) => <li key={customer.id ?? customer.name}>{customer.name}</li>)}
                </ul>
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>
      <div className="customer-map-footer">
        {currentProgress.total > 0 && <span>Orte werden gesucht: {currentProgress.done} von {currentProgress.total}</span>}
        {customersWithAddress === 0 && <span>Bei den Kunden sind noch keine Adressen hinterlegt.</span>}
        {customersWithAddress > 0 && addressEntries.length === 0 && <span>Für die Ortssuche fehlt eine Postleitzahl mit Ort.</span>}
        {addressEntries.length > 0 && groups.length === 0 && !placesPending && !currentError
          && <span>Für die gespeicherten Anschriften wurden keine Orte gefunden.</span>}
        {currentError && <span role="status">{currentError} Bitte später erneut versuchen.</span>}
        <small>Zur Ortssuche werden nur Postleitzahl und Ort an <a href="https://photon.komoot.io/" target="_blank" rel="noreferrer">Photon</a> übermittelt. Straßen-/Hauspunkte werden nicht verwendet; Kartenkacheln von OpenStreetMap.</small>
      </div>
    </section>
  )
}

export default CustomerMap
