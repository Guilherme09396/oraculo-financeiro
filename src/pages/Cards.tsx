import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { supabase } from "@/integrations/supabase/client"
import { useAuth } from "@/lib/auth"
import { formatCurrency } from "@/lib/format"

import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"

import MonthSelector from "@/components/MonthSelector"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

import {
  Plus,
  Trash2,
  Pencil,
  CreditCard,
  Wallet,
} from "lucide-react"

import { toast } from "sonner"

const CARD_COLORS = [
  "#6366f1",
  "#22c55e",
  "#ef4444",
  "#f59e0b",
  "#3b82f6",
  "#ec4899",
  "#8b5cf6",
]

function CardForm({
  card,
  onClose,
}: {
  card?: any
  onClose: () => void
}) {

  const { user } = useAuth()
  const qc = useQueryClient()

  const [name, setName] = useState(card?.name || "")
  const [limit, setLimit] = useState(card?.card_limit || "")
  const [color, setColor] = useState(card?.color || CARD_COLORS[0])

  const mut = useMutation({

    mutationFn: async () => {

      if (!name) throw new Error("Nome obrigatório")

      if (card) {

        const { error } = await supabase
          .from("credit_cards")
          .update({
            name,
            card_limit: Number(limit),
            color,
          })
          .eq("id", card.id)

        if (error) throw error

      } else {

        const { error } = await supabase
          .from("credit_cards")
          .insert({
            user_id: user!.id,
            name,
            card_limit: Number(limit),
            color,
          })

        if (error) throw error
      }
    },

    onSuccess: () => {

      qc.invalidateQueries({ queryKey: ["credit_cards"] })

      toast.success(card ? "Cartão atualizado!" : "Cartão criado!")

      onClose()
    },

    onError: (e: any) => toast.error(e.message),
  })

  return (
    <div className="space-y-4">

      <div className="space-y-2">
        <Label>Nome</Label>
        <Input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label>Limite</Label>
        <Input
          required
          type="number"
          value={limit}
          onChange={(e) => setLimit(e.target.value)}
        />
      </div>

      <div className="space-y-2">

        <Label>Cor</Label>

        <div className="flex gap-2 flex-wrap">

          {CARD_COLORS.map((c) => (

            <button
              key={c}
              type="button"
              className={`w-8 h-8 rounded-full border-2 ${
                color === c ? "border-white" : "border-transparent"
              }`}
              style={{ background: c }}
              onClick={() => setColor(c)}
            />

          ))}

        </div>

      </div>

      <Button
        className="w-full gradient-primary"
        disabled={mut.isPending}
        onClick={() => mut.mutate()}
      >
        {mut.isPending
          ? "Salvando..."
          : card
          ? "Salvar alterações"
          : "Criar cartão"}
      </Button>

    </div>
  )
}

function PayInvoiceDialog({
  card,
  remaining,
  onClose,
}: {
  card: any
  remaining: number
  onClose: () => void
}) {

  const { user } = useAuth()
  const qc = useQueryClient()

  const [amount, setAmount] = useState(String(remaining))
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))

  const mut = useMutation({

    mutationFn: async () => {

      const value = parseFloat(amount)

      if (value > remaining)
        throw new Error("Valor maior que a fatura restante")

      const { error } = await supabase
        .from("transactions")
        .insert({
          user_id: user!.id,
          description: `Pagamento fatura ${card.name}`,
          amount: value,
          type: "expense",
          date,
          payment_method: "credit_card_invoice",
          notes: `Fatura do cartão ${card.name}`,
        })

      if (error) throw error
    },

    onSuccess: () => {

      qc.invalidateQueries({ queryKey: ["transactions"] })
      qc.invalidateQueries({ queryKey: ["card_transactions"] })

      toast.success("Pagamento registrado")

      onClose()
    },

    onError: (e: any) => toast.error(e.message),
  })

  return (

    <div className="space-y-4">

      <p>
        Restante da fatura:{" "}
        <strong>{formatCurrency(remaining)}</strong>
      </p>

      <div className="space-y-2">

        <Label>Valor</Label>

        <Input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />

      </div>

      <div className="space-y-2">

        <Label>Data</Label>

        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />

      </div>

      <Button
        className="w-full"
        disabled={mut.isPending}
        onClick={() => mut.mutate()}
      >
        {mut.isPending ? "Registrando..." : "Registrar pagamento"}
      </Button>

    </div>
  )
}

export default function Cards() {

  const qc = useQueryClient()

  const now = new Date()

  const [month, setMonth] = useState(now.getMonth())
  const [year, setYear] = useState(now.getFullYear())

  const [editingCard, setEditingCard] = useState<any>(null)
  const [creatingCard, setCreatingCard] = useState(false)
  const [payInvoice, setPayInvoice] = useState<any>(null)

  const { data: cards = [] } = useQuery({

    queryKey: ["credit_cards"],

    queryFn: async () => {

      const { data, error } = await supabase
        .from("credit_cards")
        .select("*")

      if (error) throw error

      return data
    },
  })

  const { data: transactions = [] } = useQuery({

    queryKey: ["card_transactions", month, year],

    queryFn: async () => {

      const start = `${year}-${String(month + 1).padStart(2, "0")}-01`
      const end = `${year}-${String(month + 1).padStart(2, "0")}-31`

      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .not("card_id", "is", null)
        .gte("date", start)
        .lte("date", end)

      if (error) throw error

      return data
    },
  })

  const { data: invoicePayments = [] } = useQuery({

    queryKey: ["invoice_payments"],

    queryFn: async () => {

      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .eq("payment_method", "credit_card_invoice")

      if (error) throw error

      return data
    },
  })

  const deleteCard = useMutation({

    mutationFn: async (id: string) => {

      const { error } = await supabase
        .from("credit_cards")
        .delete()
        .eq("id", id)

      if (error) throw error
    },

    onSuccess: () => {

      qc.invalidateQueries({ queryKey: ["credit_cards"] })

      toast.success("Cartão removido")
    },
  })

  return (

    <div className="space-y-6">

      <div className="flex justify-between items-center flex-wrap gap-4">

        <div>
          <h1 className="text-2xl font-bold">Cartões</h1>
          <p className="text-muted-foreground">
            Gerencie seus cartões
          </p>
        </div>

        <div className="flex gap-2">

          <MonthSelector
            month={month}
            year={year}
            onChange={(m, y) => {
              setMonth(m)
              setYear(y)
            }}
          />

          <Button onClick={() => setCreatingCard(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Novo cartão
          </Button>

        </div>

      </div>

      <div className="grid md:grid-cols-2 gap-6">

        {cards.map((card: any) => {

          const cardTx = transactions.filter(
            (t: any) => t.card_id === card.id
          )

          const spent = cardTx.reduce(
            (s: number, t: any) => s + Number(t.amount),
            0
          )

          const payments = invoicePayments.filter(
            (p: any) =>
              p.notes === `Fatura do cartão ${card.name}`
          )

          const paid = payments.reduce(
            (s: number, p: any) => s + Number(p.amount),
            0
          )

          const remaining = Math.max(0, spent - paid)

          const paidInvoice = remaining === 0 && spent > 0

          return (

            <Card
              key={card.id}
              className="overflow-hidden"
            >

              <div
                className="p-6 text-white"
                style={{
                  background: `linear-gradient(135deg, ${card.color}, ${card.color}88)`,
                }}
              >

                <p>{card.name}</p>

                <p className="text-xl font-bold">
                  {formatCurrency(card.card_limit)}
                </p>

              </div>

              <div className="p-6 space-y-4">

                <div className="flex justify-between">

                  <span>Fatura</span>

                  <strong>
                    {formatCurrency(spent)}
                  </strong>

                </div>

                <Progress
                  value={
                    card.card_limit
                      ? (spent / card.card_limit) * 100
                      : 0
                  }
                />

                {!paidInvoice && spent > 0 && (

                  <Button
                    className="w-full"
                    onClick={() =>
                      setPayInvoice({ card, remaining })
                    }
                  >

                    <Wallet className="w-4 h-4 mr-2" />

                    Pagar fatura ({formatCurrency(remaining)})

                  </Button>

                )}

                {paidInvoice && (

                  <p className="text-green-500 text-center font-semibold">
                    Fatura paga
                  </p>

                )}

                <div className="flex gap-2">

                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setEditingCard(card)}
                  >

                    <Pencil className="w-4 h-4 mr-2" />
                    Editar

                  </Button>

                  <Button
                    variant="destructive"
                    className="flex-1"
                    onClick={() =>
                      deleteCard.mutate(card.id)
                    }
                  >

                    <Trash2 className="w-4 h-4 mr-2" />
                    Remover

                  </Button>

                </div>

              </div>

            </Card>

          )
        })}

      </div>

      <Dialog
        open={creatingCard}
        onOpenChange={setCreatingCard}
      >

        <DialogContent>

          <DialogHeader>
            <DialogTitle>Novo cartão</DialogTitle>
          </DialogHeader>

          <CardForm onClose={() => setCreatingCard(false)} />

        </DialogContent>

      </Dialog>

      <Dialog
        open={!!editingCard}
        onOpenChange={() => setEditingCard(null)}
      >

        <DialogContent>

          <DialogHeader>
            <DialogTitle>Editar cartão</DialogTitle>
          </DialogHeader>

          {editingCard && (
            <CardForm
              card={editingCard}
              onClose={() => setEditingCard(null)}
            />
          )}

        </DialogContent>

      </Dialog>

      <Dialog
        open={!!payInvoice}
        onOpenChange={() => setPayInvoice(null)}
      >

        <DialogContent>

          <DialogHeader>
            <DialogTitle>Pagar fatura</DialogTitle>
          </DialogHeader>

          {payInvoice && (

            <PayInvoiceDialog
              card={payInvoice.card}
              remaining={payInvoice.remaining}
              onClose={() => setPayInvoice(null)}
            />

          )}

        </DialogContent>

      </Dialog>

    </div>
  )
}