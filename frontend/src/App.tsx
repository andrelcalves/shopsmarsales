// frontend/src/App.tsx
import React, { useState, FormEvent, useEffect } from 'react';
import './App.css';
import Dashboard from './Dashboard'; // Importa o componente de gráficos

const API_URL = 'http://localhost:4000';

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
  const [currentView, setCurrentView] = useState<'upload' | 'dashboard'>('upload');

  // --- LÓGICA DA TELA DE UPLOAD ---
  const [file, setFile] = useState<File | null>(null);
  const [source, setSource] = useState<'shopee' | 'tiktok'>('shopee');
  const [message, setMessage] = useState('');
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFile(e.target.files[0]);
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

  return (
    <div className="App">
      {/* --- MENU DE NAVEGAÇÃO --- */}
      <nav style={{ 
        padding: '15px', 
        backgroundColor: '#282c34', 
        borderBottom: '1px solid #444',
        display: 'flex',
        justifyContent: 'center',
        gap: '20px'
      }}>
        <button 
          onClick={() => setCurrentView('upload')}
          style={{
            padding: '10px 20px',
            cursor: 'pointer',
            backgroundColor: currentView === 'upload' ? '#61dafb' : '#ccc',
            border: 'none',
            borderRadius: '5px',
            fontWeight: 'bold',
            color: currentView === 'upload' ? '#000' : '#444'
          }}
        >
          📥 Upload & Lista
        </button>

        <button 
          onClick={() => setCurrentView('dashboard')}
          style={{
            padding: '10px 20px',
            cursor: 'pointer',
            backgroundColor: currentView === 'dashboard' ? '#61dafb' : '#ccc',
            border: 'none',
            borderRadius: '5px',
            fontWeight: 'bold',
            color: currentView === 'dashboard' ? '#000' : '#444'
          }}
        >
          📊 Dashboard Gráfico
        </button>
      </nav>

      {/* --- RENDERIZAÇÃO CONDICIONAL --- */}
      
      {currentView === 'dashboard' ? (
        // Se a view for dashboard, mostramos o componente Dashboard
        <Dashboard />
      ) : (
        // Se não, mostramos o layout original de Upload/Lista
        <header className="App-header">
          <h1>Consolidador de Vendas</h1>
          
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.1)', padding: '20px', borderRadius: '10px' }}>
            <div>
              <label htmlFor="source-select" style={{ marginRight: '10px' }}>Canal de Venda:</label>
              <select
                id="source-select"
                value={source}
                onChange={(e) => setSource(e.target.value as any)}
                style={{ padding: '5px' }}
              >
                <option value="shopee">Shopee</option>
                <option value="tiktok">TikTok Shop</option>
              </select>
            </div>
            
            <div>
              <input 
                type="file" 
                onChange={handleFileChange} 
                accept=".csv, .xlsx, .xls"
                style={{ color: '#fff' }}
              />
            </div>

            <button type="submit" disabled={!file} style={{ padding: '10px 20px', cursor: 'pointer', fontWeight: 'bold' }}>
              Enviar Arquivo
            </button>
          </form>
          
          {message && <p style={{ marginTop: '10px', color: '#61dafb' }}>{message}</p>}

          <hr style={{ width: '80%', margin: '30px 0', borderColor: '#555' }} />

          <h2>Últimas Vendas Importadas</h2>
          {loading ? (
            <p>Carregando lista...</p>
          ) : (
            <div style={{ maxHeight: '400px', overflowY: 'auto', width: '90%' }}>
              <table border={1} cellPadding="8" style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.9rem' }}>
                <thead style={{ position: 'sticky', top: 0, backgroundColor: '#20232a' }}>
                  <tr>
                    <th>Data</th>
                    <th>ID Pedido</th>
                    <th>Produto</th>
                    <th>Qtd.</th>
                    <th>Preço Total</th>
                    <th>Origem</th>
                  </tr>
                </thead>
                <tbody>
                  {sales.map((sale) => (
                    <tr key={sale.id}>
                      <td>{new Date(sale.orderDate).toLocaleDateString()}</td>
                      <td>{sale.orderId}</td>
                      <td>{sale.productName}</td>
                      <td>{sale.quantity}</td>
                      <td>{sale.totalPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                      <td>
                        <span style={{ 
                          padding: '2px 8px', 
                          borderRadius: '4px',
                          backgroundColor: sale.source === 'shopee' ? '#EE4D2D' : '#000',
                          color: '#fff',
                          fontSize: '0.8rem'
                        }}>
                          {sale.source}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </header>
      )}
    </div>
  );
}

export default App;