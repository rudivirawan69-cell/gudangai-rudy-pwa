export function formatSpreadsheetTimestamp(timestamp) {
  if (!timestamp) return 'Belum ada data dari spreadsheet';

  const value = String(timestamp).trim();
  const match = value.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  const dateValue = match
    ? `${match[1]}T${match[2].padStart(2, '0')}:${match[3]}:${match[4] || '00'}+07:00`
    : value;
  const date = /^\d+$/.test(value) ? new Date(Number(value)) : new Date(dateValue);
  if (Number.isNaN(date.getTime())) return value;

  return `${new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: 'Asia/Jakarta',
  }).format(date)} WIB`;
}
