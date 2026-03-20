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
import { Textarea } from '@/components/ui/textarea';
import MonthSelector from '@/components/MonthSelector';
import ReceiptPreviewDialog from '@/components/ReceiptPreviewDialog';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import { Plus, Search, Trash2, TrendingUp, TrendingDown, Pencil, FileText } from 'lucide-react';
import { toast } from 'sonner';

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

function getFirstInstallmentInvoiceMonth(purchaseDateStr: string, closingDay: number): string {
  const purchase = new Date(purchaseDateStr + 'T12:00:00');
  const purchaseDay = purchase.getDate();
  let invoiceMonth = purchase.getMonth();
  let invoiceYear = purchase.getFullYear();

  if (purchaseDay > closingDay) {
    invoiceMonth += 1;
    if (invoiceMonth > 11) { invoiceMonth = 0; invoiceYear += 1; }
  }

  return `${MONTH_NAMES[invoiceMonth]}/${invoiceYear}`;
}

function TransactionDialog({ transaction, onClose, defaultType }: { transaction?: any; onClose: () => void; defaultType?: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const isEditing = !!transaction;
  const [description, setDescription] = useState(transaction?.description || '');
  const [amount, setAmount] = useState(transaction ? String(transaction.amount) : '');
  const [type, setType] = useState(transaction?.type || defaultType || 'expense');
  const [categoryId, setCategoryId] = useState(transaction?.category_id || '');
  const [date, setDate] = useState(transaction?.date || new Date().toLocaleDateString('en-CA'));
  const [paymentMethod, setPaymentMethod] = useState(transaction?.payment_method || '');
  const [notes, setNotes] = useState(transaction?.notes || '');
  const [receiptUrl, setReceiptUrl] = useState((transaction as any)?.receipt_url || '');
  const [cardId, setCardId] = useState((transaction as any)?.card_id || '');
  const [uploading, setUploading] = useState(false);

  // Installment state
  const [isInstallment, setIsInstallment] = useState(false);
  const [installments, setInstallments] = useState('2');

  const create = useCreateTransaction();
  const update = useUpdateTransaction();
  const { data: categories = [] } = useCategories(type);
  const { data: cards = [] } = useQuery({
    queryKey: ['credit_cards'],
    queryFn: async () => {
      const { data, error } = await supabase.from('credit_cards').select('*').order('name');
      if (error) throw error;
      return data;
    },
  });

  const handleReceiptUpload = async (file: File) => {
    if (!user) return;
    setUploading(true);
    const ext = file.name.split('.').pop();
    const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from('receipts').upload(path, file);
    if (error) { toast.error('Erro ao enviar comprovante'); setUploading(false); return; }
    const { data } = supabase.storage.from('receipts').getPublicUrl(path);
    setReceiptUrl(data.publicUrl);
    setUploading(false);
  };

  const selectedCard = cards?.find((c: any) => c.id === cardId);

  const bulkMut = useMutation({
    mutationFn: async (txList: any[]) => {
      const { error } = await supabase.from('transactions').insert(txList);
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

    if (isEditing) {
      update.mutate({
        id: transaction.id,
        description, amount: totalAmount, type, category_id: categoryId || null,
        date, payment_method: paymentMethod || null, notes: notes || null, receipt_url: receiptUrl || null,
        card_id: (paymentMethod === 'credit_card' && cardId) ? cardId : null,
      }, { onSuccess: onClose });
      return;
    }

    if (type === 'expense' && paymentMethod === 'credit_card' && cardId && isInstallment && selectedCard) {
      const numInstallments = parseInt(installments);
      if (isNaN(numInstallments) || numInstallments < 2) {
        toast.error('Número de parcelas inválido (mínimo 2)');
        return;
      }
      const installmentAmount = Math.round((totalAmount / numInstallments) * 100) / 100;

      // All installments keep the SAME purchase date
      const txList = Array.from({ length: numInstallments }, (_, i) => ({
        user_id: user!.id,
        description: `${description} (${i + 1}/${numInstallments}x)`,
        amount: installmentAmount,
        type: 'expense',
        category_id: categoryId || null,
        date, // same purchase date
        payment_method: 'credit_card',
        notes: notes || null,
        receipt_url: i === 0 ? (receiptUrl || null) : null,
        card_id: cardId,
        installment_index: i + 1,
        installment_total: numInstallments,
      }));

      bulkMut.mutate(txList);
      return;
    }

    create.mutate({
      description, amount: totalAmount, type, category_id: categoryId || null,
      date, payment_method: paymentMethod || null, notes: notes || null, receipt_url: receiptUrl || null,
      card_id: (paymentMethod === 'credit_card' && cardId) ? cardId : null,
    }, { onSuccess: onClose });
  };

  const isSaving = create.isPending || update.isPending || bulkMut.isPending;
  const showInstallmentSection = !isEditing && type === 'expense' && paymentMethod === 'credit_card' && !!cardId;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>Descrição</Label>
        <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Ex: Salário, Mercado..." className="bg-secondary border-border" required />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Valor {isInstallment ? '(total)' : ''}</Label>
          <Input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0,00" className="bg-secondary border-border" required />
        </div>
        <div className="space-y-2">
          <Label>Data da compra</Label>
          <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="bg-secondary border-border" required />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Tipo</Label>
          <Select value={type} onValueChange={(v) => { setType(v); if (v !== 'expense') setIsInstallment(false); }}>
            <SelectTrigger className="bg-secondary border-border"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="income">Receita</SelectItem>
              <SelectItem value="expense">Despesa</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Categoria</Label>
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger className="bg-secondary border-border"><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>
              {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.icon} {c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-2">
        <Label>Forma de Pagamento</Label>
        <Select value={paymentMethod} onValueChange={(v) => { setPaymentMethod(v); if (v !== 'credit_card') { setCardId(''); setIsInstallment(false); } }}>
          <SelectTrigger className="bg-secondary border-border"><SelectValue placeholder="Selecione" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="pix">PIX</SelectItem>
            <SelectItem value="credit_card">Cartão de Crédito</SelectItem>
            <SelectItem value="debit_card">Cartão de Débito</SelectItem>
            <SelectItem value="cash">Dinheiro</SelectItem>
            <SelectItem value="transfer">Transferência</SelectItem>
          </SelectContent>
        </Select>
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
              <Button type="button" size="sm" variant={isInstallment ? 'default' : 'outline'}
                onClick={() => setIsInstallment(true)} className={isInstallment ? 'gradient-primary' : ''}>
                Sim
              </Button>
              <Button type="button" size="sm" variant={!isInstallment ? 'default' : 'outline'}
                onClick={() => setIsInstallment(false)} className={!isInstallment ? 'gradient-primary' : ''}>
                Não
              </Button>
            </div>
          </div>
          {isInstallment && (
            <div className="space-y-2">
              <Label>Número de parcelas</Label>
              <Input type="number" min="2" max="48" value={installments}
                onChange={e => setInstallments(e.target.value)} className="bg-secondary border-border" required />
              {amount && !isNaN(parseFloat(amount)) && parseInt(installments) >= 2 && selectedCard && (
                <p className="text-xs text-muted-foreground">
                  💡 {installments}x de <strong>{formatCurrency(Math.round((parseFloat(amount) / parseInt(installments)) * 100) / 100)}</strong>
                  {' '}— 1ª parcela na fatura de <strong>{getFirstInstallmentInvoiceMonth(date, selectedCard.closing_day)}</strong>
                </p>
              )}
            </div>
          )}
        </div>
      )}

      <div className="space-y-2">
        <Label>Observações</Label>
        <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notas opcionais..." className="bg-secondary border-border" rows={2} />
      </div>
      <div className="space-y-2">
        <Label>Comprovante</Label>
        {receiptUrl ? (
          <div className="flex items-center gap-2">
            <span className="text-primary text-sm">✅ Comprovante anexado</span>
            <Button type="button" variant="ghost" size="sm" onClick={() => setReceiptUrl('')} className="text-xs">Remover</Button>
          </div>
        ) : (
          <Input type="file" accept="image/*,.pdf" disabled={uploading}
            onChange={e => e.target.files?.[0] && handleReceiptUpload(e.target.files[0])}
            className="bg-secondary border-border" />
        )}
        {uploading && <p className="text-xs text-muted-foreground">Enviando...</p>}
      </div>
      <Button type="submit" className="w-full gradient-primary" disabled={isSaving}>
        {isSaving ? 'Salvando...' : isEditing ? 'Atualizar' : isInstallment ? `Criar ${installments} parcelas` : 'Adicionar'}
      </Button>
    </form>
  );
}

export default function Transactions() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [previewReceipt, setPreviewReceipt] = useState<string | null>(null);

  const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const endDate = `${year}-${String(month + 1).padStart(2, '0')}-${new Date(year, month + 1, 0).getDate()}`;

  const { data: transactions = [], isLoading } = useTransactions({
    type: filterType !== 'all' ? filterType : undefined,
    startDate,
    endDate,
  });
  const { data: categories = [] } = useCategories();
  const deleteTransaction = useDeleteTransaction();

  const filtered = transactions.filter((t: any) => {
    if (search && !t.description.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterCategory !== 'all' && t.category_id !== filterCategory) return false;
    return true;
  });

  const totalIncome = filtered.filter((t: any) => t.type === 'income').reduce((s: number, t: any) => s + Number(t.amount), 0);
  const totalExpense = filtered.filter((t: any) => t.type === 'expense').reduce((s: number, t: any) => s + Number(t.amount), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Transações</h1>
          <p className="text-sm text-muted-foreground">Gerencie suas movimentações financeiras</p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <MonthSelector month={month} year={year} onChange={(m, y) => { setMonth(m); setYear(y); }} />
          <Dialog open={showCreate} onOpenChange={setShowCreate}>
            <DialogTrigger asChild>
              <Button className="gradient-primary gap-2"><Plus className="w-4 h-4" /> <span className="hidden sm:inline">Nova Transação</span></Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Nova Transação</DialogTitle></DialogHeader>
              <TransactionDialog onClose={() => setShowCreate(false)} />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <Card className="p-3 sm:p-4 bg-card border-border">
          <p className="text-xs text-muted-foreground">Receitas</p>
          <p className="text-base sm:text-lg font-bold text-income">{formatCurrency(totalIncome)}</p>
        </Card>
        <Card className="p-3 sm:p-4 bg-card border-border">
          <p className="text-xs text-muted-foreground">Despesas</p>
          <p className="text-base sm:text-lg font-bold text-expense">{formatCurrency(totalExpense)}</p>
        </Card>
        <Card className="p-3 sm:p-4 bg-card border-border">
          <p className="text-xs text-muted-foreground">Saldo</p>
          <p className={`text-base sm:text-lg font-bold ${totalIncome - totalExpense >= 0 ? 'text-income' : 'text-expense'}`}>{formatCurrency(totalIncome - totalExpense)}</p>
        </Card>
      </div>

      <div className="flex gap-2 sm:gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[160px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10 bg-secondary border-border" />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-[120px] sm:w-[140px] bg-secondary border-border"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="income">Receitas</SelectItem>
            <SelectItem value="expense">Despesas</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-[140px] sm:w-[180px] bg-secondary border-border"><SelectValue placeholder="Categoria" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas categorias</SelectItem>
            {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.icon} {c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card className="bg-card border-border overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">Carregando...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 sm:p-12 text-center text-muted-foreground">
            <p className="text-lg">Nenhuma transação encontrada</p>
            <p className="text-sm mt-1">Ajuste os filtros ou adicione uma nova transação</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((t: any) => (
              <div key={t.id} className="flex items-center justify-between px-4 sm:px-5 py-3 sm:py-4 hover:bg-secondary/50 transition-colors gap-2">
                <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                  <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0 ${t.type === 'income' ? 'bg-income/15' : 'bg-expense/15'}`}>
                    {t.type === 'income' ? <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-income" /> : <TrendingDown className="w-4 h-4 sm:w-5 sm:h-5 text-expense" />}
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-foreground text-sm sm:text-base truncate">{t.description}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {formatDate(t.date)} · {(t as any).categories?.name || 'Sem categoria'}
                      {t.payment_method === 'credit_card' && ' · 💳 Cartão'}
                      {t.payment_method && t.payment_method !== 'credit_card' && ` · ${t.payment_method}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                  <span className={`font-mono font-semibold text-sm ${t.type === 'income' ? 'text-income' : 'text-expense'}`}>
                    {t.type === 'income' ? '+' : '-'}{formatCurrency(Number(t.amount))}
                  </span>
                  {(t as any).receipt_url && (
                    <Button variant="ghost" size="icon" onClick={() => setPreviewReceipt((t as any).receipt_url)} className="h-8 w-8">
                      <FileText className="w-3.5 h-3.5 text-primary" />
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" onClick={() => setEditing(t)} className="text-muted-foreground hover:text-foreground h-8 w-8">
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => deleteTransaction.mutate(t.id)} className="text-muted-foreground hover:text-destructive h-8 w-8 hidden sm:flex">
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Dialog open={!!editing} onOpenChange={open => !open && setEditing(null)}>
        <DialogContent className="bg-card border-border max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Editar Transação</DialogTitle></DialogHeader>
          {editing && <TransactionDialog transaction={editing} onClose={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>

      <ReceiptPreviewDialog url={previewReceipt} onClose={() => setPreviewReceipt(null)} />
    </div>
  );
}