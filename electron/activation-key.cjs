const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const keyPattern = /^[A-F0-9]{36}$/

const getOrCreateBootstrapKey = (filePath) => {
  try {
    const existingKey = fs.readFileSync(filePath, 'utf8').trim()
    if (keyPattern.test(existingKey)) return existingKey
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }

  const activationKey = crypto.randomBytes(18).toString('hex').toUpperCase()
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${activationKey}\n`, { encoding: 'utf8', mode: 0o600 })
  return activationKey
}

const removeBootstrapKey = (filePath) => {
  try {
    fs.unlinkSync(filePath)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
}

module.exports = { getOrCreateBootstrapKey, removeBootstrapKey }