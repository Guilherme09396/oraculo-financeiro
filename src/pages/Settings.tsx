import { Card } from '@/components/ui/card';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Settings as SettingsIcon, User, LogOut } from 'lucide-react';

export default function SettingsPage() {
  const { user, signOut } = useAuth();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Configurações</h1>
        <p className="text-muted-foreground">Gerencie sua conta e preferências</p>
      </div>

      <Card className="p-6 bg-card border-border">
        <h3 className="text-sm font-medium text-muted-foreground mb-4 flex items-center gap-2">
          <User className="w-4 h-4" /> Conta
        </h3>
        <div className="space-y-3">
          <div>
            <p className="text-sm text-muted-foreground">Email</p>
            <p className="text-foreground">{user?.email}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">ID</p>
            <p className="text-foreground font-mono text-xs">{user?.id}</p>
          </div>
        </div>
      </Card>

      <Card className="p-6 bg-card border-border">
        <h3 className="text-sm font-medium text-muted-foreground mb-4 flex items-center gap-2">
          <SettingsIcon className="w-4 h-4" /> Ações
        </h3>
        <Button variant="destructive" onClick={signOut} className="gap-2">
          <LogOut className="w-4 h-4" /> Sair da conta
        </Button>
      </Card>
    </div>
  );
}
