import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { formatCurrency } from '@/lib/format';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger
} from '@/components/ui/dialog';
import { Plus, Trash2, Target, Pencil, PlusCircle } from 'lucide-react';
import { toast } from 'sonner';

function useGoals() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['goals'],
    queryFn: async () => {
      const { data, error } = await supabase.from('goals').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });
}

const GOAL_ICONS = ['🎯', '💰', '🏠', '🚗', '✈️', '📚', '💊', '🛡️'];

function GoalDialog({ goal, onClose }: { goal?: any; onClose: () => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const isEditing = !!goal;
  const [title, setTitle] = useState(goal?.title || '');
  const [target, setTarget] = useState(goal ? String(goal.target_amount) : '');
  const [current, setCurrent] = useState(goal ? String(goal.current_amount || 0) : '0');
  const [icon, setIcon] = useState(goal?.icon || '🎯');
  const [deadline, setDeadline] = useState(goal?.deadline || '');

  const mut = useMutation({
    mutationFn: async () => {
      if (isEditing) {
        const { error } = await supabase.from('goals').update({
          title, target_amount: parseFloat(target), current_amount: parseFloat(current) || 0,
          icon, deadline: deadline || null,
        }).eq('id', goal.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('goals').insert({
          user_id: user!.id, title, target_amount: parseFloat(target),
          current_amount: parseFloat(current) || 0, icon, deadline: deadline || null,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['goals'] }); toast.success(isEditing ? 'Meta atualizada!' : 'Meta criada!'); onClose(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <form onSubmit={e => { e.preventDefault(); mut.mutate(); }} className="space-y-4">
      <div className="space-y-2">
        <Label>Título</Label>
        <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex: Reserva de emergência" className="bg-secondary border-border" required />
      </div>
      <div className="space-y-2">
        <Label>Ícone</Label>
        <div className="flex gap-2 flex-wrap">
          {GOAL_ICONS.map(e => (
            <button key={e} type="button" onClick={() => setIcon(e)}
              className={`w-10 h-10 rounded-lg text-lg flex items-center justify-center ${icon === e ? 'bg-primary/20 ring-2 ring-primary' : 'bg-secondary'}`}>{e}</button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2"><Label>Valor Alvo</Label><Input type="number" step="0.01" value={target} onChange={e => setTarget(e.target.value)} className="bg-secondary border-border" required /></div>
        <div className="space-y-2"><Label>Valor Atual</Label><Input type="number" step="0.01" value={current} onChange={e => setCurrent(e.target.value)} className="bg-secondary border-border" /></div>
      </div>
      <div className="space-y-2">
        <Label>Prazo (opcional)</Label>
        <Input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} className="bg-secondary border-border" />
      </div>
      <Button type="submit" className="w-full gradient-primary" disabled={mut.isPending}>
        {mut.isPending ? 'Salvando...' : isEditing ? 'Atualizar Meta' : 'Criar Meta'}
      </Button>
    </form>
  );
}

function AddAmountDialog({ goal, onClose }: { goal: any; onClose: () => void }) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState('');

  const mut = useMutation({
    mutationFn: async () => {
      const newAmount = Number(goal.current_amount) + parseFloat(amount);
      const { error } = await supabase.from('goals').update({ current_amount: newAmount }).eq('id', goal.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['goals'] }); toast.success('Valor adicionado!'); onClose(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <form onSubmit={e => { e.preventDefault(); mut.mutate(); }} className="space-y-4">
      <p className="text-sm text-muted-foreground">Meta: <span className="text-foreground font-medium">{goal.title}</span></p>
      <p className="text-sm text-muted-foreground">Atual: <span className="text-income font-mono">{formatCurrency(Number(goal.current_amount))}</span></p>
      <div className="space-y-2">
        <Label>Valor a adicionar</Label>
        <Input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="R$ 0,00" className="bg-secondary border-border" required />
      </div>
      <Button type="submit" className="w-full gradient-primary" disabled={mut.isPending}>
        {mut.isPending ? 'Salvando...' : 'Adicionar Valor'}
      </Button>
    </form>
  );
}

export default function Goals() {
  const qc = useQueryClient();
  const { data: goals = [], isLoading } = useGoals();
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [addingAmount, setAddingAmount] = useState<any>(null);

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('goals').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['goals'] }); toast.success('Meta removida!'); },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Metas Financeiras</h1>
          <p className="text-muted-foreground">Acompanhe seus objetivos financeiros</p>
        </div>
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild><Button className="gradient-primary gap-2"><Plus className="w-4 h-4" /> Nova Meta</Button></DialogTrigger>
          <DialogContent className="bg-card border-border">
            <DialogHeader><DialogTitle>Nova Meta</DialogTitle></DialogHeader>
            <GoalDialog onClose={() => setShowCreate(false)} />
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Carregando...</div>
      ) : goals.length === 0 ? (
        <Card className="p-12 bg-card border-border text-center text-muted-foreground">
          <Target className="w-12 h-12 mx-auto mb-4" />
          <p className="text-lg">Nenhuma meta definida</p>
          <p className="text-sm mt-1">Defina metas para acompanhar seu progresso</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {goals.map((goal: any) => {
            const pct = Math.min(100, (Number(goal.current_amount) / Number(goal.target_amount)) * 100);
            return (
              <Card key={goal.id} className="p-6 bg-card border-border animate-fade-in">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">{goal.icon}</span>
                    <div>
                      <h3 className="font-semibold text-foreground">{goal.title}</h3>
                      <p className="text-sm text-muted-foreground">
                        {formatCurrency(Number(goal.current_amount))} de {formatCurrency(Number(goal.target_amount))}
                      </p>
                      {goal.deadline && <p className="text-xs text-muted-foreground">Prazo: {new Date(goal.deadline).toLocaleDateString('pt-BR')}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" onClick={() => setAddingAmount(goal)} title="Adicionar valor" className="h-8 w-8 text-income">
                      <PlusCircle className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setEditing(goal)} className="h-8 w-8">
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => deleteMut.mutate(goal.id)} className="h-8 w-8 hover:text-destructive">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
                <Progress value={pct} className="h-2 mb-2" />
                <div className="flex items-center justify-between">
                  <span className={`text-sm font-medium ${pct >= 100 ? 'text-income' : 'text-primary'}`}>
                    {pct >= 100 ? '🎉 Meta atingida!' : `${pct.toFixed(0)}%`}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Faltam {formatCurrency(Math.max(0, Number(goal.target_amount) - Number(goal.current_amount)))}
                  </span>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={open => !open && setEditing(null)}>
        <DialogContent className="bg-card border-border">
          <DialogHeader><DialogTitle>Editar Meta</DialogTitle></DialogHeader>
          {editing && <GoalDialog goal={editing} onClose={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>

      <Dialog open={!!addingAmount} onOpenChange={open => !open && setAddingAmount(null)}>
        <DialogContent className="bg-card border-border">
          <DialogHeader><DialogTitle>Adicionar Valor à Meta</DialogTitle></DialogHeader>
          {addingAmount && <AddAmountDialog goal={addingAmount} onClose={() => setAddingAmount(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
