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
import { Plus, Trash2, Target } from 'lucide-react';
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

export default function Goals() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: goals = [], isLoading } = useGoals();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [target, setTarget] = useState('');
  const [current, setCurrent] = useState('0');
  const [icon, setIcon] = useState('🎯');
  const [color, setColor] = useState('#22c55e');

  const createMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('goals').insert({
        user_id: user!.id,
        title,
        target_amount: parseFloat(target),
        current_amount: parseFloat(current) || 0,
        icon,
        color,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['goals'] });
      toast.success('Meta criada!');
      setOpen(false);
      setTitle('');
      setTarget('');
      setCurrent('0');
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('goals').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['goals'] });
      toast.success('Meta removida!');
    },
  });

  const updateAmount = useMutation({
    mutationFn: async ({ id, amount }: { id: string; amount: number }) => {
      const { error } = await supabase.from('goals').update({ current_amount: amount }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['goals'] });
      toast.success('Progresso atualizado!');
    },
  });

  const GOAL_ICONS = ['🎯', '💰', '🏠', '🚗', '✈️', '📚', '💊', '🛡️'];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Metas Financeiras</h1>
          <p className="text-muted-foreground">Acompanhe seus objetivos financeiros</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gradient-primary gap-2"><Plus className="w-4 h-4" /> Nova Meta</Button>
          </DialogTrigger>
          <DialogContent className="bg-card border-border">
            <DialogHeader><DialogTitle>Nova Meta</DialogTitle></DialogHeader>
            <form onSubmit={e => { e.preventDefault(); createMut.mutate(); }} className="space-y-4">
              <div className="space-y-2">
                <Label>Título</Label>
                <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex: Reserva de emergência" className="bg-secondary border-border" required />
              </div>
              <div className="space-y-2">
                <Label>Ícone</Label>
                <div className="flex gap-2">
                  {GOAL_ICONS.map(e => (
                    <button key={e} type="button" onClick={() => setIcon(e)} className={`w-10 h-10 rounded-lg text-lg flex items-center justify-center ${icon === e ? 'bg-primary/20 ring-2 ring-primary' : 'bg-secondary'}`}>{e}</button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Valor Alvo</Label>
                  <Input type="number" step="0.01" value={target} onChange={e => setTarget(e.target.value)} className="bg-secondary border-border" required />
                </div>
                <div className="space-y-2">
                  <Label>Valor Atual</Label>
                  <Input type="number" step="0.01" value={current} onChange={e => setCurrent(e.target.value)} className="bg-secondary border-border" />
                </div>
              </div>
              <Button type="submit" className="w-full gradient-primary" disabled={createMut.isPending}>Criar Meta</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Carregando...</div>
      ) : goals.length === 0 ? (
        <Card className="p-12 bg-card border-border text-center text-muted-foreground">
          <Target className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-lg">Nenhuma meta definida</p>
          <p className="text-sm mt-1">Defina metas para acompanhar seu progresso financeiro</p>
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
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => deleteMut.mutate(goal.id)} className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
                <Progress value={pct} className="h-2 mb-2" />
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-primary">{pct.toFixed(0)}%</span>
                  <span className="text-xs text-muted-foreground">
                    Faltam {formatCurrency(Math.max(0, Number(goal.target_amount) - Number(goal.current_amount)))}
                  </span>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
