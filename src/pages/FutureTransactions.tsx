import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useCategories } from '@/hooks/useCategories';
import { formatCurrency, formatDate } from '@/lib/format';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import { Plus, Trash2, CheckCircle, Clock, AlertCircle, CalendarClock } from 'lucide-react';
import { toast } from 'sonner';

function useFutureTransactions() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['future_transactions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('future_transactions')
        .select('*, categories(name, icon, color)')
        .order('due_date', { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });
}

export default function FutureTransactions() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: items = [], isLoading } = useFutureTransactions();
  const { data: categories = [] } = useCategories();
  const [open, setOpen] = useState(false);
  const [desc, setDesc] = useState('');
  const [amount, setAmount] = useState('');
  const [type, setType] = useState('expense');
  const [categoryId, setCategoryId] = useState('');
  const [dueDate, setDueDate] = useState(new Date().toISOString().split('T')[0]);
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringPeriod, setRecurringPeriod] = useState('monthly');
  const [isInstallment, setIsInstallment] = useState(false);
  const [totalInstallments, setTotalInstallments] = useState('');

  const createMut = useMutation({
    mutationFn: async () => {
      if (isInstallment && totalInstallments) {
        const total = parseInt(totalInstallments);
        const installmentAmount = parseFloat(amount) / total;
        const rows = Array.from({ length: total }, (_, i) => {
          const d = new Date(dueDate);
          d.setMonth(d.getMonth() + i);
          return {
            user_id: user!.id,
            description: desc,
            amount: installmentAmount,
            type,
            category_id: categoryId || null,
            due_date: d.toISOString().split('T')[0],
            is_installment: true,
            total_installments: total,
            current_installment: i + 1,
            status: 'pending',
          };
        });
        const { error } = await supabase.from('future_transactions').insert(rows);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('future_transactions').insert({
          user_id: user!.id,
          description: desc,
          amount: parseFloat(amount),
          type,
          category_id: categoryId || null,
          due_date: dueDate,
          is_recurring: isRecurring,
          recurring_period: isRecurring ? recurringPeriod : null,
          status: 'pending',
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['future_transactions'] });
      toast.success('Lançamento futuro criado!');
      setOpen(false);
      setDesc('');
      setAmount('');
    },
    onError: (e) => toast.error(e.message),
  });

  const markPaid = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('future_transactions').update({ status: 'paid' }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['future_transactions'] });
      toast.success('Marcado como pago!');
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('future_transactions').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['future_transactions'] });
      toast.success('Lançamento removido!');
    },
  });

  const statusIcon = (status: string) => {
    if (status === 'paid') return <CheckCircle className="w-4 h-4 text-income" />;
    if (status === 'overdue') return <AlertCircle className="w-4 h-4 text-expense" />;
    return <Clock className="w-4 h-4 text-warning" />;
  };

  const statusLabel = (status: string) => {
    if (status === 'paid') return 'Pago';
    if (status === 'overdue') return 'Atrasado';
    return 'Pendente';
  };

  const pending = items.filter((i: any) => i.status === 'pending');
  const paid = items.filter((i: any) => i.status === 'paid');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Lançamentos Futuros</h1>
          <p className="text-muted-foreground">Gerencie suas contas e parcelas futuras</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gradient-primary gap-2"><Plus className="w-4 h-4" /> Novo Lançamento</Button>
          </DialogTrigger>
          <DialogContent className="bg-card border-border max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Novo Lançamento Futuro</DialogTitle></DialogHeader>
            <form onSubmit={e => { e.preventDefault(); createMut.mutate(); }} className="space-y-4">
              <div className="space-y-2">
                <Label>Descrição</Label>
                <Input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Ex: Internet, Parcela TV..." className="bg-secondary border-border" required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Valor {isInstallment ? '(total)' : ''}</Label>
                  <Input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} className="bg-secondary border-border" required />
                </div>
                <div className="space-y-2">
                  <Label>Data Prevista</Label>
                  <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="bg-secondary border-border" required />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Tipo</Label>
                  <Select value={type} onValueChange={setType}>
                    <SelectTrigger className="bg-secondary border-border"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="income">A Receber</SelectItem>
                      <SelectItem value="expense">A Pagar</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Categoria</Label>
                  <Select value={categoryId} onValueChange={setCategoryId}>
                    <SelectTrigger className="bg-secondary border-border"><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {categories.map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.icon} {c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Card className="p-4 bg-secondary border-border space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">Recorrente</p>
                    <p className="text-xs text-muted-foreground">Repete automaticamente</p>
                  </div>
                  <Switch checked={isRecurring} onCheckedChange={c => { setIsRecurring(c); if (c) setIsInstallment(false); }} />
                </div>
                {isRecurring && (
                  <Select value={recurringPeriod} onValueChange={setRecurringPeriod}>
                    <SelectTrigger className="bg-card border-border"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">Mensal</SelectItem>
                      <SelectItem value="weekly">Semanal</SelectItem>
                      <SelectItem value="yearly">Anual</SelectItem>
                    </SelectContent>
                  </Select>
                )}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">Parcelado</p>
                    <p className="text-xs text-muted-foreground">Dividir em parcelas</p>
                  </div>
                  <Switch checked={isInstallment} onCheckedChange={c => { setIsInstallment(c); if (c) setIsRecurring(false); }} />
                </div>
                {isInstallment && (
                  <Input type="number" min="2" value={totalInstallments} onChange={e => setTotalInstallments(e.target.value)} placeholder="Número de parcelas" className="bg-card border-border" />
                )}
              </Card>

              <div className="flex gap-3">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button type="submit" className="flex-1 gradient-primary" disabled={createMut.isPending}>
                  {createMut.isPending ? 'Salvando...' : 'Adicionar'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-5 bg-card border-border">
          <p className="text-sm text-muted-foreground">A Receber</p>
          <p className="text-2xl font-bold text-income mt-1">
            {formatCurrency(pending.filter((i: any) => i.type === 'income').reduce((s: number, i: any) => s + Number(i.amount), 0))}
          </p>
        </Card>
        <Card className="p-5 bg-card border-border">
          <p className="text-sm text-muted-foreground">A Pagar</p>
          <p className="text-2xl font-bold text-expense mt-1">
            {formatCurrency(pending.filter((i: any) => i.type === 'expense').reduce((s: number, i: any) => s + Number(i.amount), 0))}
          </p>
        </Card>
        <Card className="p-5 bg-card border-border">
          <p className="text-sm text-muted-foreground">Total Pendente</p>
          <p className="text-2xl font-bold text-foreground mt-1">{pending.length} lançamento(s)</p>
        </Card>
      </div>

      {/* Pending */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-3">Pendentes</h2>
        <Card className="bg-card border-border overflow-hidden">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Carregando...</div>
          ) : pending.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">Nenhum lançamento pendente</div>
          ) : (
            <div className="divide-y divide-border">
              {pending.map((item: any) => (
                <div key={item.id} className="flex items-center justify-between px-5 py-4">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center">
                      <CalendarClock className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">
                        {item.description}
                        {item.is_installment && ` (${item.current_installment}/${item.total_installments})`}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(item.due_date)} · {(item as any).categories?.name || 'Sem categoria'}
                        {item.is_recurring && ' · 🔄 Recorrente'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`font-mono font-semibold ${item.type === 'income' ? 'text-income' : 'text-expense'}`}>
                      {item.type === 'income' ? '+' : '-'}{formatCurrency(Number(item.amount))}
                    </span>
                    <Button variant="ghost" size="icon" onClick={() => markPaid.mutate(item.id)} title="Marcar como pago">
                      <CheckCircle className="w-4 h-4 text-income" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => deleteMut.mutate(item.id)} className="hover:text-destructive">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Paid */}
      {paid.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-foreground mb-3">Efetivados</h2>
          <Card className="bg-card border-border overflow-hidden">
            <div className="divide-y divide-border">
              {paid.map((item: any) => (
                <div key={item.id} className="flex items-center justify-between px-5 py-4 opacity-60">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-income/10 flex items-center justify-center">
                      <CheckCircle className="w-5 h-5 text-income" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{item.description}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(item.due_date)}</p>
                    </div>
                  </div>
                  <span className="font-mono text-muted-foreground">{formatCurrency(Number(item.amount))}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
