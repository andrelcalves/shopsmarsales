// frontend/src/App.tsx
import React, { useState, FormEvent, useEffect } from 'react';
import './App.css';
import Dashboard from './Dashboard';
import AdsSpend from './AdsSpend';
import AdsDashboard from './AdsDashboard';
import ContributionDashboard from './ContributionDashboard';
import Products from './Products';
import Simulation from './Simulation';
import SimulationGrossRevenue, { type GrossRevenueNavParams } from './SimulationGrossRevenue';
import PaymentTypeFees from './PaymentTypeFees';
import StockOverview from './StockOverview';
import StockLaunch from './StockLaunch';
import MasterProducts from './MasterProducts';
import BillsToPay from './BillsToPay';
import Receivables from './Receivables';
import SalesByDayDashboard from './SalesByDayDashboard';
import BillsDashboard from './BillsDashboard';
import Pricing from './Pricing';
import ShopeeIntegration from './ShopeeIntegration';
import ShopeeDuplicates from './ShopeeDuplicates';
import ProductCurve from './ProductCurve';
import Returns from './Returns';
import Orders from './Orders';
import AtacadoManualSale from './AtacadoManualSale';
import AppSidebar, { type AppView, getViewTitle, MobileMenuButton } from './AppSidebar';

import { API_URL } from './config';
import { parseApiJson } from './api';


const UI = {
  bg: 'bg-slate-50',
  card: 'bg-white/90 backdrop-blur border border-slate-200 shadow-sm rounded-2xl',
};

function cn(...classes: Array<string | false | undefined | null>) {
  return classes.filter(Boolean).join(' ');
}

interface Sale {
  id: number;
  orderId: string;
  orderDate: string;
  productName: string;
  quantity: number;
  totalPrice: number;
  source: string;
}

type OrderUploadSource = 'shopee' | 'tiktok' | 'tray' | 'atacado' | 'tray_varejo';

function App() {
  const [currentView, setCurrentView] = useState<AppView>('upload');
  const [grossRevenueParams, setGrossRevenueParams] = useState<GrossRevenueNavParams | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [atacadoEditOrderId, setAtacadoEditOrderId] = useState<string | null>(null);

  function navigateTo(view: AppView) {
    if (view === 'simulation_gross_revenue' && currentView !== 'simulation_gross_revenue') {
      setGrossRevenueParams(null);
    }
    if (view !== 'atacado_manual') {
      setAtacadoEditOrderId(null);
    }
    setCurrentView(view);
  }

  function openAtacadoEdit(orderId: string) {
    setAtacadoEditOrderId(orderId);
    setCurrentView('atacado_manual');
  }

  // --- LÓGICA DA TELA DE UPLOAD ---
  const [file, setFile] = useState<File | null>(null);
  const [source, setSource] = useState<OrderUploadSource>('shopee');
  const [message, setMessage] = useState('');
  const [itemsFile, setItemsFile] = useState<File | null>(null);
  const [itemsTraySource, setItemsTraySource] = useState<'tray' | 'atacado' | 'tray_varejo'>('atacado');
  const [itemsMessage, setItemsMessage] = useState('');
  const [tiktokIncomeFile, setTiktokIncomeFile] = useState<File | null>(null);
  const [tiktokIncomeMessage, setTiktokIncomeMessage] = useState('');
  const [tiktokIncomeLoading, setTiktokIncomeLoading] = useState(false);
  const [shopeeIncomeFile, setShopeeIncomeFile] = useState<File | null>(null);
  const [shopeeIncomeMessage, setShopeeIncomeMessage] = useState('');
  const [shopeeIncomeLoading, setShopeeIncomeLoading] = useState(false);
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFile(e.target.files[0]);
    }
  };

  const handleItemsFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setItemsFile(e.target.files[0]);
    }
  };

  const fetchSales = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/api/sales`);
      if (response.ok) {
        const data = await response.json();
        setSales(Array.isArray(data) ? data : []);
      } else {
        console.error('Erro ao buscar vendas:', response.status, response.statusText);
        setSales([]);
      }
    } catch (error) {
      console.error('Erro ao buscar dados:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Busca os dados apenas se estiver na tela de upload (opcional, mas economiza recursos)
    if (currentView === 'upload') {
      fetchSales();
    }
  }, [currentView]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!file) {
      setMessage('Por favor, selecione um arquivo.');
      return;
    }

    setMessage('Enviando e processando...');
    const formData = new FormData();
    formData.append('file', file);
    formData.append('source', source);

    try {
      const response = await fetch(`${API_URL}/api/upload`, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (response.ok) {
        setMessage(`Sucesso! ${data.count} novas vendas foram importadas.`);
        fetchSales();
      } else {
        throw new Error(data.message || 'Ocorreu um erro no upload.');
      }
    } catch (error: any) {
      setMessage(`Erro: ${error.message}`);
    }
  };

  const handleTiktokIncomeFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setTiktokIncomeFile(e.target.files[0]);
    }
  };

  const handleTiktokIncomeSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!tiktokIncomeFile) {
      setTiktokIncomeMessage('Por favor, selecione o relatório TikTok (.xlsx).');
      return;
    }

    setTiktokIncomeLoading(true);
    setTiktokIncomeMessage('Enviando e processando relatório TikTok...');
    const formData = new FormData();
    formData.append('file', tiktokIncomeFile);

    try {
      const response = await fetch(`${API_URL}/api/tiktok/income/import`, {
        method: 'POST',
        body: formData,
      });
      const data = await parseApiJson<{
        message?: string;
        updated?: number;
        notFound?: number;
        skippedSettled?: number;
        importType?: 'settled' | 'onhold' | null;
      }>(response);

      if (response.ok) {
        const nf = data.notFound ?? 0;
        const skipped = data.skippedSettled ?? 0;
        const extras: string[] = [];
        if (nf > 0) {
          extras.push(
            `${nf} pedido(s) do arquivo não existem no sistema (importe o CSV de pedidos antes).`,
          );
        }
        if (skipped > 0) {
          extras.push(`${skipped} pedido(s) já liquidados foram ignorados.`);
        }
        const extra = extras.length ? ` ${extras.join(' ')}` : '';
        setTiktokIncomeMessage(`${data.message} Atualizados: ${data.updated ?? 0}.${extra}`);
        fetchSales();
      } else {
        throw new Error(data.message || 'Erro na importação de income TikTok.');
      }
    } catch (error: any) {
      setTiktokIncomeMessage(`Erro: ${error.message}`);
    } finally {
      setTiktokIncomeLoading(false);
    }
  };

  const handleShopeeIncomeFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setShopeeIncomeFile(e.target.files[0]);
    }
  };

  const handleShopeeIncomeSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!shopeeIncomeFile) {
      setShopeeIncomeMessage('Por favor, selecione o relatório Shopee (.xlsx).');
      return;
    }

    setShopeeIncomeLoading(true);
    setShopeeIncomeMessage('Enviando e processando relatório Shopee...');
    const formData = new FormData();
    formData.append('file', shopeeIncomeFile);

    try {
      const response = await fetch(`${API_URL}/api/shopee/income/import`, {
        method: 'POST',
        body: formData,
      });
      const data = await parseApiJson<{
        message?: string;
        updated?: number;
        notFound?: number;
        matched?: number;
      }>(response);

      if (response.ok) {
        const nf = data.notFound ?? 0;
        const extra =
          nf > 0
            ? ` ${nf} pedido(s) do arquivo não existem no sistema (importe os pedidos Shopee antes).`
            : '';
        setShopeeIncomeMessage(`${data.message} Atualizados: ${data.updated ?? 0}.${extra}`);
        fetchSales();
      } else {
        throw new Error(data.message || 'Erro na importação de income Shopee.');
      }
    } catch (error: unknown) {
      setShopeeIncomeMessage(`Erro: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setShopeeIncomeLoading(false);
    }
  };

  const handleItemsSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!itemsFile) {
      setItemsMessage('Por favor, selecione o arquivo de produtos vendidos (CSV).');
      return;
    }

    setItemsMessage('Enviando e processando produtos...');
    const formData = new FormData();
    formData.append('file', itemsFile);
    formData.append('source', itemsTraySource);

    try {
      const response = await fetch(`${API_URL}/api/upload-items`, {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();

      if (response.ok) {
        setItemsMessage(`Sucesso! ${data.items ?? 0} itens processados. Pedidos atualizados: ${data.ordersUpdated ?? 0}.`);
        fetchSales();
      } else {
        throw new Error(data.message || 'Ocorreu um erro no upload de produtos.');
      }
    } catch (error: any) {
      setItemsMessage(`Erro: ${error.message}`);
    }
  };

  return (
    <div className={cn(UI.bg, 'min-h-screen')}>
      <AppSidebar
        currentView={currentView}
        onNavigate={navigateTo}
        collapsed={sidebarCollapsed}
        onCollapsedChange={setSidebarCollapsed}
        mobileOpen={mobileMenuOpen}
        onMobileOpenChange={setMobileMenuOpen}
      />

      <div
        className={cn(
          'min-h-screen transition-[padding]',
          sidebarCollapsed ? 'md:pl-[72px]' : 'md:pl-64',
        )}
      >
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
          <div className="flex items-center gap-3 px-4 py-3 md:px-6">
            <MobileMenuButton onClick={() => setMobileMenuOpen(true)} />
            <div className="min-w-0">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Consolidador de vendas
              </div>
              <h1 className="truncate text-xl font-black tracking-tight text-slate-900 md:text-2xl">
                {getViewTitle(currentView)}
              </h1>
            </div>
          </div>
        </header>

        <main>
      {currentView === 'dashboard' ? (
        <Dashboard />
      ) : currentView === 'sales_by_day' ? (
        <SalesByDayDashboard />
      ) : currentView === 'bills_dashboard' ? (
        <BillsDashboard />
      ) : currentView === 'ads_dashboard' ? (
        <AdsDashboard />
      ) : currentView === 'contribution_dashboard' ? (
        <ContributionDashboard />
      ) : currentView === 'ads_spend' ? (
        <AdsSpend />
      ) : currentView === 'products' ? (
        <Products />
      ) : currentView === 'payment_type_fees' ? (
        <PaymentTypeFees />
      ) : currentView === 'stock_overview' ? (
        <StockOverview />
      ) : currentView === 'stock_launch' ? (
        <StockLaunch />
      ) : currentView === 'master_products' ? (
        <MasterProducts />
      ) : currentView === 'bills_to_pay' ? (
        <BillsToPay />
      ) : currentView === 'receivables' ? (
        <Receivables />
      ) : currentView === 'pricing' ? (
        <Pricing />
      ) : currentView === 'simulation' ? (
        <Simulation
          onOpenGrossRevenue={(params) => {
            setGrossRevenueParams(params);
            setCurrentView('simulation_gross_revenue');
          }}
        />
      ) : currentView === 'simulation_gross_revenue' ? (
        <SimulationGrossRevenue
          initialParams={grossRevenueParams}
          onBack={
            grossRevenueParams
              ? () => {
                  setCurrentView('simulation');
                }
              : undefined
          }
        />
      ) : currentView === 'shopee_integration' ? (
        <ShopeeIntegration />
      ) : currentView === 'shopee_duplicates' ? (
        <ShopeeDuplicates />
      ) : currentView === 'product_curve' ? (
        <ProductCurve />
      ) : currentView === 'returns' ? (
        <Returns />
      ) : currentView === 'orders' ? (
        <Orders onEditManualOrder={openAtacadoEdit} />
      ) : currentView === 'atacado_manual' ? (
        <AtacadoManualSale
          initialEditOrderId={atacadoEditOrderId}
          onEditHandled={() => setAtacadoEditOrderId(null)}
        />
      ) : (
        <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
          {/* Card: Upload */}
          <div className={cn(UI.card, 'p-6')}>
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="text-lg font-black tracking-tight text-slate-900">Importar pedidos</h2>
                <p className="mt-1 text-sm text-slate-500">Selecione o canal e envie um arquivo CSV/XLSX.</p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="mt-5 grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
              <div className="md:col-span-4">
                <label htmlFor="source-select" className="block text-xs font-bold tracking-widest uppercase text-slate-500">
                  Canal
                </label>
                <select
                  id="source-select"
                  value={source}
                  onChange={(e) => setSource(e.target.value as OrderUploadSource)}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500/30"
                >
                  <option value="shopee">Shopee</option>
                  <option value="tiktok">TikTok Shop</option>
                  <option value="atacado">Atacado (Nuvemshop — pedidos + itens)</option>
                  <option value="tray_varejo">Tray Varejo</option>
                  <option value="tray">Tray legado — detectar pelo arquivo (prefixo 5/2 ou loja)</option>
                </select>
                {source === 'atacado' ? (
                  <p className="mt-2 text-xs text-slate-500">
                    Use o CSV de Vendas da Nuvemshop (ex.: Vendas-….csv). Pedidos e itens entram no mesmo arquivo.
                  </p>
                ) : null}
              </div>

              <div className="md:col-span-5">
                <label className="block text-xs font-bold tracking-widest uppercase text-slate-500">Arquivo</label>
                <input
                  type="file"
                  onChange={handleFileChange}
                  accept=".csv, .xlsx, .xls"
                  className="mt-2 block w-full text-sm text-slate-700 file:mr-4 file:rounded-xl file:border-0 file:bg-slate-100 file:px-4 file:py-2 file:text-sm file:font-extrabold file:text-slate-900 hover:file:bg-slate-200"
                />
              </div>

              <div className="md:col-span-3">
                <button
                  type="submit"
                  disabled={!file}
                  className={cn(
                    'w-full rounded-xl px-4 py-2 text-sm font-extrabold shadow-sm transition',
                    file
                      ? 'bg-slate-900 text-white hover:bg-slate-800'
                      : 'bg-slate-200 text-slate-500 cursor-not-allowed'
                  )}
                >
                  Enviar arquivo
                </button>
              </div>
            </form>

            {message && (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
                {message}
              </div>
            )}
          </div>

          {/* Card: Upload Produtos (Tray) */}
          <div className={cn(UI.card, 'p-6')}>
            <div>
              <h2 className="text-lg font-black tracking-tight text-slate-900">Importar produtos (Tray / itens)</h2>
              <p className="mt-1 text-sm text-slate-500">
                Planilha de itens Tray. Para Atacado (Nuvemshop), os itens já vêm no upload de vendas acima.
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Escolha a loja acima e use o arquivo <span className="font-bold">produtos_vendidos_*.csv</span>. Deve ser o mesmo subcanal dos pedidos já importados.
              </p>
            </div>

            <form onSubmit={handleItemsSubmit} className="mt-5 grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
              <div className="md:col-span-3">
                <label className="block text-xs font-bold tracking-widest uppercase text-slate-500">Loja Tray</label>
                <select
                  value={itemsTraySource}
                  onChange={(e) => setItemsTraySource(e.target.value as 'tray' | 'atacado' | 'tray_varejo')}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500/30"
                >
                  <option value="atacado">Atacado</option>
                  <option value="tray_varejo">Tray Varejo</option>
                  <option value="tray">Detectar pelo código do pedido</option>
                </select>
              </div>
              <div className="md:col-span-6">
                <label className="block text-xs font-bold tracking-widest uppercase text-slate-500">Arquivo de produtos</label>
                <input
                  type="file"
                  onChange={handleItemsFileChange}
                  accept=".csv"
                  className="mt-2 block w-full text-sm text-slate-700 file:mr-4 file:rounded-xl file:border-0 file:bg-slate-100 file:px-4 file:py-2 file:text-sm file:font-extrabold file:text-slate-900 hover:file:bg-slate-200"
                />
              </div>
              <div className="md:col-span-3 flex items-end">
                <button
                  type="submit"
                  disabled={!itemsFile}
                  className={cn(
                    'w-full rounded-xl px-4 py-2 text-sm font-extrabold shadow-sm transition',
                    itemsFile
                      ? 'bg-indigo-700 text-white hover:bg-indigo-600'
                      : 'bg-slate-200 text-slate-500 cursor-not-allowed'
                  )}
                >
                  Importar produtos
                </button>
              </div>
            </form>

            {itemsMessage && (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
                {itemsMessage}
              </div>
            )}
          </div>

          {/* Card: Income / Liquidação TikTok */}
          <div className={cn(UI.card, 'p-6')}>
            <div>
              <h2 className="text-lg font-black tracking-tight text-slate-900">Income / Liquidação TikTok Shop</h2>
              <p className="mt-1 text-sm text-slate-500">
                Relatório de receitas do <span className="font-bold">TikTok Shop</span> (
                <span className="font-bold">.xlsx</span>): liquidação paga (aba{' '}
                <span className="font-bold">Detalhes do pedido</span>) ou pendentes onhold (aba{' '}
                <span className="font-bold">Pedidos não liquidados e ajuste</span>). O sistema detecta
                automaticamente o tipo de arquivo.
              </p>
            </div>

            <form onSubmit={handleTiktokIncomeSubmit} className="mt-5 grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
              <div className="md:col-span-9">
                <label className="block text-xs font-bold tracking-widest uppercase text-slate-500">Arquivo TikTok (.xlsx)</label>
                <input
                  type="file"
                  onChange={handleTiktokIncomeFileChange}
                  accept=".xlsx,.xls"
                  className="mt-2 block w-full text-sm text-slate-700 file:mr-4 file:rounded-xl file:border-0 file:bg-slate-100 file:px-4 file:py-2 file:text-sm file:font-extrabold file:text-slate-900 hover:file:bg-slate-200"
                />
              </div>
              <div className="md:col-span-3">
                <button
                  type="submit"
                  disabled={!tiktokIncomeFile || tiktokIncomeLoading}
                  className={cn(
                    'w-full rounded-xl px-4 py-2 text-sm font-extrabold shadow-sm transition',
                    tiktokIncomeFile && !tiktokIncomeLoading
                      ? 'bg-slate-800 text-white hover:bg-slate-700'
                      : 'bg-slate-200 text-slate-500 cursor-not-allowed'
                  )}
                >
                  {tiktokIncomeLoading ? 'Processando...' : 'Importar relatório'}
                </button>
              </div>
            </form>

            {tiktokIncomeMessage && (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
                {tiktokIncomeMessage}
              </div>
            )}
          </div>

          {/* Card: Income / Liquidação Shopee */}
          <div className={cn(UI.card, 'p-6')}>
            <div>
              <h2 className="text-lg font-black tracking-tight text-slate-900">Income / Liquidação Shopee</h2>
              <p className="mt-1 text-sm text-slate-500">
                Relatório de rendimento do <span className="font-bold">Shopee Seller Centre</span> (
                <span className="font-bold">.xlsx</span>): aba <span className="font-bold">Renda</span>, linhas{' '}
                <span className="font-bold">Order</span>. Atualiza valor liquidado e taxas nos pedidos Shopee já
                importados.
              </p>
            </div>

            <form onSubmit={handleShopeeIncomeSubmit} className="mt-5 grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
              <div className="md:col-span-9">
                <label className="block text-xs font-bold tracking-widest uppercase text-slate-500">
                  Arquivo Shopee Income (.xlsx)
                </label>
                <input
                  type="file"
                  onChange={handleShopeeIncomeFileChange}
                  accept=".xlsx,.xls"
                  className="mt-2 block w-full text-sm text-slate-700 file:mr-4 file:rounded-xl file:border-0 file:bg-slate-100 file:px-4 file:py-2 file:text-sm file:font-extrabold file:text-slate-900 hover:file:bg-slate-200"
                />
              </div>
              <div className="md:col-span-3">
                <button
                  type="submit"
                  disabled={!shopeeIncomeFile || shopeeIncomeLoading}
                  className={cn(
                    'w-full rounded-xl px-4 py-2 text-sm font-extrabold shadow-sm transition',
                    shopeeIncomeFile && !shopeeIncomeLoading
                      ? 'bg-orange-600 text-white hover:bg-orange-700'
                      : 'bg-slate-200 text-slate-500 cursor-not-allowed'
                  )}
                >
                  {shopeeIncomeLoading ? 'Processando...' : 'Importar relatório'}
                </button>
              </div>
            </form>

            {shopeeIncomeMessage && (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
                {shopeeIncomeMessage}
              </div>
            )}
          </div>

          {/* Card: Lista */}
          <div className={cn(UI.card, 'overflow-hidden')}>
            <div className="px-6 pt-6 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-extrabold tracking-wide text-slate-900">Últimas vendas importadas</h3>
                <p className="mt-1 text-xs text-slate-500">Atualiza automaticamente após importação.</p>
              </div>
              <button
                onClick={fetchSales}
                className="rounded-xl bg-white px-4 py-2 text-sm font-extrabold text-slate-900 shadow-sm border border-slate-200 hover:bg-slate-50 transition"
              >
                Atualizar
              </button>
            </div>

            <div className="p-6">
              {loading ? (
                <div className="text-sm text-slate-500">Carregando lista...</div>
              ) : (
                <div className="max-h-[420px] overflow-auto rounded-2xl border border-slate-200 bg-white">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-slate-100 border-b border-slate-200">
                      <tr className="text-left text-xs font-extrabold tracking-widest uppercase text-slate-600">
                        <th className="px-4 py-3">Data</th>
                        <th className="px-4 py-3">ID Pedido</th>
                        <th className="px-4 py-3">Produto</th>
                        <th className="px-4 py-3">Qtd.</th>
                        <th className="px-4 py-3">Preço Total</th>
                        <th className="px-4 py-3">Origem</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {sales.map((sale) => (
                        <tr key={sale.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3 text-slate-700">
                            {new Date(sale.orderDate).toLocaleDateString('pt-BR')}
                          </td>
                          <td className="px-4 py-3 font-extrabold text-slate-900">{sale.orderId}</td>
                          <td className="px-4 py-3 text-slate-700">{sale.productName}</td>
                          <td className="px-4 py-3 text-slate-700">{sale.quantity}</td>
                          <td className="px-4 py-3 font-bold text-slate-900">
                            {sale.totalPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={cn(
                                'inline-flex items-center rounded-lg px-2 py-1 text-[11px] font-extrabold text-white',
                                sale.source === 'shopee'
                                  ? 'bg-orange-600'
                                  : sale.source === 'tiktok'
                                    ? 'bg-slate-800'
                                    : 'bg-indigo-700'
                              )}
                            >
                              {sale.source}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
        </main>
      </div>
    </div>
  );
}

export default App;