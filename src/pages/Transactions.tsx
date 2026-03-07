import { useState } from 'react';
import { useTransactions, useCreateTransaction, useDeleteTransaction } from '@/hooks/useTransactions';
import { useCategories } from '@/hooks/useCategories';
import { formatCurrency, formatDate } from '@/lib/format';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import { Plus, Search, Trash2, TrendingUp, TrendingDown } from 'lucide-react';

function NewTransactionDialog({ type: initialType }: { type?: string }) {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [type, setType] = useState(initialType || 'expense');
  const [categoryId, setCategoryId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentMethod, setPaymentMethod] = useState('');
  const create = useCreateTransaction();
  const { data: categories = [] } = useCategories(type);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    create.mutate({
      description,
      amount: parseFloat(amount),
      type: type as 'income' | 'expense',
      category_id: categoryId || null,
      date,
      payment_method: paymentMethod || null,
      notes: null,
    }, {
      onSuccess: () => {
        setOpen(false);
        setDescription('');
        setAmount('');
        setCategoryId('');
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gradient-primary gap-2">
          <Plus className="w-4 h-4" /> Nova Transação
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-card border-border">
        <DialogHeader>
          <DialogTitle>Nova Transação</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Descrição</Label>
            <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Ex: Salário, Mercado..." className="bg-secondary border-border" required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Valor</Label>
              <Input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0,00" className="bg-secondary border-border" required />
            </div>
            <div className="space-y-2">
              <Label>Data</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="bg-secondary border-border" required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={type} onValueChange={setType}>
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
                  {categories.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.icon} {c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Forma de Pagamento</Label>
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
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
          <Button type="submit" className="w-full gradient-primary" disabled={create.isPending}>
            {create.isPending ? 'Salvando...' : 'Adicionar'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function Transactions() {
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('all');
  const { data: transactions = [], isLoading } = useTransactions(
    filterType !== 'all' ? { type: filterType } : undefined
  );
  const deleteTransaction = useDeleteTransaction();

  const filtered = transactions.filter((t: any) =>
    t.description.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Transações</h1>
          <p className="text-muted-foreground">Gerencie suas movimentações financeiras</p>
        </div>
        <NewTransactionDialog />
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar transação..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-10 bg-secondary border-border"
          />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-[160px] bg-secondary border-border"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="income">Receitas</SelectItem>
            <SelectItem value="expense">Despesas</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Transaction List */}
      <Card className="bg-card border-border overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">Carregando...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            <p className="text-lg">Nenhuma transação encontrada</p>
            <p className="text-sm mt-1">Adicione sua primeira transação para começar</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((t: any) => (
              <div key={t.id} className="flex items-center justify-between px-5 py-4 hover:bg-secondary/50 transition-colors">
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${t.type === 'income' ? 'bg-income/15' : 'bg-expense/15'}`}>
                    {t.type === 'income' ? (
                      <TrendingUp className="w-5 h-5 text-income" />
                    ) : (
                      <TrendingDown className="w-5 h-5 text-expense" />
                    )}
                  </div>
                  <div>
                    <p className="font-medium text-foreground">{t.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(t.date)} · {(t as any).categories?.name || 'Sem categoria'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className={`font-mono font-semibold ${t.type === 'income' ? 'text-income' : 'text-expense'}`}>
                    {t.type === 'income' ? '+' : '-'}{formatCurrency(Number(t.amount))}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => deleteTransaction.mutate(t.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
