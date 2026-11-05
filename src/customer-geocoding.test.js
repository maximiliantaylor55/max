import assert from 'node:assert/strict'
import test from 'node:test'
import { getCustomerGeocodePlace, selectCustomerMapLocation } from './customer-geocoding.js'

test('geocoding extracts only postal code and locality from a full address', () => {
  assert.equal(getCustomerGeocodePlace('Birlenbacherstr 59\n57078 Siegen'), '57078 Siegen')
})

test('geocoding does not send an address without a postal code and locality', () => {
  assert.equal(getCustomerGeocodePlace('Birlenbacherstr 59'), '')
  assert.equal(getCustomerGeocodePlace('Hauptstraße'), '')
  assert.equal(getCustomerGeocodePlace('Siegen'), '')
})

test('map location prefers the postal-code center over street-level results', () => {
  const features = [
    { properties: { type: 'house', osm_value: 'company', name: 'Local business' }, geometry: { coordinates: [8.007, 50.908] } },
    { properties: { type: 'other', osm_value: 'postcode', name: '57078', city: 'Siegen' }, geometry: { coordinates: [7.995, 50.925] } },
  ]
  assert.deepEqual(selectCustomerMapLocation(features, '57078 Siegen'), [50.925, 7.995])
})

test('map location rejects house points and ambiguous locality matches', () => {
  const house = { properties: { type: 'house', name: 'Siegen' }, geometry: { coordinates: [8.007, 50.908] } }
  assert.equal(selectCustomerMapLocation([house], '57078 Siegen'), null)
  assert.equal(selectCustomerMapLocation([], 'Siegen'), null)
})
