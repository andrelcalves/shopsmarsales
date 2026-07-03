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

type OrderUploadSource = 'shopee' | 'tiktok' | 'tray' | 'tray_atacado' | 'tray_varejo';

function App() {
  // Estado para controlar qual tela está visível: 'upload' ou 'dashboard'
  const [currentView, setCurrentView] = useState<'upload' | 'dashboard' | 'ads_spend' | 'ads_dashboard' | 'contribution_dashboard' | 'sales_by_day' | 'bills_dashboard' | 'products' | 'payment_type_fees' | 'stock_overview' | 'stock_launch' | 'master_products' | 'simulation' | 'simulation_gross_revenue' | 'bills_to_pay' | 'receivables' | 'pricing' | 'shopee_integration' | 'shopee_duplicates' | 'product_curve' | 'returns' | 'orders'>('upload');
  const [grossRevenueParams, setGrossRevenueParams] = useState<GrossRevenueNavParams | null>(null);

  // --- LÓGICA DA TELA DE UPLOAD ---
  const [file, setFile] = useState<File | null>(null);
  const [source, setSource] = useState<OrderUploadSource>('shopee');
  const [message, setMessage] = useState('');
  const [itemsFile, setItemsFile] = useState<File | null>(null);
  const [itemsTraySource, setItemsTraySource] = useState<'tray' | 'tray_atacado' | 'tray_varejo'>('tray_atacado');
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
      {/* Header com gradiente (mesma pegada do Dashboard) */}
      <div className="bg-gradient-to-r from-sky-700 via-blue-700 to-indigo-700">
        <div className="max-w-7xl mx-auto px-6 py-7 text-white">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="text-sm font-semibold tracking-wide opacity-95">CONSOLIDADOR DE VENDAS</div>
              <h1 className="mt-2 text-3xl md:text-4xl font-black tracking-tight">
                {currentView === 'upload'
                  ? 'Upload & Lista'
                  : currentView === 'dashboard'
                    ? 'Vendas Geral'
                    : currentView === 'sales_by_day'
                      ? 'Vendas por Dia'
                      : currentView === 'bills_dashboard'
                        ? 'Contas a pagar'
                        : currentView === 'ads_dashboard'
                          ? 'Custo ADS'
                          : currentView === 'contribution_dashboard'
                            ? 'Margem por Canal'
                            : currentView === 'ads_spend'
                            ? 'Cadastro ADS'
                            : currentView === 'products'
                              ? 'Produtos'
                              : currentView === 'payment_type_fees'
                                ? 'Taxas Tray'
                                : currentView === 'stock_overview'
                                  ? 'Estoque'
                                  : currentView === 'stock_launch'
                                    ? 'Lançar estoque'
                                    : currentView === 'master_products'
                                      ? 'Produtos mestre'
                                  : currentView === 'bills_to_pay'
                                    ? 'Cadastro contas'
                                    : currentView === 'receivables'
                                      ? 'Contas a receber'
                                    : currentView === 'pricing'
                                      ? 'Precificação'
                                      : currentView === 'simulation'
                                        ? 'Simulação'
                                        : currentView === 'simulation_gross_revenue'
                                          ? 'Faturamento bruto'
                                          : currentView === 'shopee_integration'
                                          ? 'Integrações'
                                          : currentView === 'shopee_duplicates'
                                            ? 'Duplicatas Shopee'
                                            : currentView === 'product_curve'
                                              ? 'Curva ABC'
                                              : currentView === 'returns'
                                                ? 'Devoluções'
                                                : currentView === 'orders'
                                                  ? 'Pedidos'
                                                  : 'Consolidador'}
              </h1>
            </div>

            {/* Dashboards */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-white/70 uppercase tracking-wider">Dashboards</span>
              </div>
              <div className="flex flex-wrap items-center gap-2 bg-white/10 border border-white/15 rounded-2xl p-1">
                <button
                  onClick={() => setCurrentView('dashboard')}
                  className={cn(
                    'px-4 py-2 rounded-xl text-sm font-extrabold transition',
                    currentView === 'dashboard' ? 'bg-white text-slate-900 shadow-sm' : 'text-white/85 hover:bg-white/10'
                  )}
                >
                  Vendas Geral
                </button>
                <button
                  onClick={() => setCurrentView('sales_by_day')}
                  className={cn(
                    'px-4 py-2 rounded-xl text-sm font-extrabold transition',
                    currentView === 'sales_by_day' ? 'bg-white text-slate-900 shadow-sm' : 'text-white/85 hover:bg-white/10'
                  )}
                >
                  Vendas por Dia
                </button>
                <button
                  onClick={() => setCurrentView('ads_dashboard')}
                  className={cn(
                    'px-4 py-2 rounded-xl text-sm font-extrabold transition',
                    currentView === 'ads_dashboard' ? 'bg-white text-slate-900 shadow-sm' : 'text-white/85 hover:bg-white/10'
                  )}
                >
                  Custo ADS
                </button>
                <button
                  onClick={() => setCurrentView('contribution_dashboard')}
                  className={cn(
                    'px-4 py-2 rounded-xl text-sm font-extrabold transition',
                    currentView === 'contribution_dashboard' ? 'bg-white text-slate-900 shadow-sm' : 'text-white/85 hover:bg-white/10'
                  )}
                >
                  Margem por Canal
                </button>
                <button
                  onClick={() => setCurrentView('stock_overview')}
                  className={cn(
                    'px-4 py-2 rounded-xl text-sm font-extrabold transition',
                    currentView === 'stock_overview' ? 'bg-white text-slate-900 shadow-sm' : 'text-white/85 hover:bg-white/10'
                  )}
                >
                  Estoque
                </button>
                <button
                  onClick={() => setCurrentView('product_curve')}
                  className={cn(
                    'px-4 py-2 rounded-xl text-sm font-extrabold transition',
                    currentView === 'product_curve' ? 'bg-white text-slate-900 shadow-sm' : 'text-white/85 hover:bg-white/10'
                  )}
                >
                  Curva ABC
                </button>
                <button
                  onClick={() => setCurrentView('simulation')}
                  className={cn(
                    'px-4 py-2 rounded-xl text-sm font-extrabold transition',
                    currentView === 'simulation' ? 'bg-white text-slate-900 shadow-sm' : 'text-white/85 hover:bg-white/10'
                  )}
                >
                  Simulação
                </button>
                <button
                  onClick={() => {
                    setGrossRevenueParams(null);
                    setCurrentView('simulation_gross_revenue');
                  }}
                  className={cn(
                    'px-4 py-2 rounded-xl text-sm font-extrabold transition',
                    currentView === 'simulation_gross_revenue' ? 'bg-white text-slate-900 shadow-sm' : 'text-white/85 hover:bg-white/10'
                  )}
                >
                  Faturamento bruto
                </button>
              </div>
              {/* Financeiro */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-white/70 uppercase tracking-wider">Financeiro</span>
              </div>
              <div className="flex flex-wrap items-center gap-2 bg-white/10 border border-white/15 rounded-2xl p-1">
                <button
                  onClick={() => setCurrentView('bills_to_pay')}
                  className={cn(
                    'px-4 py-2 rounded-xl text-sm font-extrabold transition',
                    currentView === 'bills_to_pay' ? 'bg-white text-slate-900 shadow-sm' : 'text-white/85 hover:bg-white/10'
                  )}
                >
                  Cadastro contas
                </button>
                <button
                  onClick={() => setCurrentView('ads_spend')}
                  className={cn(
                    'px-4 py-2 rounded-xl text-sm font-extrabold transition',
                    currentView === 'ads_spend' ? 'bg-white text-slate-900 shadow-sm' : 'text-white/85 hover:bg-white/10'
                  )}
                >
                  Cadastro ADS
                </button>
                <button
                  onClick={() => setCurrentView('receivables')}
                  className={cn(
                    'px-4 py-2 rounded-xl text-sm font-extrabold transition',
                    currentView === 'receivables' ? 'bg-white text-slate-900 shadow-sm' : 'text-white/85 hover:bg-white/10'
                  )}
                >
                  Contas a receber
                </button>
                <button
                  onClick={() => setCurrentView('bills_dashboard')}
                  className={cn(
                    'px-4 py-2 rounded-xl text-sm font-extrabold transition',
                    currentView === 'bills_dashboard' ? 'bg-white text-slate-900 shadow-sm' : 'text-white/85 hover:bg-white/10'
                  )}
                >
                  Contas a pagar
                </button>
              </div>
              {/* Cadastros */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-white/70 uppercase tracking-wider">Cadastros</span>
              </div>
              <div className="flex flex-wrap items-center gap-2 bg-white/10 border border-white/15 rounded-2xl p-1">
                <button
                  onClick={() => setCurrentView('upload')}
                  className={cn(
                    'px-4 py-2 rounded-xl text-sm font-extrabold transition',
                    currentView === 'upload' ? 'bg-white text-slate-900 shadow-sm' : 'text-white/85 hover:bg-white/10'
                  )}
                >
                  Upload & Lista
                </button>
                <button
                  onClick={() => setCurrentView('products')}
                  className={cn(
                    'px-4 py-2 rounded-xl text-sm font-extrabold transition',
                    currentView === 'products' ? 'bg-white text-slate-900 shadow-sm' : 'text-white/85 hover:bg-white/10'
                  )}
                >
                  Produtos
                </button>
                <button
                  onClick={() => setCurrentView('payment_type_fees')}
                  className={cn(
                    'px-4 py-2 rounded-xl text-sm font-extrabold transition',
                    currentView === 'payment_type_fees' ? 'bg-white text-slate-900 shadow-sm' : 'text-white/85 hover:bg-white/10'
                  )}
                >
                  Taxas Tray
                </button>
                <button
                  onClick={() => setCurrentView('stock_launch')}
                  className={cn(
                    'px-4 py-2 rounded-xl text-sm font-extrabold transition',
                    currentView === 'stock_launch' ? 'bg-white text-slate-900 shadow-sm' : 'text-white/85 hover:bg-white/10'
                  )}
                >
                  Lançar estoque
                </button>
                <button
                  onClick={() => setCurrentView('master_products')}
                  className={cn(
                    'px-4 py-2 rounded-xl text-sm font-extrabold transition',
                    currentView === 'master_products' ? 'bg-white text-slate-900 shadow-sm' : 'text-white/85 hover:bg-white/10'
                  )}
                >
                  Produtos mestre
                </button>
                <button
                  onClick={() => setCurrentView('pricing')}
                  className={cn(
                    'px-4 py-2 rounded-xl text-sm font-extrabold transition',
                    currentView === 'pricing' ? 'bg-white text-slate-900 shadow-sm' : 'text-white/85 hover:bg-white/10'
                  )}
                >
                  Precificação
                </button>
                <button
                  onClick={() => setCurrentView('shopee_integration')}
                  className={cn(
                    'px-4 py-2 rounded-xl text-sm font-extrabold transition',
                    currentView === 'shopee_integration' ? 'bg-white text-slate-900 shadow-sm' : 'text-white/85 hover:bg-white/10'
                  )}
                >
                  Integrações
                </button>
                <button
                  onClick={() => setCurrentView('shopee_duplicates')}
                  className={cn(
                    'px-4 py-2 rounded-xl text-sm font-extrabold transition',
                    currentView === 'shopee_duplicates' ? 'bg-white text-slate-900 shadow-sm' : 'text-white/85 hover:bg-white/10'
                  )}
                >
                  Dup. Shopee
                </button>
                <button
                  onClick={() => setCurrentView('orders')}
                  className={cn(
                    'px-4 py-2 rounded-xl text-sm font-extrabold transition',
                    currentView === 'orders' ? 'bg-white text-slate-900 shadow-sm' : 'text-white/85 hover:bg-white/10'
                  )}
                >
                  Pedidos
                </button>
                <button
                  onClick={() => setCurrentView('returns')}
                  className={cn(
                    'px-4 py-2 rounded-xl text-sm font-extrabold transition',
                    currentView === 'returns' ? 'bg-white text-slate-900 shadow-sm' : 'text-white/85 hover:bg-white/10'
                  )}
                >
                  Devoluções
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Conteúdo */}
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
        <Orders />
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
                  <option value="tray_atacado">Tray Atacado</option>
                  <option value="tray_varejo">Tray Varejo</option>
                  <option value="tray">Tray — detectar pelo arquivo (prefixo 5/2 ou loja)</option>
                </select>
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
              <h2 className="text-lg font-black tracking-tight text-slate-900">Importar produtos (Tray)</h2>
              <p className="mt-1 text-sm text-slate-500">
                Escolha a loja acima e use o arquivo <span className="font-bold">produtos_vendidos_*.csv</span>. Deve ser o mesmo subcanal dos pedidos já importados.
              </p>
            </div>

            <form onSubmit={handleItemsSubmit} className="mt-5 grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
              <div className="md:col-span-3">
                <label className="block text-xs font-bold tracking-widest uppercase text-slate-500">Loja Tray</label>
                <select
                  value={itemsTraySource}
                  onChange={(e) => setItemsTraySource(e.target.value as 'tray' | 'tray_atacado' | 'tray_varejo')}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500/30"
                >
                  <option value="tray_atacado">Tray Atacado</option>
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
    </div>
  );
}

export default App;