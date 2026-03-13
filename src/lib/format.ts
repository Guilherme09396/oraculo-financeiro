export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

export function formatDate(date: string): string {
  // Append T12:00:00 to avoid timezone offset shifting the date by one day
  const d = date.includes('T') ? date : date + 'T12:00:00';
  return new Intl.DateTimeFormat('pt-BR').format(new Date(d));
}

export function formatShortDate(date: string): string {
  const d = date.includes('T') ? date : date + 'T12:00:00';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(new Date(d));
}
