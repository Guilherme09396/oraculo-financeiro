import { useState, useMemo, useCallback } from 'react';
import { useTransactions } from '@/hooks/useTransactions';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { formatCurrency } from '@/lib/format';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import MonthSelector from '@/components/MonthSelector';
import { Download } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend,
} from 'recharts';

const COLORS = [
  'hsl(142, 60%, 45%)', 'hsl(199, 89%, 48%)', 'hsl(38, 92%, 55%)',
  'hsl(280, 65%, 60%)', 'hsl(0, 72%, 55%)', 'hsl(170, 60%, 45%)',
  'hsl(320, 70%, 55%)', 'hsl(60, 70%, 45%)',
];

const tooltipStyle = {
  contentStyle: { background: 'hsl(220, 18%, 10%)', border: '1px solid hsl(220, 14%, 16%)', borderRadius: '8px', color: 'hsl(210, 20%, 95%)' },
};

function downloadCSV(data: any[], filename: string) {
  if (data.length === 0) return;
  const headers = Object.keys(data[0]);
  const csv = [headers.join(','), ...data.map(row => headers.map(h => `"${row[h] ?? ''}"`).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Reports() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());
  const { user } = useAuth();
  const { data: transactions = [] } = useTransactions();

  const { data: futureItems = [] } = useQuery({
    queryKey: ['future_transactions'],
    queryFn: async () => {
      const { data, error } = await supabase.from('future_transactions')
        .select('*, categories(name, icon, color)');
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const startOfMonth = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const endOfMonth = `${year}-${String(month + 1).padStart(2, '0')}-${new Date(year, month + 1, 0).getDate()}`;

  const allMonthly = useMemo(() => {
    // Excluir compras feitas no crédito (saldo só é impactado no pagamento da fatura)
    // Pagamentos de fatura permanecem como despesa real
    const monthly = transactions.filter((t: any) => {
      if (!(t.date >= startOfMonth && t.date <= endOfMonth)) return false;
      if (t.type === 'expense' && t.payment_method === 'credit_card') return false;
      return true;
    });
    const paidFuture = futureItems.filter((f: any) => {
      const paidAt = (f as any).paid_at;
      return f.status === 'paid' && paidAt && paidAt >= startOfMonth && paidAt <= endOfMonth;
    }).map((f: any) => ({ ...f, date: (f as any).paid_at, categories: (f as any).categories }));
    return [...monthly, ...paidFuture];
  }, [transactions, futureItems, startOfMonth, endOfMonth]);

  const monthlyIncome = allMonthly.filter((t: any) => t.type === 'income').reduce((s: number, t: any) => s + Number(t.amount), 0);
  const monthlyExpense = allMonthly.filter((t: any) => t.type === 'expense').reduce((s: number, t: any) => s + Number(t.amount), 0);

  const categoryData = useMemo(() => {
    const map = new Map<string, number>();
    allMonthly.filter((t: any) => t.type === 'expense').forEach((t: any) => {
      const name = (t as any).categories?.name || 'Sem categoria';
      map.set(name, (map.get(name) || 0) + Number(t.amount));
    });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [allMonthly]);

  const incCategoryData = useMemo(() => {
    const map = new Map<string, number>();
    allMonthly.filter((t: any) => t.type === 'income').forEach((t: any) => {
      const name = (t as any).categories?.name || 'Sem categoria';
      map.set(name, (map.get(name) || 0) + Number(t.amount));
    });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [allMonthly]);

  const monthlyEvolution = useMemo(() => {
    const months: { month: string; income: number; expense: number; balance: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(year, month - i, 1);
      const ms = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const me = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()}`;
      const mi = transactions.filter((t: any) => t.date >= `${ms}-01` && t.date <= me);
      const pf = futureItems.filter((f: any) => {
        const pa = (f as any).paid_at;
        return f.status === 'paid' && pa && pa >= `${ms}-01` && pa <= me;
      });
      const all = [...mi, ...pf];
      const inc = all.filter((t: any) => t.type === 'income').reduce((s: number, t: any) => s + Number(t.amount), 0);
      const exp = all.filter((t: any) => t.type === 'expense').reduce((s: number, t: any) => s + Number(t.amount), 0);
      months.push({ month: `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`, income: inc, expense: exp, balance: inc - exp });
    }
    return months;
  }, [transactions, futureItems, month, year]);

  const balanceData = useMemo(() => {
    let balance = 0;
    const sorted = [...allMonthly].sort((a: any, b: any) => (a.date || '').localeCompare(b.date || ''));
    const map = new Map<string, number>();
    sorted.forEach((t: any) => {
      balance += t.type === 'income' ? Number(t.amount) : -Number(t.amount);
      map.set(t.date, balance);
    });
    return Array.from(map.entries()).map(([date, saldo]) => ({ date: date?.slice(5) || '', saldo }));
  }, [allMonthly]);

  const topExpenses = useMemo(() => {
    return allMonthly
      .filter((t: any) => t.type === 'expense')
      .sort((a: any, b: any) => Number(b.amount) - Number(a.amount))
      .slice(0, 10);
  }, [allMonthly]);

  const exportCSV = useCallback(() => {
    const data = allMonthly.map((t: any) => ({
      Data: t.date,
      Descrição: t.description,
      Tipo: t.type === 'income' ? 'Receita' : 'Despesa',
      Valor: Number(t.amount).toFixed(2),
      Categoria: (t as any).categories?.name || 'Sem categoria',
    }));
    downloadCSV(data, `relatorio-${year}-${String(month + 1).padStart(2, '0')}.csv`);
  }, [allMonthly, year, month]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Relatórios</h1>
          <p className="text-sm text-muted-foreground">Análise financeira detalhada</p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <MonthSelector month={month} year={year} onChange={(m, y) => { setMonth(m); setYear(y); }} />
          <Button variant="outline" onClick={exportCSV} className="gap-2"><Download className="w-4 h-4" /> <span className="hidden sm:inline">Exportar</span> CSV</Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <Card className="p-4 sm:p-5 bg-card border-border">
          <p className="text-xs sm:text-sm text-muted-foreground">Receitas</p>
          <p className="text-lg sm:text-2xl font-bold text-income mt-1">{formatCurrency(monthlyIncome)}</p>
        </Card>
        <Card className="p-4 sm:p-5 bg-card border-border">
          <p className="text-xs sm:text-sm text-muted-foreground">Despesas</p>
          <p className="text-lg sm:text-2xl font-bold text-expense mt-1">{formatCurrency(monthlyExpense)}</p>
        </Card>
        <Card className="p-4 sm:p-5 bg-card border-border">
          <p className="text-xs sm:text-sm text-muted-foreground">Resultado</p>
          <p className={`text-lg sm:text-2xl font-bold mt-1 ${monthlyIncome - monthlyExpense >= 0 ? 'text-income' : 'text-expense'}`}>
            {formatCurrency(monthlyIncome - monthlyExpense)}
          </p>
        </Card>
      </div>

      {allMonthly.length === 0 ? (
        <Card className="p-8 sm:p-12 bg-card border-border text-center text-muted-foreground">Sem dados para este período</Card>
      ) : (
        <>
          <Card className="p-5 sm:p-6 bg-card border-border">
            <h3 className="text-sm font-medium text-muted-foreground mb-4">Evolução Mensal (6 meses)</h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={monthlyEvolution}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <Tooltip {...tooltipStyle} />
                <Legend />
                <Bar dataKey="income" fill="hsl(142, 60%, 45%)" radius={[4, 4, 0, 0]} name="Receita" />
                <Bar dataKey="expense" fill="hsl(0, 72%, 55%)" radius={[4, 4, 0, 0]} name="Despesa" />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="p-5 sm:p-6 bg-card border-border">
              <h3 className="text-sm font-medium text-muted-foreground mb-4">Despesas por Categoria</h3>
              {categoryData.length > 0 ? (
                <div>
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={categoryData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={2}>
                        {categoryData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip {...tooltipStyle} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-1.5 mt-2">
                    {categoryData.map((c, i) => (
                      <div key={c.name} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                          <span className="text-foreground truncate">{c.name}</span>
                        </div>
                        <span className="text-muted-foreground font-mono text-xs shrink-0">{formatCurrency(c.value)} ({monthlyExpense > 0 ? (c.value / monthlyExpense * 100).toFixed(0) : 0}%)</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : <div className="text-center py-8 text-muted-foreground text-sm">Sem despesas</div>}
            </Card>

            <Card className="p-5 sm:p-6 bg-card border-border">
              <h3 className="text-sm font-medium text-muted-foreground mb-4">Receitas por Categoria</h3>
              {incCategoryData.length > 0 ? (
                <div>
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={incCategoryData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={2}>
                        {incCategoryData.map((_, i) => <Cell key={i} fill={COLORS[(i + 3) % COLORS.length]} />)}
                      </Pie>
                      <Tooltip {...tooltipStyle} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-1.5 mt-2">
                    {incCategoryData.map((c, i) => (
                      <div key={c.name} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: COLORS[(i + 3) % COLORS.length] }} />
                          <span className="text-foreground truncate">{c.name}</span>
                        </div>
                        <span className="text-muted-foreground font-mono text-xs shrink-0">{formatCurrency(c.value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : <div className="text-center py-8 text-muted-foreground text-sm">Sem receitas</div>}
            </Card>
          </div>

          <Card className="p-5 sm:p-6 bg-card border-border">
            <h3 className="text-sm font-medium text-muted-foreground mb-4">Evolução do Saldo no Mês</h3>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={balanceData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <Tooltip {...tooltipStyle} />
                <Line type="monotone" dataKey="saldo" stroke="hsl(142, 60%, 45%)" strokeWidth={2} dot={false} name="Saldo" />
              </LineChart>
            </ResponsiveContainer>
          </Card>

          <Card className="p-5 sm:p-6 bg-card border-border">
            <h3 className="text-sm font-medium text-muted-foreground mb-4">Maiores Despesas do Mês</h3>
            <div className="space-y-2">
              {topExpenses.map((t: any, i: number) => (
                <div key={t.id || i} className="flex items-center justify-between text-sm py-2 border-b border-border last:border-0 gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-muted-foreground font-mono w-6 shrink-0">{i + 1}.</span>
                    <div className="min-w-0">
                      <span className="text-foreground truncate block">{t.description}</span>
                      <span className="text-xs text-muted-foreground">{(t as any).categories?.name || ''}</span>
                    </div>
                  </div>
                  <span className="font-mono text-expense font-semibold shrink-0">{formatCurrency(Number(t.amount))}</span>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
