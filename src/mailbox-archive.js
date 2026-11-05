export const maxEmailArchiveAttachmentBytes = 5 * 1024 * 1024
export const maxArchiveDocumentsBytes = 7 * 1024 * 1024

export const getArchiveDocumentsBytes = (documents) => documents.reduce((total, document) => {
  const size = Number(document?.size)
  return Number.isSafeInteger(size) && size > 0 ? total + size : total
}, 0)
