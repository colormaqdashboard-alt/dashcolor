import * as XLSX from "xlsx";
import type { Projeto } from "@/lib/dashboard";

export type DashboardData = {
  projetos: Projeto[];
  equipe: { lider: string; gerente: string }[];
  metas: { gerente: string; meta: number }[];
  fases: { fase: string; pct: number; etapa: string }[];
};

const norm = (s: unknown) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, " ")
    .trim();

const FIELD_MATCHERS: { key: keyof Projeto; test: (h: string) => boolean }[] = [
  { key: "matricula", test: (h) => /\bmatricula\b/.test(h) },
  { key: "projeto", test: (h) => /\bprojeto\b/.test(h) && !/tipo/.test(h) },
  { key: "tipo", test: (h) => /\btipo\b/.test(h) },
  { key: "setor", test: (h) => /(setor|filial)/.test(h) },
  { key: "lider", test: (h) => /\blider\b/.test(h) },
  { key: "gerente", test: (h) => /\bgerente\b/.test(h) },
  { key: "fase3_2_compras", test: (h) => /compras/.test(h) },
  { key: "fase3_1", test: (h) => /fase\s*3\s*\.?\s*1/.test(h) },
  { key: "fase3_2", test: (h) => /fase\s*3\s*\.?\s*2/.test(h) },
  { key: "fase1", test: (h) => /fase\s*1\b/.test(h) },
  { key: "fase2", test: (h) => /fase\s*2\b/.test(h) },
  { key: "fase3", test: (h) => /fase\s*3\b/.test(h) },
  { key: "fase4", test: (h) => /fase\s*4\b/.test(h) },
  { key: "fase5", test: (h) => /fase\s*5\b/.test(h) },
  { key: "desperdicio", test: (h) => /desperdicio/.test(h) },
  { key: "saving_aprovado", test: (h) => /saving.*aprov|aprov.*saving|controladoria/.test(h) },
  { key: "saving_previsto", test: (h) => /saving/.test(h) },
  { key: "investimento", test: (h) => /investimento/.test(h) },
  { key: "memorial", test: (h) => /memorial/.test(h) },
  { key: "proxima_acao", test: (h) => /proxima/.test(h) },
  { key: "responsavel_acao", test: (h) => /respons/.test(h) },
  { key: "prazo_acao", test: (h) => /prazo/.test(h) },
  { key: "status", test: (h) => /\bstatus\b/.test(h) },
  { key: "observacao", test: (h) => /observ/.test(h) },
  { key: "ultima_atualizacao", test: (h) => /ultima.*atualiz|atualiz/.test(h) },
  { key: "evidencia", test: (h) => /evidencia/.test(h) },
];

function mapHeaders(headers: string[]): Partial<Record<keyof Projeto, number>> {
  const map: Partial<Record<keyof Projeto, number>> = {};
  headers.forEach((h, i) => {
    const n = norm(h);
    if (!n) return;
    for (const m of FIELD_MATCHERS) {
      if (map[m.key] != null) continue;
      if (m.test(n)) {
        map[m.key] = i;
        return;
      }
    }
  });
  return map;
}

function toNumber(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return isFinite(v) ? v : null;
  let s = String(v).trim();
  if (!s) return null;
  s = s.replace(/[R$\s]/gi, "");
  // Brazilian: 1.234,56 -> 1234.56
  if (/,/.test(s) && /\./.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else if (/,/.test(s)) s = s.replace(",", ".");
  const n = Number(s);
  return isFinite(n) ? n : null;
}

// Coluna R — Investimento é alfanumérica. Removemos qualquer letra ou
// símbolo e mantemos apenas dígitos, vírgulas, pontos e sinal. Valores
// inválidos viram 0. SEM teto de magnitude.
function toInvestimento(v: unknown): number {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return isFinite(v) ? v : 0;
  let s = String(v).replace(/[^\d,.\-]/g, "");
  if (!s || s === "-" || s === "." || s === ",") return 0;
  if (/,/.test(s) && /\./.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else if (/,/.test(s)) s = s.replace(",", ".");
  const n = Number(s);
  return isFinite(n) ? n : 0;
}

function toDateISO(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v.toISOString();
  if (typeof v === "number") {
    // Excel serial date
    const d = XLSX.SSF?.parse_date_code?.(v);
    if (d) return new Date(Date.UTC(d.y, d.m - 1, d.d)).toISOString();
  }
  const s = String(v).trim();
  if (!s) return null;
  // dd/mm/yyyy
  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (br) {
    const yyyy = br[3].length === 2 ? 2000 + Number(br[3]) : Number(br[3]);
    const d = new Date(Date.UTC(yyyy, Number(br[2]) - 1, Number(br[1])));
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function toStr(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

const DATE_FIELDS = new Set<keyof Projeto>([
  "fase1", "fase2", "fase3", "fase3_1", "fase3_2", "fase3_2_compras",
  "fase4", "fase5", "prazo_acao", "ultima_atualizacao",
]);
const NUMBER_FIELDS = new Set<keyof Projeto>([
  "matricula", "desperdicio", "saving_previsto", "saving_aprovado",
]);

function buildProjetos(rows: unknown[][]): Projeto[] {
  if (!rows || rows.length < 2) return [];
  // Skip leading empty rows; pick first row with >=3 non-empty cells as header
  let headerIdx = 0;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const nonEmpty = rows[i].filter((c) => norm(c)).length;
    if (nonEmpty >= 3) { headerIdx = i; break; }
  }
  const headers = (rows[headerIdx] || []).map((h) => String(h ?? ""));
  const map = mapHeaders(headers);
  const out: Projeto[] = [];
  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || !row.some((c) => norm(c))) continue;
    const p: any = {
      matricula: 0, projeto: "", tipo: null, setor: null, lider: null, gerente: null,
      fase1: null, fase2: null, fase3: null, fase3_1: null, fase3_2: null, fase3_2_compras: null,
      fase4: null, fase5: null, desperdicio: null, saving_previsto: null, saving_aprovado: null,
      investimento: null, investimento_raw: null, memorial: null, proxima_acao: null, responsavel_acao: null,
      prazo_acao: null, status: null, observacao: null, ultima_atualizacao: null, evidencia: null,
    };
    for (const m of FIELD_MATCHERS) {
      const idx = map[m.key];
      if (idx == null) continue;
      const v = row[idx];
      if (m.key === "investimento") {
        (p as any).investimento = toInvestimento(v);
        (p as any).investimento_raw = toStr(v);
      } else if (NUMBER_FIELDS.has(m.key)) (p as any)[m.key] = toNumber(v);
      else if (DATE_FIELDS.has(m.key)) (p as any)[m.key] = toDateISO(v);
      else (p as any)[m.key] = toStr(v);
    }
    if (!p.projeto && !p.matricula) continue;
    if (!p.matricula) p.matricula = r;
    out.push(p as Projeto);
  }
  return out;
}

function buildEquipe(rows: unknown[][]): { lider: string; gerente: string }[] {
  if (!rows || rows.length < 2) return [];
  const headers = (rows[0] || []).map((h) => norm(h));
  const liderIdx = headers.findIndex((h) => /lider/.test(h));
  const gerenteIdx = headers.findIndex((h) => /gerente/.test(h));
  if (liderIdx < 0 || gerenteIdx < 0) return [];
  return rows.slice(1)
    .map((r) => ({ lider: toStr(r[liderIdx]) || "", gerente: toStr(r[gerenteIdx]) || "" }))
    .filter((x) => x.lider && x.gerente);
}

function buildMetas(rows: unknown[][]): { gerente: string; meta: number }[] {
  if (!rows || rows.length < 2) return [];
  const headers = (rows[0] || []).map((h) => norm(h));
  // Spec: EQUIPE col E = gerente, col F = meta. Fall back to header-based detection.
  let gerenteIdx = 4;
  let metaIdx = 5;
  const gByHeader = headers.findIndex((h) => /gerente/.test(h));
  const mByHeader = headers.findIndex((h) => /\bmeta\b/.test(h));
  if (gByHeader >= 0) gerenteIdx = gByHeader;
  if (mByHeader >= 0) metaIdx = mByHeader;
  const map = new Map<string, number>();
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i] || [];
    const g = toStr(r[gerenteIdx]);
    const m = toNumber(r[metaIdx]);
    if (!g || m == null) continue;
    map.set(g.trim(), (map.get(g.trim()) || 0) + m);
  }
  return Array.from(map, ([gerente, meta]) => ({ gerente, meta }));
}

function buildFases(rows: unknown[][]): { fase: string; pct: number; etapa: string }[] {
  return buildFasesImpl(rows);
}

function buildMetasGerentes(rows: unknown[][]): { gerente: string; meta: number }[] {
  if (!rows || rows.length < 1) return [];
  // Aba "Metas gerentes": coluna A = nome do gerente, coluna B = meta.
  // Detecta automaticamente se a primeira linha é cabeçalho.
  const first = rows[0] || [];
  const firstAIsHeader = !!toStr(first[0]) && toNumber(first[1]) == null;
  const start = firstAIsHeader ? 1 : 0;
  const map = new Map<string, number>();
  for (let i = start; i < rows.length; i++) {
    const r = rows[i] || [];
    const g = toStr(r[0]);
    const m = toNumber(r[1]);
    if (!g || m == null) continue;
    const key = g.trim();
    map.set(key, (map.get(key) || 0) + m);
  }
  return Array.from(map, ([gerente, meta]) => ({ gerente, meta }));
}

function buildFasesImpl(rows: unknown[][]): { fase: string; pct: number; etapa: string }[] {
  if (!rows || rows.length < 2) return [];
  const headers = (rows[0] || []).map((h) => norm(h));
  const faseIdx = headers.findIndex((h) => /fase/.test(h));
  const pctIdx = headers.findIndex((h) => /(%|pct|percent|conclusao)/.test(h));
  const etapaIdx = headers.findIndex((h) => /(etapa|descric)/.test(h));
  if (faseIdx < 0) return [];
  return rows.slice(1).map((r) => ({
    fase: toStr(r[faseIdx]) || "",
    pct: pctIdx >= 0 ? (toNumber(r[pctIdx]) || 0) : 0,
    etapa: etapaIdx >= 0 ? (toStr(r[etapaIdx]) || "") : "",
  })).filter((x) => x.fase);
}

function sheetToRows(wb: XLSX.WorkBook, name: string): unknown[][] {
  const match = wb.SheetNames.find((n) => norm(n) === norm(name))
    || wb.SheetNames.find((n) => norm(n).startsWith(norm(name)))
    || wb.SheetNames.find((n) => norm(n).includes(norm(name)));
  if (!match) return [];
  const ws = wb.Sheets[match];
  return XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null });
}

function workbookToData(wb: XLSX.WorkBook): DashboardData {
  const equipeRows = sheetToRows(wb, "EQUIPE");
  const metasRows = sheetToRows(wb, "Metas gerentes");
  return {
    projetos: buildProjetos(sheetToRows(wb, "Projetos")),
    equipe: buildEquipe(equipeRows),
    metas: buildMetasGerentes(metasRows),
    fases: buildFases(sheetToRows(wb, "Funcionalidade")),
  };
}

export async function loadFromExcelFile(file: File): Promise<DashboardData> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  return workbookToData(wb);
}

export function extractSpreadsheetId(url: string): string | null {
  const m = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return m ? m[1] : null;
}

async function fetchSheetCSV(id: string, sheetName: string): Promise<unknown[][]> {
  const url = `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Falha ao buscar aba "${sheetName}" (HTTP ${res.status}). Verifique se a planilha está pública.`);
  const text = await res.text();
  const wb = XLSX.read(text, { type: "string", cellDates: true });
  const first = wb.SheetNames[0];
  return XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[first], { header: 1, raw: true, defval: null });
}

export async function loadFromGoogleSheets(url: string): Promise<DashboardData> {
  const id = extractSpreadsheetId(url);
  if (!id) throw new Error("URL inválida. Use o link de uma planilha do Google Sheets.");
  // Download the whole spreadsheet as .xlsx (one request) and parse locally.
  const exportUrl = `https://docs.google.com/spreadsheets/d/${id}/export?format=xlsx`;
  const res = await fetch(exportUrl);
  if (!res.ok) {
    throw new Error(
      `Falha ao baixar a planilha (HTTP ${res.status}). Verifique se ela está pública (Qualquer pessoa com o link · Leitor).`,
    );
  }
  const buf = await res.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  return workbookToData(wb);
}