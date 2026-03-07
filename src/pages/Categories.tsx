import { useState } from 'react';
import { useCategories, useCreateCategory, useDeleteCategory } from '@/hooks/useCategories';
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
import { Plus, Trash2 } from 'lucide-react';

const EMOJI_OPTIONS = ['📦', '🍔', '🏠', '🚗', '🎮', '💰', '📚', '💊', '✈️', '🛒', '📱', '🎯', '💳', '🔧', '👕'];

function NewCategoryDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('📦');
  const [color, setColor] = useState('#22c55e');
  const [type, setType] = useState('both');
  const [limit, setLimit] = useState('');
  const create = useCreateCategory();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    create.mutate({
      name,
      icon,
      color,
      type: type as 'income' | 'expense' | 'both',
      monthly_limit: limit ? parseFloat(limit) : null,
    }, {
      onSuccess: () => {
        setOpen(false);
        setName('');
        setLimit('');
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gradient-primary gap-2">
          <Plus className="w-4 h-4" /> Nova Categoria
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-card border-border">
        <DialogHeader>
          <DialogTitle>Nova Categoria</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Nome</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Alimentação" className="bg-secondary border-border" required />
          </div>
          <div className="space-y-2">
            <Label>Ícone</Label>
            <div className="flex flex-wrap gap-2">
              {EMOJI_OPTIONS.map(e => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setIcon(e)}
                  className={`w-10 h-10 rounded-lg text-lg flex items-center justify-center transition-colors ${icon === e ? 'bg-primary/20 ring-2 ring-primary' : 'bg-secondary hover:bg-accent'}`}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger className="bg-secondary border-border"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="both">Ambos</SelectItem>
                  <SelectItem value="income">Receita</SelectItem>
                  <SelectItem value="expense">Despesa</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Cor</Label>
              <Input type="color" value={color} onChange={e => setColor(e.target.value)} className="h-10 p-1 bg-secondary border-border" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Limite Mensal (opcional)</Label>
            <Input type="number" step="0.01" value={limit} onChange={e => setLimit(e.target.value)} placeholder="Sem limite" className="bg-secondary border-border" />
          </div>
          <Button type="submit" className="w-full gradient-primary" disabled={create.isPending}>
            {create.isPending ? 'Criando...' : 'Criar Categoria'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function Categories() {
  const { data: categories = [], isLoading } = useCategories();
  const deleteCategory = useDeleteCategory();

  const typeLabel = (t: string) => {
    if (t === 'income') return 'Receita';
    if (t === 'expense') return 'Despesa';
    return 'Ambos';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Categorias</h1>
          <p className="text-muted-foreground">Organize suas finanças por categorias</p>
        </div>
        <NewCategoryDialog />
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Carregando...</div>
      ) : categories.length === 0 ? (
        <Card className="p-12 bg-card border-border text-center text-muted-foreground">
          <p className="text-lg">Nenhuma categoria criada</p>
          <p className="text-sm mt-1">Crie categorias para organizar suas transações</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {categories.map(cat => (
            <Card key={cat.id} className="p-5 bg-card border-border hover:border-primary/30 transition-colors animate-fade-in">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl" style={{ backgroundColor: cat.color + '22' }}>
                    {cat.icon}
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">{cat.name}</p>
                    <p className="text-xs text-muted-foreground">{typeLabel(cat.type)}</p>
                    {cat.monthly_limit && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Limite: R$ {Number(cat.monthly_limit).toFixed(2)}
                      </p>
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => deleteCategory.mutate(cat.id)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
