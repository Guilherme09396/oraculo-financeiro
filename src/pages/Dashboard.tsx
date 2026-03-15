import { useState, useMemo } from 'react';
import { useTransactions } from '@/hooks/useTransactions';
import { useProfile } from '@/hooks/useProfile';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { formatCurrency } from '@/lib/format';
import { Card } from '@/components/ui/card';
import MonthSelector from '@/components/MonthSelector';
import {
  TrendingUp, TrendingDown, Wallet, ArrowUpRight, ArrowDownRight,
  PiggyBank, Activity, AlertTriangle, Clock, Target, DollarSign, CreditCard,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';

const CHART_COLORS = [
  'hsl(142, 60%, 45%)', 'hsl(199, 89%, 48%)', 'hsl(38, 92%, 55%)',
  'hsl(280, 65%, 60%)', 'hsl(0, 72%, 55%)', 'hsl(170, 60%, 45%)',
  'hsl(320, 70%, 55%)', 'hsl(60, 70%, 45%)',
];

function StatCard({ label, value, icon: Icon, trend, color }: {
  label: string; value: string; icon: any; trend?: string; color: string;
}) {
  return (
    <Card className="p-4 sm:p-5 bg-card border-border hover:border-primary/30 transition-colors animate-fade-in">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-xs sm:text-sm text-muted-foreground truncate">{label}</p>
          <p className={`text-lg sm:text-2xl font-bold mt-1 ${color}`}>{value}</p>
          {trend && <p className="text-xs text-muted-foreground mt-1">{trend}</p>}
        </div>
        <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-secondary flex items-center justify-center shrink-0">
          <Icon className="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground" />
        </div>
      </div>
    </Card>
  );
}

function HealthScore({ score }: { score: number }) {
  const getColor = (s: number) => s >= 80 ? 'text-income' : s >= 60 ? 'text-warning' : 'text-expense';
  const getLabel = (s: number) => s >= 80 ? 'Excelente' : s >= 60 ? 'Boa' : s >= 40 ? 'Regular' : 'Atenção';

  return (
    <Card className="p-5 sm:p-6 bg-card border-border animate-fade-in">
      <h3 className="text-sm font-medium text-muted-foreground mb-4">Saúde Financeira</h3>
      <div className="flex items-center gap-4 sm:gap-6">
        <div className="relative w-20 h-20 sm:w-24 sm:h-24 shrink-0">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="42" fill="none" stroke="hsl(var(--secondary))" strokeWidth="8" />
            <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" strokeWidth="8"
              strokeDasharray={`${score * 2.64} 264`} strokeLinecap="round" className={getColor(score)} />
          </svg>
          <span className={`absolute inset-0 flex items-center justify-center text-xl sm:text-2xl font-bold ${getColor(score)}`}>{score}</span>
        </div>
        <div>
          <p className={`text-base sm:text-lg font-semibold ${getColor(score)}`}>{getLabel(score)}</p>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">Baseado nos seus hábitos financeiros do mês</p>
        </div>
      </div>
    </Card>
  );
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

export default function Dashboard() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const { data: transactions = [] } = useTransactions();

  const { data: futureItems = [] } = useQuery({
    queryKey: ['future_transactions'],
    queryFn: async () => {
      const { data, error } = await supabase.from('future_transactions')
        .select('*, categories(name, icon, color)').order('due_date');
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: goals = [] } = useQuery({
    queryKey: ['goals'],
    queryFn: async () => {
      const { data, error } = await supabase.from('goals').select('*');
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: cards = [] } = useQuery({
    queryKey: ['credit_cards'],
    queryFn: async () => {
      const { data, error } = await supabase.from('credit_cards').select('*');
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const startOfMonth = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const endOfMonth = `${year}-${String(month + 1).padStart(2, '0')}-${new Date(year, month + 1, 0).getDate()}`;

  const prevMonth = month === 0 ? 11 : month - 1;
  const prevYear = month === 0 ? year - 1 : year;
  const startOfPrevMonth = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-01`;
  const endOfPrevMonth = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-${new Date(prevYear, prevMonth + 1, 0).getDate()}`;

  // Saldo acumulado: inclui pagamentos de fatura pois são saídas reais de dinheiro
  const cumulativeBalance = useMemo(() => {
    const allIncome = transactions
      .filter((t: any) => t.type === 'income')
      .reduce((s: number, t: any) => s + Number(t.amount), 0);
    const allExpense = transactions
      .filter((t: any) => t.type === 'expense' && t.payment_method !== 'credit_card')
      .reduce((s: number, t: any) => s + Number(t.amount), 0);
    const paidFutureIncome = futureItems
      .filter((f: any) => f.status === 'paid' && f.type === 'income')
      .reduce((s: number, f: any) => s + Number(f.amount), 0);
    const paidFutureExpense = futureItems
      .filter((f: any) => f.status === 'paid' && f.type === 'expense')
      .reduce((s: number, f: any) => s + Number(f.amount), 0);
    return (allIncome + paidFutureIncome) - (allExpense + paidFutureExpense);
  }, [transactions, futureItems]);

  const stats = useMemo(() => {
    const monthly = transactions.filter((t: any) => t.date >= startOfMonth && t.date <= endOfMonth);
    const income = monthly
      .filter((t: any) => t.type === 'income')
      .reduce((s: number, t: any) => s + Number(t.amount), 0);

    // Despesas do mês: exclui gastos no crédito (ainda não saíram do bolso),
    // mas INCLUI pagamentos de fatura (que são saídas reais de dinheiro)
    const expenses = monthly
      .filter((t: any) => t.type === 'expense' && t.payment_method !== 'credit_card')
      .reduce((s: number, t: any) => s + Number(t.amount), 0);

    const paidFuture = futureItems.filter((f: any) => {
      const paidAt = (f as any).paid_at;
      return f.status === 'paid' && paidAt && paidAt >= startOfMonth && paidAt <= endOfMonth;
    });
    const futureExpPaid = paidFuture
      .filter((f: any) => f.type === 'expense')
      .reduce((s: number, f: any) => s + Number(f.amount), 0);
    const futureIncPaid = paidFuture
      .filter((f: any) => f.type === 'income')
      .reduce((s: number, f: any) => s + Number(f.amount), 0);

    const totalIncome = income + futureIncPaid;
    const totalExpenses = expenses + futureExpPaid;
    const balance = totalIncome - totalExpenses;
    const savings = totalIncome > 0 ? ((totalIncome - totalExpenses) / totalIncome * 100) : 0;

    const pendingFuture = futureItems.filter((f: any) => f.status === 'pending');
    const toReceive = pendingFuture
      .filter((f: any) => f.type === 'income' && f.due_date >= startOfMonth && f.due_date <= endOfMonth)
      .reduce((s: number, f: any) => s + Number(f.amount), 0);
    const toPay = pendingFuture
      .filter((f: any) => f.type === 'expense' && f.due_date >= startOfMonth && f.due_date <= endOfMonth)
      .reduce((s: number, f: any) => s + Number(f.amount), 0);

    const cardSpending = monthly
      .filter((t: any) => t.type === 'expense' && t.payment_method === 'credit_card')
      .reduce((s: number, t: any) => s + Number(t.amount), 0);

    const goalsProgress = goals.length > 0
      ? goals.reduce((s: number, g: any) => s + Math.min(1, Number(g.current_amount) / Number(g.target_amount)), 0) / goals.length * 20
      : 10;
    const savingsScore = Math.min(30, Math.max(0, savings * 0.6));
    const expenseRatio = totalIncome > 0 ? Math.min(30, Math.max(0, (1 - totalExpenses / totalIncome) * 60)) : 15;
    const overdueCount = pendingFuture.filter((f: any) => f.due_date < new Date().toISOString().split('T')[0]).length;
    const overdueScore = Math.max(0, 20 - overdueCount * 5);
    const score = Math.round(Math.min(100, savingsScore + expenseRatio + goalsProgress + overdueScore));

    return { income: totalIncome, expenses: totalExpenses, balance, savings, score, toReceive, toPay, transactionCount: monthly.length, cardSpending };
  }, [transactions, futureItems, goals, startOfMonth, endOfMonth]);

  // Gráfico de categorias: exclui gastos no crédito E exclui pagamentos de fatura
  // (fatura aparece em gráfico separado)
  const expenseByCategory = useMemo(() => {
    const monthly = transactions.filter((t: any) =>
      t.date >= startOfMonth &&
      t.date <= endOfMonth &&
      t.type === 'expense' &&
      t.payment_method !== 'credit_card' &&
      !(t.description || '').startsWith('Pagamento fatura')
    );
    const map = new Map<string, number>();
    monthly.forEach((t: any) => {
      const name = (t as any).categories?.name || 'Sem categoria';
      map.set(name, (map.get(name) || 0) + Number(t.amount));
    });
    futureItems.filter((f: any) => {
      const paidAt = (f as any).paid_at;
      return f.status === 'paid' && f.type === 'expense' && paidAt && paidAt >= startOfMonth && paidAt <= endOfMonth;
    }).forEach((f: any) => {
      const name = (f as any).categories?.name || 'Sem categoria';
      map.set(name, (map.get(name) || 0) + Number(f.amount));
    });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [transactions, futureItems, startOfMonth, endOfMonth]);

  const invoicePaymentsByCard = useMemo(() => {
    const prevMonthPayments = transactions.filter((t: any) =>
      t.date >= startOfMonth &&
      t.date <= endOfMonth &&
      t.type === 'expense' &&
      (t.description || '').startsWith('Pagamento fatura')
    );

    const map = new Map<string, number>();
    prevMonthPayments.forEach((t: any) => {
      const desc = t.description || '';
      cards.forEach((card: any) => {
        if (desc.includes(card.name)) {
          map.set(card.name, (map.get(card.name) || 0) + Number(t.amount));
        }
      });
    });

    return Array.from(map.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [transactions, cards, startOfMonth, endOfMonth]);

  const dailyData = useMemo(() => {
    const monthly = transactions.filter((t: any) => t.date >= startOfMonth && t.date <= endOfMonth);
    const map = new Map<string, { income: number; expense: number }>();
    monthly.forEach((t: any) => {
      const day = t.date.slice(8, 10);
      const prev = map.get(day) || { income: 0, expense: 0 };
      if (t.type === 'income') {
        prev.income += Number(t.amount);
      } else if (t.payment_method !== 'credit_card') {
        // inclui pagamentos de fatura no gráfico diário pois são despesas reais
        prev.expense += Number(t.amount);
      }
      map.set(day, prev);
    });
    return Array.from(map.entries()).map(([day, v]) => ({ day, ...v })).sort((a, b) => a.day.localeCompare(b.day));
  }, [transactions, startOfMonth, endOfMonth]);

  const alerts = useMemo(() => {
    const list: { text: string; type: 'warning' | 'info' | 'danger' }[] = [];
    const today = new Date().toISOString().split('T')[0];

    const overdue = futureItems.filter((f: any) => f.status === 'pending' && f.due_date < today);
    if (overdue.length > 0) list.push({ text: `⚠️ Você possui ${overdue.length} conta(s) vencida(s) que ainda não foram pagas.`, type: 'danger' });

    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    const upcoming = futureItems.filter((f: any) => f.status === 'pending' && f.due_date >= today && f.due_date <= nextWeek.toISOString().split('T')[0]);
    if (upcoming.length > 0) list.push({ text: `📅 ${upcoming.length} conta(s) vencem nos próximos 7 dias.`, type: 'warning' });

    if (cards.length > 0) {
      const todayDate = new Date();
      cards.forEach((card: any) => {
        const dueDay = card.due_day;
        const diff = dueDay - todayDate.getDate();
        if (diff >= 0 && diff <= 5) {
          list.push({ text: `💳 Cartão ${card.name} vence em ${diff === 0 ? 'HOJE' : `${diff} dia(s)`}!`, type: diff <= 2 ? 'danger' : 'warning' });
        }
      });
    }

    if (stats.cardSpending > 0) {
      list.push({ text: `💳 Gastos no cartão este mês: ${formatCurrency(stats.cardSpending)} (não impactam saldo até o pagamento da fatura)`, type: 'info' });
    }

    if (stats.expenses > stats.income && stats.income > 0) list.push({ text: '🚨 Seus gastos estão maiores que sua renda este mês!', type: 'danger' });
    if (stats.savings < 10 && stats.income > 0) list.push({ text: '💡 Você está economizando menos de 10% da renda.', type: 'warning' });
    if (expenseByCategory.length > 0) {
      const totalCatExpense = expenseByCategory.reduce((s, c) => s + c.value, 0);
      const top = expenseByCategory[0];
      const pct = totalCatExpense > 0 ? (top.value / totalCatExpense * 100).toFixed(0) : 0;
      list.push({ text: `📊 Maior gasto: ${top.name} — ${formatCurrency(top.value)} (${pct}% do total)`, type: 'info' });
    }
    if (goals.length > 0) {
      const achieved = goals.filter((g: any) => Number(g.current_amount) >= Number(g.target_amount)).length;
      if (achieved > 0) list.push({ text: `🎯 Parabéns! Você atingiu ${achieved} meta(s) financeira(s)!`, type: 'info' });
    }
    return list;
  }, [stats, expenseByCategory, futureItems, goals, cards]);

  const tooltipStyle = {
    contentStyle: { background: 'hsl(220, 18%, 10%)', border: '1px solid hsl(220, 14%, 16%)', borderRadius: '8px', color: 'hsl(210, 20%, 95%)' },
  };

  const displayName = profile?.display_name || user?.email?.split('@')[0] || 'Usuário';

  const MONTH_NAMES = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">{getGreeting()}, {displayName}! 👋</h1>
          <p className="text-sm text-muted-foreground">Sua visão financeira completa</p>
        </div>
        <MonthSelector month={month} year={year} onChange={(m, y) => { setMonth(m); setYear(y); }} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard label="Receitas (mês)" value={formatCurrency(stats.income)} icon={TrendingUp} color="text-income" />
        <StatCard label="Despesas (mês)" value={formatCurrency(stats.expenses)} icon={TrendingDown} color="text-expense" />
        <StatCard label="Saldo do Mês" value={formatCurrency(stats.balance)} icon={Wallet} color={stats.balance >= 0 ? 'text-income' : 'text-expense'} />
        <StatCard label="Saldo Geral" value={formatCurrency(cumulativeBalance)} icon={DollarSign} color={cumulativeBalance >= 0 ? 'text-income' : 'text-expense'} trend="Acumulado total" />
        <StatCard label="A Receber" value={formatCurrency(stats.toReceive)} icon={ArrowUpRight} color="text-income" />
        <StatCard label="A Pagar" value={formatCurrency(stats.toPay)} icon={ArrowDownRight} color="text-expense" />
        <StatCard label="Economia" value={`${stats.savings.toFixed(0)}%`} icon={PiggyBank} color="text-foreground" trend={stats.savings > 20 ? '✨ Ótimo!' : 'Pode melhorar'} />
        {stats.cardSpending > 0 && (
          <StatCard label="Cartão (mês)" value={formatCurrency(stats.cardSpending)} icon={CreditCard} color="text-muted-foreground" trend="Não impacta saldo" />
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <HealthScore score={stats.score} />
        <Card className="p-5 sm:p-6 bg-card border-border lg:col-span-2 animate-fade-in">
          <h3 className="text-sm font-medium text-muted-foreground mb-4 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> Alertas & Insights
          </h3>
          {alerts.length === 0 ? (
            <p className="text-muted-foreground text-sm">Tudo certo! Continue assim! 🎉</p>
          ) : (
            <ul className="space-y-2">
              {alerts.map((a, i) => (
                <li key={i} className={`text-sm rounded-lg px-3 sm:px-4 py-2 sm:py-3 ${
                  a.type === 'danger' ? 'bg-expense/10 text-expense' :
                  a.type === 'warning' ? 'bg-warning/10 text-warning' :
                  'bg-secondary text-foreground'
                }`}>{a.text}</li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-5 sm:p-6 bg-card border-border animate-fade-in">
          <h3 className="text-sm font-medium text-muted-foreground mb-4">Receitas vs Despesas (Diário)</h3>
          {dailyData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={dailyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <Tooltip {...tooltipStyle} />
                <Area type="monotone" dataKey="income" stroke="hsl(142, 60%, 45%)" fill="hsl(142, 60%, 45%)" fillOpacity={0.15} name="Receita" />
                <Area type="monotone" dataKey="expense" stroke="hsl(0, 72%, 55%)" fill="hsl(0, 72%, 55%)" fillOpacity={0.15} name="Despesa" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[250px] text-muted-foreground text-sm">Sem dados neste período</div>
          )}
        </Card>

        <Card className="p-5 sm:p-6 bg-card border-border animate-fade-in">
          <h3 className="text-sm font-medium text-muted-foreground mb-4">Despesas por Categoria</h3>
          <p className="text-xs text-muted-foreground mb-3">Exclui gastos no cartão e pagamentos de fatura</p>
          {expenseByCategory.length > 0 ? (
            <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
              <ResponsiveContainer width="100%" height={200} className="sm:w-1/2">
                <PieChart>
                  <Pie data={expenseByCategory} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2}>
                    {expenseByCategory.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 flex-1 w-full">
                {expenseByCategory.slice(0, 6).map((cat, i) => (
                  <div key={cat.name} className="flex items-center justify-between text-sm gap-4">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                      <span className="text-foreground truncate">{cat.name}</span>
                    </div>
                    <span className="text-muted-foreground font-mono text-xs shrink-0">{formatCurrency(cat.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">Sem despesas neste período</div>
          )}
        </Card>
      </div>

      {invoicePaymentsByCard.length > 0 && (
        <Card className="p-4 sm:p-5 bg-card border-border animate-fade-in">
          <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
            <CreditCard className="w-4 h-4" /> Despesa por Cartão - Fatura {MONTH_NAMES[month]}/{year}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {invoicePaymentsByCard.map((card, i) => {
              const total = invoicePaymentsByCard.reduce((s, c) => s + c.value, 0);
              const pct = total > 0 ? (card.value / total) * 100 : 0;
              return (
                <div key={card.name} className="flex items-center gap-3 p-3 rounded-lg bg-secondary">
                  <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-sm text-foreground truncate">{card.name}</span>
                      <span className="text-xs font-mono text-muted-foreground shrink-0">{formatCurrency(card.value)}</span>
                    </div>
                    <div className="h-1.5 bg-background rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-5 sm:p-6 bg-card border-border animate-fade-in">
          <h3 className="text-sm font-medium text-muted-foreground mb-4">Transações Recentes</h3>
          <div className="space-y-3">
            {transactions.filter((t: any) => t.date >= startOfMonth && t.date <= endOfMonth).slice(0, 8).map((t: any) => (
              <div key={t.id} className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${t.type === 'income' ? 'bg-income/15' : 'bg-expense/15'}`}>
                    {t.type === 'income' ? <TrendingUp className="w-4 h-4 text-income" /> : <TrendingDown className="w-4 h-4 text-expense" />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{t.description}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {(t as any).categories?.name || 'Sem categoria'}
                      {t.payment_method === 'credit_card' && ' · 💳 Cartão'}
                      {(t.description || '').startsWith('Pagamento fatura') && ' · 📄 Fatura'}
                    </p>
                  </div>
                </div>
                <span className={`font-mono text-sm font-semibold shrink-0 ${t.type === 'income' ? 'text-income' : 'text-expense'}`}>
                  {t.type === 'income' ? '+' : '-'}{formatCurrency(Number(t.amount))}
                </span>
              </div>
            ))}
            {transactions.filter((t: any) => t.date >= startOfMonth && t.date <= endOfMonth).length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">Sem transações neste mês</p>
            )}
          </div>
        </Card>

        <Card className="p-5 sm:p-6 bg-card border-border animate-fade-in">
          <h3 className="text-sm font-medium text-muted-foreground mb-4 flex items-center gap-2">
            <Target className="w-4 h-4" /> Progresso das Metas
          </h3>
          <div className="space-y-4">
            {goals.slice(0, 4).map((g: any) => {
              const pct = Math.min(100, (Number(g.current_amount) / Number(g.target_amount)) * 100);
              return (
                <div key={g.id}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-foreground truncate">{g.icon} {g.title}</span>
                    <span className="text-xs text-muted-foreground font-mono">{pct.toFixed(0)}%</span>
                  </div>
                  <div className="h-2 bg-secondary rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
            {goals.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Nenhuma meta definida</p>}
          </div>
        </Card>
      </div>
    </div>
  );
}