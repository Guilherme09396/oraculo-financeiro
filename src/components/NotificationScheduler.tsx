import { useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { pushInAppNotification, showSystemNotification, registerServiceWorker } from '@/lib/notifications';

/**
 * Watches for upcoming bills and credit-card invoices, then creates in-app
 * notifications (deduped per day) and triggers system notifications when the
 * user has granted permission and enabled push.
 *
 * Runs on every page load while logged in. Lightweight (single client query
 * per session, then 5min poll).
 */
export default function NotificationScheduler() {
  const { user } = useAuth();

  // Fetch user prefs
  const { data: prefs } = useQuery({
    queryKey: ['notification_preferences'],
    queryFn: async () => {
      const { data } = await supabase
        .from('notification_preferences')
        .select('*')
        .eq('user_id', user!.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  const { data: futureItems = [] } = useQuery({
    queryKey: ['future_for_notif'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('future_transactions')
        .select('id, description, amount, due_date, status, type')
        .eq('status', 'pending');
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
    refetchInterval: 5 * 60 * 1000,
  });

  const { data: cards = [] } = useQuery({
    queryKey: ['cards_for_notif'],
    queryFn: async () => {
      const { data, error } = await supabase.from('credit_cards').select('id, name, due_day, closing_day');
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  // Register SW once
  useEffect(() => {
    if (prefs?.push_enabled) registerServiceWorker();
  }, [prefs?.push_enabled]);

  // Run scan
  useEffect(() => {
    if (!user || !prefs) return;
    if (!prefs.in_app_enabled && !prefs.push_enabled) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayISO = today.toISOString().split('T')[0];
    const daysBefore = prefs.days_before || 3;

    (async () => {
      // 1) Future transactions due soon
      if (prefs.notify_bills_due) {
        for (const item of futureItems) {
          const dueDate = new Date(item.due_date + 'T12:00:00');
          dueDate.setHours(0, 0, 0, 0);
          const diffDays = Math.round((dueDate.getTime() - today.getTime()) / 86400000);
          if (diffDays < 0 || diffDays > daysBefore) continue;
          const dedupeKey = `bill:${item.id}:${todayISO}`;
          const title = item.type === 'income'
            ? `💰 ${item.description} a receber`
            : `💸 ${item.description} a vencer`;
          const body = diffDays === 0
            ? `Vence hoje — ${formatBRL(Number(item.amount))}`
            : `Vence em ${diffDays} dia(s) — ${formatBRL(Number(item.amount))}`;
          if (prefs.in_app_enabled) {
            await pushInAppNotification({
              userId: user.id,
              title,
              body,
              type: diffDays <= 1 ? 'danger' : 'warning',
              link: '/future',
              dedupeKey,
            });
          }
          if (prefs.push_enabled) showSystemNotification(title, body);
        }
      }

      // 2) Credit-card invoices about to close/due
      if (prefs.notify_invoice_due) {
        for (const card of cards) {
          const dueDay = card.due_day;
          const todayDay = today.getDate();
          const month = today.getMonth();
          const year = today.getFullYear();
          // Compute the next due-date occurrence
          let nextDue = new Date(year, month, dueDay);
          if (nextDue < today) nextDue = new Date(year, month + 1, dueDay);
          const diffDays = Math.round((nextDue.getTime() - today.getTime()) / 86400000);
          if (diffDays < 0 || diffDays > daysBefore) continue;
          const dedupeKey = `invoice:${card.id}:${todayISO}`;
          const title = `💳 Fatura do ${card.name}`;
          const body = diffDays === 0
            ? 'Vence HOJE!'
            : `Vence em ${diffDays} dia(s) (${String(dueDay).padStart(2, '0')})`;
          if (prefs.in_app_enabled) {
            await pushInAppNotification({
              userId: user.id,
              title,
              body,
              type: diffDays <= 2 ? 'danger' : 'warning',
              link: '/cards',
              dedupeKey,
            });
          }
          if (prefs.push_enabled) showSystemNotification(title, body);
        }
      }
    })();
  }, [user, prefs, futureItems, cards]);

  return null;
}

function formatBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
