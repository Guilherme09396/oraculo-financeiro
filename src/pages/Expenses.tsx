import { useState } from 'react';
import { useTransactions, useCreateTransaction, useDeleteTransaction, useUpdateTransaction } from '@/hooks/useTransactions';
import { useCategories } from '@/hooks/useCategories';
import { useAuth } from '@/lib/auth';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatCurrency, formatDate } from '@/lib/format';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import MonthSelector from '@/components/MonthSelector';
import ReceiptPreviewDialog from '@/components/ReceiptPreviewDialog';
import InvoiceImport from '@/pages/InvoiceImport';
import ExpensePhotoImport from '@/pages/ExpensePhotoImport';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import {
  Plus, TrendingDown, Pencil, Trash2, FileText, FileUp, Camera, Search, X
} from 'lucide-react';
import { toast } from 'sonner';
import { calculateInstallmentDates, splitInstallmentAmount } from '@/lib/installments';

const PAYMENT_METHOD_LABELS = {
  pix: 'PIX',
  credit_card: 'Crédito',
  debit_card: 'Débito',
  cash: 'Dinheiro',
  transfer: 'Transferência',
  boleto: 'Boleto',
};

function ExpenseDialog({ transaction, onClose }: { transaction?: any; onClose: () => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const isEditing = !!transaction;
  const [description, setDescription] = useState(transaction?.description || '');
  const [amount, setAmount] = useState(transaction ? String(transaction.amount) : '');
  const [categoryId, setCategoryId] = useState(transaction?.category_id || '');
  const [date, setDate] = useState(transaction?.date || new Date().toLocaleDateString('en-CA'));
  const [paymentMethod, setPaymentMethod] = useState(transaction?.payment_method || '');
  const [cardId, setCardId] = useState(transaction?.card_id || '');
  const [receiptUrl, setReceiptUrl] = useState(transaction?.receipt_url || '');
  const [uploading, setUploading] = useState(false);
  const [isThirdParty, setIsThirdParty] = useState(transaction?.is_third_party || false);
  const [thirdPartyName, setThirdPartyName] = useState(transaction?.third_party_name || '');
  const [isInstallment, setIsInstallment] = useState(false);
  const [totalInstallments, setTotalInstallments] = useState('2');
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

  const selectedCard = cards.find((c) => c.id === cardId);
  const canInstallment = !isEditing && paymentMethod === 'credit_card' && !!selectedCard;

  const handleUpload = async (file) => {
    if (!user) return;
    setUploading(true);
    const path = `${user.id}/${crypto.randomUUID()}.${file.name.split('.').pop()}`;
    const { error } = await supabase.storage.from('receipts').upload(path, file);
    if (error) { toast.error('Erro ao enviar'); setUploading(false); return; }
    setReceiptUrl(supabase.storage.from('receipts').getPublicUrl(path).data.publicUrl);
    setUploading(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const baseData = {
      description,
      type: 'expense',
      category_id: categoryId || null,
      payment_method: paymentMethod || null,
      notes: null,
      receipt_url: receiptUrl || null,
      card_id: (paymentMethod === 'credit_card' && cardId) ? cardId : null,
      is_third_party: isThirdParty,
      third_party_name: isThirdParty ? thirdPartyName : null,
    };

    if (canInstallment && isInstallment) {
      const n = parseInt(totalInstallments);
      if (!n || n < 2) { toast.error('Número de parcelas inválido'); return; }
      const total = parseFloat(amount);
      if (!total || total <= 0) { toast.error('Valor inválido'); return; }
      if (!user) return;
      try {
        const dates = calculateInstallmentDates(date, selectedCard.closing_day, selectedCard.due_day, n);
        const amounts = splitInstallmentAmount(total, n);
        const groupId = crypto.randomUUID();
        const rows = dates.map((d, i) => {
          const [yy, mm] = d.split('-').map(Number);
          return {
            ...baseData,
            user_id: user.id,
            description: `${description} (${i + 1}/${n})`,
            amount: amounts[i],
            date: d,
            installment_number: i + 1,
            installment_total: n,
            group_id: groupId,
            invoice_month: mm,
            invoice_year: yy,
          };
        });
        const { error } = await supabase.from('transactions').insert(rows as any);
        if (error) throw error;
        const firstDate = dates[0].split('-').reverse().join('/');
        const lastDate = dates[n - 1].split('-').reverse().join('/');
        toast.success(`${n} parcelas cadastradas! 1ª em ${firstDate}, última em ${lastDate}.`);
        qc.invalidateQueries({ queryKey: ['transactions'] });
        qc.invalidateQueries({ queryKey: ['card_transactions'] });
        onClose();
      } catch (err: any) {
        toast.error(err.message || 'Erro ao cadastrar parcelas');
      }
      return;
    }

    const data = {
      ...baseData,
      amount: parseFloat(amount),
      date,
    };
    if (isEditing) update.mutate({ id: transaction.id, ...(data as any) }, { onSuccess: onClose });
    else create.mutate(data as any, { onSuccess: onClose });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>Descrição</Label>
        <Input value={description} onChange={e => setDescription(e.target.value)} className="bg-secondary border-border" required />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Valor</Label>
          <Input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} className="bg-secondary border-border" required />
        </div>
        <div className="space-y-2">
          <Label>Data</Label>
          <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="bg-secondary border-border" required />
        </div>
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
          <Select value={paymentMethod} onValueChange={(v) => { setPaymentMethod(v); if (v !== 'credit_card') setCardId(''); }}>
            <SelectTrigger className="bg-secondary border-border"><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pix">PIX</SelectItem>
              <SelectItem value="credit_card">Cartão de Crédito</SelectItem>
              <SelectItem value="debit_card">Cartão de Débito</SelectItem>
              <SelectItem value="cash">Dinheiro</SelectItem>
              <SelectItem value="transfer">Transferência</SelectItem>
              <SelectItem value="boleto">Boleto</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      {paymentMethod === 'credit_card' && cards && cards.length > 0 && (
        <div className="space-y-2">
          <Label>Qual cartão?</Label>
          <Select value={cardId} onValueChange={setCardId}>
            <SelectTrigger className="bg-secondary border-border"><SelectValue placeholder="Selecione o cartão" /></SelectTrigger>
            <SelectContent>{cards.map((c) => <SelectItem key={c.id} value={c.id}>💳 {c.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      )}
      <div className="space-y-2">
        <Label>Comprovante</Label>
        {receiptUrl ? (
          <div className="flex items-center gap-2">
            <span className="text-primary text-sm">✅ Comprovante anexado</span>
            <Button type="button" variant="ghost" size="sm" onClick={() => setReceiptUrl('')}>Remover</Button>
          </div>
        ) : (
          <Input type="file" accept="image/*,.pdf" disabled={uploading} onChange={e => e.target.files?.[0] && handleUpload(e.target.files[0])} className="bg-secondary border-border" />
        )}
        {uploading && <p className="text-xs text-muted-foreground">Enviando...</p>}
      </div>
      <div className="space-y-2">
        <Label>Essa despesa é de outra pessoa?</Label>
        <Select value={isThirdParty ? 'yes' : 'no'} onValueChange={(v) => setIsThirdParty(v === 'yes')}>
          <SelectTrigger className="bg-secondary border-border"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="no">Não</SelectItem>
            <SelectItem value="yes">Sim</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {isThirdParty && (
        <div className="space-y-2">
          <Label>Nome da pessoa</Label>
          <Input value={thirdPartyName} onChange={e => setThirdPartyName(e.target.value)} placeholder="Ex: João..." className="bg-secondary border-border" required />
        </div>
      )}
      <Button type="submit" className="w-full gradient-primary" disabled={create.isPending || update.isPending}>
        {(create.isPending || update.isPending) ? 'Salvando...' : isEditing ? 'Atualizar' : 'Adicionar'}
      </Button>
    </form>
  );
}

export default function Expenses() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterPaymentMethod, setFilterPaymentMethod] = useState('all');
  const [filterPerson, setFilterPerson] = useState('all');
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState(null);
  const [previewReceipt, setPreviewReceipt] = useState(null);
  const [showInvoiceImport, setShowInvoiceImport] = useState(false);
  const [showPhotoImport, setShowPhotoImport] = useState(false);

  const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const endDate = `${year}-${String(month + 1).padStart(2, '0')}-${new Date(year, month + 1, 0).getDate()}`;

  const { data: transactions = [], isLoading } = useTransactions({ type: 'expense', startDate, endDate });
  const { data: categories = [] } = useCategories('expense');
  const deleteTransaction = useDeleteTransaction();

  const thirdPartyNames = Array.from(
    new Set(
      transactions
        .filter((t) => t.is_third_party && t.third_party_name)
        .map((t) => t.third_party_name),
    ),
  ).sort();

  const filtered = transactions.filter((t) => {
    if (search) {
      const term = search.toLowerCase();
      const matchDescription = t.description.toLowerCase().includes(term);
      const matchPerson = (t.third_party_name || '').toLowerCase().includes(term);
      if (!matchDescription && !matchPerson) return false;
    }
    if (filterCategory !== 'all' && t.category_id !== filterCategory) return false;
    if (filterPaymentMethod !== 'all' && t.payment_method !== filterPaymentMethod) return false;
    if (filterPerson === 'mine') {
      if (t.is_third_party) return false;
    } else if (filterPerson === 'third_party') {
      if (!t.is_third_party) return false;
    } else if (filterPerson !== 'all') {
      if (t.third_party_name !== filterPerson) return false;
    }
    return true;
  });

  const total = filtered.reduce((s, t) => s + Number(t.amount), 0);
  const hasActiveFilters = filterPaymentMethod !== 'all' || filterPerson !== 'all' || filterCategory !== 'all' || search !== '';

  function clearAllFilters() {
    setSearch('');
    setFilterCategory('all');
    setFilterPaymentMethod('all');
    setFilterPerson('all');
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Despesas</h1>
          <p className="text-sm text-muted-foreground">Todos os seus gastos</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <MonthSelector month={month} year={year} onChange={(m, y) => { setMonth(m); setYear(y); }} />

          <Dialog open={showInvoiceImport} onOpenChange={setShowInvoiceImport}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5 text-xs sm:text-sm">
                <FileUp className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span className="hidden sm:inline">Importar Fatura</span>
                <span className="sm:hidden">Fatura</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border w-[95vw] max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <FileUp className="w-4 h-4 text-primary" /> Importar Fatura do Cartão
                </DialogTitle>
              </DialogHeader>
              <InvoiceImport />
            </DialogContent>
          </Dialog>

          <Dialog open={showPhotoImport} onOpenChange={setShowPhotoImport}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5 text-xs sm:text-sm">
                <Camera className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span className="hidden sm:inline">Importar por Foto</span>
                <span className="sm:hidden">Foto</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border w-[95vw] max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Camera className="w-4 h-4 text-primary" /> Importar Despesas por Foto
                </DialogTitle>
              </DialogHeader>
              <ExpensePhotoImport />
            </DialogContent>
          </Dialog>

          <Dialog open={showCreate} onOpenChange={setShowCreate}>
            <DialogTrigger asChild>
              <Button className="gradient-primary gap-1.5 text-xs sm:text-sm" size="sm">
                <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span className="hidden sm:inline">Nova </span>Despesa
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Nova Despesa</DialogTitle></DialogHeader>
              <ExpenseDialog onClose={() => setShowCreate(false)} />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Card total */}
      <Card className="p-4 sm:p-5 bg-card border-border">
        <p className="text-sm text-muted-foreground">Total de Despesas</p>
        <p className="text-2xl sm:text-3xl font-bold text-expense mt-1">{formatCurrency(total)}</p>
        <p className="text-sm text-muted-foreground mt-1">{filtered.length} lançamento(s)</p>
      </Card>

      {/* Filtros — mesmo padrão da página de Transações */}
      <div className="space-y-2">
        {/* Busca full width */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por descrição ou pessoa..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 bg-secondary border-border w-full"
          />
        </div>

        {/* 3 filtros em grid: 2 col mobile / 3 col desktop */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="bg-secondary border-border text-xs sm:text-sm h-9">
              <SelectValue placeholder="Categoria" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas categorias</SelectItem>
              {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.icon} {c.name}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={filterPaymentMethod} onValueChange={setFilterPaymentMethod}>
            <SelectTrigger className="bg-secondary border-border text-xs sm:text-sm h-9">
              <SelectValue placeholder="Pagamento" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos pagamentos</SelectItem>
              <SelectItem value="pix">PIX</SelectItem>
              <SelectItem value="credit_card">Cartão de Crédito</SelectItem>
              <SelectItem value="debit_card">Cartão de Débito</SelectItem>
              <SelectItem value="cash">Dinheiro</SelectItem>
              <SelectItem value="transfer">Transferência</SelectItem>
              <SelectItem value="boleto">Boleto</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filterPerson} onValueChange={setFilterPerson}>
            <SelectTrigger className="bg-secondary border-border text-xs sm:text-sm h-9 col-span-2 sm:col-span-1">
              <SelectValue placeholder="Responsável" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="mine">Minhas</SelectItem>
              <SelectItem value="third_party">De terceiros</SelectItem>
              {thirdPartyNames.length > 0 && (
                <>
                  <div className="px-2 py-1.5 text-xs text-muted-foreground font-medium">Por pessoa</div>
                  {thirdPartyNames.map((name) => (
                    <SelectItem key={name} value={name}>👤 {name}</SelectItem>
                  ))}
                </>
              )}
            </SelectContent>
          </Select>
        </div>

        {/* Botão limpar */}
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground h-7 px-2 gap-1"
            onClick={clearAllFilters}
          >
            <X className="w-3 h-3" /> Limpar filtros
          </Button>
        )}
      </div>

      {/* Lista de despesas */}
      <Card className="bg-card border-border overflow-hidden">
        {isLoading
          ? <div className="p-8 text-center text-muted-foreground">Carregando...</div>
          : filtered.length === 0
            ? <div className="p-8 sm:p-12 text-center text-muted-foreground">Nenhuma despesa encontrada</div>
            : (
              <div className="divide-y divide-border">
                {filtered.map((t) => (
                  <div key={t.id} className="flex items-center justify-between px-4 sm:px-5 py-3 sm:py-4 hover:bg-secondary/50 transition-colors gap-2">
                    <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                      <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-expense/15 flex items-center justify-center shrink-0">
                        <TrendingDown className="w-4 h-4 sm:w-5 sm:h-5 text-expense" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-foreground text-sm sm:text-base truncate">{t.description}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {formatDate(t.date)} · {t.categories?.name || 'Sem categoria'}
                          {t.payment_method && <> · {PAYMENT_METHOD_LABELS[t.payment_method] || t.payment_method}</>}
                          {t.is_third_party && <> · 👤 {t.third_party_name}</>}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                      <span className="font-mono font-semibold text-expense text-sm">-{formatCurrency(Number(t.amount))}</span>
                      {t.receipt_url && (
                        <Button variant="ghost" size="icon" onClick={() => setPreviewReceipt(t.receipt_url)} className="h-8 w-8" title="Ver comprovante">
                          <FileText className="w-3.5 h-3.5 text-primary" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" onClick={() => setEditing(t)} className="h-8 w-8">
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => deleteTransaction.mutate(t.id)} className="h-8 w-8 hover:text-destructive hidden sm:flex">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )
        }
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