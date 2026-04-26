import { supabase } from '@/integrations/supabase/client';

/** Helper to (idempotently) push an in-app notification using a dedupe key. */
export async function pushInAppNotification(params: {
  userId: string;
  title: string;
  body?: string;
  type?: 'info' | 'warning' | 'danger';
  link?: string;
  dedupeKey: string;
}) {
  const { userId, title, body, type = 'info', link, dedupeKey } = params;
  // Try insert; if dedupe collision, ignore.
  const { error } = await supabase.from('notifications').insert({
    user_id: userId,
    title,
    body,
    type,
    link,
    dedupe_key: dedupeKey,
  });
  if (error && !error.message.toLowerCase().includes('duplicate')) {
    // Silent fail otherwise (e.g. unique violation when already created today)
    console.warn('notification insert', error);
  }
}

/** Show a browser/system notification if the user has granted permission. */
export function showSystemNotification(title: string, body?: string) {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  try {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then((reg) => {
        reg.showNotification(title, {
          body,
          icon: '/favicon.ico',
          badge: '/favicon.ico',
          tag: title,
        });
      }).catch(() => {
        new Notification(title, { body });
      });
    } else {
      new Notification(title, { body });
    }
  } catch {
    /* ignore */
  }
}

export async function requestPushPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.register('/sw.js');
    return reg;
  } catch (e) {
    console.warn('SW registration failed', e);
    return null;
  }
}
