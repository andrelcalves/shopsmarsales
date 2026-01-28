// frontend/src/App.tsx
import React, { useState, FormEvent, useEffect } from 'react';
import './App.css';
import Dashboard from './Dashboard'; // Importa o componente de gráficos
import AdsSpend from './AdsSpend';
import AdsDashboard from './AdsDashboard';

const API_URL = 'http://localhost:4000';

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

function App() {
  // Estado para controlar qual tela está visível: 'upload' ou 'dashboard'
  const [currentView, setCurrentView] = useState<'upload' | 'dashboard' | 'ads_spend' | 'ads_dashboard'>('upload');

  // --- LÓGICA DA TELA DE UPLOAD ---
  const [file, setFile] = useState<File | null>(null);
  const [source, setSource] = useState<'shopee' | 'tiktok' | 'tray'>('shopee');
  const [message, setMessage] = useState('');
  const [itemsFile, setItemsFile] = useState<File | null>(null);
  const [itemsMessage, setItemsMessage] = useState('');
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

  const handleItemsSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!itemsFile) {
      setItemsMessage('Por favor, selecione o arquivo de produtos vendidos (CSV).');
      return;
    }

    setItemsMessage('Enviando e processando produtos...');
    const formData = new FormData();
    formData.append('file', itemsFile);
    formData.append('source', 'tray');

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
                    ? 'Dashboard'
                    : currentView === 'ads_spend'
                      ? 'Cadastro ADS'
                      : 'Dashboard ADS'}
              </h1>
              <p className="mt-1 text-white/80 text-sm">Shopee + TikTok + Tray • Importação e visualização</p>
            </div>

            {/* Toggle */}
            <div className="flex items-center gap-2 bg-white/10 border border-white/15 rounded-2xl p-1">
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
                onClick={() => setCurrentView('dashboard')}
                className={cn(
                  'px-4 py-2 rounded-xl text-sm font-extrabold transition',
                  currentView === 'dashboard' ? 'bg-white text-slate-900 shadow-sm' : 'text-white/85 hover:bg-white/10'
                )}
              >
                Dashboard
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
                onClick={() => setCurrentView('ads_dashboard')}
                className={cn(
                  'px-4 py-2 rounded-xl text-sm font-extrabold transition',
                  currentView === 'ads_dashboard' ? 'bg-white text-slate-900 shadow-sm' : 'text-white/85 hover:bg-white/10'
                )}
              >
                Dashboard ADS
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Conteúdo */}
      {currentView === 'dashboard' ? (
        <Dashboard />
      ) : currentView === 'ads_spend' ? (
        <AdsSpend />
      ) : currentView === 'ads_dashboard' ? (
        <AdsDashboard />
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
                  onChange={(e) => setSource(e.target.value as any)}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500/30"
                >
                  <option value="shopee">Shopee</option>
                  <option value="tiktok">TikTok Shop</option>
                  <option value="tray">Site Tray</option>
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
                Use o arquivo <span className="font-bold">produtos_vendidos_*.csv</span> para associar itens aos pedidos Tray.
              </p>
            </div>

            <form onSubmit={handleItemsSubmit} className="mt-5 grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
              <div className="md:col-span-9">
                <label className="block text-xs font-bold tracking-widest uppercase text-slate-500">Arquivo de produtos</label>
                <input
                  type="file"
                  onChange={handleItemsFileChange}
                  accept=".csv"
                  className="mt-2 block w-full text-sm text-slate-700 file:mr-4 file:rounded-xl file:border-0 file:bg-slate-100 file:px-4 file:py-2 file:text-sm file:font-extrabold file:text-slate-900 hover:file:bg-slate-200"
                />
              </div>
              <div className="md:col-span-3">
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