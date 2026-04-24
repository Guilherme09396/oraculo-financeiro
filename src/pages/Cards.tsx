import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { formatCurrency, formatDate } from '@/lib/format';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import MonthSelector from '@/components/MonthSelector';
import ReceiptPreviewDialog from '@/components/ReceiptPreviewDialog';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Plus, Trash2, CreditCard, Pencil, TrendingDown, ChevronDown, ChevronUp, FileText, Wallet, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Calcula o período de uma fatura dado o mês/ano de VENCIMENTO.
 *
 * Casos:
 *  A) dueDay > closingDay  → fechamento e vencimento no MESMO mês
 *     Ex: fecha dia 10, vence dia 15 → período: 11/mês-anterior até 10/mês
 *
 *  B) dueDay < closingDay  → vencimento é no mês SEGUINTE ao fechamento
 *     Ex: fecha dia 28, vence dia 5  → ao ver "Maio" (vence 5/Mai):
 *         o fechamento foi 28/Mar → período: 29/Mar até 28/Abr
 *     Ou seja: fechamento ocorre em (month - 1), e o período é
 *         29/(month-2) até 28/(month-1)   [usando os dias do cartão]
 */
function getInvoicePeriod(month, year, closingDay, dueDay) {
  const formatISO = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  let periodEnd, periodStart;

  if (dueDay > closingDay) {
    // Caso A: fecha e vence no mesmo mês
    // periodEnd = closingDay do mês selecionado
    // periodStart = closingDay + 1 do mês anterior
    periodEnd = new Date(year, month, closingDay);
    periodStart = new Date(year, month - 1, closingDay + 1);
  } else {
    // Caso B: fecha em (month - 1), vence em (month)
    // periodEnd = closingDay do mês anterior ao selecionado
    // periodStart = closingDay + 1 do mês dois meses atrás
    periodEnd = new Date(year, month - 1, closingDay);
    periodStart = new Date(year, month - 2, closingDay + 1);
  }

  return {
    start: formatISO(periodStart),
    end: formatISO(periodEnd),
  };
}

const CARD_COLORS = ['#6366f1', '#22c55e', '#ef4444', '#f59e0b', '#3b82f6', '#ec4899', '#8b5cf6'];

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['credit_cards'] });
      toast.success(isEditing ? 'Cartão atualizado!' : 'Cartão adicionado!');
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <form onSubmit={e => { e.preventDefault(); mut.mutate(); }} className="space-y-4">
      <div className="space-y-2">
        <Label>Nome do Cartão</Label>
        <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Nubank" className="bg-secondary border-border" required />
      </div>
      <div className="space-y-2">
        <Label>Limite</Label>
        <Input type="number" step="0.01" value={limit} onChange={e => setLimit(e.target.value)} placeholder="R$ 0,00" className="bg-secondary border-border" required />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Dia de Fechamento</Label>
          <Input type="number" min="1" max="31" value={closingDay} onChange={e => setClosingDay(e.target.value)} className="bg-secondary border-border" required />
        </div>
        <div className="space-y-2">
          <Label>Dia de Vencimento</Label>
          <Input type="number" min="1" max="31" value={dueDay} onChange={e => setDueDay(e.target.value)} className="bg-secondary border-border" required />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Cor</Label>
        <div className="flex gap-2 flex-wrap">
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

function PayInvoiceDialog({ card, spent, alreadyPaid, month, year, onClose }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const remaining = spent - alreadyPaid;
  const [amount, setAmount] = useState(String(remaining));
  const [paidDate, setPaidDate] = useState(new Date().toLocaleDateString('en-CA'));
  const [receiptUrl, setReceiptUrl] = useState('');
  const [uploading, setUploading] = useState(false);

  const monthName = MONTH_NAMES[month];

  const handleUpload = async (file) => {
    if (!user) return;
    setUploading(true);
    const path = `${user.id}/${crypto.randomUUID()}.${file.name.split('.').pop()}`;
    const { error } = await supabase.storage.from('receipts').upload(path, file);
    if (error) { toast.error('Erro ao enviar'); setUploading(false); return; }
    setReceiptUrl(supabase.storage.from('receipts').getPublicUrl(path).data.publicUrl);
    setUploading(false);
  };

  const mut = useMutation({
    mutationFn: async () => {
      const paymentAmount = parseFloat(amount);
      if (paymentAmount > remaining) {
        throw new Error(`O valor não pode ser maior que o restante da fatura (${formatCurrency(remaining)})`);
      }

      const { data: cardCategory } = await supabase
        .from('categories').select('id').ilike('name', 'cartão').maybeSingle();
      let categoryId = cardCategory?.id || null;

      if (!categoryId) {
        const { data: cardCategoryAlt } = await supabase
          .from('categories').select('id').ilike('name', 'cartao').maybeSingle();
        categoryId = cardCategoryAlt?.id || null;
      }

      const { error } = await supabase.from('transactions').insert({
        user_id: user.id,
        description: `Pagamento fatura ${card.name} - ${monthName}`,
        amount: paymentAmount,
        type: 'expense',
        date: paidDate,
        payment_method: 'pix',
        category_id: categoryId,
        receipt_url: receiptUrl || null,
        notes: `Fatura do cartão ${card.name} referente a ${monthName}/${year}`,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['invoice_payments'] });
      toast.success('Fatura paga! Despesa registrada no mês do pagamento.');
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Cartão: <strong className="text-foreground">{card.name}</strong></p>
      <p className="text-sm text-muted-foreground">Fatura de: <strong className="text-foreground">{monthName}/{year}</strong></p>
      <p className="text-sm text-muted-foreground">Valor total: <strong className="text-expense">{formatCurrency(spent)}</strong></p>
      {alreadyPaid > 0 && (
        <p className="text-sm text-muted-foreground">Já pago: <strong className="text-income">{formatCurrency(alreadyPaid)}</strong></p>
      )}
      <p className="text-sm text-muted-foreground">Restante: <strong className="text-expense">{formatCurrency(remaining)}</strong></p>
      <div className="space-y-2">
        <Label>Valor a pagar (máximo: {formatCurrency(remaining)})</Label>
        <Input type="number" step="0.01" max={remaining} value={amount} onChange={e => setAmount(e.target.value)} className="bg-secondary border-border" required />
      </div>
      <div className="space-y-2">
        <Label>Data do pagamento</Label>
        <Input type="date" value={paidDate} onChange={e => setPaidDate(e.target.value)} className="bg-secondary border-border" required />
      </div>
      <div className="space-y-2">
        <Label>Comprovante</Label>
        {receiptUrl ? (
          <div className="flex items-center gap-2">
            <span className="text-primary text-sm">✅ Comprovante anexado</span>
            <Button type="button" variant="ghost" size="sm" onClick={() => setReceiptUrl('')}>Remover</Button>
          </div>
        ) : <Input type="file" accept="image/*,.pdf" disabled={uploading} onChange={e => e.target.files?.[0] && handleUpload(e.target.files[0])} className="bg-secondary border-border" />}
      </div>
      <p className="text-xs text-muted-foreground">
        💡 Uma despesa será criada com categoria "Cartão" e método PIX na data informada, impactando o saldo do mês correspondente.
      </p>
      <Button onClick={() => mut.mutate()} className="w-full gradient-primary" disabled={mut.isPending}>
        {mut.isPending ? 'Registrando...' : 'Pagar Fatura'}
      </Button>
    </div>
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
  const [editing, setEditing] = useState(null);
  const [expandedCard, setExpandedCard] = useState(null);
  const [previewReceipt, setPreviewReceipt] = useState(null);
  const [payingInvoice, setPayingInvoice] = useState(null);

  const { data: allCardTransactions = [] } = useQuery({
    queryKey: ['card_transactions'],
    queryFn: async () => {
      const { data, error } = await supabase.from('transactions')
        .select('*, categories(name, icon, color)')
        .not('card_id', 'is', null)
        .order('date', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: allPayments = [] } = useQuery({
    queryKey: ['invoice_payments'],
    queryFn: async () => {
      const { data, error } = await supabase.from('transactions')
        .select('*')
        .eq('type', 'expense')
        .eq('payment_method', 'pix')
        .like('description', 'Pagamento fatura %')
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

  const monthName = MONTH_NAMES[month];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Cartões</h1>
          <p className="text-sm text-muted-foreground">Gerencie seus cartões de crédito</p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <MonthSelector month={month} year={year} onChange={(m, y) => { setMonth(m); setYear(y); }} />
          <Dialog open={showCreate} onOpenChange={setShowCreate}>
            <DialogTrigger asChild>
              <Button className="gradient-primary gap-2">
                <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Novo Cartão</span>
              </Button>
            </DialogTrigger>
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
        <Card className="p-8 sm:p-12 bg-card border-border text-center text-muted-foreground">
          <CreditCard className="w-12 h-12 mx-auto mb-4" />
          <p className="text-lg">Nenhum cartão cadastrado</p>
          <p className="text-sm mt-1">Adicione um cartão para acompanhar seus gastos</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {cards.map((card) => {
            const period = getInvoicePeriod(month, year, card.closing_day, card.due_day);

            const cardTx = allCardTransactions.filter((t) =>
              t.card_id === card.id &&
              t.type === 'expense' &&
              t.date >= period.start &&
              t.date <= period.end
            );
            const spent = cardTx.reduce((s, t) => s + Number(t.amount), 0);
            const pct = card.card_limit > 0 ? Math.min(100, (spent / Number(card.card_limit)) * 100) : 0;
            const available = Math.max(0, Number(card.card_limit) - spent);
            const isExpanded = expandedCard === card.id;

            const payments = allPayments.filter((p) =>
              p.description.includes(card.name) && p.description.includes(monthName)
            );
            const alreadyPaid = payments.reduce((sum, p) => sum + Number(p.amount), 0);
            const remaining = spent - alreadyPaid;
            const isFullyPaid = alreadyPaid >= spent && spent > 0;

            return (
              <Card key={card.id} className="bg-card border-border overflow-hidden animate-fade-in rounded-xl">
                <div className="p-3 sm:p-4 relative" style={{ background: `linear-gradient(135deg, ${card.color}, ${card.color}88)` }}>
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-white/80 text-xs">💳 {card.name}</p>
                      <p className="text-white text-lg sm:text-xl font-bold mt-0.5">{formatCurrency(Number(card.card_limit))}</p>
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
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    <div><p className="text-white/60">Fechamento</p><p className="text-white font-semibold">Dia {card.closing_day}</p></div>
                    <div><p className="text-white/60">Vencimento</p><p className="text-white font-semibold">Dia {card.due_day}</p></div>
                  </div>
                  {/* Período da fatura */}
                  <div className="mt-2 text-[10px] text-white/60">
                    Período: {period.start.split('-').reverse().join('/')} → {period.end.split('-').reverse().join('/')}
                  </div>
                </div>

                <div className="p-3 sm:p-4 space-y-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Fatura do mês</span>
                    <span className="text-expense font-mono font-semibold">{formatCurrency(spent)}</span>
                  </div>
                  <Progress value={pct} className="h-1.5" />
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Disponível</span>
                    <span className="text-income font-mono font-semibold">{formatCurrency(available)}</span>
                  </div>
                  <div className="text-right text-[10px] text-muted-foreground">{pct.toFixed(0)}% utilizado</div>

                  {alreadyPaid > 0 && (
                    <div className="pt-2 pb-1 border-t border-border space-y-0.5">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Já pago</span>
                        <span className="text-income font-mono font-semibold">{formatCurrency(alreadyPaid)}</span>
                      </div>
                      {!isFullyPaid && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Restante</span>
                          <span className="text-expense font-mono font-semibold">{formatCurrency(remaining)}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {spent > 0 && (
                    <>
                      {isFullyPaid ? (
                        <div className="flex items-center justify-center gap-2 p-2 bg-income/10 border border-income/20 rounded-lg">
                          <CheckCircle2 className="w-5 h-5 text-income" />
                          <span className="text-income font-semibold">Fatura Paga</span>
                        </div>
                      ) : (
                        <Button variant="outline" className="w-full gap-2 h-8 text-xs"
                          onClick={() => setPayingInvoice({ card, spent, alreadyPaid })}>
                          <Wallet className="w-4 h-4" />
                          {alreadyPaid > 0 ? `Pagar Restante (${formatCurrency(remaining)})` : 'Pagar Fatura'}
                        </Button>
                      )}
                    </>
                  )}

                  {cardTx.length > 0 && (
                    <div className="pt-4 border-t border-border">
                      <button onClick={() => setExpandedCard(isExpanded ? null : card.id)}
                        className="flex items-center justify-between w-full text-sm text-muted-foreground hover:text-foreground transition-colors">
                        <span>Transações do mês ({cardTx.length})</span>
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                      {isExpanded && (
                        <div className="space-y-1 mt-2 max-h-[220px] overflow-y-auto">
                          {cardTx.map((t) => (
                            <div key={t.id} className="flex items-center justify-between text-sm gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <TrendingDown className="w-3.5 h-3.5 text-expense shrink-0" />
                                <span className="text-foreground truncate">{t.description}</span>
                                {t.receipt_url && (
                                  <button onClick={() => setPreviewReceipt(t.receipt_url)} className="shrink-0">
                                    <FileText className="w-3 h-3 text-primary" />
                                  </button>
                                )}
                              </div>
                              <div className="text-right shrink-0">
                                <span className="text-expense font-mono text-[11px]">{formatCurrency(Number(t.amount))}</span>
                                <p className="text-[10px] text-muted-foreground">{formatDate(t.date)}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {payments.length > 0 && (
                    <div className="pt-4 border-t border-border">
                      <p className="text-xs text-muted-foreground mb-2">Pagamentos realizados:</p>
                      <div className="space-y-1">
                        {payments.map((p) => (
                          <div key={p.id} className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">{formatDate(p.date)}</span>
                            <span className="text-income font-mono">{formatCurrency(Number(p.amount))}</span>
                          </div>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        💡 Para pagar novamente, exclua os pagamentos acima na aba de transações.
                      </p>
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

      <Dialog open={!!payingInvoice} onOpenChange={open => !open && setPayingInvoice(null)}>
        <DialogContent className="bg-card border-border">
          <DialogHeader><DialogTitle>Pagar Fatura</DialogTitle></DialogHeader>
          {payingInvoice && (
            <PayInvoiceDialog
              card={payingInvoice.card}
              spent={payingInvoice.spent}
              alreadyPaid={payingInvoice.alreadyPaid}
              month={month}
              year={year}
              onClose={() => setPayingInvoice(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      <ReceiptPreviewDialog url={previewReceipt} onClose={() => setPreviewReceipt(null)} />
    </div>
  );
}