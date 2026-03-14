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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Plus,
  Trash2,
  CreditCard,
  Pencil,
  TrendingDown,
  ChevronDown,
  ChevronUp,
  FileText,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';

const CARD_COLORS = [
  '#6366f1',
  '#22c55e',
  '#ef4444',
  '#f59e0b',
  '#3b82f6',
  '#ec4899',
  '#8b5cf6',
];

function useCards() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['credit_cards'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('credit_cards')
        .select('*')
        .order('name');

      if (error) throw error;

      return data;
    },
    enabled: !!user,
  });
}

function PayInvoiceDialog({
  card,
  remaining,
  onClose,
}: {
  card: any;
  remaining: number;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const [amount, setAmount] = useState(String(remaining));
  const [paidDate, setPaidDate] = useState(
    new Date().toLocaleDateString('en-CA')
  );

  const mut = useMutation({
    mutationFn: async () => {
      const value = parseFloat(amount);

      if (value > remaining) {
        throw new Error('Valor maior que o restante da fatura');
      }

      const monthName = new Date(paidDate).toLocaleDateString('pt-BR', {
        month: 'long',
      });

      const { error } = await supabase.from('transactions').insert({
        user_id: user!.id,
        description: `Pagamento fatura ${card.name} - ${monthName}`,
        amount: value,
        type: 'expense',
        date: paidDate,
        payment_method: 'credit_card_invoice',
        category_id: null,
        notes: `Fatura do cartão ${card.name}`,
      });

      if (error) throw error;
    },

    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['card_transactions'] });
      qc.invalidateQueries({ queryKey: ['invoice_payments'] });

      toast.success('Pagamento registrado!');
      onClose();
    },

    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Cartão: <strong>{card.name}</strong>
      </p>

      <p className="text-sm text-muted-foreground">
        Restante da fatura:{' '}
        <strong className="text-expense">
          {formatCurrency(remaining)}
        </strong>
      </p>

      <div className="space-y-2">
        <Label>Valor a pagar</Label>
        <Input
          type="number"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label>Data do pagamento</Label>
        <Input
          type="date"
          value={paidDate}
          onChange={(e) => setPaidDate(e.target.value)}
        />
      </div>

      <Button
        onClick={() => mut.mutate()}
        className="w-full gradient-primary"
        disabled={mut.isPending}
      >
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

  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [previewReceipt, setPreviewReceipt] = useState<string | null>(null);
  const [payingInvoice, setPayingInvoice] = useState<any>(null);

  const startOfMonth = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const endOfMonth = `${year}-${String(month + 1).padStart(
    2,
    '0'
  )}-${new Date(year, month + 1, 0).getDate()}`;

  const { data: cardTransactions = [] } = useQuery({
    queryKey: ['card_transactions', startOfMonth, endOfMonth],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transactions')
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

  const { data: invoicePayments = [] } = useQuery({
    queryKey: ['invoice_payments', startOfMonth, endOfMonth],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('payment_method', 'credit_card_invoice')
        .gte('date', startOfMonth)
        .lte('date', endOfMonth);

      if (error) throw error;

      return data;
    },
    enabled: !!user,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">
            Cartões
          </h1>

          <p className="text-sm text-muted-foreground">
            Gerencie seus cartões de crédito
          </p>
        </div>

        <MonthSelector
          month={month}
          year={year}
          onChange={(m, y) => {
            setMonth(m);
            setYear(y);
          }}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {cards.map((card: any) => {
          const cardTx = cardTransactions.filter(
            (t: any) => t.card_id === card.id && t.type === 'expense'
          );

          const spent = cardTx.reduce(
            (s: number, t: any) => s + Number(t.amount),
            0
          );

          const payments = invoicePayments.filter(
            (p: any) => p.notes === `Fatura do cartão ${card.name}`
          );

          const totalPaid = payments.reduce(
            (s: number, p: any) => s + Number(p.amount),
            0
          );

          const remaining = Math.max(0, spent - totalPaid);
          const invoicePaid = remaining === 0 && spent > 0;

          const pct =
            card.card_limit > 0
              ? Math.min(100, (spent / Number(card.card_limit)) * 100)
              : 0;

          const available = Math.max(
            0,
            Number(card.card_limit) - spent
          );

          const isExpanded = expandedCard === card.id;

          return (
            <Card
              key={card.id}
              className="bg-card border-border overflow-hidden animate-fade-in"
            >
              <div
                className="p-5 sm:p-6 relative"
                style={{
                  background: `linear-gradient(135deg, ${card.color}, ${card.color}88)`,
                }}
              >
                <p className="text-white/80 text-sm">💳 {card.name}</p>

                <p className="text-white text-xl font-bold mt-1">
                  {formatCurrency(Number(card.card_limit))}
                </p>
              </div>

              <div className="p-5 space-y-4">
                <div className="flex justify-between text-sm">
                  <span>Fatura do mês</span>

                  <span className="text-expense font-semibold">
                    {formatCurrency(spent)}
                  </span>
                </div>

                <Progress value={pct} />

                <div className="flex justify-between text-sm">
                  <span>Disponível</span>

                  <span className="text-income font-semibold">
                    {formatCurrency(available)}
                  </span>
                </div>

                {!invoicePaid && spent > 0 && (
                  <Button
                    className="w-full"
                    onClick={() =>
                      setPayingInvoice({
                        card,
                        remaining,
                      })
                    }
                  >
                    <Wallet className="w-4 h-4 mr-2" />
                    Pagar restante ({formatCurrency(remaining)})
                  </Button>
                )}

                {invoicePaid && (
                  <div className="text-green-500 text-center font-semibold">
                    ✅ Fatura paga
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      <Dialog
        open={!!payingInvoice}
        onOpenChange={(open) => !open && setPayingInvoice(null)}
      >
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>Pagar Fatura</DialogTitle>
          </DialogHeader>

          {payingInvoice && (
            <PayInvoiceDialog
              card={payingInvoice.card}
              remaining={payingInvoice.remaining}
              onClose={() => setPayingInvoice(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      <ReceiptPreviewDialog
        url={previewReceipt}
        onClose={() => setPreviewReceipt(null)}
      />
    </div>
  );
}