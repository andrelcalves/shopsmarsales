export type BankStatementDraft = {
  externalId: string;
  date: string;
  amount: number;
  type: 'payable' | 'receivable';
  supplier: string;
  description: string;
  settled: boolean;
  included: boolean;
  isFixedCost: boolean;
};

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function parseNubankDate(raw: string): string | null {
  const s = String(raw || '').trim();
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const dd = m[1];
  const mm = m[2];
  const yyyy = m[3];
  return `${yyyy}-${mm}-${dd}`;
}

function parseAmount(raw: string): number | null {
  const s = String(raw || '').trim();
  if (!s) return null;
  // Nubank CSV export uses dot as decimal separator (e.g. -1156.58, 800.00)
  const normalized = s.includes(',') && !s.includes('.') ? s.replace(',', '.') : s;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

export function extractSupplierFromDescription(description: string): string {
  const desc = String(description || '').trim();
  const pixSent = desc.match(/^Transferência enviada pelo Pix\s*-\s*(.+?)(?:\s*-\s*|$)/i);
  if (pixSent?.[1]) return pixSent[1].trim();
  const pixReceived = desc.match(/^Transferência recebida pelo Pix\s*-\s*(.+?)(?:\s*-\s*|$)/i);
  if (pixReceived?.[1]) return pixReceived[1].trim();
  const firstPart = desc.split(' - ')[0]?.trim();
  return firstPart || desc;
}

export function parseNubankStatementCsv(csvText: string): {
  payables: BankStatementDraft[];
  receivables: BankStatementDraft[];
  errors: string[];
} {
  const errors: string[] = [];
  const payables: BankStatementDraft[] = [];
  const receivables: BankStatementDraft[] = [];

  const lines = String(csvText || '')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    errors.push('Arquivo CSV vazio ou sem linhas de dados.');
    return { payables, receivables, errors };
  }

  const header = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const dateIdx = header.findIndex((h) => h === 'data');
  const valueIdx = header.findIndex((h) => h === 'valor');
  const idIdx = header.findIndex((h) => h === 'identificador');
  const descIdx = header.findIndex((h) => h.includes('descri'));

  if (dateIdx < 0 || valueIdx < 0 || idIdx < 0 || descIdx < 0) {
    errors.push('Cabeçalho inválido. Esperado: Data, Valor, Identificador, Descrição.');
    return { payables, receivables, errors };
  }

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const date = parseNubankDate(cols[dateIdx] ?? '');
    const amountRaw = parseAmount(cols[valueIdx] ?? '');
    const externalId = String(cols[idIdx] ?? '').trim();
    const description = String(cols[descIdx] ?? '').trim();

    if (!date) {
      errors.push(`Linha ${i + 1}: data inválida.`);
      continue;
    }
    if (amountRaw == null || amountRaw === 0) {
      errors.push(`Linha ${i + 1}: valor inválido.`);
      continue;
    }
    if (!externalId) {
      errors.push(`Linha ${i + 1}: identificador ausente.`);
      continue;
    }

    const draft: BankStatementDraft = {
      externalId,
      date,
      amount: Math.round(Math.abs(amountRaw) * 100) / 100,
      type: amountRaw < 0 ? 'payable' : 'receivable',
      supplier: extractSupplierFromDescription(description),
      description,
      settled: true,
      included: true,
      isFixedCost: false,
    };

    if (draft.type === 'payable') payables.push(draft);
    else receivables.push(draft);
  }

  return { payables, receivables, errors };
}
