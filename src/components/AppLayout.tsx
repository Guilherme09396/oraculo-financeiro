import { Outlet } from 'react-router-dom';
import AppSidebar from './AppSidebar';
import { useIsMobile } from '@/hooks/use-mobile';

export default function AppLayout() {
  const isMobile = useIsMobile();

  return (
    <div className="min-h-screen bg-background">
      <AppSidebar />
      <main className={cn(
        'min-h-screen transition-all duration-300',
        isMobile ? 'pt-14' : 'ml-[260px]'
      )}>
        <div className={cn('max-w-[1400px] mx-auto', isMobile ? 'p-4' : 'p-6 lg:p-8')}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}
