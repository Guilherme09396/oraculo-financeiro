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
import ReceiptPreviewDialog from '@/components/ReceiptPreviewDialog';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import { Plus, Trash2, CheckCircle, Clock, CalendarClock, Pencil, Undo2, FileText, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import ThirdPartyField from '@/components/ThirdPartyField';
import PersonFilter from '@/components/PersonFilter';

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

// Cascade scope: 'single' | 'all' | 'this_and_future'
type CascadeScope = 'single' | 'all' | 'this_and_future';

function CascadeChoiceDialog({ item, onChoice, onClose }: { item: any; onChoice: (scope: CascadeScope) => void; onClose: () => void }) {
  const isInstallment = item.is_installment;
  const label = isInstallment ? 'parcela' : 'recorrência';
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        <strong className="text-foreground">{item.description}</strong> faz parte de uma {label}. Como deseja aplicar a alteração?
      </p>
      <div className="space-y-2">
        <Button variant="outline" className="w-full justify-start" onClick={() => onChoice('single')}>
          Somente este lançamento
        </Button>
        <Button variant="outline" className="w-full justify-start" onClick={() => onChoice('this_and_future')}>
          Este e todos os futuros
        </Button>
        <Button variant="outline" className="w-full justify-start" onClick={() => onChoice('all')}>
          Todos os lançamentos do grupo
        </Button>
      </div>
      <Button variant="ghost" className="w-full" onClick={onClose}>Cancelar</Button>
    </div>
  );
}

function FutureDialog({ item, onClose, cascadeScope }: { item?: any; onClose: () => void; cascadeScope?: CascadeScope }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: categories = [] } = useCategories();
  const isEditing = !!item;
  const [desc, setDesc] = useState(item?.description || '');
  const [amount, setAmount] = useState(item ? String(item.amount) : '');
  const [type, setType] = useState(item?.type || 'expense');
  const [categoryId, setCategoryId] = useState(item?.category_id || '');
  const [dueDate, setDueDate] = useState(item?.due_date || new Date().toLocaleDateString('en-CA'));
  const [isRecurring, setIsRecurring] = useState(item?.is_recurring || false);
  const [recurringPeriod, setRecurringPeriod] = useState(item?.recurring_period || 'monthly');
  const [isInstallment, setIsInstallment] = useState(false);
  const [totalInstallments, setTotalInstallments] = useState('');
  const [receiptUrl, setReceiptUrl] = useState((item as any)?.receipt_url || '');
  const [uploading, setUploading] = useState(false);
  const [isThirdParty, setIsThirdParty] = useState((item as any)?.is_third_party || false);
  const [thirdPartyName, setThirdPartyName] = useState((item as any)?.third_party_name || '');

  const handleUpload = async (file: File) => {
    if (!user) return;
    setUploading(true);
    const path = `${user.id}/${crypto.randomUUID()}.${file.name.split('.').pop()}`;
    const { error } = await supabase.storage.from('receipts').upload(path, file);
    if (error) { toast.error('Erro ao enviar'); setUploading(false); return; }
    setReceiptUrl(supabase.storage.from('receipts').getPublicUrl(path).data.publicUrl);
    setUploading(false);
  };

  const personFields = {
    is_third_party: isThirdParty,
    third_party_name: isThirdParty ? thirdPartyName : null,
  };

  const mut = useMutation({
    mutationFn: async () => {
      if (isEditing) {
        const updateData: any = {
          description: desc, amount: parseFloat(amount), type, category_id: categoryId || null,
          is_recurring: isRecurring, recurring_period: isRecurring ? recurringPeriod : null,
          receipt_url: receiptUrl || null,
          ...personFields,
        };

        if (cascadeScope === 'all' && item.installment_group) {
          const { error } = await supabase.from('future_transactions')
            .update({ description: desc, amount: parseFloat(amount), type, category_id: categoryId || null, receipt_url: receiptUrl || null, ...personFields })
            .eq('installment_group', item.installment_group);
          if (error) throw error;
        } else if (cascadeScope === 'this_and_future' && item.installment_group) {
          const { error } = await supabase.from('future_transactions')
            .update({ description: desc, amount: parseFloat(amount), type, category_id: categoryId || null, receipt_url: receiptUrl || null, ...personFields })
            .eq('installment_group', item.installment_group)
            .gte('due_date', item.due_date);
          if (error) throw error;
        } else {
          updateData.due_date = dueDate;
          const { error } = await supabase.from('future_transactions').update(updateData).eq('id', item.id);
          if (error) throw error;
        }
      } else if (isInstallment && totalInstallments) {
        const total = parseInt(totalInstallments);
        const instAmount = parseFloat(amount) / total;
        const groupId = crypto.randomUUID();
        const rows = Array.from({ length: total }, (_, i) => {
          const d = new Date(dueDate + 'T12:00:00');
          d.setMonth(d.getMonth() + i);
          return {
            user_id: user!.id, description: desc, amount: instAmount, type,
            category_id: categoryId || null, due_date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
            is_installment: true, total_installments: total, current_installment: i + 1,
            status: 'pending', installment_group: groupId,
            ...personFields,
          };
        });
        const { error } = await supabase.from('future_transactions').insert(rows);
        if (error) throw error;
      } else if (isRecurring && recurringPeriod === 'monthly') {
        const startD = new Date(dueDate + 'T12:00:00');
        const endYear = startD.getFullYear() + 1;
        const rows: any[] = [];
        const d = new Date(startD);
        const recurringGroup = crypto.randomUUID();
        while (d.getFullYear() <= endYear) {
          rows.push({
            user_id: user!.id, description: desc, amount: parseFloat(amount), type,
            category_id: categoryId || null,
            due_date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
            is_recurring: true, recurring_period: 'monthly', status: 'pending',
            installment_group: recurringGroup,
            ...personFields,
          });
          d.setMonth(d.getMonth() + 1);
        }
        const { error } = await supabase.from('future_transactions').insert(rows);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('future_transactions').insert({
          user_id: user!.id, description: desc, amount: parseFloat(amount), type,
          category_id: categoryId || null, due_date: dueDate,
          is_recurring: isRecurring, recurring_period: isRecurring ? recurringPeriod : null, status: 'pending',
          ...personFields,
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
      {isEditing && (item?.is_installment || item?.is_recurring) && cascadeScope && (
        <div className="bg-secondary/50 rounded-lg p-3 text-sm text-muted-foreground">
          ℹ️ {item.is_installment ? `Parcela (${item.current_installment}/${item.total_installments}).` : 'Conta recorrente.'}
          {' '}Escopo: {cascadeScope === 'single' ? 'somente este' : cascadeScope === 'all' ? 'todos do grupo' : 'este e futuros'}.
        </div>
      )}
      {!isEditing && (
        <Card className="p-4 bg-secondary border-border space-y-4">
          <div className="flex items-center justify-between">
            <div><p className="text-sm font-medium text-foreground">Recorrente</p><p className="text-xs text-muted-foreground">Cria para todos os meses</p></div>
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
            <span className="text-primary text-sm">✅ Comprovante anexado</span>
            <Button type="button" variant="ghost" size="sm" onClick={() => setReceiptUrl('')}>Remover</Button>
          </div>
        ) : <Input type="file" accept="image/*,.pdf" disabled={uploading} onChange={e => e.target.files?.[0] && handleUpload(e.target.files[0])} className="bg-secondary border-border" />}
      </div>
      <ThirdPartyField
        type={type === 'income' ? 'future_income' : 'future_expense'}
        isThirdParty={isThirdParty}
        thirdPartyName={thirdPartyName}
        onIsThirdPartyChange={setIsThirdParty}
        onThirdPartyNameChange={setThirdPartyName}
      />
      <Button type="submit" className="w-full gradient-primary" disabled={mut.isPending}>{mut.isPending ? 'Salvando...' : isEditing ? 'Atualizar' : 'Adicionar'}</Button>
    </form>
  );
}

function PaymentDateDialog({ item, onClose }: { item: any; onClose: () => void }) {
  const qc = useQueryClient();
  const today = new Date().toLocaleDateString('en-CA');
  const [paidDate, setPaidDate] = useState(today);

  const mut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('future_transactions')
        .update({ status: 'paid', paid_at: paidDate } as any)
        .eq('id', item.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['future_transactions'] }); toast.success('Pagamento registrado!'); onClose(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        <strong className="text-foreground">{item.description}</strong> — {formatCurrency(Number(item.amount))}
      </p>
      <p className="text-sm text-muted-foreground">Vencimento: {formatDate(item.due_date)}</p>
      <div className="space-y-2">
        <Label>Data do Pagamento</Label>
        <Input type="date" value={paidDate} onChange={e => setPaidDate(e.target.value)} className="bg-secondary border-border" />
      </div>
      <p className="text-xs text-muted-foreground">
        💡 A conta será contabilizada nos relatórios do mês do pagamento.
      </p>
      <Button onClick={() => mut.mutate()} className="w-full gradient-primary" disabled={mut.isPending}>
        {mut.isPending ? 'Registrando...' : 'Confirmar Pagamento'}
      </Button>
    </div>
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
  const [cascadeScope, setCascadeScope] = useState<CascadeScope>('single');
  const [choosingCascade, setChoosingCascade] = useState<{ item: any; action: 'edit' | 'delete' } | null>(null);
  const [payingItem, setPayingItem] = useState<any>(null);
  const [previewReceipt, setPreviewReceipt] = useState<string | null>(null);

  const startOfMonth = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const endOfMonth = `${year}-${String(month + 1).padStart(2, '0')}-${new Date(year, month + 1, 0).getDate()}`;

  const monthItems = items.filter((i: any) => i.due_date >= startOfMonth && i.due_date <= endOfMonth);
  const pending = monthItems.filter((i: any) => i.status !== 'paid');
  const paid = monthItems.filter((i: any) => i.status === 'paid');

  const undoPayment = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('future_transactions')
        .update({ status: 'pending', paid_at: null } as any).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['future_transactions'] }); toast.success('Pagamento desfeito!'); },
  });

  const deleteMut = useMutation({
    mutationFn: async ({ id, installmentGroup, scope, dueDate: itemDueDate }: { id: string; installmentGroup?: string; scope: CascadeScope; dueDate?: string }) => {
      if (scope === 'all' && installmentGroup) {
        const { error } = await supabase.from('future_transactions').delete().eq('installment_group', installmentGroup);
        if (error) throw error;
      } else if (scope === 'this_and_future' && installmentGroup && itemDueDate) {
        const { error } = await supabase.from('future_transactions')
          .delete()
          .eq('installment_group', installmentGroup)
          .gte('due_date', itemDueDate);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('future_transactions').delete().eq('id', id);
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['future_transactions'] }); toast.success('Removido!'); },
  });

  const toReceive = pending.filter((i: any) => i.type === 'income').reduce((s: number, i: any) => s + Number(i.amount), 0);
  const toPay = pending.filter((i: any) => i.type === 'expense').reduce((s: number, i: any) => s + Number(i.amount), 0);

  const handleEdit = (item: any) => {
    if ((item.is_installment || item.is_recurring) && item.installment_group) {
      setChoosingCascade({ item, action: 'edit' });
    } else {
      setCascadeScope('single');
      setEditing(item);
    }
  };

  const handleDelete = (item: any) => {
    if ((item.is_installment || item.is_recurring) && item.installment_group) {
      setChoosingCascade({ item, action: 'delete' });
    } else {
      deleteMut.mutate({ id: item.id, scope: 'single' });
    }
  };

  const handleCascadeChoice = (scope: CascadeScope) => {
    if (!choosingCascade) return;
    const { item, action } = choosingCascade;
    setChoosingCascade(null);
    if (action === 'edit') {
      setCascadeScope(scope);
      setEditing(item);
    } else {
      deleteMut.mutate({ id: item.id, installmentGroup: item.installment_group, scope, dueDate: item.due_date });
    }
  };

  const renderItem = (item: any) => (
    <div key={item.id} className="flex items-center justify-between px-4 sm:px-5 py-3 sm:py-4 hover:bg-secondary/50 transition-colors gap-2">
      <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
        <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0 ${item.status === 'paid' ? 'bg-income/10' : 'bg-secondary'}`}>
          {item.status === 'paid' ? <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-income" /> : <CalendarClock className="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground" />}
        </div>
        <div className="min-w-0">
          <p className="font-medium text-foreground text-sm sm:text-base truncate">
            {item.description}
            {item.is_installment && ` (${item.current_installment}/${item.total_installments})`}
            {item.is_recurring && ' 🔄'}
          </p>
          <p className="text-xs text-muted-foreground truncate">
            Vence: {formatDate(item.due_date)} · {(item as any).categories?.name || 'Sem categoria'}
            {item.status === 'paid' && (item as any).paid_at && ` · Pago: ${formatDate((item as any).paid_at)}`}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1 sm:gap-2 shrink-0">
        <span className={`font-mono font-semibold text-sm ${item.type === 'income' ? 'text-income' : 'text-expense'}`}>
          {item.type === 'income' ? '+' : '-'}{formatCurrency(Number(item.amount))}
        </span>
        {(item as any).receipt_url && (
          <Button variant="ghost" size="icon" className="h-8 w-8" title="Ver comprovante"
            onClick={() => setPreviewReceipt((item as any).receipt_url)}>
            <FileText className="w-3.5 h-3.5 text-primary" />
          </Button>
        )}
        {item.status === 'paid' ? (
          <Button variant="ghost" size="icon" className="h-8 w-8" title="Desfazer pagamento"
            onClick={() => undoPayment.mutate(item.id)}>
            <Undo2 className="w-3.5 h-3.5 text-muted-foreground" />
          </Button>
        ) : (
          <Button variant="ghost" size="icon" className="h-8 w-8" title="Marcar como pago"
            onClick={() => setPayingItem(item)}>
            <CheckCircle className="w-3.5 h-3.5 text-income" />
          </Button>
        )}
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(item)}><Pencil className="w-3.5 h-3.5" /></Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-destructive" onClick={() => handleDelete(item)}><Trash2 className="w-3.5 h-3.5" /></Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Lançamentos Futuros</h1>
          <p className="text-sm text-muted-foreground">Gerencie suas contas e parcelas</p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <MonthSelector month={month} year={year} onChange={(m, y) => { setMonth(m); setYear(y); }} />
          <Dialog open={showCreate} onOpenChange={setShowCreate}>
            <DialogTrigger asChild><Button className="gradient-primary gap-2"><Plus className="w-4 h-4" /> <span className="hidden sm:inline">Novo</span></Button></DialogTrigger>
            <DialogContent className="bg-card border-border max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Novo Lançamento Futuro</DialogTitle></DialogHeader>
              <FutureDialog onClose={() => setShowCreate(false)} />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4 sm:p-5 bg-card border-border">
          <p className="text-sm text-muted-foreground">A Receber</p>
          <p className="text-xl sm:text-2xl font-bold text-income mt-1">{formatCurrency(toReceive)}</p>
        </Card>
        <Card className="p-4 sm:p-5 bg-card border-border">
          <p className="text-sm text-muted-foreground">A Pagar</p>
          <p className="text-xl sm:text-2xl font-bold text-expense mt-1">{formatCurrency(toPay)}</p>
        </Card>
        <Card className="p-4 sm:p-5 bg-card border-border">
          <p className="text-sm text-muted-foreground">Total no Mês</p>
          <p className="text-xl sm:text-2xl font-bold text-foreground mt-1">{monthItems.length} lançamento(s)</p>
        </Card>
      </div>

      <div>
        <h2 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2"><Clock className="w-5 h-5" /> Pendentes ({pending.length})</h2>
        <Card className="bg-card border-border overflow-hidden">
          {isLoading ? <div className="p-8 text-center text-muted-foreground">Carregando...</div>
          : pending.length === 0 ? <div className="p-8 text-center text-muted-foreground">Nenhum lançamento pendente neste mês</div>
          : <div className="divide-y divide-border">{pending.map(i => renderItem(i))}</div>}
        </Card>
      </div>

      {paid.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2"><CheckCircle className="w-5 h-5 text-income" /> Pagos ({paid.length})</h2>
          <Card className="bg-card border-border overflow-hidden">
            <div className="divide-y divide-border">{paid.map(i => renderItem(i))}</div>
          </Card>
        </div>
      )}

      {/* Cascade choice dialog */}
      <Dialog open={!!choosingCascade} onOpenChange={open => !open && setChoosingCascade(null)}>
        <DialogContent className="bg-card border-border">
          <DialogHeader><DialogTitle>{choosingCascade?.action === 'edit' ? 'Editar Lançamento' : 'Excluir Lançamento'}</DialogTitle></DialogHeader>
          {choosingCascade && <CascadeChoiceDialog item={choosingCascade.item} onChoice={handleCascadeChoice} onClose={() => setChoosingCascade(null)} />}
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={open => !open && setEditing(null)}>
        <DialogContent className="bg-card border-border max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Editar Lançamento</DialogTitle></DialogHeader>
          {editing && <FutureDialog item={editing} onClose={() => setEditing(null)} cascadeScope={cascadeScope} />}
        </DialogContent>
      </Dialog>

      <Dialog open={!!payingItem} onOpenChange={open => !open && setPayingItem(null)}>
        <DialogContent className="bg-card border-border">
          <DialogHeader><DialogTitle>Registrar Pagamento</DialogTitle></DialogHeader>
          {payingItem && <PaymentDateDialog item={payingItem} onClose={() => setPayingItem(null)} />}
        </DialogContent>
      </Dialog>

      <ReceiptPreviewDialog url={previewReceipt} onClose={() => setPreviewReceipt(null)} />
    </div>
  );
}
