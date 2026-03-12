import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import {
  LayoutDashboard, ArrowLeftRight, TrendingUp, TrendingDown,
  CalendarClock, Target, Tags, CreditCard, BarChart3, Bot,
  Settings, LogOut, DollarSign, ChevronLeft, Menu, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/transactions', label: 'Transações', icon: ArrowLeftRight },
  { to: '/income', label: 'Receitas', icon: TrendingUp },
  { to: '/expenses', label: 'Despesas', icon: TrendingDown },
  { to: '/future', label: 'Lançamentos Futuros', icon: CalendarClock },
  { to: '/goals', label: 'Metas', icon: Target },
  { to: '/categories', label: 'Categorias', icon: Tags },
  { to: '/cards', label: 'Cartões', icon: CreditCard },
  { to: '/reports', label: 'Relatórios', icon: BarChart3 },
  { to: '/assistant', label: 'Assistente IA', icon: Bot },
  { to: '/settings', label: 'Configurações', icon: Settings },
];

function SidebarContent({ collapsed, onCollapse, onNavigate }: { collapsed: boolean; onCollapse?: () => void; onNavigate?: () => void }) {
  const { signOut } = useAuth();
  const location = useLocation();

  return (
    <>
      <div className="flex items-center gap-3 px-5 h-16 border-b border-sidebar-border shrink-0">
        <div className="w-9 h-9 rounded-xl gradient-primary flex items-center justify-center shrink-0">
          <DollarSign className="w-5 h-5 text-primary-foreground" />
        </div>
        {!collapsed && <span className="text-lg font-bold text-foreground">GranaIA</span>}
        {onCollapse && (
          <button
            onClick={onCollapse}
            className={cn('ml-auto p-1 rounded-md hover:bg-sidebar-accent text-sidebar-foreground transition-transform', collapsed && 'rotate-180')}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}
      </div>
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
        {navItems.map(({ to, label, icon: Icon }) => {
          const isActive = location.pathname === to;
          return (
            <NavLink
              key={to} to={to}
              onClick={onNavigate}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                isActive ? 'bg-primary/15 text-primary' : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
              )}
              title={collapsed ? label : undefined}
            >
              <Icon className="w-5 h-5 shrink-0" />
              {!collapsed && <span>{label}</span>}
            </NavLink>
          );
        })}
      </nav>
      <div className="px-3 py-4 border-t border-sidebar-border">
        <button
          onClick={signOut}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent hover:text-destructive transition-colors w-full"
          title={collapsed ? 'Sair' : undefined}
        >
          <LogOut className="w-5 h-5 shrink-0" />
          {!collapsed && <span>Sair</span>}
        </button>
      </div>
    </>
  );
}

export default function AppSidebar() {
  const isMobile = useIsMobile();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  // Close mobile sheet on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  if (isMobile) {
    return (
      <>
        <div className="fixed top-0 left-0 right-0 z-40 h-14 bg-sidebar border-b border-sidebar-border flex items-center px-4 gap-3">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9">
                <Menu className="w-5 h-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 w-[280px] bg-sidebar border-sidebar-border flex flex-col">
              <SheetTitle className="sr-only">Menu de navegação</SheetTitle>
              <SidebarContent collapsed={false} onNavigate={() => setMobileOpen(false)} />
            </SheetContent>
          </Sheet>
          <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center">
            <DollarSign className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-bold text-foreground">GranaIA</span>
        </div>
      </>
    );
  }

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 z-40 h-screen flex flex-col bg-sidebar border-r border-sidebar-border transition-all duration-300',
        collapsed ? 'w-[72px]' : 'w-[260px]'
      )}
    >
      <SidebarContent collapsed={collapsed} onCollapse={() => setCollapsed(!collapsed)} />
    </aside>
  );
}
