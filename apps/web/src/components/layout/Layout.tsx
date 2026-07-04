import { AnimatePresence, motion } from 'motion/react';
import {
  BookOpen,
  Calendar,
  ChevronLeft,
  Command as CommandIcon,
  Cpu,
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
import { NavLink, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';

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
import { BrandLogo, BRAND } from '@/components/branding/BrandLogo';
import { cn } from '@/lib/utils';

interface NavItem {
  readonly label: string;
  readonly path: string;
  readonly icon: ReactNode;
  readonly shortcut?: string;
}

// Paths are relative to /:orgSlug/ — the Layout prepends the org slug.
const NAV_ITEMS: readonly NavItem[] = [
  { label: 'Dashboard', path: '', icon: <LayoutDashboard className="h-[18px] w-[18px]" />, shortcut: 'G D' },
  { label: 'Pacientes', path: 'patients', icon: <Users className="h-[18px] w-[18px]" />, shortcut: 'G P' },
  { label: 'Sessões', path: 'sessions', icon: <Calendar className="h-[18px] w-[18px]" />, shortcut: 'G S' },
  { label: 'Base de Conhecimento', path: 'knowledge-base', icon: <BookOpen className="h-[18px] w-[18px]" />, shortcut: 'G K' },
  { label: 'Provedores de IA', path: 'ai-providers', icon: <Cpu className="h-[18px] w-[18px]" />, shortcut: 'G A' },
  { label: 'Configurações', path: 'settings', icon: <Settings className="h-[18px] w-[18px]" />, shortcut: 'G C' },
];

const PAGE_TITLES: Record<string, string> = {
  '': 'Dashboard',
  patients: 'Pacientes',
  sessions: 'Sessões',
  'knowledge-base': 'Base de Conhecimento',
  'ai-providers': 'Provedores de IA',
  settings: 'Configurações',
};

// ── Avesia Logo is now centralized in @/components/branding/BrandLogo ──────
// Change brand name, tagline, or icon there and it reflects everywhere.

export function Layout(): ReactNode {
  const auth = useContext(AuthContext);
  const location = useLocation();
  const navigate = useNavigate();
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const { theme, toggleTheme } = useTheme();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);

  if (!auth) throw new Error('Layout must be used within AuthProvider');

  // Build full path for a nav item: /:orgSlug/:path
  const buildPath = (path: string): string => `/${orgSlug}${path ? `/${path}` : ''}`;

  // Derive page title from the path after the org slug
  const pathAfterSlug = location.pathname.replace(`/${orgSlug}`, '').replace(/^\//, '');
  const pageTitle = PAGE_TITLES[pathAfterSlug] ?? BRAND.name;

  // Filter nav items by role — AI Providers only for OWNER/ADMIN
  const visibleNavItems = NAV_ITEMS.filter((item) => {
    if (item.path === 'ai-providers') {
      return auth.user?.role === 'OWNER' || auth.user?.role === 'ADMIN';
    }
    return true;
  });

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
      navigate(buildPath(path));
      setCommandOpen(false);
      setSidebarOpen(false);
    },
    [navigate, orgSlug],
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
            <BrandLogo variant={collapsed ? 'icon' : 'full'} size="md" />
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
            {visibleNavItems.map((item) => (
              <Tooltip key={item.path}>
                <TooltipTrigger asChild>
                  <NavLink
                    to={buildPath(item.path)}
                    end={item.path === ''}
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
                        {/* Active indicator — vertical bar on left, vertically centered */}
                        {isActive && (
                          <div className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-primary" />
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
                  onClick={() => { auth.logout(); navigate('/'); }}
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
              {visibleNavItems.map((item) => (
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
              <CommandItem onSelect={() => { auth.logout(); navigate('/'); setCommandOpen(false); }}>
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
