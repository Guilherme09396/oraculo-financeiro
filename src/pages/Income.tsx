import { useState } from 'react';
import { useTransactions, useCreateTransaction, useDeleteTransaction, useUpdateTransaction } from '@/hooks/useTransactions';
import { useCategories } from '@/hooks/useCategories';
import { useAuth } from '@/lib/auth';
import { formatCurrency, formatDate } from '@/lib/format';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import MonthSelector from '@/components/MonthSelector';
import ReceiptPreviewDialog from '@/components/ReceiptPreviewDialog';
import ThirdPartyField from '@/components/ThirdPartyField';
import PersonFilter from '@/components/PersonFilter';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import { Plus, TrendingUp, Pencil, Trash2, FileText, Search, X } from 'lucide-react';
import { toast } from 'sonner';

function IncomeDialog({ transaction, onClose }: { transaction?: any; onClose: () => void }) {
  const { user } = useAuth();
  const isEditing = !!transaction;
  const [description, setDescription] = useState(transaction?.description || '');
  const [amount, setAmount] = useState(transaction ? String(transaction.amount) : '');
  const [categoryId, setCategoryId] = useState(transaction?.category_id || '');
  const [date, setDate] = useState(transaction?.date || new Date().toLocaleDateString('en-CA'));
  const [paymentMethod, setPaymentMethod] = useState(transaction?.payment_method || '');
  const [receiptUrl, setReceiptUrl] = useState((transaction as any)?.receipt_url || '');
  const [uploading, setUploading] = useState(false);
  const [isThirdParty, setIsThirdParty] = useState(transaction?.is_third_party || false);
  const [thirdPartyName, setThirdPartyName] = useState(transaction?.third_party_name || '');
  const create = useCreateTransaction();
  const update = useUpdateTransaction();
  const { data: categories = [] } = useCategories('income');

  const handleUpload = async (file: File) => {
    if (!user) return;
    setUploading(true);
    const path = `${user.id}/${crypto.randomUUID()}.${file.name.split('.').pop()}`;
    const { error } = await supabase.storage.from('receipts').upload(path, file);
    if (error) { toast.error('Erro ao enviar'); setUploading(false); return; }
    setReceiptUrl(supabase.storage.from('receipts').getPublicUrl(path).data.publicUrl);
    setUploading(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data: any = {
      description,
      amount: parseFloat(amount),
      type: 'income',
      category_id: categoryId || null,
      date,
      payment_method: paymentMethod || null,
      notes: null,
      receipt_url: receiptUrl || null,
      is_third_party: isThirdParty,
      third_party_name: isThirdParty ? thirdPartyName : null,
    };
    if (isEditing) update.mutate({ id: transaction.id, ...data }, { onSuccess: onClose });
    else create.mutate(data, { onSuccess: onClose });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2"><Label>Descrição</Label><Input value={description} onChange={e => setDescription(e.target.value)} className="bg-secondary border-border" required /></div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2"><Label>Valor</Label><Input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} className="bg-secondary border-border" required /></div>
        <div className="space-y-2"><Label>Data</Label><Input type="date" value={date} onChange={e => setDate(e.target.value)} className="bg-secondary border-border" required /></div>
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
          <Select value={paymentMethod} onValueChange={setPaymentMethod}>
            <SelectTrigger className="bg-secondary border-border"><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pix">PIX</SelectItem><SelectItem value="transfer">Transferência</SelectItem><SelectItem value="cash">Dinheiro</SelectItem>
            </SelectContent>
          </Select>
        </div>
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
      <ThirdPartyField
        type="income"
        isThirdParty={isThirdParty}
        thirdPartyName={thirdPartyName}
        onIsThirdPartyChange={setIsThirdParty}
        onThirdPartyNameChange={setThirdPartyName}
      />
      <Button type="submit" className="w-full gradient-primary" disabled={create.isPending || update.isPending}>
        {(create.isPending || update.isPending) ? 'Salvando...' : isEditing ? 'Atualizar' : 'Adicionar'}
      </Button>
    </form>
  );
}

export default function Income() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterPerson, setFilterPerson] = useState('all');
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [previewReceipt, setPreviewReceipt] = useState<string | null>(null);

  const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const endDate = `${year}-${String(month + 1).padStart(2, '0')}-${new Date(year, month + 1, 0).getDate()}`;

  const { data: transactions = [], isLoading } = useTransactions({ type: 'income', startDate, endDate });
  const { data: categories = [] } = useCategories('income');
  const deleteTransaction = useDeleteTransaction();

  const thirdPartyNames = Array.from(
    new Set(
      transactions
        .filter((t: any) => t.is_third_party && t.third_party_name)
        .map((t: any) => t.third_party_name as string),
    ),
  ).sort();

  const filtered = transactions.filter((t: any) => {
    if (search) {
      const term = search.toLowerCase();
      const matchDescription = t.description.toLowerCase().includes(term);
      const matchPerson = (t.third_party_name || '').toLowerCase().includes(term);
      if (!matchDescription && !matchPerson) return false;
    }
    if (filterCategory !== 'all' && t.category_id !== filterCategory) return false;
    if (filterPerson === 'mine') {
      if (t.is_third_party) return false;
    } else if (filterPerson === 'third_party') {
      if (!t.is_third_party) return false;
    } else if (filterPerson !== 'all') {
      if (t.third_party_name !== filterPerson) return false;
    }
    return true;
  });

  const total = filtered.reduce((s: number, t: any) => s + Number(t.amount), 0);
  const hasActiveFilters = filterPerson !== 'all' || filterCategory !== 'all' || search !== '';

  function clearAllFilters() {
    setSearch('');
    setFilterCategory('all');
    setFilterPerson('all');
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Receitas</h1>
          <p className="text-sm text-muted-foreground">Todas as suas entradas financeiras</p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <MonthSelector month={month} year={year} onChange={(m, y) => { setMonth(m); setYear(y); }} />
          <Dialog open={showCreate} onOpenChange={setShowCreate}>
            <DialogTrigger asChild><Button className="gradient-primary gap-2"><Plus className="w-4 h-4" /> <span className="hidden sm:inline">Nova Receita</span></Button></DialogTrigger>
            <DialogContent className="bg-card border-border max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Nova Receita</DialogTitle></DialogHeader>
              <IncomeDialog onClose={() => setShowCreate(false)} />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card className="p-4 sm:p-5 bg-card border-border">
        <p className="text-sm text-muted-foreground">Total de Receitas</p>
        <p className="text-2xl sm:text-3xl font-bold text-income mt-1">{formatCurrency(total)}</p>
        <p className="text-sm text-muted-foreground mt-1">{filtered.length} lançamento(s)</p>
      </Card>

      {/* Filtros */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por descrição ou pessoa..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 bg-secondary border-border w-full"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="bg-secondary border-border text-xs sm:text-sm h-9"><SelectValue placeholder="Categoria" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas categorias</SelectItem>
              {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.icon} {c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <PersonFilter value={filterPerson} onChange={setFilterPerson} thirdPartyNames={thirdPartyNames} />
        </div>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" className="text-xs text-muted-foreground h-7 px-2 gap-1" onClick={clearAllFilters}>
            <X className="w-3 h-3" /> Limpar filtros
          </Button>
        )}
      </div>

      <Card className="bg-card border-border overflow-hidden">
        {isLoading ? <div className="p-8 text-center text-muted-foreground">Carregando...</div>
        : filtered.length === 0 ? <div className="p-8 sm:p-12 text-center text-muted-foreground">Nenhuma receita neste período</div>
        : <div className="divide-y divide-border">
            {filtered.map((t: any) => (
              <div key={t.id} className="flex items-center justify-between px-4 sm:px-5 py-3 sm:py-4 hover:bg-secondary/50 transition-colors gap-2">
                <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                  <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-income/15 flex items-center justify-center shrink-0"><TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-income" /></div>
                  <div className="min-w-0">
                    <p className="font-medium text-foreground text-sm sm:text-base truncate">{t.description}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {formatDate(t.date)} · {(t as any).categories?.name || 'Sem categoria'}
                      {t.is_third_party && <> · 👤 {t.third_party_name}</>}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                  <span className="font-mono font-semibold text-income text-sm">+{formatCurrency(Number(t.amount))}</span>
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
        <DialogContent className="bg-card border-border max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Editar Receita</DialogTitle></DialogHeader>
          {editing && <IncomeDialog transaction={editing} onClose={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>

      <ReceiptPreviewDialog url={previewReceipt} onClose={() => setPreviewReceipt(null)} />
    </div>
  );
}
