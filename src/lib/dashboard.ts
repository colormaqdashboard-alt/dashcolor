import data from "@/data/dashboard-data.json";

export type Projeto = {
  matricula: number;
  projeto: string;
  tipo: string | null;
  setor: string | null;
  lider: string | null;
  gerente: string | null;
  fase1: string | null;
  fase2: string | null;
  fase3: string | null;
  fase3_1: string | null;
  fase3_2: string | null;
  fase3_2_compras: string | null;
  fase4: string | null;
  fase5: string | null;
  desperdicio: number | null;
  saving_previsto: number | null;
  saving_aprovado: number | null;
  investimento: number | null;
  investimento_raw: string | null;
  memorial: string | null;
  proxima_acao: string | null;
  responsavel_acao: string | null;
  prazo_acao: string | null;
  status: string | null;
  observacao: string | null;
  ultima_atualizacao: string | null;
  evidencia: string | null;
};

export const RAW = data as {
  projetos: Projeto[];
  equipe: { lider: string; gerente: string }[];
  metas: { gerente: string; meta: number }[];
  fases: { fase: string; pct: number; etapa: string }[];
};

export const FASE_ORDER: { key: keyof Projeto; label: string; pct: number }[] = [
  { key: "fase1", label: "Fase 1 - Estudo do Problema", pct: 0.2 },
  { key: "fase2", label: "Fase 2 - Levantamento de Dados", pct: 0.4 },
  { key: "fase3", label: "Fase 3 - Plano de Ação", pct: 0.6 },
  { key: "fase3_1", label: "Fase 3.1 - Ações sem Investimento", pct: 0.6 },
  { key: "fase3_2", label: "Fase 3.2 - Ações com Investimento", pct: 0.6 },
  { key: "fase3_2_compras", label: "Fase 3.2 - Compras", pct: 0.6 },
  { key: "fase4", label: "Fase 4 - Instalação", pct: 0.8 },
  { key: "fase5", label: "Fase 5 - Finalizado / Coletando Dados", pct: 0.9 },
];

export type EnrichedProjeto = Projeto & {
  faseAtual: string;
  faseAtualPct: number;
  dataInicio: Date | null;
  dataUltimaFase: Date | null;
  leadTimeDias: number | null;
  concluido: boolean;
  atrasado: boolean;
  semPrazo: boolean;
  parado: boolean;
  pctConclusao: number;
  savingAprovadoEfetivo: number;
};

const parseDate = (v: string | null): Date | null => {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
};

export const fmtMoney = (n: number | null | undefined) => {
  const v = Number(n) || 0;
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
};

export const fmtPct = (n: number) =>
  `${(n * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

export const fmtDate = (d: Date | null) =>
  d ? d.toLocaleDateString("pt-BR") : "—";

/**
 * ROI (Payback) — tempo de retorno do investimento em ANOS.
 * Regra única do sistema:
 *  - investimento === 0  → Infinity (exibido como "∞")
 *  - saving <= 0         → null (exibido como "—")
 *  - caso contrário       → investimento / saving (em anos)
 */
export function computePayback(investimento: number, saving: number): number | null {
  const inv = Number(investimento) || 0;
  const sav = Number(saving) || 0;
  if (inv === 0) return Infinity;
  if (sav <= 0) return null;
  return inv / sav;
}

/** ROI Validado com fallback: usa savingValidado quando > 0, senão savingPrevisto. */
export function computePaybackValidado(
  investimento: number,
  savingValidado: number,
  savingPrevisto: number,
): number | null {
  const sv = Number(savingValidado) || 0;
  return computePayback(investimento, sv > 0 ? sv : Number(savingPrevisto) || 0);
}

/** Formata anos em texto intuitivo: "X dias" / "X meses" / "X ano(s) e Y mês/meses". */
export function fmtPayback(years: number | null | undefined): string {
  if (years == null) return "—";
  if (!isFinite(years)) return "∞";
  if (years < 0) return "—";
  const totalDays = Math.round(years * 365);
  if (totalDays < 30) {
    const d = Math.max(1, totalDays);
    return `${d} ${d === 1 ? "dia" : "dias"}`;
  }
  const totalMonths = Math.max(1, Math.round(years * 12));
  if (totalMonths < 12) {
    return `${totalMonths} ${totalMonths === 1 ? "mês" : "meses"}`;
  }
  const y = Math.floor(totalMonths / 12);
  const m = totalMonths % 12;
  const yLabel = `${y} ${y === 1 ? "ano" : "anos"}`;
  if (m === 0) return yLabel;
  return `${yLabel} e ${m} ${m === 1 ? "mês" : "meses"}`;
}

/** Classe de cor (Tailwind) para o payback: < 1 ano (success), 1-3 anos (warning), > 3 (danger). */
export function paybackToneClass(years: number | null | undefined): string {
  if (years == null) return "text-muted-foreground";
  if (!isFinite(years)) return "text-success font-semibold";
  if (years < 1) return "text-success font-semibold";
  if (years <= 3) return "text-warning font-semibold";
  return "text-destructive font-semibold";
}

/** Comparador para ordenação asc: menor payback (melhor) primeiro; ∞ (sem investimento) é o melhor; null é o pior. */
export function paybackCompare(a: number | null, b: number | null): number {
  const va = a == null ? Number.POSITIVE_INFINITY : !isFinite(a) ? -1 : a;
  const vb = b == null ? Number.POSITIVE_INFINITY : !isFinite(b) ? -1 : b;
  return va - vb;
}

export function enrich(p: Projeto, today = new Date()): EnrichedProjeto {
  let faseAtual = "Não Iniciado";
  let faseAtualPct = 0;
  let dataUltimaFase: Date | null = null;
  for (const f of FASE_ORDER) {
    const d = parseDate(p[f.key] as string | null);
    if (d) {
      faseAtual = f.label;
      faseAtualPct = f.pct;
      dataUltimaFase = d;
    }
  }
  // REGRA OFICIAL: status vem exclusivamente da coluna W. Validado SOMENTE
  // quando o texto for exatamente "Validado pela controladoria".
  const validado =
    (p.status || "").trim().toLowerCase() === "validado pela controladoria";
  if (validado) {
    faseAtual = "Validado pela Controladoria";
    faseAtualPct = 1;
  }
  const dataInicio = parseDate(p.fase1);
  const leadTimeDias =
    dataInicio && dataUltimaFase
      ? Math.max(
          0,
          Math.round(
            ((validado ? dataUltimaFase.getTime() : today.getTime()) -
              dataInicio.getTime()) /
              86400000
          )
        )
      : null;
  const prazo = parseDate(p.prazo_acao);
  const atrasado =
    !validado && (p.status === "Atrasado" || (prazo != null && prazo < today));
  const semPrazo = !validado && prazo == null;
  const ultima = parseDate(p.ultima_atualizacao);
  const parado =
    !validado &&
    ultima != null &&
    (today.getTime() - ultima.getTime()) / 86400000 > 30;

  return {
    ...p,
    faseAtual,
    faseAtualPct,
    dataInicio,
    dataUltimaFase,
    leadTimeDias,
    concluido: validado,
    atrasado,
    semPrazo,
    parado,
    pctConclusao: faseAtualPct,
    // Saving aprovado só conta quando validado pela controladoria.
    savingAprovadoEfetivo: validado ? Number(p.saving_aprovado) || 0 : 0,
  };
}

export function enrichAll(): EnrichedProjeto[] {
  return RAW.projetos.map((p) => enrich(p));
}

export function enrichProjetos(projetos: Projeto[]): EnrichedProjeto[] {
  return projetos.map((p) => enrich(p));
}

export function uniq<T>(arr: (T | null | undefined)[]): T[] {
  return Array.from(new Set(arr.filter((x): x is T => x != null && x !== "")));
}

export function pareto<T extends { value: number; label: string }>(items: T[]) {
  const sorted = [...items].sort((a, b) => b.value - a.value);
  const total = sorted.reduce((s, x) => s + x.value, 0) || 1;
  let acc = 0;
  return sorted.map((x) => {
    acc += x.value;
    return { ...x, acumulado: (acc / total) * 100 };
  });
}