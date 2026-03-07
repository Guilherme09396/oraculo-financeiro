import { useMemo } from 'react';
import { useTransactions } from '@/hooks/useTransactions';
import { formatCurrency } from '@/lib/format';
import { Card } from '@/components/ui/card';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line,
} from 'recharts';

const COLORS = [
  'hsl(142, 60%, 45%)', 'hsl(199, 89%, 48%)', 'hsl(38, 92%, 55%)',
  'hsl(280, 65%, 60%)', 'hsl(0, 72%, 55%)', 'hsl(170, 60%, 45%)',
];

export default function Reports() {
  const { data: transactions = [] } = useTransactions();

  const monthlyData = useMemo(() => {
    const map = new Map<string, { month: string; income: number; expense: number }>();
    transactions.forEach((t: any) => {
      const month = t.date.slice(0, 7);
      const prev = map.get(month) || { month, income: 0, expense: 0 };
      if (t.type === 'income') prev.income += Number(t.amount);
      else prev.expense += Number(t.amount);
      map.set(month, prev);
    });
    return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month));
  }, [transactions]);

  const categoryData = useMemo(() => {
    const map = new Map<string, number>();
    transactions.filter((t: any) => t.type === 'expense').forEach((t: any) => {
      const name = (t as any).categories?.name || 'Sem categoria';
      map.set(name, (map.get(name) || 0) + Number(t.amount));
    });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [transactions]);

  const balanceData = useMemo(() => {
    let balance = 0;
    const sorted = [...transactions].sort((a: any, b: any) => a.date.localeCompare(b.date));
    const map = new Map<string, number>();
    sorted.forEach((t: any) => {
      balance += t.type === 'income' ? Number(t.amount) : -Number(t.amount);
      map.set(t.date, balance);
    });
    return Array.from(map.entries()).map(([date, saldo]) => ({ date: date.slice(5), saldo }));
  }, [transactions]);

  const tooltipStyle = {
    contentStyle: { background: 'hsl(220, 18%, 10%)', border: '1px solid hsl(220, 14%, 16%)', borderRadius: '8px', color: 'hsl(210, 20%, 95%)' }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Relatórios</h1>
        <p className="text-muted-foreground">Análise financeira detalhada</p>
      </div>

      {transactions.length === 0 ? (
        <Card className="p-12 bg-card border-border text-center text-muted-foreground">
          Adicione transações para ver relatórios
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="p-6 bg-card border-border">
            <h3 className="text-sm font-medium text-muted-foreground mb-4">Receitas vs Despesas por Mês</h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <Tooltip {...tooltipStyle} />
                <Bar dataKey="income" fill="hsl(142, 60%, 45%)" radius={[4, 4, 0, 0]} name="Receita" />
                <Bar dataKey="expense" fill="hsl(0, 72%, 55%)" radius={[4, 4, 0, 0]} name="Despesa" />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card className="p-6 bg-card border-border">
            <h3 className="text-sm font-medium text-muted-foreground mb-4">Gastos por Categoria</h3>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={categoryData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={2}>
                  {categoryData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip {...tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          </Card>

          <Card className="p-6 bg-card border-border lg:col-span-2">
            <h3 className="text-sm font-medium text-muted-foreground mb-4">Evolução do Saldo</h3>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={balanceData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <Tooltip {...tooltipStyle} />
                <Line type="monotone" dataKey="saldo" stroke="hsl(142, 60%, 45%)" strokeWidth={2} dot={false} name="Saldo" />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        </div>
      )}
    </div>
  );
}
