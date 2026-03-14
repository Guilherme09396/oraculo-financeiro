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
  Wallet,
  CreditCard
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

function CardForm({ card, onClose }: { card?: any; onClose: () => void }) {

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
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label>Limite</Label>
        <Input
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

export default function Cards() {

  const { user } = useAuth()
  const qc = useQueryClient()

  const now = new Date()

  const [month, setMonth] = useState(now.getMonth())
  const [year, setYear] = useState(now.getFullYear())

  const [editingCard, setEditingCard] = useState<any>(null)
  const [creatingCard, setCreatingCard] = useState(false)

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
            Gerencie seus cartões de crédito
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
            Novo Cartão
          </Button>

        </div>

      </div>

      <div className="grid md:grid-cols-2 gap-6">

        {cards.map((card: any) => (

          <Card
            key={card.id}
            className="overflow-hidden"
          >

            <div
              className="p-6 text-white relative"
              style={{
                background: `linear-gradient(135deg, ${card.color}, ${card.color}88)`,
              }}
            >

              <div className="flex justify-between items-start">

                <div>

                  <div className="flex items-center gap-2">

                    <CreditCard size={16} />

                    <span className="font-medium">
                      {card.name}
                    </span>

                  </div>

                  <p className="text-2xl font-bold mt-2">
                    {formatCurrency(card.card_limit)}
                  </p>

                </div>

                <div className="flex gap-3">

                  <Pencil
                    size={18}
                    className="cursor-pointer opacity-80 hover:opacity-100"
                    onClick={() => setEditingCard(card)}
                  />

                  <Trash2
                    size={18}
                    className="cursor-pointer opacity-80 hover:opacity-100"
                    onClick={() => deleteCard.mutate(card.id)}
                  />

                </div>

              </div>

            </div>

          </Card>

        ))}

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

    </div>
  )
}