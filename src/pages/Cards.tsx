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
import { Plus, Trash2, CreditCard, Pencil, TrendingDown, ChevronDown, ChevronUp, FileText, Wallet } from 'lucide-react';
import { toast } from 'sonner';

const CARD_COLORS = ['#6366f1', '#22c55e', '#ef4444', '#f59e0b', '#3b82f6', '#ec4899', '#8b5cf6'];

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

function PayInvoiceDialog({ card, spent, onClose }: { card: any; spent: number; onClose: () => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const [amount, setAmount] = useState(String(spent));
  const [paidDate, setPaidDate] = useState(new Date().toLocaleDateString('en-CA'));
  const [receiptUrl, setReceiptUrl] = useState('');
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (file: File) => {
    if (!user) return;

    setUploading(true);

    const path = `${user.id}/${crypto.randomUUID()}.${file.name.split('.').pop()}`;

    const { error } = await supabase.storage.from('receipts').upload(path, file);

    if (error) {
      toast.error('Erro ao enviar');
      setUploading(false);
      return;
    }

    setReceiptUrl(
      supabase.storage.from('receipts').getPublicUrl(path).data.publicUrl
    );

    setUploading(false);
  };

  const mut = useMutation({
    mutationFn: async () => {

      if (parseFloat(amount) > spent) {
        throw new Error('Valor maior que o restante da fatura');
      }

      const monthName = new Date(paidDate)
        .toLocaleDateString('pt-BR', { month: 'long' });

      const { error } = await supabase.from('transactions').insert({
        user_id: user!.id,
        description: `Pagamento fatura ${card.name} - ${monthName}`,
        amount: parseFloat(amount),
        type: 'expense',
        date: paidDate,
        payment_method: 'credit_card_invoice',
        category_id: null,
        receipt_url: receiptUrl || null,
        notes: `Fatura do cartão ${card.name}`,
      });

      if (error) throw error;
    },

    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['invoice_payments'] });

      toast.success('Pagamento registrado!');
      onClose();
    },

    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">

      <p className="text-sm text-muted-foreground">
        Cartão: <strong className="text-foreground">{card.name}</strong>
      </p>

      <p className="text-sm text-muted-foreground">
        Restante da fatura:
        <strong className="text-expense">
          {formatCurrency(spent)}
        </strong>
      </p>

      <div className="space-y-2">
        <Label>Valor a pagar</Label>
        <Input
          type="number"
          step="0.01"
          value={amount}
          onChange={e => setAmount(e.target.value)}
          className="bg-secondary border-border"
          required
        />
      </div>

      <div className="space-y-2">
        <Label>Data do pagamento</Label>
        <Input
          type="date"
          value={paidDate}
          onChange={e => setPaidDate(e.target.value)}
          className="bg-secondary border-border"
          required
        />
      </div>

      <div className="space-y-2">
        <Label>Comprovante</Label>

        {receiptUrl ? (
          <div className="flex items-center gap-2">
            <span className="text-primary text-sm">
              ✅ Comprovante anexado
            </span>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setReceiptUrl('')}
            >
              Remover
            </Button>
          </div>
        ) : (
          <Input
            type="file"
            accept="image/*,.pdf"
            disabled={uploading}
            onChange={e => e.target.files?.[0] && handleUpload(e.target.files[0])}
            className="bg-secondary border-border"
          />
        )}
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
  const [payingInvoice, setPayingInvoice] = useState<{ card: any; spent: number } | null>(null);

  const startOfMonth = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const endOfMonth = `${year}-${String(month + 1).padStart(2, '0')}-${new Date(year, month + 1, 0).getDate()}`;

  const { data: cardTransactions = [] } = useQuery({
    queryKey: ['card_transactions', startOfMonth, endOfMonth],
    queryFn: async () => {

      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .not('card_id', 'is', null)
        .gte('date', startOfMonth)
        .lte('date', endOfMonth);

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
          (p: any) => p.notes?.includes(card.name)
        );

        const totalPaid = payments.reduce(
          (s: number, p: any) => s + Number(p.amount),
          0
        );

        const remaining = Math.max(0, spent - totalPaid);

        const invoicePaid = remaining === 0 && spent > 0;

        const pct = card.card_limit > 0
          ? Math.min(100, (spent / Number(card.card_limit)) * 100)
          : 0;

        const available = Math.max(0, Number(card.card_limit) - spent);

        const isExpanded = expandedCard === card.id;

        return (

          <Card key={card.id} className="bg-card border-border">

            <div className="p-6">

              <p className="text-lg font-semibold">
                💳 {card.name}
              </p>

              <p className="text-sm text-muted-foreground">
                Limite: {formatCurrency(Number(card.card_limit))}
              </p>

              <div className="mt-4">

                <div className="flex justify-between text-sm">
                  <span>Fatura</span>
                  <span className="text-expense font-semibold">
                    {formatCurrency(spent)}
                  </span>
                </div>

                <Progress value={pct} className="mt-2" />

                <div className="flex justify-between text-sm mt-2">
                  <span>Disponível</span>
                  <span className="text-income font-semibold">
                    {formatCurrency(available)}
                  </span>
                </div>

              </div>

              {!invoicePaid && spent > 0 && (
                <Button
                  className="w-full mt-4"
                  onClick={() => setPayingInvoice({ card, spent: remaining })}
                >
                  <Wallet className="w-4 h-4 mr-2" />
                  Pagar restante ({formatCurrency(remaining)})
                </Button>
              )}

              {invoicePaid && (
                <div className="text-green-500 text-sm mt-4 font-semibold text-center">
                  ✅ Fatura paga
                </div>
              )}

            </div>

          </Card>

        );

      })}

      <Dialog
        open={!!payingInvoice}
        onOpenChange={open => !open && setPayingInvoice(null)}
      >
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>Pagar Fatura</DialogTitle>
          </DialogHeader>

          {payingInvoice && (
            <PayInvoiceDialog
              card={payingInvoice.card}
              spent={payingInvoice.spent}
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