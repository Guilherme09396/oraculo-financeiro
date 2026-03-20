import { useState } from 'react';
import { useTransactions, useCreateTransaction, useDeleteTransaction, useUpdateTransaction } from '@/hooks/useTransactions';
import { useCategories } from '@/hooks/useCategories';
import { useAuth } from '@/lib/auth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatCurrency, formatDate } from '@/lib/format';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import MonthSelector from '@/components/MonthSelector';
import ReceiptPreviewDialog from '@/components/ReceiptPreviewDialog';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import { Plus, TrendingDown, Pencil, Trash2, FileText } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Given a purchase date and card closing day, returns the date (ISO string)
 * of the FIRST installment. 
 * Rule: if purchase date > closing day → first installment is in the SAME month (closing hasn't passed yet: NO, wait...)
 * Actually the rule is: 
 *   - if purchaseDay <= closingDay  → first installment falls in the CURRENT month's invoice
 *     (invoice closes on closingDay of current month, so this purchase is included)
 *   - if purchaseDay > closingDay   → purchase was made AFTER closing, so it goes to NEXT month's invoice
 *
 * The "installment date" we store is the 1st day of the invoice month (for grouping), 
 * but to be precise we store the actual purchase date shifted to the correct invoice month.
 * We'll store the date as the same day-of-month as the purchase, but in the correct invoice month.
 */
function getInstallmentDates(purchaseDateStr: string, closingDay: number, installments: number): string[] {
  const purchase = new Date(purchaseDateStr + 'T12:00:00');
  const purchaseDay = purchase.getDate();
  const purchaseMonth = purchase.getMonth(); // 0-indexed
  const purchaseYear = purchase.getFullYear();

  // Determine first invoice month (0-indexed)
  let firstInvoiceMonth = purchaseMonth;
  let firstInvoiceYear = purchaseYear;

  if (purchaseDay > closingDay) {
    // After closing → next month's invoice
    firstInvoiceMonth += 1;
    if (firstInvoiceMonth > 11) { firstInvoiceMonth = 0; firstInvoiceYear += 1; }
  }
  // else: on or before closing → current month's invoice

  const dates: string[] = [];
  for (let i = 0; i < installments; i++) {
    let m = firstInvoiceMonth + i;
    let y = firstInvoiceYear;
    while (m > 11) { m -= 12; y += 1; }

    // Use day 1 of that month as the transaction date (so it falls clearly in that invoice period)
    // Actually better to use the closing day itself so it clearly lands within the invoice period
    const day = Math.min(closingDay, new Date(y, m + 1, 0).getDate()); // last day of month if closingDay > days in month
    const mm = String(m + 1).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    dates.push(`${y}-${mm}-${dd}`);
  }

  return dates;
}

function ExpenseDialog({ transaction, onClose }: { transaction?: any; onClose: () => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const isEditing = !!transaction;
  const [description, setDescription] = useState(transaction?.description || '');
  const [amount, setAmount] = useState(transaction ? String(transaction.amount) : '');
  const [categoryId, setCategoryId] = useState(transaction?.category_id || '');
  const [date, setDate] = useState(transaction?.date || new Date().toLocaleDateString('en-CA'));
  const [paymentMethod, setPaymentMethod] = useState(transaction?.payment_method || '');
  const [cardId, setCardId] = useState((transaction as any)?.card_id || '');
  const [receiptUrl, setReceiptUrl] = useState((transaction as any)?.receipt_url || '');
  const [uploading, setUploading] = useState(false);

  // Installment state (only for credit card, only when creating)
  const [isInstallment, setIsInstallment] = useState(false);
  const [installments, setInstallments] = useState('2');

  const create = useCreateTransaction();
  const update = useUpdateTransaction();
  const { data: categories = [] } = useCategories('expense');
  const { data: cards = [] } = useQuery({
    queryKey: ['credit_cards'],
    queryFn: async () => {
      const { data, error } = await supabase.from('credit_cards').select('*').order('name');
      if (error) throw error;
      return data;
    },
  });

  const handleUpload = async (file: File) => {
    if (!user) return;
    setUploading(true);
    const path = `${user.id}/${crypto.randomUUID()}.${file.name.split('.').pop()}`;
    const { error } = await supabase.storage.from('receipts').upload(path, file);
    if (error) { toast.error('Erro ao enviar'); setUploading(false); return; }
    setReceiptUrl(supabase.storage.from('receipts').getPublicUrl(path).data.publicUrl);
    setUploading(false);
  };

  const selectedCard = cards?.find((c: any) => c.id === cardId);

  // Bulk create mutation for installments
  const bulkMut = useMutation({
    mutationFn: async (transactions: any[]) => {
      const { error } = await supabase.from('transactions').insert(transactions);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['card_transactions'] });
      toast.success(`${installments} parcelas criadas com sucesso!`);
      onClose();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const totalAmount = parseFloat(amount);

    // If editing, always just update (no installment logic)
    if (isEditing) {
      const data: any = {
        description, amount: totalAmount, type: 'expense', category_id: categoryId || null,
        date, payment_method: paymentMethod || null, notes: null, receipt_url: receiptUrl || null,
        card_id: (paymentMethod === 'credit_card' && cardId) ? cardId : null,
      };
      update.mutate({ id: transaction.id, ...data }, { onSuccess: onClose });
      return;
    }

    // Creating: check if installment
    if (paymentMethod === 'credit_card' && cardId && isInstallment && selectedCard) {
      const numInstallments = parseInt(installments);
      if (isNaN(numInstallments) || numInstallments < 2) {
        toast.error('Número de parcelas inválido (mínimo 2)');
        return;
      }
      const installmentAmount = Math.round((totalAmount / numInstallments) * 100) / 100;
      const dates = getInstallmentDates(date, selectedCard.closing_day, numInstallments);

      const transactions = dates.map((d, i) => ({
        user_id: user!.id,
        description: `${description} (${i + 1}/${numInstallments}x)`,
        amount: installmentAmount,
        type: 'expense',
        category_id: categoryId || null,
        date: d,
        payment_method: 'credit_card',
        notes: null,
        receipt_url: i === 0 ? (receiptUrl || null) : null,
        card_id: cardId,
      }));

      bulkMut.mutate(transactions);
      return;
    }

    // Normal single transaction
    const data: any = {
      description, amount: totalAmount, type: 'expense', category_id: categoryId || null,
      date, payment_method: paymentMethod || null, notes: null, receipt_url: receiptUrl || null,
      card_id: (paymentMethod === 'credit_card' && cardId) ? cardId : null,
    };
    create.mutate(data, { onSuccess: onClose });
  };

  const isSaving = create.isPending || update.isPending || bulkMut.isPending;
  const showInstallmentSection = !isEditing && paymentMethod === 'credit_card' && !!cardId;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2"><Label>Descrição</Label><Input value={description} onChange={e => setDescription(e.target.value)} className="bg-secondary border-border" required /></div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2"><Label>Valor {isInstallment ? '(total)' : ''}</Label><Input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} className="bg-secondary border-border" required /></div>
        <div className="space-y-2"><Label>Data da compra</Label><Input type="date" value={date} onChange={e => setDate(e.target.value)} className="bg-secondary border-border" required /></div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Categoria</Label>
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger className="bg-secondary border-border"><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>{categories.map(c => <SelectItem key={c.id} value={c.id}>{c.icon} {c.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Pagamento</Label>
          <Select value={paymentMethod} onValueChange={(v) => { setPaymentMethod(v); if (v !== 'credit_card') { setCardId(''); setIsInstallment(false); } }}>
            <SelectTrigger className="bg-secondary border-border"><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pix">PIX</SelectItem>
              <SelectItem value="credit_card">Cartão de Crédito</SelectItem>
              <SelectItem value="debit_card">Cartão de Débito</SelectItem>
              <SelectItem value="cash">Dinheiro</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {paymentMethod === 'credit_card' && cards && cards.length > 0 && (
        <div className="space-y-2">
          <Label>Qual cartão?</Label>
          <Select value={cardId} onValueChange={setCardId}>
            <SelectTrigger className="bg-secondary border-border"><SelectValue placeholder="Selecione o cartão" /></SelectTrigger>
            <SelectContent>
              {cards.map((c: any) => <SelectItem key={c.id} value={c.id}>💳 {c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}

      {showInstallmentSection && (
        <div className="space-y-3 p-3 bg-secondary/50 rounded-lg border border-border">
          <div className="flex items-center gap-3">
            <Label className="flex-1">É uma compra parcelada?</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={isInstallment ? 'default' : 'outline'}
                onClick={() => setIsInstallment(true)}
                className={isInstallment ? 'gradient-primary' : ''}
              >
                Sim
              </Button>
              <Button
                type="button"
                size="sm"
                variant={!isInstallment ? 'default' : 'outline'}
                onClick={() => setIsInstallment(false)}
                className={!isInstallment ? 'gradient-primary' : ''}
              >
                Não
              </Button>
            </div>
          </div>
          {isInstallment && (
            <div className="space-y-2">
              <Label>Número de parcelas</Label>
              <Input
                type="number"
                min="2"
                max="48"
                value={installments}
                onChange={e => setInstallments(e.target.value)}
                className="bg-secondary border-border"
                required
              />
              {amount && !isNaN(parseFloat(amount)) && parseInt(installments) >= 2 && (
                <p className="text-xs text-muted-foreground">
                  💡 {installments}x de <strong>{formatCurrency(Math.round((parseFloat(amount) / parseInt(installments)) * 100) / 100)}</strong>
                  {selectedCard && ` — 1ª parcela: ${getInstallmentDates(date, selectedCard.closing_day, 1)[0]}`}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      <div className="space-y-2">
        <Label>Comprovante</Label>
        {receiptUrl ? (
          <div className="flex items-center gap-2">
            <span className="text-primary text-sm">✅ Comprovante anexado</span>
            <Button type="button" variant="ghost" size="sm" onClick={() => setReceiptUrl('')}>Remover</Button>
          </div>
        ) : <Input type="file" accept="image/*,.pdf" disabled={uploading} onChange={e => e.target.files?.[0] && handleUpload(e.target.files[0])} className="bg-secondary border-border" />}
      </div>

      <Button type="submit" className="w-full gradient-primary" disabled={isSaving}>
        {isSaving ? 'Salvando...' : isEditing ? 'Atualizar' : isInstallment ? `Criar ${installments} parcelas` : 'Adicionar'}
      </Button>
    </form>
  );
}

export default function Expenses() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());
  const [filterCategory, setFilterCategory] = useState('all');
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [previewReceipt, setPreviewReceipt] = useState<string | null>(null);

  const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const endDate = `${year}-${String(month + 1).padStart(2, '0')}-${new Date(year, month + 1, 0).getDate()}`;

  const { data: transactions = [], isLoading } = useTransactions({ type: 'expense', startDate, endDate });
  const { data: categories = [] } = useCategories('expense');
  const deleteTransaction = useDeleteTransaction();

  const filtered = filterCategory === 'all' ? transactions : transactions.filter((t: any) => t.category_id === filterCategory);
  const total = filtered.reduce((s: number, t: any) => s + Number(t.amount), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Despesas</h1>
          <p className="text-sm text-muted-foreground">Todos os seus gastos</p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <MonthSelector month={month} year={year} onChange={(m, y) => { setMonth(m); setYear(y); }} />
          <Dialog open={showCreate} onOpenChange={setShowCreate}>
            <DialogTrigger asChild><Button className="gradient-primary gap-2"><Plus className="w-4 h-4" /> <span className="hidden sm:inline">Nova Despesa</span></Button></DialogTrigger>
            <DialogContent className="bg-card border-border max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Nova Despesa</DialogTitle></DialogHeader>
              <ExpenseDialog onClose={() => setShowCreate(false)} />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <Card className="p-4 sm:p-5 bg-card border-border flex-1 min-w-[200px]">
          <p className="text-sm text-muted-foreground">Total de Despesas</p>
          <p className="text-2xl sm:text-3xl font-bold text-expense mt-1">{formatCurrency(total)}</p>
          <p className="text-sm text-muted-foreground mt-1">{filtered.length} lançamento(s)</p>
        </Card>
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-[160px] sm:w-[180px] bg-secondary border-border"><SelectValue placeholder="Categoria" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas categorias</SelectItem>
            {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.icon} {c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card className="bg-card border-border overflow-hidden">
        {isLoading ? <div className="p-8 text-center text-muted-foreground">Carregando...</div>
          : filtered.length === 0 ? <div className="p-8 sm:p-12 text-center text-muted-foreground">Nenhuma despesa neste período</div>
          : <div className="divide-y divide-border">
              {filtered.map((t: any) => (
                <div key={t.id} className="flex items-center justify-between px-4 sm:px-5 py-3 sm:py-4 hover:bg-secondary/50 transition-colors gap-2">
                  <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                    <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-expense/15 flex items-center justify-center shrink-0"><TrendingDown className="w-4 h-4 sm:w-5 sm:h-5 text-expense" /></div>
                    <div className="min-w-0">
                      <p className="font-medium text-foreground text-sm sm:text-base truncate">{t.description}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {formatDate(t.date)} · {(t as any).categories?.name || 'Sem categoria'}
                        {t.payment_method === 'credit_card' && ' · 💳 Cartão'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                    <span className="font-mono font-semibold text-expense text-sm">-{formatCurrency(Number(t.amount))}</span>
                    {(t as any).receipt_url && (
                      <Button variant="ghost" size="icon" onClick={() => setPreviewReceipt((t as any).receipt_url)} className="h-8 w-8" title="Ver comprovante">
                        <FileText className="w-3.5 h-3.5 text-primary" />
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" onClick={() => setEditing(t)} className="h-8 w-8"><Pencil className="w-3.5 h-3.5" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => deleteTransaction.mutate(t.id)} className="h-8 w-8 hover:text-destructive hidden sm:flex"><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div>
                </div>
              ))}
            </div>}
      </Card>

      <Dialog open={!!editing} onOpenChange={open => !open && setEditing(null)}>
        <DialogContent className="bg-card border-border max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Editar Despesa</DialogTitle></DialogHeader>
          {editing && <ExpenseDialog transaction={editing} onClose={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>

      <ReceiptPreviewDialog url={previewReceipt} onClose={() => setPreviewReceipt(null)} />
    </div>
  );
}