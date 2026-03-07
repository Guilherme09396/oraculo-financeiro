import { useTransactions } from '@/hooks/useTransactions';
import { formatCurrency, formatDate } from '@/lib/format';
import { Card } from '@/components/ui/card';
import { TrendingDown } from 'lucide-react';

export default function Expenses() {
  const { data: transactions = [], isLoading } = useTransactions({ type: 'expense' });

  const total = transactions.reduce((s: number, t: any) => s + Number(t.amount), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Despesas</h1>
        <p className="text-muted-foreground">Todos os seus gastos</p>
      </div>

      <Card className="p-6 bg-card border-border">
        <p className="text-sm text-muted-foreground">Total de Despesas</p>
        <p className="text-3xl font-bold text-expense mt-1">{formatCurrency(total)}</p>
        <p className="text-sm text-muted-foreground mt-1">{transactions.length} lançamento(s)</p>
      </Card>

      <Card className="bg-card border-border overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">Carregando...</div>
        ) : transactions.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">Nenhuma despesa registrada</div>
        ) : (
          <div className="divide-y divide-border">
            {transactions.map((t: any) => (
              <div key={t.id} className="flex items-center justify-between px-5 py-4">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-expense/15 flex items-center justify-center">
                    <TrendingDown className="w-5 h-5 text-expense" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">{t.description}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(t.date)} · {(t as any).categories?.name || 'Sem categoria'}</p>
                  </div>
                </div>
                <span className="font-mono font-semibold text-expense">-{formatCurrency(Number(t.amount))}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
