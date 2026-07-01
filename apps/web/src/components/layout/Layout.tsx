import { AnimatePresence, motion } from 'motion/react';
import {
  BookOpen,
  Calendar,
  ChevronLeft,
  Command as CommandIcon,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Settings,
  Sun,
  Users,
  X,
} from 'lucide-react';
import {
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@/components/ui/command';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { NeuralIndicator } from '@/components/ui/neural-indicator';
import { AuthContext } from '@/lib/auth-context';
import { useTheme } from '@/lib/theme-context';
import { cn } from '@/lib/utils';

interface NavItem {
  readonly label: string;
  readonly path: string;
  readonly icon: ReactNode;
  readonly shortcut?: string;
}

const NAV_ITEMS: readonly NavItem[] = [
  { label: 'Dashboard', path: '/', icon: <LayoutDashboard className="h-[18px] w-[18px]" />, shortcut: 'G D' },
  { label: 'Pacientes', path: '/patients', icon: <Users className="h-[18px] w-[18px]" />, shortcut: 'G P' },
  { label: 'Sessões', path: '/sessions', icon: <Calendar className="h-[18px] w-[18px]" />, shortcut: 'G S' },
  { label: 'Base de Conhecimento', path: '/knowledge-base', icon: <BookOpen className="h-[18px] w-[18px]" />, shortcut: 'G K' },
  { label: 'Configurações', path: '/settings', icon: <Settings className="h-[18px] w-[18px]" />, shortcut: 'G C' },
];

const PAGE_TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/patients': 'Pacientes',
  '/sessions': 'Sessões',
  '/knowledge-base': 'Base de Conhecimento',
  '/settings': 'Configurações',
};

// ── Avesia Logo Mark ───────────────────────────────────────────────────────
// Custom SVG logo: a neural node with connections — not a generic brain icon.
// Represents the Knowledge Graph + AI intelligence layer.
function AvesiaLogo({ collapsed }: { collapsed: boolean }): React.JSX.Element {
  return (
    <div className="flex items-center gap-3">
      <div className="relative flex h-9 w-9 shrink-0 items-center justify-center">
        <svg viewBox="0 0 36 36" className="h-9 w-9">
          {/* Neural connections — faint lines */}
          <line x1="18" y1="8" x2="10" y2="22" stroke="hsl(var(--primary) / 0.3)" strokeWidth="1" />
          <line x1="18" y1="8" x2="26" y2="22" stroke="hsl(var(--primary) / 0.3)" strokeWidth="1" />
          <line x1="10" y1="22" x2="26" y2="22" stroke="hsl(var(--primary) / 0.2)" strokeWidth="1" />
          {/* Nodes */}
          <circle cx="18" cy="8" r="3" fill="hsl(var(--primary))" />
          <circle cx="10" cy="22" r="2.5" fill="hsl(var(--primary) / 0.7)" />
          <circle cx="26" cy="22" r="2.5" fill="hsl(var(--primary) / 0.7)" />
          {/* Glow on central node */}
          <circle cx="18" cy="8" r="5" fill="hsl(var(--primary) / 0.15)">
            <animate attributeName="r" values="4;6;4" dur="3s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.15;0.05;0.15" dur="3s" repeatCount="indefinite" />
          </circle>
        </svg>
      </div>
      {!collapsed && (
        <div className="flex-1 overflow-hidden">
          <h1 className="text-base font-bold tracking-tight text-foreground">Avesia</h1>
          <p className="text-[10px] font-medium uppercase tracking-wider text-primary/60">Clinical Intelligence</p>
        </div>
      )}
    </div>
  );
}

export function Layout(): ReactNode {
  const auth = useContext(AuthContext);
  const location = useLocation();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);

  if (!auth) throw new Error('Layout must be used within AuthProvider');

  const pageTitle = PAGE_TITLES[location.pathname] ?? 'Avesia';

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandOpen((prev) => !prev);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const handleNavigate = useCallback(
    (path: string) => {
      navigate(path);
      setCommandOpen(false);
      setSidebarOpen(false);
    },
    [navigate],
  );

  return (
    <TooltipProvider delayDuration={200}>
      <div className="min-h-screen bg-background mesh-bg">
        {/* Ambient glow — subtle top gradient */}
        <div className="pointer-events-none fixed inset-x-0 top-0 h-64 bg-gradient-glow opacity-60" />

        {/* Mobile overlay */}
        <AnimatePresence>
          {sidebarOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
              onClick={() => setSidebarOpen(false)}
            />
          )}
        </AnimatePresence>

        {/* Sidebar */}
        <aside
          className={cn(
            'fixed inset-y-0 left-0 z-50 flex flex-col border-r border-sidebar-border bg-sidebar transition-all duration-300 ease-out-expo lg:translate-x-0',
            collapsed ? 'w-[var(--sidebar-collapsed-width)]' : 'w-[var(--sidebar-width)]',
            sidebarOpen ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          {/* Logo */}
          <div className="flex h-16 items-center border-b border-sidebar-border px-4">
            <AvesiaLogo collapsed={collapsed} />
            <button
              className="ml-auto rounded-md p-1.5 text-foreground-muted transition-colors hover:bg-surface-elevated lg:hidden"
              onClick={() => setSidebarOpen(false)}
              aria-label="Fechar menu"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-0.5 px-2 py-4">
            {NAV_ITEMS.map((item) => (
              <Tooltip key={item.path}>
                <TooltipTrigger asChild>
                  <NavLink
                    to={item.path}
                    end={item.path === '/'}
                    onClick={() => setSidebarOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        'group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-all duration-200 ease-out-expo',
                        collapsed && 'justify-center',
                        isActive
                          ? 'bg-sidebar-item-active text-primary'
                          : 'text-foreground-secondary hover:bg-sidebar-item-hover hover:text-foreground',
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {/* Active indicator — neural line on left */}
                        {isActive && (
                          <motion.div
                            layoutId="nav-active-indicator"
                            className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-primary"
                            initial={{ opacity: 0, scaleY: 0 }}
                            animate={{ opacity: 1, scaleY: 1 }}
                            transition={{ duration: 0.2 }}
                          />
                        )}
                        <span className={cn('transition-transform duration-200', !isActive && 'group-hover:scale-110')}>
                          {item.icon}
                        </span>
                        {!collapsed && <span className="truncate">{item.label}</span>}
                      </>
                    )}
                  </NavLink>
                </TooltipTrigger>
                {collapsed && (
                  <TooltipContent side="right" sideOffset={8}>
                    {item.label}
                  </TooltipContent>
                )}
              </Tooltip>
            ))}
          </nav>

          {/* AI status indicator — ambient presence */}
          {!collapsed && (
            <div className="px-3 pb-2">
              <div className="flex items-center gap-2.5 rounded-md border border-border-subtle bg-surface/50 px-3 py-2">
                <NeuralIndicator state="idle" size="sm" />
                <div className="flex-1">
                  <p className="text-[10px] font-medium text-foreground-secondary">IA ativa</p>
                  <p className="text-[9px] text-foreground-muted">Sistema operacional</p>
                </div>
                <div className="h-1.5 w-1.5 rounded-full bg-success/80 animate-ai-pulse" />
              </div>
            </div>
          )}

          {/* Collapse toggle */}
          <div className="hidden px-2 lg:block">
            <button
              onClick={() => setCollapsed((prev) => !prev)}
              className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-foreground-muted transition-colors hover:bg-surface-elevated hover:text-foreground"
              aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
            >
              <ChevronLeft
                className={cn('h-4 w-4 transition-transform duration-200', collapsed && 'rotate-180')}
              />
              {!collapsed && <span>Recolher</span>}
            </button>
          </div>

          {/* User section */}
          <div className="border-t border-sidebar-border p-3">
            <div className={cn('flex items-center gap-3', collapsed && 'justify-center')}>
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-primary/10 text-primary text-xs font-medium">
                  {auth.user?.email?.charAt(0).toUpperCase() ?? 'U'}
                </AvatarFallback>
              </Avatar>
              {!collapsed && (
                <div className="flex-1 overflow-hidden">
                  <p className="truncate text-xs font-medium text-foreground">
                    {auth.user?.email ?? 'Usuário'}
                  </p>
                  <p className="truncate text-[10px] text-foreground-muted uppercase tracking-wider">
                    {auth.user?.role ?? 'PROFESSIONAL'}
                  </p>
                </div>
              )}
              {!collapsed && (
                <button
                  onClick={auth.logout}
                  className="rounded-md p-1.5 text-foreground-muted transition-colors hover:bg-destructive/10 hover:text-destructive"
                  aria-label="Sair"
                  title="Sair"
                >
                  <LogOut className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        </aside>

        {/* Main content */}
        <div className={cn('transition-all duration-300 ease-out-expo', collapsed ? 'lg:pl-[var(--sidebar-collapsed-width)]' : 'lg:pl-[var(--sidebar-width)]')}>
          {/* Header — glass with warm blur */}
          <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border glass px-4 sm:px-6">
            <button
              className="rounded-md p-2 text-foreground-secondary transition-colors hover:bg-surface-elevated hover:text-foreground lg:hidden"
              onClick={() => setSidebarOpen(true)}
              aria-label="Abrir menu"
            >
              <Menu className="h-5 w-5" />
            </button>

            <h2 className="text-sm font-semibold tracking-tight text-foreground">
              {pageTitle}
            </h2>

            <div className="ml-auto flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCommandOpen(true)}
                className="hidden gap-2 text-foreground-muted sm:flex"
              >
                <CommandIcon className="h-3.5 w-3.5" />
                <span className="text-xs">Buscar</span>
                <kbd className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-foreground-muted">
                  ⌘K
                </kbd>
              </Button>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={toggleTheme}
                    aria-label={theme === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro'}
                  >
                    {theme === 'dark' ? (
                      <Sun className="h-4 w-4" />
                    ) : (
                      <Moon className="h-4 w-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
                </TooltipContent>
              </Tooltip>

              <Separator orientation="vertical" className="h-5" />

              <Avatar className="h-7 w-7 lg:hidden">
                <AvatarFallback className="bg-primary/10 text-primary text-[10px]">
                  {auth.user?.email?.charAt(0).toUpperCase() ?? 'U'}
                </AvatarFallback>
              </Avatar>
            </div>
          </header>

          {/* Page content with transitions */}
          <main className="p-4 sm:p-6 lg:p-8">
            <AnimatePresence mode="wait">
              <motion.div
                key={location.pathname}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              >
                <Outlet />
              </motion.div>
            </AnimatePresence>
          </main>
        </div>

        {/* Command Palette */}
        <CommandDialog open={commandOpen} onOpenChange={setCommandOpen}>
          <CommandInput placeholder="Buscar páginas e ações..." />
          <CommandList>
            <CommandEmpty>Nenhum resultado encontrado.</CommandEmpty>
            <CommandGroup heading="Navegação">
              {NAV_ITEMS.map((item) => (
                <CommandItem
                  key={item.path}
                  onSelect={() => handleNavigate(item.path)}
                >
                  {item.icon}
                  <span>{item.label}</span>
                  {item.shortcut && <CommandShortcut>{item.shortcut}</CommandShortcut>}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandGroup heading="Ações">
              <CommandItem onSelect={() => { toggleTheme(); setCommandOpen(false); }}>
                {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                <span>{theme === 'dark' ? 'Tema claro' : 'Tema escuro'}</span>
              </CommandItem>
              <CommandItem onSelect={() => { auth.logout(); setCommandOpen(false); }}>
                <LogOut className="h-4 w-4" />
                <span>Sair</span>
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </CommandDialog>
      </div>
    </TooltipProvider>
  );
}
