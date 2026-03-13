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
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import { Plus, TrendingUp, Pencil, Trash2, FileText } from 'lucide-react';
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
    const data: any = { description, amount: parseFloat(amount), type: 'income', category_id: categoryId || null, date, payment_method: paymentMethod || null, notes: null, receipt_url: receiptUrl || null };
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
  const [filterCategory, setFilterCategory] = useState('all');
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [previewReceipt, setPreviewReceipt] = useState<string | null>(null);

  const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const endDate = `${year}-${String(month + 1).padStart(2, '0')}-${new Date(year, month + 1, 0).getDate()}`;

  const { data: transactions = [], isLoading } = useTransactions({ type: 'income', startDate, endDate });
  const { data: categories = [] } = useCategories('income');
  const deleteTransaction = useDeleteTransaction();

  const filtered = filterCategory === 'all' ? transactions : transactions.filter((t: any) => t.category_id === filterCategory);
  const total = filtered.reduce((s: number, t: any) => s + Number(t.amount), 0);

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

      <div className="flex items-center gap-4 flex-wrap">
        <Card className="p-4 sm:p-5 bg-card border-border flex-1 min-w-[200px]">
          <p className="text-sm text-muted-foreground">Total de Receitas</p>
          <p className="text-2xl sm:text-3xl font-bold text-income mt-1">{formatCurrency(total)}</p>
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
        : filtered.length === 0 ? <div className="p-8 sm:p-12 text-center text-muted-foreground">Nenhuma receita neste período</div>
        : <div className="divide-y divide-border">
            {filtered.map((t: any) => (
              <div key={t.id} className="flex items-center justify-between px-4 sm:px-5 py-3 sm:py-4 hover:bg-secondary/50 transition-colors gap-2">
                <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                  <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-income/15 flex items-center justify-center shrink-0"><TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-income" /></div>
                  <div className="min-w-0">
                    <p className="font-medium text-foreground text-sm sm:text-base truncate">{t.description}</p>
                    <p className="text-xs text-muted-foreground truncate">{formatDate(t.date)} · {(t as any).categories?.name || 'Sem categoria'}</p>
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
