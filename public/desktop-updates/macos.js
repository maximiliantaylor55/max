const downloads = document.querySelector('#downloads')
fetch('/desktop-updates/macos/latest.json', { cache: 'no-store' })
  .then((response) => {
    if (!response.ok) throw new Error('Download-Informationen sind noch nicht verfügbar.')
    return response.json()
  })
  .then((update) => {
    document.querySelector('#version').textContent = `Version ${update.version}`
    for (const file of update.files) {
      const link = document.createElement('a')
      link.href = `/desktop-updates/macos/${encodeURIComponent(file.name)}`
      link.download = file.name
      link.append(document.createTextNode(file.label), document.createElement('span'))
      link.lastChild.textContent = 'DMG herunterladen'
      downloads.append(link)
    }
  })
  .catch((error) => {
    document.querySelector('#version').textContent = error.message
  })
