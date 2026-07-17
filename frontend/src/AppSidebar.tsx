import React, { useEffect, useMemo, useState } from 'react';
import {
  Boxes,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Home,
  LineChart,
  Link2,
  Menu,
  Package,
  Settings,
  ShoppingCart,
  Wallet,
  X,
} from 'lucide-react';

export type AppView =
  | 'upload'
  | 'dashboard'
  | 'ads_spend'
  | 'ads_dashboard'
  | 'contribution_dashboard'
  | 'sales_by_day'
  | 'bills_dashboard'
  | 'products'
  | 'payment_type_fees'
  | 'stock_overview'
  | 'stock_launch'
  | 'master_products'
  | 'simulation'
  | 'simulation_gross_revenue'
  | 'bills_to_pay'
  | 'receivables'
  | 'pricing'
  | 'shopee_integration'
  | 'shopee_duplicates'
  | 'product_curve'
  | 'returns'
  | 'orders';

type NavItem = { view: AppView; label: string };

type NavModule = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  items: NavItem[];
};

const NAV_MODULES: NavModule[] = [
  {
    id: 'home',
    label: 'Home',
    icon: Home,
    items: [
      { view: 'dashboard', label: 'Vendas Geral' },
      { view: 'sales_by_day', label: 'Vendas por Dia' },
    ],
  },
  {
    id: 'orders',
    label: 'Pedidos',
    icon: ShoppingCart,
    items: [
      { view: 'orders', label: 'Lista de pedidos' },
      { view: 'returns', label: 'Devoluções' },
    ],
  },
  {
    id: 'products',
    label: 'Produtos',
    icon: Package,
    items: [
      { view: 'products', label: 'Produtos de canal' },
      { view: 'master_products', label: 'Produtos mestre' },
      { view: 'pricing', label: 'Precificação' },
    ],
  },
  {
    id: 'stock',
    label: 'Estoque',
    icon: Boxes,
    items: [
      { view: 'stock_overview', label: 'Visão de estoque' },
      { view: 'stock_launch', label: 'Lançar estoque' },
    ],
  },
  {
    id: 'analytics',
    label: 'Análises',
    icon: LineChart,
    items: [
      { view: 'contribution_dashboard', label: 'Margem por Canal' },
      { view: 'ads_dashboard', label: 'Custo ADS' },
      { view: 'product_curve', label: 'Curva ABC' },
      { view: 'simulation', label: 'Simulação' },
      { view: 'simulation_gross_revenue', label: 'Faturamento bruto' },
    ],
  },
  {
    id: 'finance',
    label: 'Financeiro',
    icon: Wallet,
    items: [
      { view: 'bills_dashboard', label: 'Contas a pagar' },
      { view: 'bills_to_pay', label: 'Cadastro contas' },
      { view: 'receivables', label: 'Contas a receber' },
      { view: 'ads_spend', label: 'Cadastro ADS' },
    ],
  },
  {
    id: 'integrations',
    label: 'Integrações',
    icon: Link2,
    items: [
      { view: 'upload', label: 'Upload & Lista' },
      { view: 'payment_type_fees', label: 'Taxas Tray' },
      { view: 'shopee_integration', label: 'Integrações' },
      { view: 'shopee_duplicates', label: 'Duplicatas Shopee' },
    ],
  },
  {
    id: 'settings',
    label: 'Configurações',
    icon: Settings,
    items: [],
  },
];

const VIEW_TITLES: Record<AppView, string> = {
  upload: 'Upload & Lista',
  dashboard: 'Vendas Geral',
  sales_by_day: 'Vendas por Dia',
  bills_dashboard: 'Contas a pagar',
  ads_dashboard: 'Custo ADS',
  contribution_dashboard: 'Margem por Canal',
  ads_spend: 'Cadastro ADS',
  products: 'Produtos de canal',
  payment_type_fees: 'Taxas Tray',
  stock_overview: 'Visão de estoque',
  stock_launch: 'Lançar estoque',
  master_products: 'Produtos mestre',
  bills_to_pay: 'Cadastro contas',
  receivables: 'Contas a receber',
  pricing: 'Precificação',
  simulation: 'Simulação',
  simulation_gross_revenue: 'Faturamento bruto',
  shopee_integration: 'Integrações',
  shopee_duplicates: 'Duplicatas Shopee',
  product_curve: 'Curva ABC',
  returns: 'Devoluções',
  orders: 'Lista de pedidos',
};

export function getViewTitle(view: AppView): string {
  return VIEW_TITLES[view] ?? 'Consolidador';
}

function moduleIdForView(view: AppView): string | null {
  for (const mod of NAV_MODULES) {
    if (mod.items.some((i) => i.view === view)) return mod.id;
  }
  return null;
}

function cn(...classes: Array<string | false | undefined | null>) {
  return classes.filter(Boolean).join(' ');
}

type AppSidebarProps = {
  currentView: AppView;
  onNavigate: (view: AppView) => void;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
};

export default function AppSidebar({
  currentView,
  onNavigate,
  collapsed,
  onCollapsedChange,
  mobileOpen,
  onMobileOpenChange,
}: AppSidebarProps): JSX.Element {
  const activeModuleId = useMemo(() => moduleIdForView(currentView), [currentView]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() =>
    activeModuleId ? { [activeModuleId]: true } : { home: true },
  );

  useEffect(() => {
    if (!activeModuleId) return;
    setExpanded((prev) => ({ ...prev, [activeModuleId]: true }));
  }, [activeModuleId]);

  function toggleModule(id: string) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function handleNavigate(view: AppView) {
    onNavigate(view);
    onMobileOpenChange(false);
  }

  const navBody = (
    <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-1">
      {NAV_MODULES.map((mod) => {
        const Icon = mod.icon;
        const isOpen = Boolean(expanded[mod.id]);
        const hasItems = mod.items.length > 0;
        const moduleActive = activeModuleId === mod.id;

        if (!hasItems) {
          return (
            <div
              key={mod.id}
              className={cn(
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-400',
                collapsed && 'justify-center px-2',
              )}
              title={collapsed ? mod.label : undefined}
            >
              <Icon className="h-5 w-5 shrink-0" />
              {!collapsed && <span>{mod.label}</span>}
              {!collapsed && (
                <span className="ml-auto text-[10px] font-bold uppercase tracking-wide text-slate-400">Em breve</span>
              )}
            </div>
          );
        }

        return (
          <div key={mod.id}>
            <button
              type="button"
              onClick={() => {
                if (collapsed) {
                  onCollapsedChange(false);
                  setExpanded((prev) => ({ ...prev, [mod.id]: true }));
                  return;
                }
                toggleModule(mod.id);
              }}
              className={cn(
                'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-extrabold transition',
                moduleActive
                  ? 'bg-sky-50 text-sky-900'
                  : 'text-slate-700 hover:bg-slate-100',
                collapsed && 'justify-center px-2',
              )}
              title={collapsed ? mod.label : undefined}
              aria-expanded={isOpen}
            >
              <Icon className="h-5 w-5 shrink-0" />
              {!collapsed && (
                <>
                  <span className="flex-1 text-left">{mod.label}</span>
                  <ChevronDown
                    className={cn('h-4 w-4 text-slate-400 transition', isOpen && 'rotate-180')}
                  />
                </>
              )}
            </button>

            {!collapsed && isOpen && (
              <div className="mt-1 ml-3 space-y-0.5 border-l border-slate-200 pl-3">
                {mod.items.map((item) => {
                  const active = currentView === item.view;
                  return (
                    <button
                      key={item.view}
                      type="button"
                      onClick={() => handleNavigate(item.view)}
                      className={cn(
                        'flex w-full items-center rounded-lg px-3 py-2 text-left text-sm font-semibold transition',
                        active
                          ? 'bg-slate-900 text-white shadow-sm'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                      )}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={cn(
          'hidden md:flex fixed inset-y-0 left-0 z-30 flex-col border-r border-slate-200 bg-white transition-[width]',
          collapsed ? 'w-[72px]' : 'w-64',
        )}
      >
        <div
          className={cn(
            'flex h-14 items-center border-b border-slate-200 px-3',
            collapsed ? 'justify-center' : 'justify-between gap-2',
          )}
        >
          {!collapsed && (
            <div className="min-w-0 pl-1">
              <div className="truncate text-xs font-bold uppercase tracking-wider text-slate-400">ShopSmart</div>
              <div className="truncate text-sm font-black text-slate-900">Sales</div>
            </div>
          )}
          <button
            type="button"
            onClick={() => onCollapsedChange(!collapsed)}
            className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50"
            aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>
        {navBody}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/40"
            aria-label="Fechar menu"
            onClick={() => onMobileOpenChange(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-white shadow-xl">
            <div className="flex h-14 items-center justify-between border-b border-slate-200 px-4">
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-slate-400">ShopSmart</div>
                <div className="text-sm font-black text-slate-900">Sales</div>
              </div>
              <button
                type="button"
                onClick={() => onMobileOpenChange(false)}
                className="rounded-lg border border-slate-200 p-1.5 text-slate-600"
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {navBody}
          </aside>
        </div>
      )}
    </>
  );
}

export function MobileMenuButton({ onClick }: { onClick: () => void }): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className="md:hidden inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white p-2 text-slate-700 shadow-sm"
      aria-label="Abrir menu"
    >
      <Menu className="h-5 w-5" />
    </button>
  );
}
