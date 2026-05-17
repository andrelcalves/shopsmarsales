/** Lê corpo da resposta como JSON; se vier HTML (404/SPA), mensagem clara. */
export async function parseApiJson<T = Record<string, unknown>>(response: Response): Promise<T> {
  const text = await response.text();
  const trimmed = text.trim();
  if (!trimmed) return {} as T;
  if (trimmed.startsWith('<')) {
    throw new Error(
      response.status === 404
        ? 'Rota da API não encontrada. O backend pode estar desatualizado — tente novamente em alguns minutos ou contate o suporte.'
        : 'A API retornou HTML em vez de JSON. Verifique se REACT_APP_API_URL aponta para o servidor correto.',
    );
  }
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    throw new Error(trimmed.slice(0, 200) || `Resposta inválida (HTTP ${response.status}).`);
  }
}
