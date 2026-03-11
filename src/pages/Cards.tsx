import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { formatCurrency } from '@/lib/format';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import MonthSelector from '@/components/MonthSelector';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Plus, Trash2, CreditCard, Pencil, TrendingDown } from 'lucide-react';
import { toast } from 'sonner';

const CARD_COLORS = ['#6366f1', '#22c55e', '#ef4444', '#f59e0b', '#3b82f6', '#ec4899', '#8b5cf6'];

function useCards() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['credit_cards'],
    queryFn: async () => {
      const { data, error } = await supabase.from('credit_cards').select('*').order('name');
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });
}

function CardDialog({ card, onClose }: { card?: any; onClose: () => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const isEditing = !!card;
  const [name, setName] = useState(card?.name || '');
  const [limit, setLimit] = useState(card ? String(card.card_limit) : '');
  const [closingDay, setClosingDay] = useState(card ? String(card.closing_day) : '');
  const [dueDay, setDueDay] = useState(card ? String(card.due_day) : '');
  const [color, setColor] = useState(card?.color || '#6366f1');

  const mut = useMutation({
    mutationFn: async () => {
      const payload: any = {
        name, card_limit: parseFloat(limit), closing_day: parseInt(closingDay),
        due_day: parseInt(dueDay), color,
      };
      if (isEditing) {
        const { error } = await supabase.from('credit_cards').update(payload).eq('id', card.id);
        if (error) throw error;
      } else {
        payload.user_id = user!.id;
        const { error } = await supabase.from('credit_cards').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['credit_cards'] }); toast.success(isEditing ? 'Cartão atualizado!' : 'Cartão adicionado!'); onClose(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <form onSubmit={e => { e.preventDefault(); mut.mutate(); }} className="space-y-4">
      <div className="space-y-2"><Label>Nome do Cartão</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Nubank" className="bg-secondary border-border" required /></div>
      <div className="space-y-2"><Label>Limite</Label><Input type="number" step="0.01" value={limit} onChange={e => setLimit(e.target.value)} placeholder="R$ 0,00" className="bg-secondary border-border" required /></div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2"><Label>Dia de Fechamento</Label><Input type="number" min="1" max="31" value={closingDay} onChange={e => setClosingDay(e.target.value)} className="bg-secondary border-border" required /></div>
        <div className="space-y-2"><Label>Dia de Vencimento</Label><Input type="number" min="1" max="31" value={dueDay} onChange={e => setDueDay(e.target.value)} className="bg-secondary border-border" required /></div>
      </div>
      <div className="space-y-2">
        <Label>Cor</Label>
        <div className="flex gap-2">
          {CARD_COLORS.map(c => (
            <button key={c} type="button" onClick={() => setColor(c)}
              className={`w-8 h-8 rounded-full border-2 ${color === c ? 'border-foreground' : 'border-transparent'}`}
              style={{ backgroundColor: c }} />
          ))}
        </div>
      </div>
      <Button type="submit" className="w-full gradient-primary" disabled={mut.isPending}>
        {mut.isPending ? 'Salvando...' : isEditing ? 'Atualizar' : 'Adicionar'}
      </Button>
    </form>
  );
}

export default function Cards() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: cards = [], isLoading } = useCards();
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  const startOfMonth = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const endOfMonth = `${year}-${String(month + 1).padStart(2, '0')}-${new Date(year, month + 1, 0).getDate()}`;

  // Fetch transactions linked to cards for this month
  const { data: cardTransactions = [] } = useQuery({
    queryKey: ['card_transactions', startOfMonth, endOfMonth],
    queryFn: async () => {
      const { data, error } = await supabase.from('transactions')
        .select('*, categories(name, icon, color)')
        .not('card_id', 'is', null)
        .gte('date', startOfMonth)
        .lte('date', endOfMonth)
        .order('date', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('credit_cards').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['credit_cards'] }); toast.success('Cartão removido!'); },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Cartões</h1>
          <p className="text-muted-foreground">Gerencie seus cartões de crédito</p>
        </div>
        <div className="flex items-center gap-3">
          <MonthSelector month={month} year={year} onChange={(m, y) => { setMonth(m); setYear(y); }} />
          <Dialog open={showCreate} onOpenChange={setShowCreate}>
            <DialogTrigger asChild><Button className="gradient-primary gap-2"><Plus className="w-4 h-4" /> Novo Cartão</Button></DialogTrigger>
            <DialogContent className="bg-card border-border">
              <DialogHeader><DialogTitle>Novo Cartão</DialogTitle></DialogHeader>
              <CardDialog onClose={() => setShowCreate(false)} />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Carregando...</div>
      ) : cards.length === 0 ? (
        <Card className="p-12 bg-card border-border text-center text-muted-foreground">
          <CreditCard className="w-12 h-12 mx-auto mb-4" />
          <p className="text-lg">Nenhum cartão cadastrado</p>
          <p className="text-sm mt-1">Adicione um cartão para acompanhar seus gastos</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {cards.map((card: any) => {
            const spent = cardTransactions
              .filter((t: any) => t.card_id === card.id && t.type === 'expense')
              .reduce((s: number, t: any) => s + Number(t.amount), 0);
            const pct = card.card_limit > 0 ? Math.min(100, (spent / Number(card.card_limit)) * 100) : 0;
            const available = Math.max(0, Number(card.card_limit) - spent);
            const cardTx = cardTransactions.filter((t: any) => t.card_id === card.id);

            return (
              <Card key={card.id} className="bg-card border-border overflow-hidden animate-fade-in">
                {/* Card header */}
                <div className="p-6 relative" style={{ background: `linear-gradient(135deg, ${card.color}, ${card.color}88)` }}>
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-white/80 text-sm">💳 {card.name}</p>
                      <p className="text-white text-2xl font-bold mt-1">Limite: {formatCurrency(Number(card.card_limit))}</p>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-white/80 hover:text-white hover:bg-white/20" onClick={() => setEditing(card)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-white/80 hover:text-white hover:bg-white/20" onClick={() => deleteMut.mutate(card.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                    <div><p className="text-white/60">Fechamento</p><p className="text-white font-semibold">Dia {card.closing_day}</p></div>
                    <div><p className="text-white/60">Vencimento</p><p className="text-white font-semibold">Dia {card.due_day}</p></div>
                  </div>
                </div>

                {/* Usage */}
                <div className="p-6 space-y-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Gasto no mês</span>
                    <span className="text-expense font-mono font-semibold">{formatCurrency(spent)}</span>
                  </div>
                  <Progress value={pct} className="h-2" />
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Disponível</span>
                    <span className="text-income font-mono font-semibold">{formatCurrency(available)}</span>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">{pct.toFixed(0)}% utilizado</div>

                  {/* Recent card transactions */}
                  {cardTx.length > 0 && (
                    <div className="pt-4 border-t border-border">
                      <p className="text-sm text-muted-foreground mb-3">Transações do mês</p>
                      <div className="space-y-2 max-h-[200px] overflow-y-auto">
                        {cardTx.slice(0, 8).map((t: any) => (
                          <div key={t.id} className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2">
                              <TrendingDown className="w-3.5 h-3.5 text-expense" />
                              <span className="text-foreground truncate">{t.description}</span>
                            </div>
                            <span className="text-expense font-mono text-xs">{formatCurrency(Number(t.amount))}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={open => !open && setEditing(null)}>
        <DialogContent className="bg-card border-border">
          <DialogHeader><DialogTitle>Editar Cartão</DialogTitle></DialogHeader>
          {editing && <CardDialog card={editing} onClose={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
