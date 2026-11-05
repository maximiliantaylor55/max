import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getArchiveDocumentsBytes,
  maxArchiveDocumentsBytes,
  maxEmailArchiveAttachmentBytes,
} from './mailbox-archive.js'

test('allows mailbox attachments up to the mailbox read limit', () => {
  assert.equal(maxEmailArchiveAttachmentBytes, 5 * 1024 * 1024)
})

test('counts actual archive file sizes against the archive limit', () => {
  assert.equal(maxArchiveDocumentsBytes, 7 * 1024 * 1024)
  assert.equal(getArchiveDocumentsBytes([
    { size: 2 * 1024 * 1024 },
    { size: 5 * 1024 * 1024 },
    { size: 0 },
    { size: 'invalid' },
  ]), maxArchiveDocumentsBytes)
})
