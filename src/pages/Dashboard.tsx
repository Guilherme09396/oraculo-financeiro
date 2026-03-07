import { useMemo } from 'react';
import { useTransactions } from '@/hooks/useTransactions';
import { useCategories } from '@/hooks/useCategories';
import { formatCurrency } from '@/lib/format';
import { Card } from '@/components/ui/card';
import {
  TrendingUp, TrendingDown, Wallet, ArrowUpRight, ArrowDownRight,
  PiggyBank, Activity, AlertTriangle
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';

const CHART_COLORS = [
  'hsl(142, 60%, 45%)', 'hsl(199, 89%, 48%)', 'hsl(38, 92%, 55%)',
  'hsl(280, 65%, 60%)', 'hsl(0, 72%, 55%)', 'hsl(170, 60%, 45%)',
];

function StatCard({ label, value, icon: Icon, trend, color }: {
  label: string; value: string; icon: any; trend?: string; color: string;
}) {
  return (
    <Card className="p-5 bg-card border-border hover:border-primary/30 transition-colors animate-fade-in">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
          {trend && <p className="text-xs text-muted-foreground mt-1">{trend}</p>}
        </div>
        <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center">
          <Icon className="w-5 h-5 text-muted-foreground" />
        </div>
      </div>
    </Card>
  );
}

function HealthScore({ score }: { score: number }) {
  const getColor = (s: number) => {
    if (s >= 80) return 'text-income';
    if (s >= 60) return 'text-warning';
    return 'text-expense';
  };
  const getLabel = (s: number) => {
    if (s >= 80) return 'Excelente';
    if (s >= 60) return 'Boa';
    if (s >= 40) return 'Regular';
    return 'Atenção';
  };

  return (
    <Card className="p-6 bg-card border-border animate-fade-in">
      <h3 className="text-sm font-medium text-muted-foreground mb-4">Saúde Financeira</h3>
      <div className="flex items-center gap-6">
        <div className="relative w-24 h-24">
          <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="42" fill="none" stroke="hsl(var(--secondary))" strokeWidth="8" />
            <circle
              cx="50" cy="50" r="42" fill="none"
              stroke="currentColor"
              strokeWidth="8"
              strokeDasharray={`${score * 2.64} 264`}
              strokeLinecap="round"
              className={getColor(score)}
            />
          </svg>
          <span className={`absolute inset-0 flex items-center justify-center text-2xl font-bold ${getColor(score)}`}>
            {score}
          </span>
        </div>
        <div>
          <p className={`text-lg font-semibold ${getColor(score)}`}>{getLabel(score)}</p>
          <p className="text-sm text-muted-foreground mt-1">
            Score baseado nos seus hábitos financeiros do mês atual
          </p>
        </div>
      </div>
    </Card>
  );
}

export default function Dashboard() {
  const { data: transactions = [] } = useTransactions();
  const { data: categories = [] } = useCategories();

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];

  const stats = useMemo(() => {
    const monthly = transactions.filter((t: any) => t.date >= startOfMonth);
    const income = monthly.filter((t: any) => t.type === 'income').reduce((s: number, t: any) => s + Number(t.amount), 0);
    const expenses = monthly.filter((t: any) => t.type === 'expense').reduce((s: number, t: any) => s + Number(t.amount), 0);
    const balance = income - expenses;
    const savings = income > 0 ? ((income - expenses) / income * 100) : 0;
    const score = Math.max(0, Math.min(100, Math.round(50 + savings / 2)));

    return { income, expenses, balance, savings, score };
  }, [transactions, startOfMonth]);

  const expenseByCategory = useMemo(() => {
    const monthly = transactions.filter((t: any) => t.date >= startOfMonth && t.type === 'expense');
    const map = new Map<string, number>();
    monthly.forEach((t: any) => {
      const name = (t as any).categories?.name || 'Sem categoria';
      map.set(name, (map.get(name) || 0) + Number(t.amount));
    });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [transactions, startOfMonth]);

  const dailyData = useMemo(() => {
    const monthly = transactions.filter((t: any) => t.date >= startOfMonth);
    const map = new Map<string, { income: number; expense: number }>();
    monthly.forEach((t: any) => {
      const day = t.date.slice(8, 10);
      const prev = map.get(day) || { income: 0, expense: 0 };
      if (t.type === 'income') prev.income += Number(t.amount);
      else prev.expense += Number(t.amount);
      map.set(day, prev);
    });
    return Array.from(map.entries()).map(([day, v]) => ({ day, ...v })).sort((a, b) => a.day.localeCompare(b.day));
  }, [transactions, startOfMonth]);

  const alerts = useMemo(() => {
    const list: string[] = [];
    if (stats.expenses > stats.income && stats.income > 0) {
      list.push('⚠️ Seus gastos estão maiores que sua renda este mês!');
    }
    if (stats.savings < 10 && stats.income > 0) {
      list.push('💡 Você está economizando menos de 10% da renda.');
    }
    if (expenseByCategory.length > 0) {
      list.push(`📊 Maior gasto: ${expenseByCategory[0].name} (${formatCurrency(expenseByCategory[0].value)})`);
    }
    return list;
  }, [stats, expenseByCategory]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground">Visão geral das suas finanças</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Receitas" value={formatCurrency(stats.income)} icon={TrendingUp} color="text-income" />
        <StatCard label="Despesas" value={formatCurrency(stats.expenses)} icon={TrendingDown} color="text-expense" />
        <StatCard label="Saldo" value={formatCurrency(stats.balance)} icon={Wallet} color={stats.balance >= 0 ? 'text-income' : 'text-expense'} />
        <StatCard label="Economia" value={`${stats.savings.toFixed(0)}%`} icon={PiggyBank} color="text-foreground" trend={stats.savings > 20 ? '✨ Ótimo!' : 'Pode melhorar'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Health Score */}
        <HealthScore score={stats.score} />

        {/* Alerts */}
        <Card className="p-6 bg-card border-border lg:col-span-2 animate-fade-in">
          <h3 className="text-sm font-medium text-muted-foreground mb-4 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> Alertas & Insights
          </h3>
          {alerts.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhum alerta no momento. Continue assim! 🎉</p>
          ) : (
            <ul className="space-y-3">
              {alerts.map((a, i) => (
                <li key={i} className="text-sm text-foreground bg-secondary rounded-lg px-4 py-3">{a}</li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6 bg-card border-border animate-fade-in">
          <h3 className="text-sm font-medium text-muted-foreground mb-4">Receitas vs Despesas</h3>
          {dailyData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={dailyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <Tooltip
                  contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', color: 'hsl(var(--foreground))' }}
                />
                <Area type="monotone" dataKey="income" stroke="hsl(142, 60%, 45%)" fill="hsl(142, 60%, 45%)" fillOpacity={0.15} name="Receita" />
                <Area type="monotone" dataKey="expense" stroke="hsl(0, 72%, 55%)" fill="hsl(0, 72%, 55%)" fillOpacity={0.15} name="Despesa" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[250px] text-muted-foreground text-sm">
              Adicione transações para ver o gráfico
            </div>
          )}
        </Card>

        <Card className="p-6 bg-card border-border animate-fade-in">
          <h3 className="text-sm font-medium text-muted-foreground mb-4">Despesas por Categoria</h3>
          {expenseByCategory.length > 0 ? (
            <div className="flex items-center gap-6">
              <ResponsiveContainer width="50%" height={200}>
                <PieChart>
                  <Pie data={expenseByCategory} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2}>
                    {expenseByCategory.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 flex-1">
                {expenseByCategory.slice(0, 5).map((cat, i) => (
                  <div key={cat.name} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                      <span className="text-foreground">{cat.name}</span>
                    </div>
                    <span className="text-muted-foreground font-mono">{formatCurrency(cat.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">
              Sem despesas neste período
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
