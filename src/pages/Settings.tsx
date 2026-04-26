import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { useAuth } from '@/lib/auth';
import { useProfile } from '@/hooks/useProfile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { supabase } from '@/integrations/supabase/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Settings as SettingsIcon, User, LogOut, Camera, Bell } from 'lucide-react';
import { toast } from 'sonner';
import { requestPushPermission, registerServiceWorker } from '@/lib/notifications';

export default function SettingsPage() {
  const { user, signOut } = useAuth();
  const { data: profile } = useProfile();
  const qc = useQueryClient();
  const [displayName, setDisplayName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [nameInit, setNameInit] = useState(false);

  if (profile && !nameInit) {
    setDisplayName(profile.display_name || '');
    setNameInit(true);
  }

  const { data: prefs } = useQuery({
    queryKey: ['notification_preferences'],
    queryFn: async () => {
      const { data } = await supabase
        .from('notification_preferences').select('*').eq('user_id', user!.id).maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  const upsertPrefs = useMutation({
    mutationFn: async (patch: any) => {
      const base = prefs || { user_id: user!.id };
      const { error } = await supabase.from('notification_preferences')
        .upsert({ ...base, ...patch, user_id: user!.id }, { onConflict: 'user_id' });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['notification_preferences'] }); toast.success('Preferências atualizadas!'); },
    onError: (e: any) => toast.error(e.message),
  });

  const updateProfile = useMutation({
    mutationFn: async (data: { display_name?: string; avatar_url?: string }) => {
      const { error } = await supabase.from('profiles').update(data).eq('user_id', user!.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['profile'] }); toast.success('Perfil atualizado!'); },
    onError: (e) => toast.error(e.message),
  });

  const handleAvatarUpload = async (file: File) => {
    if (!user) return;
    setUploading(true);
    const ext = file.name.split('.').pop();
    const path = `${user.id}/avatar.${ext}`;
    const { error } = await supabase.storage.from('receipts').upload(path, file, { upsert: true });
    if (error) { toast.error('Erro ao enviar foto'); setUploading(false); return; }
    const { data } = supabase.storage.from('receipts').getPublicUrl(path);
    updateProfile.mutate({ avatar_url: data.publicUrl + '?t=' + Date.now() });
    setUploading(false);
  };

  const handlePushToggle = async (enabled: boolean) => {
    if (enabled) {
      const granted = await requestPushPermission();
      if (!granted) { toast.error('Permissão de notificação negada pelo navegador'); return; }
      await registerServiceWorker();
    }
    upsertPrefs.mutate({ push_enabled: enabled });
  };

  const initials = (profile?.display_name || user?.email || 'U').slice(0, 2).toUpperCase();

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-foreground">Configurações</h1>
        <p className="text-sm text-muted-foreground">Gerencie sua conta e preferências</p>
      </div>

      <Card className="p-6 bg-card border-border">
        <h3 className="text-sm font-medium text-muted-foreground mb-4 flex items-center gap-2"><User className="w-4 h-4" /> Perfil</h3>
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="relative group">
              <Avatar className="w-16 h-16">
                <AvatarImage src={profile?.avatar_url || undefined} />
                <AvatarFallback className="text-lg bg-primary/20 text-primary">{initials}</AvatarFallback>
              </Avatar>
              <label className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                <Camera className="w-5 h-5 text-white" />
                <input type="file" accept="image/*" className="hidden" disabled={uploading}
                  onChange={e => e.target.files?.[0] && handleAvatarUpload(e.target.files[0])} />
              </label>
            </div>
            <div>
              <p className="text-foreground font-medium">{profile?.display_name || 'Seu nome'}</p>
              <p className="text-sm text-muted-foreground">{user?.email}</p>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Nome de exibição</Label>
            <Input value={displayName} onChange={e => setDisplayName(e.target.value)} className="bg-secondary border-border" placeholder="Seu nome" />
          </div>
          <Button onClick={() => updateProfile.mutate({ display_name: displayName })} className="gradient-primary" disabled={updateProfile.isPending}>
            {updateProfile.isPending ? 'Salvando...' : 'Salvar alterações'}
          </Button>
        </div>
      </Card>

      <Card className="p-6 bg-card border-border">
        <h3 className="text-sm font-medium text-muted-foreground mb-4 flex items-center gap-2"><Bell className="w-4 h-4" /> Notificações</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-foreground">No app (sino)</p>
              <p className="text-xs text-muted-foreground">Recebe alertas dentro do app</p>
            </div>
            <Switch checked={prefs?.in_app_enabled ?? true} onCheckedChange={(v) => upsertPrefs.mutate({ in_app_enabled: v })} />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-foreground">No celular (Push)</p>
              <p className="text-xs text-muted-foreground">Notificações no navegador, mesmo com o app fechado</p>
            </div>
            <Switch checked={prefs?.push_enabled ?? false} onCheckedChange={handlePushToggle} />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-foreground">Vencimento de fatura</p>
              <p className="text-xs text-muted-foreground">Avisa quando a fatura do cartão estiver próxima</p>
            </div>
            <Switch checked={prefs?.notify_invoice_due ?? true} onCheckedChange={(v) => upsertPrefs.mutate({ notify_invoice_due: v })} />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-foreground">Contas a vencer</p>
              <p className="text-xs text-muted-foreground">Avisa sobre lançamentos futuros próximos</p>
            </div>
            <Switch checked={prefs?.notify_bills_due ?? true} onCheckedChange={(v) => upsertPrefs.mutate({ notify_bills_due: v })} />
          </div>
          <div className="space-y-2">
            <Label>Avisar quantos dias antes?</Label>
            <Input
              type="number" min={1} max={15}
              value={prefs?.days_before ?? 3}
              onChange={(e) => upsertPrefs.mutate({ days_before: Number(e.target.value) || 3 })}
              className="bg-secondary border-border w-24"
            />
          </div>
        </div>
      </Card>

      <Card className="p-6 bg-card border-border">
        <h3 className="text-sm font-medium text-muted-foreground mb-4 flex items-center gap-2"><SettingsIcon className="w-4 h-4" /> Conta</h3>
        <div className="space-y-3">
          <div>
            <p className="text-sm text-muted-foreground">Email</p>
            <p className="text-foreground">{user?.email}</p>
          </div>
        </div>
      </Card>

      <Card className="p-6 bg-card border-border">
        <Button variant="destructive" onClick={signOut} className="gap-2">
          <LogOut className="w-4 h-4" /> Sair da conta
        </Button>
      </Card>
    </div>
  );
}
