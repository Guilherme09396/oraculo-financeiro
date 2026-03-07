import { Card } from '@/components/ui/card';
import { Bot, Zap } from 'lucide-react';

export default function Assistant() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Assistente IA</h1>
        <p className="text-muted-foreground">Seu conselheiro financeiro inteligente</p>
      </div>

      <Card className="p-12 bg-card border-border text-center">
        <div className="w-16 h-16 rounded-2xl gradient-primary flex items-center justify-center mx-auto mb-4 animate-pulse-glow">
          <Bot className="w-8 h-8 text-primary-foreground" />
        </div>
        <h2 className="text-xl font-bold text-foreground mb-2">Em breve</h2>
        <p className="text-muted-foreground max-w-md mx-auto">
          O assistente financeiro com IA está sendo preparado. Em breve você poderá perguntar coisas como
          "Para onde está indo meu dinheiro?" ou "Como posso economizar?".
        </p>
        <div className="mt-6 flex items-center justify-center gap-2 text-sm text-primary">
          <Zap className="w-4 h-4" />
          Powered by Lovable AI
        </div>
      </Card>
    </div>
  );
}
