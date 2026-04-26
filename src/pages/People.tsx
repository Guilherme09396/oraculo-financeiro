import { useState, useMemo } from 'react';
import { useAuth } from '@/lib/auth';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Search, Users, ArrowUpRight, ArrowDownRight, Wallet } from 'lucide-react';
import { formatCurrency } from '@/lib/format';
import { Link } from 'react-router-dom';

export default function People() {
  const { user } = useAuth();
  const [search, setSearch] = useState('');

  const { data: transactions = [] } = useQuery({
    queryKey: ['transactions_all_for_people'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transactions')
        .select('id, description, amount, type, third_party_name, is_third_party, date')
        .eq('is_third_party', true);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const { data: futures = [] } = useQuery({
    queryKey: ['futures_for_people'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('future_transactions')
        .select('id, description, amount, type, third_party_name, is_third_party, due_date, status')
        .eq('is_third_party', true);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const peopleData = useMemo(() => {
    const map = new Map<string, {
      name: string;
      paidByMe: number;       // já paguei para essa pessoa (despesas)
      receivedFromMe: number; // expense de terceiros = sou pra essa pessoa
      receivedFromThem: number;// receitas de terceiros = elas me devem
      futureToReceive: number;
      futureToPay: number;
    }>();

    transactions.forEach((t: any) => {
      const name = t.third_party_name || 'Sem nome';
      const cur = map.get(name) || {
        name,
        paidByMe: 0,
        receivedFromMe: 0,
        receivedFromThem: 0,
        futureToReceive: 0,
        futureToPay: 0,
      };
      const amt = Number(t.amount);
      if (t.type === 'expense') cur.paidByMe += amt;       // paguei algo da pessoa
      else if (t.type === 'income') cur.receivedFromThem += amt; // recebi dela
      map.set(name, cur);
    });

    futures.forEach((f: any) => {
      if (f.status === 'paid') return; // só pendentes
      const name = f.third_party_name || 'Sem nome';
      const cur = map.get(name) || {
        name,
        paidByMe: 0,
        receivedFromMe: 0,
        receivedFromThem: 0,
        futureToReceive: 0,
        futureToPay: 0,
      };
      const amt = Number(f.amount);
      if (f.type === 'expense') cur.futureToPay += amt;
      else if (f.type === 'income') cur.futureToReceive += amt;
      map.set(name, cur);
    });

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [transactions, futures]);

  const filtered = peopleData.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));

  const totalToReceive = peopleData.reduce((s, p) => s + p.futureToReceive, 0);
  const totalToPay = peopleData.reduce((s, p) => s + p.futureToPay, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2">
          <Users className="w-6 h-6" /> Pessoas
        </h1>
        <p className="text-sm text-muted-foreground">Quem te deve e a quem você deve</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4 sm:p-5 bg-card border-border">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Total a receber</p>
            <ArrowUpRight className="w-4 h-4 text-income" />
          </div>
          <p className="text-2xl font-bold text-income mt-1">{formatCurrency(totalToReceive)}</p>
        </Card>
        <Card className="p-4 sm:p-5 bg-card border-border">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Total a pagar</p>
            <ArrowDownRight className="w-4 h-4 text-expense" />
          </div>
          <p className="text-2xl font-bold text-expense mt-1">{formatCurrency(totalToPay)}</p>
        </Card>
        <Card className="p-4 sm:p-5 bg-card border-border">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Saldo líquido</p>
            <Wallet className="w-4 h-4 text-foreground" />
          </div>
          <p className={`text-2xl font-bold mt-1 ${totalToReceive - totalToPay >= 0 ? 'text-income' : 'text-expense'}`}>
            {formatCurrency(totalToReceive - totalToPay)}
          </p>
        </Card>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Buscar pessoa..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10 bg-secondary border-border"
        />
      </div>

      <Card className="bg-card border-border overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-8 sm:p-12 text-center text-muted-foreground">
            <Users className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="text-base">Nenhuma pessoa encontrada</p>
            <p className="text-xs mt-1">Marque transações como "de outra pessoa" para começar a acompanhar.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((p) => {
              const balance = p.futureToReceive - p.futureToPay;
              return (
                <div key={p.name} className="px-4 sm:px-5 py-3 sm:py-4 hover:bg-secondary/50 transition-colors">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center text-primary font-semibold shrink-0">
                        {p.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-foreground truncate">{p.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Histórico: pagou {formatCurrency(p.paidByMe)} · recebeu {formatCurrency(p.receivedFromThem)}
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`font-mono font-semibold text-sm ${balance >= 0 ? 'text-income' : 'text-expense'}`}>
                        {balance >= 0 ? '+' : ''}{formatCurrency(balance)}
                      </p>
                      <p className="text-[10px] text-muted-foreground">saldo pendente</p>
                    </div>
                  </div>
                  {(p.futureToReceive > 0 || p.futureToPay > 0) && (
                    <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
                      {p.futureToReceive > 0 && (
                        <Link to="/future" className="flex items-center justify-between rounded bg-income/10 px-3 py-2 hover:bg-income/15">
                          <span className="text-income">A receber</span>
                          <span className="font-mono font-semibold text-income">{formatCurrency(p.futureToReceive)}</span>
                        </Link>
                      )}
                      {p.futureToPay > 0 && (
                        <Link to="/future" className="flex items-center justify-between rounded bg-expense/10 px-3 py-2 hover:bg-expense/15">
                          <span className="text-expense">A pagar</span>
                          <span className="font-mono font-semibold text-expense">{formatCurrency(p.futureToPay)}</span>
                        </Link>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
