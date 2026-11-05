const amountParts = (grossCents, vatRate) => {
  const netCents = vatRate ? Math.round(grossCents * 100 / (100 + vatRate)) : grossCents
  return { netCents, vatCents: grossCents - netCents }
}

const isInMonth = (date, month) => typeof date === 'string' && date.startsWith(`${month}-`)

export const calculateFinanceReport = (entries, month) => {
  const validEntries = (Array.isArray(entries) ? entries : []).filter((entry) => (
    entry && Number.isSafeInteger(entry.grossCents) && entry.grossCents > 0
    && [0, 7, 19].includes(Number(entry.vatRate))
  ))
  const paidEntries = validEntries.filter((entry) => isInMonth(entry.paidAt, month))
  const paidIncome = paidEntries.filter((entry) => entry.type === 'income')
  const paidExpenses = paidEntries.filter((entry) => entry.type === 'expense')
  const invoicedExpenses = validEntries.filter((entry) => (
    entry.type === 'expense' && entry.receiptAvailable === true && isInMonth(entry.date, month)
  ))
  const netTotal = (records) => records.reduce((sum, entry) => sum + amountParts(entry.grossCents, Number(entry.vatRate)).netCents, 0)
  const vatTotal = (records) => records.reduce((sum, entry) => sum + amountParts(entry.grossCents, Number(entry.vatRate)).vatCents, 0)
  const vatSales = [0, 7, 19].map((vatRate) => {
    const records = paidIncome.filter((entry) => Number(entry.vatRate) === vatRate)
    return { vatRate, grossCents: records.reduce((sum, entry) => sum + entry.grossCents, 0), vatCents: vatTotal(records) }
  })
  const categories = [...new Set(paidEntries.map((entry) => entry.category))].sort().map((category) => {
    const records = paidEntries.filter((entry) => entry.category === category)
    const type = records[0]?.type
    return { category, type, netCents: netTotal(records), grossCents: records.reduce((sum, entry) => sum + entry.grossCents, 0) }
  })
  const incomeNetCents = netTotal(paidIncome)
  const expenseNetCents = netTotal(paidExpenses)
  const outputVatCents = vatTotal(paidIncome)
  const inputVatCents = vatTotal(invoicedExpenses)

  return {
    month,
    paidEntries,
    incomeNetCents,
    expenseNetCents,
    operatingResultCents: incomeNetCents - expenseNetCents,
    outputVatCents,
    inputVatCents,
    vatDueCents: outputVatCents - inputVatCents,
    vatSales,
    categories,
  }
}

export const calculateVatSubmissionPreview = (entries, month, filingPeriod = 'monthly') => {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month)
  if (!match) throw new Error('Ungültiger Auswertungsmonat.')
  if (!['monthly', 'quarterly'].includes(filingPeriod)) throw new Error('Ungültiger UStVA-Zeitraum.')

  const year = Number(match[1])
  const selectedMonth = Number(match[2])
  const firstMonth = filingPeriod === 'quarterly' ? Math.floor((selectedMonth - 1) / 3) * 3 + 1 : selectedMonth
  const monthCount = filingPeriod === 'quarterly' ? 3 : 1
  const months = Array.from({ length: monthCount }, (_, index) => (
    `${year}-${String(firstMonth + index).padStart(2, '0')}`
  ))
  const reports = months.map((periodMonth) => calculateFinanceReport(entries, periodMonth))
  const sum = (selector) => reports.reduce((total, report) => total + selector(report), 0)
  const vatSales = [0, 7, 19].map((vatRate) => {
    const sales = reports.flatMap((report) => report.vatSales).filter((item) => item.vatRate === vatRate)
    const grossCents = sales.reduce((total, item) => total + item.grossCents, 0)
    const vatCents = sales.reduce((total, item) => total + item.vatCents, 0)
    return { vatRate, netCents: grossCents - vatCents, vatCents }
  })

  return {
    filingPeriod,
    startMonth: months[0],
    endMonth: months[months.length - 1],
    vatSales,
    outputVatCents: sum((report) => report.outputVatCents),
    inputVatCents: sum((report) => report.inputVatCents),
    vatDueCents: sum((report) => report.vatDueCents),
  }
}
