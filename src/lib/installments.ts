/**
 * Cálculo de datas de parcelas em cartão de crédito.
 *
 * Regra: a primeira parcela cai na PRÓXIMA fatura cujo fechamento
 * é >= data da compra. Em outras palavras:
 *   - Se purchaseDay <= closingDay  → fatura fecha neste mês.
 *   - Se purchaseDay >  closingDay  → fatura fecha no mês seguinte.
 *
 * Depois disso, o vencimento da fatura é o próximo `dueDay`:
 *   - Se dueDay > closingDay  → vence no mesmo mês do fechamento.
 *   - Se dueDay <= closingDay → vence no mês seguinte ao fechamento.
 *
 * As parcelas seguintes ocorrem nos meses subsequentes na mesma data.
 */
export function calculateInstallmentDates(
  purchaseDateISO: string,
  closingDay: number,
  dueDay: number,
  totalInstallments: number,
): string[] {
  // parse local date (YYYY-MM-DD)
  const [py, pm, pd] = purchaseDateISO.split('-').map(Number);
  const purchase = new Date(py, pm - 1, pd);
  const purchaseDay = purchase.getDate();

  // 1) determinar o mês/ano do fechamento que captura essa compra
  let closingYear = purchase.getFullYear();
  let closingMonth = purchase.getMonth(); // 0-based
  if (purchaseDay > closingDay) {
    // já passou do fechamento → vai para o próximo fechamento
    closingMonth += 1;
    if (closingMonth > 11) { closingMonth = 0; closingYear += 1; }
  }

  // 2) determinar o mês/ano do vencimento da PRIMEIRA parcela
  let firstDueYear = closingYear;
  let firstDueMonth = closingMonth;
  if (dueDay <= closingDay) {
    // vencimento é depois do fechamento, mas como o "dia" é menor,
    // significa que cai no mês seguinte ao fechamento
    firstDueMonth += 1;
    if (firstDueMonth > 11) { firstDueMonth = 0; firstDueYear += 1; }
  }

  // 3) gerar as N datas de vencimento
  const dates: string[] = [];
  for (let i = 0; i < totalInstallments; i++) {
    let m = firstDueMonth + i;
    let y = firstDueYear;
    while (m > 11) { m -= 12; y += 1; }
    // ajustar dueDay para meses curtos (ex: dia 31 em fevereiro)
    const lastDayOfMonth = new Date(y, m + 1, 0).getDate();
    const day = Math.min(dueDay, lastDayOfMonth);
    const iso = `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    dates.push(iso);
  }
  return dates;
}

/**
 * Distribui um valor total em N parcelas, ajustando a última
 * para compensar arredondamentos de centavos.
 */
export function splitInstallmentAmount(total: number, n: number): number[] {
  const cents = Math.round(total * 100);
  const base = Math.floor(cents / n);
  const remainder = cents - base * n;
  const arr: number[] = [];
  for (let i = 0; i < n; i++) {
    const c = base + (i === n - 1 ? remainder : 0);
    arr.push(c / 100);
  }
  return arr;
}
