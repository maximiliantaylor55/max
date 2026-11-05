const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('zyroUpdater', {
  getState: () => ipcRenderer.invoke('zyro-updater:get-state'),
  check: () => ipcRenderer.invoke('zyro-updater:check'),
  download: () => ipcRenderer.invoke('zyro-updater:download'),
  install: () => ipcRenderer.invoke('zyro-updater:install'),
  onState: (callback) => {
    const listener = (_event, state) => callback(state)
    ipcRenderer.on('zyro-updater:state', listener)
    return () => ipcRenderer.removeListener('zyro-updater:state', listener)
  },
})

contextBridge.exposeInMainWorld('zyroAI', {
  getStatus: () => ipcRenderer.invoke('zyro-ai:status'),
  saveKey: (apiKey) => ipcRenderer.invoke('zyro-ai:save-key', apiKey),
  saveOpenAiKey: (apiKey) => ipcRenderer.invoke('zyro-ai:save-openai-key', apiKey),
  generateRecipe: (prompt) => ipcRenderer.invoke('zyro-ai:generate-recipe', prompt),
  analyzeOffer: (fileName, contentType, bytes, sessionToken) => ipcRenderer.invoke(
    'zyro-ai:analyze-offer', fileName, contentType, bytes, sessionToken,
  ),
  generateLabelDesign: (prompt) => ipcRenderer.invoke('zyro-ai:generate-label-design', prompt),
  estimateLabelNutrition: (prompt) => ipcRenderer.invoke('zyro-ai:estimate-label-nutrition', prompt),
})

contextBridge.exposeInMainWorld('zyroElster', {
  getSetup: (sessionToken) => ipcRenderer.invoke('zyro-elster:get-setup', sessionToken),
  saveSetup: (setup, sessionToken) => ipcRenderer.invoke('zyro-elster:save-setup', setup, sessionToken),
})

contextBridge.exposeInMainWorld('zyroFinanceReceipts', {
  upload: (entryId, fileName, contentType, bytes, sessionToken) => ipcRenderer.invoke(
    'zyro-finance-receipt:upload', entryId, fileName, contentType, bytes, sessionToken,
  ),
  get: (entryId, receiptId, sessionToken) => ipcRenderer.invoke(
    'zyro-finance-receipt:get', entryId, receiptId, sessionToken,
  ),
  delete: (entryId, receiptId, sessionToken) => ipcRenderer.invoke(
    'zyro-finance-receipt:delete', entryId, receiptId, sessionToken,
  ),
})

contextBridge.exposeInMainWorld('zyroData', {
  get: (key, sessionToken) => ipcRenderer.sendSync('zyro-data:get', key, sessionToken),
  set: (key, value, sessionToken) => ipcRenderer.invoke('zyro-data:set', key, value, sessionToken),
  getSnapshot: (sessionToken) => ipcRenderer.invoke('zyro-data:snapshot', sessionToken),
  getNetworkStatus: () => ipcRenderer.invoke('zyro-data:network-status'),
  startHost: () => ipcRenderer.invoke('zyro-data:start-host'),
  stopHost: () => ipcRenderer.invoke('zyro-data:stop-host'),
  connectHost: (address, accessCode) => ipcRenderer.invoke('zyro-data:connect-host', address, accessCode),
  disconnectHost: () => ipcRenderer.invoke('zyro-data:disconnect-host'),
  exportMonthlyInvoicesPdf: (html, fileName) => ipcRenderer.invoke('zyro-data:export-monthly-invoices-pdf', html, fileName),
  exportBottleLabelPdf: (html, fileName, widthMm, heightMm) => ipcRenderer.invoke('zyro-data:export-bottle-label-pdf', html, fileName, widthMm, heightMm),
  exportZugferdInvoice: (salesDocument, sellerDetails) => ipcRenderer.invoke('zyro-data:export-zugferd-invoice', salesDocument, sellerDetails),
  openHtmlPreview: (html, title) => ipcRenderer.invoke('zyro-data:open-html-preview', html, title),
  closeHtmlPreview: (previewId) => ipcRenderer.invoke('zyro-data:close-html-preview', previewId),
})

contextBridge.exposeInMainWorld('zyroCloud', {
  status: () => ipcRenderer.invoke('zyro-cloud:status'),
  enable: (adminToken, sessionToken) => ipcRenderer.invoke('zyro-cloud:enable', adminToken, sessionToken),
  disable: (sessionToken) => ipcRenderer.invoke('zyro-cloud:disable', sessionToken),
  syncNow: (sessionToken) => ipcRenderer.invoke('zyro-cloud:sync-now', sessionToken),
})

contextBridge.exposeInMainWorld('zyroAuth', {
  getStatus: () => ipcRenderer.invoke('zyro-auth:status'),
  login: (credentials) => ipcRenderer.invoke('zyro-auth:login', credentials),
  logout: (sessionToken) => ipcRenderer.invoke('zyro-auth:logout', sessionToken),
  updateProfile: (profile, sessionToken) => ipcRenderer.invoke('zyro-auth:update-profile', profile, sessionToken),
  updateAccount: (account, sessionToken) => ipcRenderer.invoke('zyro-auth:update-account', account, sessionToken),
  register: (registration) => ipcRenderer.invoke('zyro-auth:register', registration),
  issueKey: (role, permissions, sessionToken) => ipcRenderer.invoke('zyro-auth:issue-key', role, permissions, sessionToken),
  updateUserPermissions: (userId, role, permissions, sessionToken) => ipcRenderer.invoke('zyro-auth:update-user-permissions', userId, role, permissions, sessionToken),
  removeUser: (userId, sessionToken) => ipcRenderer.invoke('zyro-auth:remove-user', userId, sessionToken),
})

contextBridge.exposeInMainWorld('zyroBackup', {
  list: (sessionToken) => ipcRenderer.invoke('zyro-backup:list', sessionToken),
  restore: (fileName, sessionToken) => ipcRenderer.invoke('zyro-backup:restore', fileName, sessionToken),
})

contextBridge.exposeInMainWorld('zyroCalls', {
  connect: (sessionToken) => ipcRenderer.invoke('zyro-calls:connect', sessionToken),
  send: (message) => ipcRenderer.send('zyro-calls:send', message),
  disconnect: () => ipcRenderer.invoke('zyro-calls:disconnect'),
  onMessage: (callback) => {
    const listener = (_event, message) => callback(message)
    ipcRenderer.on('zyro-calls:message', listener)
    return () => ipcRenderer.removeListener('zyro-calls:message', listener)
  },
  onError: (callback) => {
    const listener = (_event, message) => callback(message)
    ipcRenderer.on('zyro-calls:error', listener)
    return () => ipcRenderer.removeListener('zyro-calls:error', listener)
  },
  onDisconnected: (callback) => {
    const listener = () => callback()
    ipcRenderer.on('zyro-calls:disconnected', listener)
    return () => ipcRenderer.removeListener('zyro-calls:disconnected', listener)
  },
})

contextBridge.exposeInMainWorld('zyroMailbox', {
  getSettings: (sessionToken) => ipcRenderer.invoke('zyro-mailbox:get-settings', sessionToken),
  saveSettings: (value, sessionToken) => ipcRenderer.invoke('zyro-mailbox:save-settings', value, sessionToken),
  remove: (sessionToken) => ipcRenderer.invoke('zyro-mailbox:remove', sessionToken),
  listFolders: (sessionToken) => ipcRenderer.invoke('zyro-mailbox:list-folders', sessionToken),
  list: (options, sessionToken) => ipcRenderer.invoke('zyro-mailbox:list', options, sessionToken),
  read: (options, sessionToken) => ipcRenderer.invoke('zyro-mailbox:read', options, sessionToken),
  deleteMessage: (options, sessionToken) => ipcRenderer.invoke('zyro-mailbox:delete', options, sessionToken),
  moveMessage: (options, sessionToken) => ipcRenderer.invoke('zyro-mailbox:move', options, sessionToken),
  send: (message, sessionToken) => ipcRenderer.invoke('zyro-mailbox:send', message, sessionToken),
  openLink: (url, sessionToken) => ipcRenderer.invoke('zyro-mailbox:open-link', url, sessionToken),
})

contextBridge.exposeInMainWorld('zyroSipgate', {
  getSettings: (sessionToken) => ipcRenderer.invoke('zyro-sipgate:get-settings', sessionToken),
  saveSettings: (value, sessionToken) => ipcRenderer.invoke('zyro-sipgate:save-settings', value, sessionToken),
  removeSettings: (sessionToken) => ipcRenderer.invoke('zyro-sipgate:remove-settings', sessionToken),
  startCall: (destination, sessionToken) => ipcRenderer.invoke('zyro-sipgate:start-call', destination, sessionToken),
})

contextBridge.exposeInMainWorld('zyroSipSoftphone', {
  getSettings: (sessionToken) => ipcRenderer.invoke('zyro-sip-softphone:get-settings', sessionToken),
  getCredentials: (sessionToken) => ipcRenderer.invoke('zyro-sip-softphone:get-credentials', sessionToken),
  saveSettings: (value, sessionToken) => ipcRenderer.invoke('zyro-sip-softphone:save-settings', value, sessionToken),
  removeSettings: (sessionToken) => ipcRenderer.invoke('zyro-sip-softphone:remove-settings', sessionToken),
})

contextBridge.exposeInMainWorld('zyroWebOrders', {
  generateAdminToken: (sessionToken, rotate = false) => ipcRenderer.invoke('zyro-web-orders:generate-token', sessionToken, rotate),
  getStatus: (sessionToken) => ipcRenderer.invoke('zyro-web-orders:status', sessionToken),
  setAdminToken: (token, sessionToken) => ipcRenderer.invoke('zyro-web-orders:set-admin-token', token, sessionToken),
  listContactMessages: (sessionToken) => ipcRenderer.invoke('zyro-web-orders:list-contact-messages', sessionToken),
  replyContactMessage: (messageId, reply, sessionToken) => ipcRenderer.invoke('zyro-web-orders:reply-contact-message', messageId, reply, sessionToken),
  deleteContactMessage: (messageId, sessionToken) => ipcRenderer.invoke('zyro-web-orders:delete-contact-message', messageId, sessionToken),
  updateContactMessage: (messageId, status, sessionToken) => ipcRenderer.invoke('zyro-web-orders:update-contact-message', messageId, status, sessionToken),
  inquirySettings: (notifyEmail, sessionToken) => ipcRenderer.invoke('zyro-web-orders:inquiry-settings', notifyEmail, sessionToken),
  sendInvoice: (emailData, sessionToken) => ipcRenderer.invoke('zyro-web-orders:send-invoice', emailData, sessionToken),
  listBusinessCustomers: (sessionToken) => ipcRenderer.invoke('zyro-web-orders:list-business-customers', sessionToken),
  listCustomerAccounts: (sessionToken) => ipcRenderer.invoke('zyro-web-orders:list-customer-accounts', sessionToken),
  deleteCustomerAccount: (email, confirmEmail, sessionToken) => ipcRenderer.invoke('zyro-web-orders:delete-customer-account', email, confirmEmail, sessionToken),
  updateBusinessCustomer: (customer, sessionToken) => ipcRenderer.invoke('zyro-web-orders:update-business-customer', customer, sessionToken),
})

contextBridge.exposeInMainWorld('zyroMde', {
  receiveStock: (receipt, sessionToken) => ipcRenderer.invoke('zyro-mde:receive-stock', receipt, sessionToken),
  receivePurchaseOrder: (receipt, sessionToken) => ipcRenderer.invoke('zyro-mde:receive-purchase-order', receipt, sessionToken),
  acceptOrder: (orderId, sessionToken) => ipcRenderer.invoke('zyro-mde:accept-order', orderId, sessionToken),
  scanProduct: (orderId, barcode, sessionToken) => ipcRenderer.invoke('zyro-mde:scan-product', orderId, barcode, sessionToken),
  packOrder: (packing, sessionToken) => ipcRenderer.invoke('zyro-mde:pack-order', packing, sessionToken),
  updateShipment: (shipment, sessionToken) => ipcRenderer.invoke('zyro-mde:update-shipment', shipment, sessionToken),
  confirmDelivery: (orderId, sessionToken) => ipcRenderer.invoke('zyro-mde:confirm-delivery', orderId, sessionToken),
  requestReview: (orderId, sessionToken) => ipcRenderer.invoke('zyro-mde:request-review', orderId, sessionToken),
  listProductReviews: (sessionToken) => ipcRenderer.invoke('zyro-mde:list-product-reviews', sessionToken),
  moderateProductReview: (reviewId, decision, sessionToken) => ipcRenderer.invoke('zyro-mde:moderate-product-review', reviewId, decision, sessionToken),
  notifyPacked: (orderId, sessionToken) => ipcRenderer.invoke('zyro-mde:notify-packed', orderId, sessionToken),
  notifyShipment: (orderId, sessionToken) => ipcRenderer.invoke('zyro-mde:notify-shipment', orderId, sessionToken),
})