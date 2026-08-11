import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  DollarSign,
  Filter,
  FileSpreadsheet,
  FileCode2,
  Link2,
  RefreshCw,
  RotateCcw,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  enrichProjetos,
  RAW,
  fmtDate,
  fmtMoney,
  fmtPct,
  pareto,
  uniq,
  type Projeto,
  type EnrichedProjeto,
} from "@/lib/dashboard";
import {
  exportRankingXLSX,
  exportRankingHTML,
  type RankingKind,
} from "@/lib/ranking-export";
import {
  loadFromGoogleSheets,
  type DashboardData,
  type NovoProjeto,
} from "@/lib/data-source";
import { Kpi } from "./Kpi";
import { SectionCard } from "./SectionCard";
import { FinanceiroTable } from "./FinanceiroTable";
import { PainelEstrategicoROI } from "./PainelEstrategicoROI";
import { StatusReportDialog } from "./StatusReportDialog";
import { PerformanceExecutivoPanel } from "./PerformanceExecutivoPanel";
import type { StatusReportRow } from "@/lib/status-report";

const ALL = "__all__";

const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

function hasBlackStatusTreatment(status: string) {
  const low = status.trim().toLowerCase();
  return low === "inviabilizado" || low === "reprovado pela controladoria";
}

function statusBadge(p: EnrichedProjeto) {
  // Status sempre vem literal da coluna W da aba Projetos.
  const s = (p.status || "").trim();
  if (!s) return <Badge variant="secondary">Sem status</Badge>;
  const low = s.toLowerCase();
  if (low === "validado pela controladoria")
    return <Badge className="bg-success text-success-foreground hover:bg-success">{s}</Badge>;
  if (low === "atrasado") return <Badge variant="destructive">{s}</Badge>;
  if (hasBlackStatusTreatment(s))
    return <Badge className="bg-black text-white hover:bg-black">{s}</Badge>;
  return <Badge variant="secondary">{s}</Badge>;
}

const STORAGE_KEY = "dashboard.source.v1";
const SHEET_URL_KEY = "dashboard.sheetUrl.v1";

type SourceState = {
  label: string;
  detail: string;
  projetos: Projeto[];
  metas: { gerente: string; meta: number }[];
  novosProjetos: NovoProjeto[];
  updatedAt: Date;
};

// Relação oficial percentual → Conclusão (coluna F da estrutura de fases).
const CONCLUSAO_POR_PCT: Record<number, string> = {
  0: "Não iniciado",
  20: "1ª fase",
  40: "2ª fase",
  60: "3ª fase",
  70: "3ª fase",
  80: "4ª fase",
  90: "5ª fase",
  100: "Finalizado",
};

function loadPersistedSource(): SourceState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.projetos?.length) return null;
    return {
      label: parsed.label,
      detail: parsed.detail,
      projetos: parsed.projetos as Projeto[],
      metas: parsed.metas || [],
      novosProjetos: (parsed.novosProjetos || []) as NovoProjeto[],
      updatedAt: parsed.updatedAt ? new Date(parsed.updatedAt) : new Date(),
    };
  } catch {
    return null;
  }
}

export default function Dashboard() {
  const [source, setSource] = useState<SourceState>(() => {
    const persisted = loadPersistedSource();
    if (persisted) return persisted;
    return {
      label: "Dados de exemplo (interno)",
      detail: `${RAW.projetos.length} projetos`,
      projetos: RAW.projetos as Projeto[],
      metas: RAW.metas || [],
      novosProjetos: [],
      updatedAt: new Date(),
    };
  });
  const [sheetUrl, setSheetUrl] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    try {
      return window.localStorage.getItem(SHEET_URL_KEY) || "";
    } catch {
      return "";
    }
  });
  const [loadingSource, setLoadingSource] = useState(false);
  const [sourceError, setSourceError] = useState<string | null>(null);

  // Hidrata do Cloud (compartilhado para todos os visitantes). Se houver
  // snapshot na nuvem mais recente que o cache local, substitui o estado.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("dashboard_snapshot")
          .select("label, detail, sheet_url, projetos, metas, novos_projetos, updated_at")
          .eq("id", 1)
          .maybeSingle();
        if (cancelled || error || !data) return;
        const projetos = (data.projetos as unknown as Projeto[]) || [];
        if (!projetos.length) return;
        const next: SourceState = {
          label: data.label || "Google Sheets",
          detail: data.detail || `${projetos.length} projetos sincronizados`,
          projetos,
          metas: (data.metas as unknown as { gerente: string; meta: number }[]) || [],
          novosProjetos: (data.novos_projetos as unknown as NovoProjeto[]) || [],
          updatedAt: data.updated_at ? new Date(data.updated_at) : new Date(),
        };
        setSource(next);
        if (data.sheet_url) setSheetUrl(data.sheet_url);
        try {
          window.localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({ ...next, updatedAt: next.updatedAt.toISOString() }),
          );
          if (data.sheet_url) window.localStorage.setItem(SHEET_URL_KEY, data.sheet_url);
        } catch {
          /* ignore */
        }
      } catch {
        /* offline ou sem permissão — mantém cache local */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const all = useMemo(() => enrichProjetos(source.projetos), [source]);

  const applyData = async (
    data: DashboardData,
    label: string,
    detail: string,
    persistSheetUrl?: string,
  ) => {
    if (!data.projetos.length) {
      throw new Error("Nenhum projeto encontrado. Verifique os cabeçalhos da aba 'Projetos'.");
    }
    const next: SourceState = {
      label,
      detail,
      projetos: data.projetos,
      metas: data.metas || [],
      novosProjetos: data.novosProjetos || [],
      updatedAt: new Date(),
    };
    setSource(next);
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ ...next, updatedAt: next.updatedAt.toISOString() }),
      );
    } catch {
      /* ignore quota errors */
    }
    // Persiste na nuvem para todos os visitantes verem os mesmos dados.
    try {
      await supabase.from("dashboard_snapshot").upsert(
        {
          id: 1,
          label,
          detail,
          sheet_url: persistSheetUrl ?? null,
          projetos: data.projetos as any,
          metas: (data.metas || []) as any,
          novos_projetos: (data.novosProjetos || []) as any,
          updated_at: next.updatedAt.toISOString(),
        },
        { onConflict: "id" },
      );
    } catch {
      /* não bloqueia o painel se a nuvem falhar */
    }
  };

  const handleSyncSheet = async () => {
    if (!sheetUrl.trim()) return;
    setLoadingSource(true);
    setSourceError(null);
    try {
      const url = sheetUrl.trim();
      const data = await loadFromGoogleSheets(url);
      await applyData(data, "Google Sheets", `${data.projetos.length} projetos sincronizados`, url);
      try {
        window.localStorage.setItem(SHEET_URL_KEY, url);
      } catch {
        /* ignore */
      }
    } catch (e: any) {
      setSourceError(e?.message || "Erro ao sincronizar a planilha.");
    } finally {
      setLoadingSource(false);
    }
  };


  const [fStatus, setFStatus] = useState(ALL);
  const [fFase, setFFase] = useState(ALL);
  const [fLider, setFLider] = useState(ALL);
  const [fGerente, setFGerente] = useState(ALL);
  const [fSetor, setFSetor] = useState(ALL);
  const [fTipo, setFTipo] = useState(ALL);
  const [dFrom, setDFrom] = useState("");
  const [dTo, setDTo] = useState("");
  const [search, setSearch] = useState("");
  const [showAtencao, setShowAtencao] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    try {
      return window.localStorage.getItem("statusProjetos.showAtencao") !== "false";
    } catch {
      return true;
    }
  });
  const toggleShowAtencao = (v: boolean) => {
    setShowAtencao(v);
    try {
      window.localStorage.setItem("statusProjetos.showAtencao", String(v));
    } catch {
      /* ignore */
    }
  };

  const [reportOpen, setReportOpen] = useState(false);
  const [reportLogo, setReportLogo] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      return window.localStorage.getItem("statusReport.logoDataUri");
    } catch {
      return null;
    }
  });
  const saveReportLogo = (v: string | null) => {
    setReportLogo(v);
    try {
      if (v) window.localStorage.setItem("statusReport.logoDataUri", v);
      else window.localStorage.removeItem("statusReport.logoDataUri");
    } catch {
      /* ignore */
    }
  };
  const handleLogoFile = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") saveReportLogo(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const [showIndicators, setShowIndicators] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    try {
      return window.localStorage.getItem("dashboard.showIndicators") !== "false";
    } catch {
      return true;
    }
  });
  const toggleShowIndicators = (v: boolean) => {
    setShowIndicators(v);
    try {
      window.localStorage.setItem("dashboard.showIndicators", String(v));
    } catch {
      /* ignore */
    }
  };
  const [showMetaGerente, setShowMetaGerente] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    try {
      return window.localStorage.getItem("dashboard.showMetaGerente") !== "false";
    } catch {
      return true;
    }
  });
  const toggleShowMetaGerente = (v: boolean) => {
    setShowMetaGerente(v);
    try {
      window.localStorage.setItem("dashboard.showMetaGerente", String(v));
    } catch {
      /* ignore */
    }
  };

  const statusOpts = useMemo(() => uniq(all.map((p) => p.status)), [all]);
  const faseOpts = useMemo(() => uniq(all.map((p) => p.faseAtual)), [all]);
  const liderOpts = useMemo(() => uniq(all.map((p) => p.lider)).sort(), [all]);
  const gerenteOpts = useMemo(() => uniq(all.map((p) => p.gerente)).sort(), [all]);
  const setorOpts = useMemo(() => uniq(all.map((p) => p.setor)).sort(), [all]);
  const tipoOpts = useMemo(() => uniq(all.map((p) => p.tipo)).sort(), [all]);

  const projetos = useMemo(() => {
    const fromD = dFrom ? new Date(dFrom) : null;
    const toD = dTo ? new Date(dTo) : null;
    const q = search.trim().toLowerCase();
    return all.filter((p) => {
      if (fStatus !== ALL && (p.status || "") !== fStatus) return false;
      if (fFase !== ALL && p.faseAtual !== fFase) return false;
      if (fLider !== ALL && (p.lider || "") !== fLider) return false;
      if (fGerente !== ALL && (p.gerente || "") !== fGerente) return false;
      if (fSetor !== ALL && (p.setor || "") !== fSetor) return false;
      if (fTipo !== ALL && (p.tipo || "") !== fTipo) return false;
      if (fromD && (!p.dataInicio || p.dataInicio < fromD)) return false;
      if (toD && (!p.dataInicio || p.dataInicio > toD)) return false;
      if (q && !`${p.projeto} ${p.matricula}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [all, fStatus, fFase, fLider, fGerente, fSetor, fTipo, dFrom, dTo, search]);

  const totals = useMemo(() => {
    const validados = projetos.filter((p) => p.concluido);
    const emAndamento = projetos.filter(
      (p) => !p.concluido && p.status !== "Inviabilizado"
    );
    const finalizados = projetos.filter(
      (p) => p.faseAtual.startsWith("Fase 5") || p.concluido
    );
    const savingPrev = projetos.reduce((s, p) => s + (Number(p.saving_previsto) || 0), 0);
    // Saving aprovado: SOMENTE projetos com status "Validado pela controladoria" (coluna W).
    const savingAprov = projetos.reduce((s, p) => s + p.savingAprovadoEfetivo, 0);
    const investimento = projetos.reduce((s, p) => s + (Number(p.investimento) || 0), 0);
    const pctMedio =
      projetos.length === 0
        ? 0
        : projetos.reduce((s, p) => s + p.pctConclusao, 0) / projetos.length;
    return {
      total: projetos.length,
      validados: validados.length,
      emAndamento: emAndamento.length,
      finalizados: finalizados.length,
      savingPrev,
      savingAprov,
      investimento,
      pctMedio,
    };
  }, [projetos]);

  const prazo = useMemo(() => {
    const comLead = projetos.filter((p) => p.leadTimeDias != null);
    const tempoMedio =
      comLead.length === 0
        ? 0
        : comLead.reduce((s, p) => s + (p.leadTimeDias || 0), 0) / comLead.length;
    const atrasados = projetos.filter((p) => p.atrasado).length;
    const noPrazo = projetos.filter(
      (p) => !p.concluido && !p.atrasado && !p.semPrazo
    ).length;
    const semPrazo = projetos.filter((p) => p.semPrazo).length;
    return { tempoMedio, atrasados, noPrazo, semPrazo };
  }, [projetos]);

  const distFases = useMemo(() => {
    const m = new Map<string, number>();
    projetos.forEach((p) => m.set(p.faseAtual, (m.get(p.faseAtual) || 0) + 1));
    return Array.from(m, ([fase, qtd]) => ({ fase, qtd })).sort(
      (a, b) => b.qtd - a.qtd
    );
  }, [projetos]);

  const distStatus = useMemo(() => {
    const m = new Map<string, number>();
    projetos.forEach((p) =>
      m.set(p.status || "Sem status", (m.get(p.status || "Sem status") || 0) + 1)
    );
    return Array.from(m, ([name, value]) => ({ name, value }));
  }, [projetos]);

  const porLider = useMemo(() => {
    const m = new Map<string, { qtd: number; saving: number; aprovado: number }>();
    projetos.forEach((p) => {
      const k = p.lider || "Sem líder";
      const cur = m.get(k) || { qtd: 0, saving: 0, aprovado: 0 };
      cur.qtd += 1;
      cur.saving += Number(p.saving_previsto) || 0;
      cur.aprovado += p.savingAprovadoEfetivo;
      m.set(k, cur);
    });
    return Array.from(m, ([lider, v]) => ({ lider, ...v })).sort(
      (a, b) => b.saving - a.saving
    );
  }, [projetos]);

  const porGerente = useMemo(() => {
    const metaMap = new Map<string, number>();
    (source.metas || []).forEach((mt) => {
      const k = (mt.gerente || "").trim();
      if (!k) return;
      metaMap.set(k, (metaMap.get(k) || 0) + (Number(mt.meta) || 0));
    });
    const m = new Map<string, { qtd: number; saving: number; aprovado: number }>();
    projetos.forEach((p) => {
      const k = (p.gerente || "Sem gerente").trim();
      const cur = m.get(k) || { qtd: 0, saving: 0, aprovado: 0 };
      cur.qtd += 1;
      cur.saving += Number(p.saving_previsto) || 0;
      cur.aprovado += p.savingAprovadoEfetivo;
      m.set(k, cur);
    });
    return Array.from(m, ([gerente, v]) => {
      const meta = metaMap.get(gerente) || 0;
      const belowMeta = meta > 0 && v.saving < meta;
      return { gerente, ...v, meta, belowMeta };
    }).sort((a, b) => b.saving - a.saving);
  }, [projetos, source.metas]);

  // Meta por Gerente — realizado = soma de Projetos!Q (saving_aprovado),
  // meta = EQUIPE!F. Sem limite de valor.
  const metaPorGerente = useMemo(() => {
    const realizadoMap = new Map<string, number>();
    projetos.forEach((p) => {
      const k = (p.gerente || "").trim();
      if (!k) return;
      realizadoMap.set(k, (realizadoMap.get(k) || 0) + p.savingAprovadoEfetivo);
    });
    const metaMap = new Map<string, number>();
    (source.metas || []).forEach((m) => {
      const k = (m.gerente || "").trim();
      if (!k) return;
      metaMap.set(k, (metaMap.get(k) || 0) + (Number(m.meta) || 0));
    });
    const all = new Set<string>([...realizadoMap.keys(), ...metaMap.keys()]);
    return Array.from(all).map((gerente) => {
      const realizado = realizadoMap.get(gerente) || 0;
      const meta = metaMap.get(gerente) || 0;
      const faltante = meta - realizado;
      const pctAtingido = meta > 0 ? realizado / meta : null;
      const pctFaltante = pctAtingido == null ? null : 1 - pctAtingido;
      return { gerente, realizado, meta, faltante, pctAtingido, pctFaltante };
    }).sort((a, b) => b.realizado - a.realizado);
  }, [projetos, source.metas]);

  const porSetor = useMemo(() => {
    const m = new Map<string, { qtd: number; saving: number; investimento: number }>();
    projetos.forEach((p) => {
      const k = p.setor || "Sem setor";
      const cur = m.get(k) || { qtd: 0, saving: 0, investimento: 0 };
      cur.qtd += 1;
      cur.saving += Number(p.saving_previsto) || 0;
      cur.investimento += Number(p.investimento) || 0;
      m.set(k, cur);
    });
    return Array.from(m, ([setor, v]) => ({ setor, ...v })).sort(
      (a, b) => b.saving - a.saving
    );
  }, [projetos]);

  const porTipo = useMemo(() => {
    const m = new Map<string, number>();
    projetos.forEach((p) => {
      const k = p.tipo || "Sem tipo";
      m.set(k, (m.get(k) || 0) + (Number(p.saving_previsto) || 0));
    });
    return Array.from(m, ([name, value]) => ({ name, value }));
  }, [projetos]);

  // ---- Investimento agregado (coluna R já tratada) ----
  const investPorStatus = useMemo(() => {
    const m = new Map<string, number>();
    projetos.forEach((p) => {
      const k = (p.status || "Sem status").trim() || "Sem status";
      m.set(k, (m.get(k) || 0) + (Number(p.investimento) || 0));
    });
    return Array.from(m, ([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [projetos]);
  const investPorGerente = useMemo(() => {
    const m = new Map<string, number>();
    projetos.forEach((p) => {
      const k = (p.gerente || "Sem gerente").trim() || "Sem gerente";
      m.set(k, (m.get(k) || 0) + (Number(p.investimento) || 0));
    });
    return Array.from(m, ([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [projetos]);
  const investPorLider = useMemo(() => {
    const m = new Map<string, number>();
    projetos.forEach((p) => {
      const k = (p.lider || "Sem líder").trim() || "Sem líder";
      m.set(k, (m.get(k) || 0) + (Number(p.investimento) || 0));
    });
    return Array.from(m, ([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [projetos]);
  const investPorFase = useMemo(() => {
    const m = new Map<string, number>();
    projetos.forEach((p) => {
      m.set(p.faseAtual, (m.get(p.faseAtual) || 0) + (Number(p.investimento) || 0));
    });
    return Array.from(m, ([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [projetos]);

  // ---- Rankings de Projetos ----
  const rankSavingPrev = useMemo(
    () => projetos.slice().sort((a, b) => (Number(b.saving_previsto) || 0) - (Number(a.saving_previsto) || 0)).slice(0, 20),
    [projetos],
  );
  const rankSavingAprov = useMemo(
    () => projetos.slice().filter((p) => p.savingAprovadoEfetivo > 0).sort((a, b) => b.savingAprovadoEfetivo - a.savingAprovadoEfetivo).slice(0, 20),
    [projetos],
  );
  const rankInvest = useMemo(
    () => projetos.slice().sort((a, b) => (Number(b.investimento) || 0) - (Number(a.investimento) || 0)).slice(0, 20),
    [projetos],
  );

  const evolucao = useMemo(() => {
    const m = new Map<string, { mes: string; iniciados: number; concluidos: number; saving: number }>();
    const key = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    projetos.forEach((p) => {
      if (p.dataInicio) {
        const k = key(p.dataInicio);
        const cur = m.get(k) || { mes: k, iniciados: 0, concluidos: 0, saving: 0 };
        cur.iniciados += 1;
        m.set(k, cur);
      }
      if (p.concluido && p.dataUltimaFase) {
        const k = key(p.dataUltimaFase);
        const cur = m.get(k) || { mes: k, iniciados: 0, concluidos: 0, saving: 0 };
        cur.concluidos += 1;
        cur.saving += p.savingAprovadoEfetivo;
        m.set(k, cur);
      }
    });
    return Array.from(m.values()).sort((a, b) => a.mes.localeCompare(b.mes));
  }, [projetos]);

  const leadTimePorFase = useMemo(() => {
    return distFases.map((d) => {
      const lt = projetos
        .filter((p) => p.faseAtual === d.fase && p.leadTimeDias != null)
        .map((p) => p.leadTimeDias as number);
      const media = lt.length ? lt.reduce((s, x) => s + x, 0) / lt.length : 0;
      return { fase: d.fase, dias: Math.round(media) };
    });
  }, [distFases, projetos]);

  const paretoProjetos = useMemo(
    () =>
      pareto(
        projetos
          .filter((p) => (Number(p.saving_previsto) || 0) > 0)
          .map((p) => ({ label: p.projeto, value: Number(p.saving_previsto) || 0 }))
      ).slice(0, 20),
    [projetos]
  );
  const paretoSetor = useMemo(
    () => pareto(porSetor.map((s) => ({ label: s.setor, value: s.saving }))),
    [porSetor]
  );
  const paretoLider = useMemo(
    () => pareto(porLider.map((s) => ({ label: s.lider, value: s.saving }))),
    [porLider]
  );
  const paretoGerente = useMemo(
    () => pareto(porGerente.map((s) => ({ label: s.gerente, value: s.saving }))),
    [porGerente]
  );
  const paretoInvest = useMemo(
    () =>
      pareto(
        projetos
          .filter((p) => (Number(p.investimento) || 0) > 0)
          .map((p) => ({ label: p.projeto, value: Number(p.investimento) || 0 }))
      ).slice(0, 20),
    [projetos]
  );

  const alertas = useMemo(() => {
    return {
      semStatus: projetos.filter((p) => !p.status),
      semProxima: projetos.filter((p) => !p.proxima_acao && !p.concluido),
      semResponsavel: projetos.filter((p) => !p.responsavel_acao && !p.concluido),
      altoInvestBaixoSaving: projetos.filter(
        (p) =>
          (Number(p.investimento) || 0) > 0 &&
          (Number(p.investimento) || 0) > (Number(p.saving_previsto) || 0)
      ),
      parados: projetos.filter((p) => p.parado),
    };
  }, [projetos]);

  // ---- Status dos Projetos (página dedicada) ----
  const PHASE_DEFS = [
    { key: "fase1", short: "🟢 1ª Fase", full: "Estudo do Problema / Variáveis" },
    { key: "fase2", short: "🔵 2ª Fase", full: "Levantamento de Dados / Gráficos / DOE" },
    { key: "fase3", short: "🟠 3ª Fase", full: "Plano de Ação sendo executado" },
    { key: "fase3_1", short: "🟠 3.1 Fase", full: "Ações sem investimentos" },
    { key: "fase3_2", short: "🟠 3.2 Fase", full: "Ações com investimentos" },
    { key: "fase3_2_compras", short: "🟡 3.2 Compras", full: "Compras" },
    { key: "fase4", short: "🟣 4ª Fase", full: "Instalação de Equipamentos / Estruturas / Ferramental" },
    { key: "fase5", short: "✅ 5ª Fase", full: "Finalizado / PA coletando dados" },
  ] as const;
  const statusProjetos = useMemo(() => {
    const today = new Date();
    const DAY = 86400000;
    const parse = (v: string | null) => {
      if (!v) return null;
      const d = new Date(v);
      return isNaN(d.getTime()) ? null : d;
    };
    return projetos
      .map((p) => {
        const phaseDates = [
          p.fase1, p.fase2, p.fase3, p.fase3_1, p.fase3_2, p.fase3_2_compras, p.fase4, p.fase5,
        ]
          .map(parse)
          .filter((d): d is Date => d != null);
        const ultimaFase = phaseDates.length
          ? new Date(Math.max(...phaseDates.map((d) => d.getTime())))
          : null;
        const prazo = parse(p.prazo_acao);
        const ultimaAtualizacao = parse(p.ultima_atualizacao);
        const diasFase =
          prazo && ultimaFase ? Math.round((prazo.getTime() - ultimaFase.getTime()) / DAY) : null;
        const diasAtualizacao = ultimaAtualizacao
          ? Math.max(0, Math.floor((today.getTime() - ultimaAtualizacao.getTime()) / DAY))
          : null;
        // Fase atual = última coluna preenchida entre G e N (mais à direita)
        let faseAtual: { short: string; full: string } | null = null;
        for (let i = PHASE_DEFS.length - 1; i >= 0; i--) {
          const def = PHASE_DEFS[i];
          if (parse((p as any)[def.key])) {
            faseAtual = { short: def.short, full: def.full };
            break;
          }
        }
        const status = (p.status || "").trim();
        const low = status.toLowerCase();
        // Nova lógica da coluna "Atenção" (ordem obrigatória):
        // 1) Validado pela controladoria  → ⚪ Validado (cinza)
        // 2) Inviabilizado (ou Reprovado) → ⚫ Inviabilizado (preto)
        // 3) Prazo (V) < hoje             → 🔴 Atrasado
        // 4) Prazo - Última atualização > 90 dias → 🔵 Longa duração
        // 5) Dias desde a última atualização:
        //    0–7 🟢 Em dia · 8–15 🟡 Atenção · >15 🟠 Sem atualização
        let atencao = {
          label: "🟢 Em dia",
          bg: "bg-success",
          text: "text-black",
          order: 99,
        };
        if (low === "validado pela controladoria") {
          atencao = {
            label: "⚪ Validado",
            bg: "bg-gray-400",
            text: "text-black",
            order: 5,
          };
        } else if (hasBlackStatusTreatment(status)) {
          atencao = { label: "⚫ Inviabilizado", bg: "bg-black", text: "text-white", order: 6 };
        } else if (prazo && prazo.getTime() < today.getTime()) {
          atencao = { label: "🔴 Atrasado", bg: "bg-destructive", text: "text-white", order: 0 };
        } else if (
          prazo &&
          ultimaAtualizacao &&
          (prazo.getTime() - ultimaAtualizacao.getTime()) / DAY > 90
        ) {
          atencao = {
            label: "🔵 Longa duração",
            bg: "bg-blue-600",
            text: "text-white",
            order: 1,
          };
        } else if (diasAtualizacao != null) {
          if (diasAtualizacao > 15) {
            atencao = {
              label: "🟠 Sem atualização",
              bg: "bg-orange-500",
              text: "text-white",
              order: 2,
            };
          } else if (diasAtualizacao >= 8) {
            atencao = {
              label: "🟡 Atenção",
              bg: "bg-warning",
              text: "text-black",
              order: 3,
            };
          } else {
            atencao = { label: "🟢 Em dia", bg: "bg-success", text: "text-black", order: 4 };
          }
        }
        const tempoFase = ultimaFase
          ? Math.round((today.getTime() - ultimaFase.getTime()) / DAY)
          : -1;
        return {
          p,
          ultimaFase,
          prazo,
          ultimaAtualizacao,
          diasFase,
          diasAtualizacao,
          atencao,
          tempoFase,
          faseAtual,
        };
      })
      .sort(
        (a, b) => a.atencao.order - b.atencao.order || b.tempoFase - a.tempoFase,
      );
  }, [projetos]);

  const distPctConclusao = useMemo(() => {
    const m = new Map<number, number>();
    projetos
      .filter((p) => (p.status || "").trim().toLowerCase() !== "inviabilizado")
      .forEach((p) => {
        const pct = Math.round(p.pctConclusao * 100);
        m.set(pct, (m.get(pct) || 0) + 1);
      });
    return Array.from(m, ([pct, qtd]) => ({
      pct: `${pct}%`,
      qtd,
      order: pct,
      conclusao: CONCLUSAO_POR_PCT[pct] || `${pct}%`,
    })).sort((a, b) => a.order - b.order);
  }, [projetos]);

  const distStatusW = useMemo(() => {
    const m = new Map<string, number>();
    projetos.forEach((p) => {
      const k = (p.status || "Sem status").trim() || "Sem status";
      m.set(k, (m.get(k) || 0) + 1);
    });
    return Array.from(m, ([name, qtd]) => ({ name, qtd })).sort((a, b) => b.qtd - a.qtd);
  }, [projetos]);

  const resetFilters = () => {
    setFStatus(ALL);
    setFFase(ALL);
    setFLider(ALL);
    setFGerente(ALL);
    setFSetor(ALL);
    setFTipo(ALL);
    setDFrom("");
    setDTo("");
    setSearch("");
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Hero header */}
      <header
        className="border-b text-primary-foreground"
        style={{ backgroundImage: "var(--gradient-hero)" }}
      >
        <div className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium uppercase tracking-[0.2em] text-primary-foreground/70">
              Gestão Executiva
            </span>
            <h1 className="text-2xl font-semibold sm:text-3xl">
              Painel de Gestão de Projetos
            </h1>
            <p className="max-w-2xl text-sm text-primary-foreground/80">
              Monitoramento completo de execução, prazos, saving e gargalos —
              base para decisões estratégicas e melhoria contínua.
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] space-y-6 px-4 py-6 sm:px-6">
        {/* Data Source */}
          <SectionCard
          title="Fonte de Dados"
          description="Cole o link de uma planilha pública do Google Sheets e clique em Sincronizar para baixar e alimentar o painel"
        >
          <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">
                Link público do Google Sheets (somente leitura)
              </label>
              <div className="relative">
                <Link2 className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder="https://docs.google.com/spreadsheets/d/.../edit"
                  value={sheetUrl}
                  onChange={(e) => setSheetUrl(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleSyncSheet(); }}
                />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">&nbsp;</label>
              <Button onClick={handleSyncSheet} disabled={loadingSource || !sheetUrl.trim()}>
                <RefreshCw className={`mr-2 h-4 w-4 ${loadingSource ? "animate-spin" : ""}`} />
                {loadingSource ? "Baixando..." : "Sincronizar"}
              </Button>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <FileSpreadsheet className="h-3.5 w-3.5" />
            <span className="font-medium text-foreground">{source.label}</span>
            <span>·</span>
            <span>{source.detail}</span>
            <span>·</span>
            <span>Atualizado: {source.updatedAt.toLocaleString("pt-BR")}</span>
            {source.label === "Google Sheets" ? (
              <Badge variant="secondary" className="ml-1">Sincronização manual</Badge>
            ) : null}
          </div>
          {sourceError ? (
            <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {sourceError}
            </div>
          ) : null}
          <p className="mt-2 text-xs text-muted-foreground">
            Como publicar: no Google Sheets, vá em <b>Compartilhar → Geral → Qualquer pessoa com o link (Leitor)</b>.
            Ao clicar em <b>Sincronizar</b>, o painel baixa a planilha (.xlsx) e atualiza os dados. Para refletir mudanças feitas na planilha, clique em Sincronizar novamente.
          </p>
        </SectionCard>

        {/* Filters */}
        <SectionCard
          title="Filtros"
          description="Aplicados a todos os indicadores do painel"
          action={
            <Button variant="ghost" size="sm" onClick={resetFilters}>
              <RotateCcw className="mr-1 h-3.5 w-3.5" />
              Limpar
            </Button>
          }
        >
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-5">
            <FilterSelect label="Status" value={fStatus} onChange={setFStatus} options={statusOpts} />
            <FilterSelect label="Fase" value={fFase} onChange={setFFase} options={faseOpts} />
            <FilterSelect label="Líder" value={fLider} onChange={setFLider} options={liderOpts} />
            <FilterSelect label="Gerente" value={fGerente} onChange={setFGerente} options={gerenteOpts} />
            <FilterSelect label="Setor / Filial" value={fSetor} onChange={setFSetor} options={setorOpts} />
            <FilterSelect label="Tipo" value={fTipo} onChange={setFTipo} options={tipoOpts} />
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Início de</label>
              <Input type="date" value={dFrom} onChange={(e) => setDFrom(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Início até</label>
              <Input type="date" value={dTo} onChange={(e) => setDTo(e.target.value)} />
            </div>
            <div className="col-span-2 flex flex-col gap-1 md:col-span-2 lg:col-span-1">
              <label className="text-xs font-medium text-muted-foreground">Buscar projeto</label>
              <Input
                placeholder="Nome ou matrícula..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <Filter className="h-3.5 w-3.5" />
            Exibindo <span className="font-semibold text-foreground">{projetos.length}</span> de{" "}
            {all.length} projetos
          </div>
        </SectionCard>

        {/* Toggles de exibição */}
        <div className="flex flex-wrap items-center gap-4 rounded-lg border bg-card px-4 py-3 shadow-[var(--shadow-card)]">
          <div className="flex items-center gap-2">
            <Switch
              id="toggle-indicators"
              checked={showIndicators}
              onCheckedChange={toggleShowIndicators}
            />
            <Label htmlFor="toggle-indicators" className="text-sm cursor-pointer">
              Exibir Indicadores
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="toggle-meta-gerente"
              checked={showMetaGerente}
              onCheckedChange={toggleShowMetaGerente}
            />
            <Label htmlFor="toggle-meta-gerente" className="text-sm cursor-pointer">
              Exibir Meta por Gerente
            </Label>
          </div>
        </div>

        {/* KPIs */}
        {showIndicators && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6 animate-in fade-in slide-in-from-top-2 duration-300">
            <Kpi
              tone="primary"
              label="Total de Projetos"
              value={totals.total}
              sub={`${totals.emAndamento} EM ANDAMENTO`}
              icon={<Target className="h-5 w-5" />}
            />
            <Kpi
              tone="success"
              label="Validados pela Controladoria"
              value={totals.validados}
              sub={fmtPct(totals.total ? totals.validados / totals.total : 0)}
              icon={<CheckCircle2 className="h-5 w-5" />}
              className="text-black [&_*]:text-black"
            />
            <Kpi
              label="Conclusão Média"
              value={fmtPct(totals.pctMedio)}
              sub={`${totals.finalizados} na Fase 5+`}
              icon={<TrendingUp className="h-5 w-5" />}
            />
            <Kpi
              label="Saving Previsto (12 meses)"
              value={fmtMoney(totals.savingPrev)}
              sub="Coluna P · todos os projetos"
              icon={<DollarSign className="h-5 w-5" />}
            />
            <Kpi
              label="Saving Aprovado pela Controladoria"
              value={fmtMoney(totals.savingAprov)}
              sub='Coluna Q · apenas status "Validado pela controladoria"'
              icon={<CheckCircle2 className="h-5 w-5" />}
            />
            <Kpi
              tone="info"
              label="Tempo Médio de Projeto"
              value={`${Math.round(prazo.tempoMedio)} d`}
              sub="Média de lead time"
              icon={<Clock className="h-5 w-5" />}
            />
          </div>
        )}

        {showMetaGerente && (
        <SectionCard
          title="Meta por Gerente"
          description="Realizado (Projetos!Q) vs Meta (EQUIPE!F) — valores sem limite de magnitude"
        >
          {metaPorGerente.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              Nenhuma meta carregada. Verifique a aba <b>EQUIPE</b> (coluna E = gerente, coluna F = meta).
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {metaPorGerente.map((g) => {
                const pct = g.pctAtingido;
                const tone =
                  pct == null ? "muted"
                    : pct >= 1 ? "success"
                    : pct >= 0.8 ? "warning"
                    : "danger";
                const dot =
                  tone === "success" ? "bg-success"
                    : tone === "warning" ? "bg-warning"
                    : tone === "danger" ? "bg-destructive"
                    : "bg-muted-foreground";
                const barColor =
                  tone === "success" ? "var(--success, #16a34a)"
                    : tone === "warning" ? "var(--warning, #f59e0b)"
                    : tone === "danger" ? "var(--destructive, #dc2626)"
                    : "var(--muted-foreground)";
                const pctClamped = pct == null ? 0 : Math.min(1, Math.max(0, pct));
                return (
                  <div key={g.gerente} className="rounded-lg border bg-card p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`inline-block h-2 w-2 rounded-full ${dot}`} />
                          <span className="truncate text-sm font-semibold">{g.gerente}</span>
                        </div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          Meta {fmtMoney(g.meta)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-muted-foreground">Atingido</div>
                        <div className="text-lg font-bold tabular-nums">
                          {pct == null ? "—" : fmtPct(pct)}
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pctClamped * 100}%`, backgroundColor: barColor }}
                      />
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <div className="text-muted-foreground">Realizado</div>
                        <div className="font-semibold tabular-nums">{fmtMoney(g.realizado)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-muted-foreground">
                          {g.faltante > 0 ? "Faltante" : "Excedente"}
                        </div>
                        <div
                          className={`font-semibold tabular-nums ${g.faltante > 0 ? "text-destructive" : "text-success"}`}
                        >
                          {fmtMoney(Math.abs(g.faltante))}
                          {g.pctFaltante != null ? (
                            <span className="ml-1 text-muted-foreground">
                              ({fmtPct(Math.abs(g.pctFaltante))})
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>
        )}

        <Tabs defaultValue="visao" className="w-full">
          <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
            <TabsTrigger value="visao">Visão Geral</TabsTrigger>
            <TabsTrigger value="pessoas">Pessoas</TabsTrigger>
            <TabsTrigger value="financeiro">Financeiro</TabsTrigger>
            <TabsTrigger value="painel-roi">Painel Estratégico de ROI</TabsTrigger>
            <TabsTrigger value="performance">Performance</TabsTrigger>
            <TabsTrigger value="ranking">Ranking de Projetos</TabsTrigger>
            <TabsTrigger value="status">Status dos Projetos</TabsTrigger>
            <TabsTrigger value="projetos">Projetos</TabsTrigger>
            <TabsTrigger value="novos">Novos Projetos</TabsTrigger>
          </TabsList>

          {/* VISÃO GERAL */}
          <TabsContent value="visao" className="mt-4 space-y-4">
            <div className="grid gap-4 lg:grid-cols-3">
              <SectionCard
                title="Distribuição por Fase"
                description="Onde estão os projetos hoje"
                className="lg:col-span-2"
              >
                <ChartWrap>
                  <BarChart data={distFases} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis type="number" stroke="var(--muted-foreground)" fontSize={11} />
                    <YAxis
                      type="category"
                      dataKey="fase"
                      stroke="var(--muted-foreground)"
                      fontSize={11}
                      width={220}
                    />
                    <Tooltip cursor={{ fill: "var(--muted)" }} contentStyle={tooltipStyle} />
                    <Bar dataKey="qtd" fill="var(--chart-1)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ChartWrap>
              </SectionCard>
              <SectionCard title="Status dos Projetos">
                <ChartWrap height={300}>
                  <PieChart>
                    <Pie
                      data={distStatus}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={55}
                      outerRadius={95}
                      paddingAngle={2}
                    >
                      {distStatus.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ChartWrap>
              </SectionCard>
            </div>

            <SectionCard
              title="Timeline dos Projetos"
              description="Início, última fase alcançada e lead time"
            >
              <div className="max-h-[480px] overflow-auto rounded-md border">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0_var(--border)]">
                    <TableRow>
                      <TableHead>Projeto</TableHead>
                      <TableHead>Líder</TableHead>
                      <TableHead>Início</TableHead>
                      <TableHead>Última fase</TableHead>
                      <TableHead className="text-right">Lead time</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="min-w-[140px]">Conclusão</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {projetos
                      .slice()
                      .sort(
                        (a, b) =>
                          (b.dataInicio?.getTime() || 0) - (a.dataInicio?.getTime() || 0)
                      )
                      .map((p) => (
                        <TableRow key={p.matricula}>
                          <TableCell className="max-w-[280px]">
                            <div className="truncate font-medium">{p.projeto}</div>
                            <div className="text-xs text-muted-foreground">
                              #{p.matricula} · {p.setor || "—"}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">{p.lider || "—"}</TableCell>
                          <TableCell className="text-sm">{fmtDate(p.dataInicio)}</TableCell>
                          <TableCell className="text-sm">
                            <div>{p.faseAtual}</div>
                            <div className="text-xs text-muted-foreground">
                              {fmtDate(p.dataUltimaFase)}
                            </div>
                          </TableCell>
                          <TableCell className="text-right text-sm tabular-nums">
                            {p.leadTimeDias != null ? `${p.leadTimeDias} d` : "—"}
                          </TableCell>
                          <TableCell>{statusBadge(p)}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Progress value={p.pctConclusao * 100} className="h-2 flex-1" />
                              <span className="w-10 text-right text-xs tabular-nums">
                                {fmtPct(p.pctConclusao)}
                              </span>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>
            </SectionCard>

          </TabsContent>

          {/* PESSOAS */}
          <TabsContent value="pessoas" className="mt-4 space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <SectionCard title="Saving por Líder" description="Top 15 por saving previsto">
                <ChartWrap height={380}>
                  <BarChart data={porLider.slice(0, 15)} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis type="number" stroke="var(--muted-foreground)" fontSize={11} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <YAxis type="category" dataKey="lider" stroke="var(--muted-foreground)" fontSize={11} width={130} />
                    <Tooltip formatter={(v: any) => fmtMoney(Number(v))} contentStyle={tooltipStyle} />
                    <Bar dataKey="saving" fill="var(--chart-1)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ChartWrap>
              </SectionCard>
              <SectionCard title="Saving por Gerente" description="Comparativo com aprovado">
                <ChartWrap height={380}>
                  <BarChart data={porGerente.slice(0, 15)} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis type="number" stroke="var(--muted-foreground)" fontSize={11} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <YAxis type="category" dataKey="gerente" stroke="var(--muted-foreground)" fontSize={11} width={130} />
                    <Tooltip formatter={(v: any) => fmtMoney(Number(v))} contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="saving" name="Previsto" fill="var(--chart-1)" radius={[0, 4, 4, 0]} />
                    <Bar dataKey="aprovado" name="Aprovado" fill="var(--chart-2)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ChartWrap>
              </SectionCard>
            </div>
            <SectionCard title="Projetos por Setor / Filial">
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0_var(--border)]">
                    <TableRow>
                      <TableHead>Setor</TableHead>
                      <TableHead className="text-right">Projetos</TableHead>
                      <TableHead className="text-right">Saving previsto</TableHead>
                      <TableHead className="text-right">Investimento</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {porSetor.map((s) => (
                      <TableRow key={s.setor}>
                        <TableCell className="font-medium">{s.setor}</TableCell>
                        <TableCell className="text-right tabular-nums">{s.qtd}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtMoney(s.saving)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtMoney(s.investimento)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </SectionCard>
          </TabsContent>

          {/* FINANCEIRO */}
          <TabsContent value="financeiro" className="mt-4 space-y-4">
            <SectionCard
              title="Tabela Financeira dos Projetos"
              description="Análise individual: investimento, saving, ROI anual e status — sincronizada com os filtros globais"
            >
              <FinanceiroTable projetos={projetos} />
            </SectionCard>
            <div className="grid gap-4 lg:grid-cols-2">
              <SectionCard
                title="Saving Previsto vs Aprovado por Gerente"
                description="Barra e nome em vermelho indicam gerente abaixo da meta anual"
              >
                <ChartWrap>
                  <BarChart data={porGerente}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis
                      dataKey="gerente"
                      stroke="var(--muted-foreground)"
                      fontSize={10}
                      angle={-25}
                      textAnchor="end"
                      height={70}
                      interval={0}
                      tick={(props: any) => {
                        const { x, y, payload } = props;
                        const row = porGerente.find((g) => g.gerente === payload.value);
                        const fill = row?.belowMeta ? "var(--destructive)" : "var(--muted-foreground)";
                        const weight = row?.belowMeta ? 600 : 400;
                        return (
                          <text
                            x={x}
                            y={y}
                            dy={8}
                            transform={`rotate(-25, ${x}, ${y})`}
                            textAnchor="end"
                            fontSize={10}
                            fill={fill}
                            fontWeight={weight}
                          >
                            {payload.value}
                          </text>
                        );
                      }}
                    />
                    <YAxis stroke="var(--muted-foreground)" fontSize={11} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip
                      formatter={(v: any, name: any) => [fmtMoney(Number(v)), name]}
                      labelFormatter={(label: any) => {
                        const row = porGerente.find((g) => g.gerente === label);
                        if (!row || !row.meta) return label;
                        return `${label} · Meta: ${fmtMoney(row.meta)}`;
                      }}
                      contentStyle={tooltipStyle}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="saving" name="Previsto" radius={[4, 4, 0, 0]}>
                      {porGerente.map((g, i) => (
                        <Cell
                          key={i}
                          fill={g.belowMeta ? "var(--destructive)" : "var(--chart-1)"}
                        />
                      ))}
                    </Bar>
                    <Bar dataKey="aprovado" name="Aprovado" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ChartWrap>
              </SectionCard>
              <SectionCard title="Saving por Tipo de Projeto">
                <ChartWrap>
                  <PieChart>
                    <Pie data={porTipo} dataKey="value" nameKey="name" outerRadius={110}>
                      {porTipo.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: any) => fmtMoney(Number(v))} contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ChartWrap>
              </SectionCard>
            </div>
            <SectionCard title="Investimento por Setor">
              <ChartWrap>
                <BarChart data={porSetor}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="setor" stroke="var(--muted-foreground)" fontSize={10} angle={-25} textAnchor="end" height={70} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={11} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: any) => fmtMoney(Number(v))} contentStyle={tooltipStyle} />
                  <Bar dataKey="investimento" fill="var(--chart-4)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartWrap>
            </SectionCard>

            <div className="grid gap-3 md:grid-cols-2">
              <Kpi tone="info" label="Total de Investimento" value={fmtMoney(totals.investimento)} sub="Coluna R tratada (alfanumérica)" icon={<DollarSign className="h-5 w-5" />} />
              <Kpi tone="success" label="Saving Aprovado (validados)" value={fmtMoney(totals.savingAprov)} sub="Somente status = Validado pela controladoria" />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <SectionCard title="Investimento por Status (coluna W)">
                <ChartWrap>
                  <BarChart data={investPorStatus} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis type="number" stroke="var(--muted-foreground)" fontSize={11} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <YAxis type="category" dataKey="name" stroke="var(--muted-foreground)" fontSize={11} width={180} />
                    <Tooltip formatter={(v: any) => fmtMoney(Number(v))} contentStyle={tooltipStyle} />
                    <Bar dataKey="value" fill="var(--chart-4)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ChartWrap>
              </SectionCard>
              <SectionCard title="Investimento por Fase">
                <ChartWrap>
                  <BarChart data={investPorFase} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis type="number" stroke="var(--muted-foreground)" fontSize={11} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <YAxis type="category" dataKey="name" stroke="var(--muted-foreground)" fontSize={11} width={220} />
                    <Tooltip formatter={(v: any) => fmtMoney(Number(v))} contentStyle={tooltipStyle} />
                    <Bar dataKey="value" fill="var(--chart-3)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ChartWrap>
              </SectionCard>
              <SectionCard title="Investimento por Gerente">
                <ChartWrap>
                  <BarChart data={investPorGerente} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis type="number" stroke="var(--muted-foreground)" fontSize={11} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <YAxis type="category" dataKey="name" stroke="var(--muted-foreground)" fontSize={11} width={150} />
                    <Tooltip formatter={(v: any) => fmtMoney(Number(v))} contentStyle={tooltipStyle} />
                    <Bar dataKey="value" fill="var(--chart-2)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ChartWrap>
              </SectionCard>
              <SectionCard title="Investimento por Líder">
                <ChartWrap>
                  <BarChart data={investPorLider.slice(0, 15)} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis type="number" stroke="var(--muted-foreground)" fontSize={11} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <YAxis type="category" dataKey="name" stroke="var(--muted-foreground)" fontSize={11} width={150} />
                    <Tooltip formatter={(v: any) => fmtMoney(Number(v))} contentStyle={tooltipStyle} />
                    <Bar dataKey="value" fill="var(--chart-1)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ChartWrap>
              </SectionCard>
            </div>

            <SectionCard title="Saving Aprovado x Investimento por Gerente" description="Comparativo financeiro — somente saving de projetos validados">
              <ChartWrap>
                <BarChart data={porGerente.map((g) => ({ gerente: g.gerente, aprovado: g.aprovado, investimento: investPorGerente.find((x) => x.name === g.gerente)?.value || 0 }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="gerente" stroke="var(--muted-foreground)" fontSize={10} angle={-25} textAnchor="end" height={70} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={11} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: any) => fmtMoney(Number(v))} contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="aprovado" name="Saving Aprovado" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="investimento" name="Investimento" fill="var(--chart-4)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartWrap>
            </SectionCard>
          </TabsContent>

          {/* PERFORMANCE */}
          <TabsContent value="painel-roi" className="mt-4 space-y-4">
            <PainelEstrategicoROI projetos={projetos} />
          </TabsContent>

          <TabsContent value="performance" className="mt-4 space-y-4">
            <PerformanceExecutivoPanel
              all={all}
              metas={source.metas || []}
              updatedAt={source.updatedAt}
              onRefresh={sheetUrl ? handleSyncSheet : undefined}
              refreshing={loadingSource}
            />
            <div className="grid gap-4 lg:grid-cols-2">
              <SectionCard title="Evolução Mensal" description="Projetos iniciados vs concluídos">
                <ChartWrap>
                  <LineChart data={evolucao}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />

                    <XAxis dataKey="mes" stroke="var(--muted-foreground)" fontSize={11} />
                    <YAxis stroke="var(--muted-foreground)" fontSize={11} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line type="monotone" dataKey="iniciados" stroke="var(--chart-1)" strokeWidth={2} />
                    <Line type="monotone" dataKey="concluidos" stroke="var(--chart-2)" strokeWidth={2} />
                  </LineChart>
                </ChartWrap>
              </SectionCard>
              <SectionCard title="Saving Mensal Acumulado" description="A partir dos validados">
                <ChartWrap>
                  <ComposedChart data={evolucao}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="mes" stroke="var(--muted-foreground)" fontSize={11} />
                    <YAxis stroke="var(--muted-foreground)" fontSize={11} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: any) => fmtMoney(Number(v))} contentStyle={tooltipStyle} />
                    <Bar dataKey="saving" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
                  </ComposedChart>
                </ChartWrap>
              </SectionCard>
            </div>
            <SectionCard
              title="Gargalos por Fase"
              description="Volume + lead time médio (dias) — quanto maior, mais atenção"
            >
              <ChartWrap>
                <ComposedChart data={leadTimePorFase.map((l, i) => ({ ...l, qtd: distFases[i]?.qtd || 0 }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="fase" stroke="var(--muted-foreground)" fontSize={10} angle={-15} textAnchor="end" height={80} />
                  <YAxis yAxisId="left" stroke="var(--muted-foreground)" fontSize={11} />
                  <YAxis yAxisId="right" orientation="right" stroke="var(--muted-foreground)" fontSize={11} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar yAxisId="left" dataKey="qtd" name="Projetos" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
                  <Line yAxisId="right" type="monotone" dataKey="dias" name="Lead time (d)" stroke="var(--chart-4)" strokeWidth={2} />
                </ComposedChart>
              </ChartWrap>
            </SectionCard>
          </TabsContent>

          {/* RANKING DE PROJETOS */}
          <TabsContent value="ranking" className="mt-4 space-y-4">
            <RankingTable kind="prev" title="Top 20 — Saving Previsto (Coluna P)" rows={rankSavingPrev} metricKey="saving_previsto" metricLabel="Saving Previsto" />
            <RankingTable kind="aprov" title="Top 20 — Saving Aprovado (Coluna Q, validados pela Controladoria)" rows={rankSavingAprov} metricKey="savingAprovadoEfetivo" metricLabel="Saving Aprovado" />
            <RankingTable kind="invest" title="Top 20 — Investimento (Coluna R)" rows={rankInvest} metricKey="investimento" metricLabel="Investimento" />
          </TabsContent>

          {/* STATUS DOS PROJETOS */}
          <TabsContent value="status" className="mt-4 space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <SectionCard
                title="Percentual de Conclusão"
                description="Quantidade de projetos por % (exclui Inviabilizados)"
              >
                <ChartWrap height={340}>
                  <BarChart data={distPctConclusao} layout="vertical" margin={{ left: 12 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis type="number" stroke="var(--muted-foreground)" fontSize={11} allowDecimals={false} />
                    <YAxis type="category" dataKey="pct" stroke="var(--muted-foreground)" fontSize={11} width={60} />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0].payload as {
                          pct: string;
                          qtd: number;
                          conclusao: string;
                        };
                        return (
                          <div style={tooltipStyle} className="px-3 py-2 text-xs">
                            <div className="font-semibold">{d.pct}</div>
                            <div>Conclusão: {d.conclusao}</div>
                            <div>
                              {d.qtd} {d.qtd === 1 ? "projeto" : "projetos"}
                            </div>
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="qtd" fill="var(--chart-1)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ChartWrap>
              </SectionCard>
              <SectionCard
                title="Distribuição por Status (Coluna W)"
                description="Quantidade de projetos por status"
              >
                <ChartWrap height={340}>
                  <BarChart data={distStatusW} layout="vertical" margin={{ left: 12 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis type="number" stroke="var(--muted-foreground)" fontSize={11} allowDecimals={false} />
                    <YAxis type="category" dataKey="name" stroke="var(--muted-foreground)" fontSize={11} width={220} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="qtd" fill="var(--chart-2)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ChartWrap>
              </SectionCard>
            </div>

            <SectionCard
              title="Status dos Projetos"
              description="Painel gerencial para priorização — ordenado por nível de atenção e tempo na fase atual"
            >
              <div className="mb-3 flex flex-wrap items-center justify-end gap-3">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setReportOpen(true)}
                >
                  <FileCode2 className="mr-2 h-4 w-4" />
                  Gerar Relatório HTML
                </Button>
                <Label htmlFor="toggle-atencao" className="text-sm text-muted-foreground cursor-pointer">
                  Exibir coluna Atenção
                </Label>
                <Switch
                  id="toggle-atencao"
                  checked={showAtencao}
                  onCheckedChange={toggleShowAtencao}
                />
              </div>
              <div className="max-h-[640px] overflow-auto rounded-md border">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0_var(--border)]">
                    <TableRow>
                      <TableHead className="whitespace-normal align-bottom leading-tight">Projeto</TableHead>
                      <TableHead className="whitespace-normal align-bottom leading-tight">Líder</TableHead>
                      <TableHead className="whitespace-normal align-bottom leading-tight">Fase Atual</TableHead>
                      <TableHead className="whitespace-normal align-bottom leading-tight">Última fase iniciada</TableHead>
                      <TableHead className="whitespace-normal align-bottom leading-tight">Prazo da ação (V)</TableHead>
                      <TableHead className="whitespace-normal align-bottom leading-tight text-right">Dias corridos da fase</TableHead>
                      <TableHead className="whitespace-normal align-bottom leading-tight">Última atualização (Y)</TableHead>
                      <TableHead className="whitespace-normal align-bottom leading-tight text-right">Dias desde a última atualização</TableHead>
                      <TableHead className="whitespace-normal align-bottom leading-tight">Status (W)</TableHead>
                      {showAtencao && <TableHead className="whitespace-normal align-bottom leading-tight">Atenção</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {statusProjetos.map(({ p, ultimaFase, prazo, ultimaAtualizacao, diasFase, diasAtualizacao, atencao, faseAtual }) => (
                      <TableRow key={p.matricula}>
                        <TableCell className="max-w-[280px]">
                          <div className="truncate font-medium">{p.projeto}</div>
                          <div className="text-xs text-muted-foreground">#{p.matricula}</div>
                        </TableCell>
                        <TableCell className="text-sm">{p.lider || "—"}</TableCell>
                        <TableCell className="text-sm">
                          {faseAtual ? (
                            <span title={faseAtual.full} className="cursor-help whitespace-nowrap">
                              {faseAtual.short}
                            </span>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="text-sm">{fmtDate(ultimaFase)}</TableCell>
                        <TableCell className="text-sm">{fmtDate(prazo)}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums">
                          {diasFase != null ? `${diasFase} d` : "—"}
                        </TableCell>
                        <TableCell className="text-sm">{fmtDate(ultimaAtualizacao)}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums">
                          {diasAtualizacao != null ? `${diasAtualizacao} d` : "—"}
                        </TableCell>
                        <TableCell>{statusBadge(p)}</TableCell>
                        {showAtencao && (
                          <TableCell>
                            <span
                              className={`inline-flex items-center rounded-md px-2.5 py-1 text-xs font-semibold ${atencao.bg} ${atencao.text}`}
                            >
                              {atencao.label}
                            </span>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </SectionCard>

            <SectionCard
              title="Personalização do Relatório HTML"
              description="Configure o logotipo exibido no cabeçalho do relatório. A imagem é salva automaticamente e incorporada (Base64) em cada relatório gerado."
            >
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex h-20 w-40 items-center justify-center rounded-md border bg-muted/30">
                  {reportLogo ? (
                    <img
                      src={reportLogo}
                      alt="Logotipo do relatório"
                      className="max-h-[60px] max-w-[150px] object-contain"
                    />
                  ) : (
                    <span className="text-xs text-muted-foreground">Sem logotipo</span>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="report-logo-input" className="text-sm">
                    {reportLogo ? "Substituir logotipo" : "Enviar logotipo"} (PNG, JPG, JPEG, SVG)
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="report-logo-input"
                      type="file"
                      accept="image/png,image/jpeg,image/jpg,image/svg+xml"
                      onChange={(e) => handleLogoFile(e.target.files?.[0] ?? null)}
                      className="max-w-xs"
                    />
                    {reportLogo && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => saveReportLogo(null)}
                      >
                        Remover
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Altura máxima ≈ 60px · Proporção preservada (object-fit: contain) · Persistido localmente.
                  </p>
                </div>
              </div>
            </SectionCard>

            <StatusReportDialog
              open={reportOpen}
              onOpenChange={setReportOpen}
              logoDataUri={reportLogo}
              rows={statusProjetos.map(
                ({ p, ultimaFase, prazo, ultimaAtualizacao, diasFase, diasAtualizacao, atencao, faseAtual }): StatusReportRow => ({
                  matricula: p.matricula,
                  projeto: p.projeto,
                  lider: p.lider || "",
                  gerente: p.gerente || "",
                  faseAtualShort: faseAtual?.short || "",
                  faseAtualFull: faseAtual?.full || "",
                  ultimaFase,
                  prazo,
                  ultimaAtualizacao,
                  diasFase,
                  diasAtualizacao,
                  status: p.status || "",
                  atencaoLabel: atencao.label,
                  atencaoOrder: atencao.order,
                }),
              )}
            />
          </TabsContent>

          {/* TABELA COMPLETA */}
          <TabsContent value="projetos" className="mt-4">
            <SectionCard title="Lista de Projetos" description={`${projetos.length} projetos filtrados`}>
              <div className="max-h-[640px] overflow-auto rounded-md border">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0_var(--border)]">
                    <TableRow>
                      <TableHead>Projeto</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Setor</TableHead>
                      <TableHead>Líder</TableHead>
                      <TableHead>Gerente</TableHead>
                      <TableHead>Fase</TableHead>
                      <TableHead className="text-right">Saving Prev.</TableHead>
                      <TableHead className="text-right">Investimento</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {projetos.map((p) => (
                      <TableRow key={p.matricula} className={p.atrasado ? "bg-destructive/5" : p.concluido ? "bg-success/5" : undefined}>
                        <TableCell className="max-w-[280px]">
                          <div className="truncate font-medium">{p.projeto}</div>
                          <div className="text-xs text-muted-foreground">#{p.matricula}</div>
                        </TableCell>
                        <TableCell className="text-sm">{p.tipo || "—"}</TableCell>
                        <TableCell className="text-sm">{p.setor || "—"}</TableCell>
                        <TableCell className="text-sm">{p.lider || "—"}</TableCell>
                        <TableCell className="text-sm">{p.gerente || "—"}</TableCell>
                        <TableCell className="text-xs">{p.faseAtual}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtMoney(p.saving_previsto)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtMoney(p.investimento)}</TableCell>
                        <TableCell>{statusBadge(p)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </SectionCard>
          </TabsContent>

          {/* NOVOS PROJETOS (aba independente da carteira) */}
          <TabsContent value="novos" className="mt-4 space-y-4">
            <NovosProjetosPanel novos={source.novosProjetos} />
          </TabsContent>
        </Tabs>

        <footer className="pt-4 text-center text-xs text-muted-foreground">
          Conclusão validada apenas quando "Saving aprovado pela Controladoria"
          está preenchido ou status = "Validado pela controladoria".
        </footer>
      </main>
    </div>
  );
}

const tooltipStyle: React.CSSProperties = {
  backgroundColor: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontSize: 12,
  color: "var(--popover-foreground)",
};

function ChartWrap({ children, height = 320 }: { children: React.ReactElement; height?: number }) {
  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>{children}</ResponsiveContainer>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Todos</SelectItem>
          {options.map((o) => (
            <SelectItem key={o} value={o}>
              {o}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function ParetoChart({
  title,
  data,
  className,
}: {
  title: string;
  data: { label: string; value: number; acumulado: number }[];
  className?: string;
}) {
  return (
    <SectionCard title={title} className={className}>
      <ChartWrap height={340}>
        <ComposedChart data={data} margin={{ left: 4, right: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={10} angle={-30} textAnchor="end" height={90} interval={0} />
          <YAxis yAxisId="left" stroke="var(--muted-foreground)" fontSize={11} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
          <YAxis yAxisId="right" orientation="right" stroke="var(--muted-foreground)" fontSize={11} tickFormatter={(v) => `${v}%`} domain={[0, 100]} />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(v: any, name: any) =>
              name === "Acumulado %" ? `${Number(v).toFixed(1)}%` : fmtMoney(Number(v))
            }
          />
          <Bar yAxisId="left" dataKey="value" name="Valor" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
          <Line yAxisId="right" type="monotone" dataKey="acumulado" name="Acumulado %" stroke="var(--chart-4)" strokeWidth={2} dot={false} />
        </ComposedChart>
      </ChartWrap>
    </SectionCard>
  );
}

function AlertList({
  title,
  items,
  render,
  tone,
}: {
  title: string;
  items: EnrichedProjeto[];
  render: (p: EnrichedProjeto) => string;
  tone: "danger" | "warning";
}) {
  if (items.length === 0) {
    return (
      <SectionCard title={title}>
        <div className="flex items-center gap-2 text-sm text-success">
          <CheckCircle2 className="h-4 w-4" /> Nenhum projeto sinalizado.
        </div>
      </SectionCard>
    );
  }
  const dot = tone === "danger" ? "bg-destructive" : "bg-warning";
  return (
    <SectionCard title={title} description={`${items.length} projeto(s)`}>
      <ul className="divide-y">
        {items.slice(0, 20).map((p) => (
          <li key={p.matricula} className="flex items-start gap-3 py-2">
            <span className={`mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full ${dot}`} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <Users className="h-3 w-3 text-muted-foreground" />
                <span className="truncate text-sm font-medium">{p.projeto}</span>
                <span className="text-xs text-muted-foreground">
                  #{p.matricula} · {p.lider || "—"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{render(p)}</p>
            </div>
          </li>
        ))}
        {items.length > 20 ? (
          <li className="pt-2 text-xs text-muted-foreground">
            +{items.length - 20} outros...
          </li>
        ) : null}
      </ul>
    </SectionCard>
  );
}

function RankingTable({
  title,
  rows,
  metricKey,
  metricLabel,
  kind,
}: {
  title: string;
  rows: EnrichedProjeto[];
  metricKey: "saving_previsto" | "savingAprovadoEfetivo" | "investimento";
  metricLabel: string;
  kind: RankingKind;
}) {
  return (
    <SectionCard
      title={title}
      description={`${rows.length} projeto(s)`}
      action={
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" className="gap-2" onClick={() => exportRankingXLSX(kind, rows)}>
            <FileSpreadsheet className="h-4 w-4" /> Exportar XLSX
          </Button>
          <Button size="sm" variant="outline" className="gap-2" onClick={() => exportRankingHTML(kind, rows)}>
            <FileCode2 className="h-4 w-4" /> Exportar HTML
          </Button>
        </div>
      }
    >
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0_var(--border)]">
            <TableRow>
              <TableHead className="w-10 text-right">#</TableHead>
              <TableHead>Projeto (Col B)</TableHead>
              <TableHead>Líder (Col L)</TableHead>
              <TableHead>Gerente (Col M)</TableHead>
              <TableHead>Fase (Col N)</TableHead>
              <TableHead>Status (Col W)</TableHead>
              <TableHead className="text-right">Saving Previsto (P)</TableHead>
              <TableHead className="text-right">Saving Aprovado (Q)</TableHead>
              <TableHead className="text-right">Investimento (R)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((p, i) => {
              const highlight = metricKey;
              return (
                <TableRow key={p.matricula}>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{i + 1}</TableCell>
                  <TableCell className="max-w-[320px]">
                    <div className="truncate font-medium">{p.projeto}</div>
                    <div className="text-xs text-muted-foreground">#{p.matricula}</div>
                  </TableCell>
                  <TableCell className="text-sm">{p.lider || "—"}</TableCell>
                  <TableCell className="text-sm">{p.gerente || "—"}</TableCell>
                  <TableCell className="text-xs">{p.faseAtual}</TableCell>
                  <TableCell>{statusBadge(p)}</TableCell>
                  <TableCell className={`text-right tabular-nums ${highlight === "saving_previsto" ? "font-semibold" : ""}`}>
                    {fmtMoney(p.saving_previsto)}
                  </TableCell>
                  <TableCell className={`text-right tabular-nums ${highlight === "savingAprovadoEfetivo" ? "font-semibold" : ""}`}>
                    {fmtMoney(p.savingAprovadoEfetivo)}
                  </TableCell>
                  <TableCell className={`text-right tabular-nums ${highlight === "investimento" ? "font-semibold" : ""}`}>
                    {fmtMoney(p.investimento)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Ordenado por <b>{metricLabel}</b>. Saving Aprovado considera apenas projetos com status "Validado pela controladoria".
      </p>
    </SectionCard>
  );
}