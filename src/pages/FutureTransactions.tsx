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
import MonthSelector from '@/components/MonthSelector';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import { Plus, Trash2, CheckCircle, Clock, AlertCircle, CalendarClock, Pencil, Undo2, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

function useFutureTransactions() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['future_transactions'],
    queryFn: async () => {
      const { data, error } = await supabase.from('future_transactions')
        .select('*, categories(name, icon, color)').order('due_date', { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });
}

function FutureDialog({ item, onClose }: { item?: any; onClose: () => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: categories = [] } = useCategories();
  const isEditing = !!item;
  const [desc, setDesc] = useState(item?.description || '');
  const [amount, setAmount] = useState(item ? String(item.amount) : '');
  const [type, setType] = useState(item?.type || 'expense');
  const [categoryId, setCategoryId] = useState(item?.category_id || '');
  const [dueDate, setDueDate] = useState(item?.due_date || new Date().toISOString().split('T')[0]);
  const [isRecurring, setIsRecurring] = useState(item?.is_recurring || false);
  const [recurringPeriod, setRecurringPeriod] = useState(item?.recurring_period || 'monthly');
  const [isInstallment, setIsInstallment] = useState(false);
  const [totalInstallments, setTotalInstallments] = useState('');
  const [receiptUrl, setReceiptUrl] = useState((item as any)?.receipt_url || '');
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (file: File) => {
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
      if (isEditing) {
        const { error } = await supabase.from('future_transactions').update({
          description: desc, amount: parseFloat(amount), type, category_id: categoryId || null,
          due_date: dueDate, is_recurring: isRecurring, recurring_period: isRecurring ? recurringPeriod : null,
          receipt_url: receiptUrl || null,
        } as any).eq('id', item.id);
        if (error) throw error;
      } else if (isInstallment && totalInstallments) {
        const total = parseInt(totalInstallments);
        const instAmount = parseFloat(amount) / total;
        const rows = Array.from({ length: total }, (_, i) => {
          const d = new Date(dueDate);
          d.setMonth(d.getMonth() + i);
          return {
            user_id: user!.id, description: desc, amount: instAmount, type,
            category_id: categoryId || null, due_date: d.toISOString().split('T')[0],
            is_installment: true, total_installments: total, current_installment: i + 1, status: 'pending',
          };
        });
        const { error } = await supabase.from('future_transactions').insert(rows);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('future_transactions').insert({
          user_id: user!.id, description: desc, amount: parseFloat(amount), type,
          category_id: categoryId || null, due_date: dueDate,
          is_recurring: isRecurring, recurring_period: isRecurring ? recurringPeriod : null, status: 'pending',
        });
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['future_transactions'] }); toast.success(isEditing ? 'Atualizado!' : 'Criado!'); onClose(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <form onSubmit={e => { e.preventDefault(); mut.mutate(); }} className="space-y-4">
      <div className="space-y-2"><Label>Descrição</Label><Input value={desc} onChange={e => setDesc(e.target.value)} className="bg-secondary border-border" required /></div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2"><Label>Valor {!isEditing && isInstallment ? '(total)' : ''}</Label><Input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} className="bg-secondary border-border" required /></div>
        <div className="space-y-2"><Label>Data Prevista</Label><Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="bg-secondary border-border" required /></div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Tipo</Label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="bg-secondary border-border"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="income">A Receber</SelectItem><SelectItem value="expense">A Pagar</SelectItem></SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Categoria</Label>
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger className="bg-secondary border-border"><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>{categories.map(c => <SelectItem key={c.id} value={c.id}>{c.icon} {c.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      {!isEditing && (
        <Card className="p-4 bg-secondary border-border space-y-4">
          <div className="flex items-center justify-between">
            <div><p className="text-sm font-medium text-foreground">Recorrente</p><p className="text-xs text-muted-foreground">Repete automaticamente</p></div>
            <Switch checked={isRecurring} onCheckedChange={c => { setIsRecurring(c); if (c) setIsInstallment(false); }} />
          </div>
          {isRecurring && (
            <Select value={recurringPeriod} onValueChange={setRecurringPeriod}>
              <SelectTrigger className="bg-card border-border"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="monthly">Mensal</SelectItem><SelectItem value="weekly">Semanal</SelectItem><SelectItem value="yearly">Anual</SelectItem></SelectContent>
            </Select>
          )}
          <div className="flex items-center justify-between">
            <div><p className="text-sm font-medium text-foreground">Parcelado</p><p className="text-xs text-muted-foreground">Dividir em parcelas</p></div>
            <Switch checked={isInstallment} onCheckedChange={c => { setIsInstallment(c); if (c) setIsRecurring(false); }} />
          </div>
          {isInstallment && <Input type="number" min="2" value={totalInstallments} onChange={e => setTotalInstallments(e.target.value)} placeholder="Número de parcelas" className="bg-card border-border" />}
        </Card>
      )}
      <div className="space-y-2">
        <Label>Comprovante</Label>
        {receiptUrl ? (
          <div className="flex items-center gap-2">
            <a href={receiptUrl} target="_blank" rel="noopener" className="text-primary text-sm underline flex items-center gap-1"><ExternalLink className="w-3 h-3" /> Ver</a>
            <Button type="button" variant="ghost" size="sm" onClick={() => setReceiptUrl('')}>Remover</Button>
          </div>
        ) : <Input type="file" accept="image/*,.pdf" disabled={uploading} onChange={e => e.target.files?.[0] && handleUpload(e.target.files[0])} className="bg-secondary border-border" />}
      </div>
      <Button type="submit" className="w-full gradient-primary" disabled={mut.isPending}>{mut.isPending ? 'Salvando...' : isEditing ? 'Atualizar' : 'Adicionar'}</Button>
    </form>
  );
}

export default function FutureTransactions() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());
  const qc = useQueryClient();
  const { data: items = [], isLoading } = useFutureTransactions();
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  const startOfMonth = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const endOfMonth = `${year}-${String(month + 1).padStart(2, '0')}-${new Date(year, month + 1, 0).getDate()}`;

  const monthItems = items.filter((i: any) => i.due_date >= startOfMonth && i.due_date <= endOfMonth);
  const pending = monthItems.filter((i: any) => i.status !== 'paid');
  const paid = monthItems.filter((i: any) => i.status === 'paid');

  const toggleStatus = useMutation({
    mutationFn: async ({ id, currentStatus }: { id: string; currentStatus: string }) => {
      const newStatus = currentStatus === 'paid' ? 'pending' : 'paid';
      const update: any = { status: newStatus };
      if (newStatus === 'paid') update.paid_at = new Date().toISOString().split('T')[0];
      else update.paid_at = null;
      const { error } = await supabase.from('future_transactions').update(update).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['future_transactions'] }); toast.success('Status atualizado!'); },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('future_transactions').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['future_transactions'] }); toast.success('Removido!'); },
  });

  const toReceive = pending.filter((i: any) => i.type === 'income').reduce((s: number, i: any) => s + Number(i.amount), 0);
  const toPay = pending.filter((i: any) => i.type === 'expense').reduce((s: number, i: any) => s + Number(i.amount), 0);

  const renderItem = (item: any, showToggle: boolean) => (
    <div key={item.id} className="flex items-center justify-between px-5 py-4 hover:bg-secondary/50 transition-colors">
      <div className="flex items-center gap-4">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${item.status === 'paid' ? 'bg-income/10' : 'bg-secondary'}`}>
          {item.status === 'paid' ? <CheckCircle className="w-5 h-5 text-income" /> : <CalendarClock className="w-5 h-5 text-muted-foreground" />}
        </div>
        <div>
          <p className="font-medium text-foreground">
            {item.description}
            {item.is_installment && ` (${item.current_installment}/${item.total_installments})`}
          </p>
          <p className="text-xs text-muted-foreground">
            {formatDate(item.due_date)} · {(item as any).categories?.name || 'Sem categoria'}
            {item.is_recurring && ' · 🔄'}
            {(item as any).receipt_url && ' · 📎'}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className={`font-mono font-semibold ${item.type === 'income' ? 'text-income' : 'text-expense'}`}>
          {item.type === 'income' ? '+' : '-'}{formatCurrency(Number(item.amount))}
        </span>
        <Button variant="ghost" size="icon" className="h-8 w-8" title={item.status === 'paid' ? 'Desfazer pagamento' : 'Marcar como pago'}
          onClick={() => toggleStatus.mutate({ id: item.id, currentStatus: item.status })}>
          {item.status === 'paid' ? <Undo2 className="w-3.5 h-3.5 text-muted-foreground" /> : <CheckCircle className="w-3.5 h-3.5 text-income" />}
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditing(item)}><Pencil className="w-3.5 h-3.5" /></Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-destructive" onClick={() => deleteMut.mutate(item.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Lançamentos Futuros</h1>
          <p className="text-muted-foreground">Gerencie suas contas e parcelas</p>
        </div>
        <div className="flex items-center gap-3">
          <MonthSelector month={month} year={year} onChange={(m, y) => { setMonth(m); setYear(y); }} />
          <Dialog open={showCreate} onOpenChange={setShowCreate}>
            <DialogTrigger asChild><Button className="gradient-primary gap-2"><Plus className="w-4 h-4" /> Novo</Button></DialogTrigger>
            <DialogContent className="bg-card border-border max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Novo Lançamento Futuro</DialogTitle></DialogHeader>
              <FutureDialog onClose={() => setShowCreate(false)} />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-5 bg-card border-border">
          <p className="text-sm text-muted-foreground">A Receber</p>
          <p className="text-2xl font-bold text-income mt-1">{formatCurrency(toReceive)}</p>
        </Card>
        <Card className="p-5 bg-card border-border">
          <p className="text-sm text-muted-foreground">A Pagar</p>
          <p className="text-2xl font-bold text-expense mt-1">{formatCurrency(toPay)}</p>
        </Card>
        <Card className="p-5 bg-card border-border">
          <p className="text-sm text-muted-foreground">Total no Mês</p>
          <p className="text-2xl font-bold text-foreground mt-1">{monthItems.length} lançamento(s)</p>
        </Card>
      </div>

      {/* Pending */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2"><Clock className="w-5 h-5" /> Pendentes ({pending.length})</h2>
        <Card className="bg-card border-border overflow-hidden">
          {isLoading ? <div className="p-8 text-center text-muted-foreground">Carregando...</div>
          : pending.length === 0 ? <div className="p-8 text-center text-muted-foreground">Nenhum lançamento pendente neste mês</div>
          : <div className="divide-y divide-border">{pending.map(i => renderItem(i, true))}</div>}
        </Card>
      </div>

      {/* Paid */}
      {paid.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2"><CheckCircle className="w-5 h-5 text-income" /> Pagos ({paid.length})</h2>
          <Card className="bg-card border-border overflow-hidden">
            <div className="divide-y divide-border">{paid.map(i => renderItem(i, true))}</div>
          </Card>
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={open => !open && setEditing(null)}>
        <DialogContent className="bg-card border-border max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Editar Lançamento</DialogTitle></DialogHeader>
          {editing && <FutureDialog item={editing} onClose={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
