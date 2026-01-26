// frontend/src/App.tsx
import React, { useState, FormEvent, useEffect } from 'react';
import './App.css';

// É uma boa prática definir a URL da API em uma variável de ambiente,
// mas para simplificar, vamos defini-la como uma constante.
const API_URL = 'http://localhost:4000';

// Definindo o tipo para uma venda, para usar no nosso estado
interface Sale {
  id: number;
  orderId: string;
  orderDate: string; // A data virá como string do JSON
  productName: string;
  quantity: number;
  totalPrice: number;
  source: string;
}

function App() {
  // Estado para o formulário de upload
  const [file, setFile] = useState<File | null>(null);
  const [source, setSource] = useState<'shopee' | 'tiktok' | 'site'>('shopee');
  const [message, setMessage] = useState('');

  // Estado para a lista de vendas
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
        setSales(Array.isArray(data) ? data : []); // Garante que 'sales' é um array
      } else {
        console.error('Erro ao buscar vendas:', response.status, response.statusText);
        setSales([]); // Limpa as vendas em caso de erro da API
      }
    } catch (error) {
      console.error('Erro ao buscar dados:', error);
    } finally {
      setLoading(false);
    }
  };

  // useEffect para buscar os dados quando o componente montar
  useEffect(() => {
    fetchSales();
  }, []);

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
        fetchSales(); // Atualiza a lista de vendas após o upload
      } else {
        throw new Error(data.message || 'Ocorreu um erro no upload.');
      }
    } catch (error: any) {
      setMessage(`Erro: ${error.message}`);
    }
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>Consolidador de Vendas</h1>
        <form onSubmit={handleSubmit}>
          {/* ... formulário de upload ... */}
        </form>
        {message && <p>{message}</p>}

        <hr />

        <h2>Dashboard de Vendas Consolidadas</h2>
        {loading ? (
          <p>Carregando dados...</p>
        ) : (
          <table>
            <thead>
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
                  <td>{sale.totalPrice.toFixed(2)}</td>
                  <td>{sale.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </header>
    </div>
  );
}

export default App;
