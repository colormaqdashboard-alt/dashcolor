import { useEffect, useMemo, useState } from "react";
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
  loadFromGoogleSheets,
  type DashboardData,
} from "@/lib/data-source";
import { Kpi } from "./Kpi";
import { SectionCard } from "./SectionCard";

const ALL = "__all__";

const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

function statusBadge(p: EnrichedProjeto) {
  if (p.concluido)
    return <Badge className="bg-success text-success-foreground hover:bg-success">Validado</Badge>;
  if (p.atrasado)
    return <Badge variant="destructive">Atrasado</Badge>;
  if (p.parado)
    return <Badge className="bg-warning text-warning-foreground hover:bg-warning">Parado</Badge>;
  return <Badge variant="secondary">{p.status || "Sem status"}</Badge>;
}

export default function Dashboard() {
  const [source, setSource] = useState<{
    label: string;
    detail: string;
    projetos: Projeto[];
    metas: { gerente: string; meta: number }[];
    updatedAt: Date;
  }>(() => ({
    label: "Dados de exemplo (interno)",
    detail: `${RAW.projetos.length} projetos`,
    projetos: RAW.projetos as Projeto[],
    metas: RAW.metas || [],
    updatedAt: new Date(),
  }));
  const [sheetUrl, setSheetUrl] = useState("");
  const [loadingSource, setLoadingSource] = useState(false);
  const [sourceError, setSourceError] = useState<string | null>(null);

  const all = useMemo(() => enrichProjetos(source.projetos), [source]);

  const applyData = (data: DashboardData, label: string, detail: string) => {
    if (!data.projetos.length) {
      throw new Error("Nenhum projeto encontrado. Verifique os cabeçalhos da aba 'Projetos.'");
    }
    setSource({
      label,
      detail,
      projetos: data.projetos,
      metas: data.metas || [],
      updatedAt: new Date(),
    });
  };

  const handleSyncSheet = async () => {
    if (!sheetUrl.trim()) return;
    setLoadingSource(true);
    setSourceError(null);
    try {
      const data = await loadFromGoogleSheets(sheetUrl.trim());
      applyData(data, "Google Sheets", `${data.projetos.length} projetos sincronizados`);
    } catch (e: any) {
      setSourceError(e?.message || "Erro ao sincronizar a planilha.");
    } finally {
      setLoadingSource(false);
    }
  };

  // Auto-resync Google Sheets every 5 minutes when a URL is set
  useEffect(() => {
    if (source.label !== "Google Sheets" || !sheetUrl.trim()) return;
    const id = setInterval(() => {
      loadFromGoogleSheets(sheetUrl.trim())
        .then((data) => applyData(data, "Google Sheets", `${data.projetos.length} projetos sincronizados`))
        .catch(() => {});
    }, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [source.label, sheetUrl]);

  const [fStatus, setFStatus] = useState(ALL);
  const [fFase, setFFase] = useState(ALL);
  const [fLider, setFLider] = useState(ALL);
  const [fGerente, setFGerente] = useState(ALL);
  const [fSetor, setFSetor] = useState(ALL);
  const [fTipo, setFTipo] = useState(ALL);
  const [dFrom, setDFrom] = useState("");
  const [dTo, setDTo] = useState("");
  const [search, setSearch] = useState("");

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
    const savingAprov = projetos.reduce((s, p) => s + (Number(p.saving_aprovado) || 0), 0);
    const investimento = projetos.reduce((s, p) => s + (Number(p.investimento) || 0), 0);
    const pctMedio =
      projetos.length === 0
        ? 0
        : projetos.reduce((s, p) => s + p.pctConclusao, 0) / projetos.length;
    const roi = investimento > 0 ? savingPrev / investimento : null;
    return {
      total: projetos.length,
      validados: validados.length,
      emAndamento: emAndamento.length,
      finalizados: finalizados.length,
      savingPrev,
      savingAprov,
      investimento,
      pctMedio,
      roi,
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
      cur.aprovado += Number(p.saving_aprovado) || 0;
      m.set(k, cur);
    });
    return Array.from(m, ([lider, v]) => ({ lider, ...v })).sort(
      (a, b) => b.saving - a.saving
    );
  }, [projetos]);

  const porGerente = useMemo(() => {
    const m = new Map<string, { qtd: number; saving: number; aprovado: number }>();
    projetos.forEach((p) => {
      const k = (p.gerente || "Sem gerente").trim();
      const cur = m.get(k) || { qtd: 0, saving: 0, aprovado: 0 };
      cur.qtd += 1;
      cur.saving += Number(p.saving_previsto) || 0;
      cur.aprovado += Number(p.saving_aprovado) || 0;
      m.set(k, cur);
    });
    return Array.from(m, ([gerente, v]) => ({ gerente, ...v })).sort(
      (a, b) => b.saving - a.saving
    );
  }, [projetos]);

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
        cur.saving += Number(p.saving_aprovado) || Number(p.saving_previsto) || 0;
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
          description="Cole o link de uma planilha pública do Google Sheets ou envie um arquivo Excel"
        >
          <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto]">
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
                Sincronizar
              </Button>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">
                Ou enviar Excel
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.xlsm,.xlsb,.csv"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0] || null)}
              />
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={loadingSource}
              >
                <Upload className="mr-2 h-4 w-4" />
                Upload manual
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
              <Badge variant="secondary" className="ml-1">Sincronização automática a cada 5 min</Badge>
            ) : null}
          </div>
          {sourceError ? (
            <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {sourceError}
            </div>
          ) : null}
          <p className="mt-2 text-xs text-muted-foreground">
            Como publicar: no Google Sheets, vá em <b>Compartilhar → Geral → Qualquer pessoa com o link (Leitor)</b>.
            O painel lê as abas <b>Projetos.</b>, <b>EQUIPE</b> e <b>Funcionalidade</b>; demais abas são ignoradas.
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

        {/* KPIs */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
          <Kpi
            tone="primary"
            label="Total de Projetos"
            value={totals.total}
            sub={`${totals.emAndamento} em andamento`}
            icon={<Target className="h-5 w-5" />}
          />
          <Kpi
            tone="success"
            label="Validados pela Controladoria"
            value={totals.validados}
            sub={fmtPct(totals.total ? totals.validados / totals.total : 0)}
            icon={<CheckCircle2 className="h-5 w-5" />}
          />
          <Kpi
            label="Conclusão Média"
            value={fmtPct(totals.pctMedio)}
            sub={`${totals.finalizados} na Fase 5+`}
            icon={<TrendingUp className="h-5 w-5" />}
          />
          <Kpi
            label="Saving Previsto (12m)"
            value={fmtMoney(totals.savingPrev)}
            sub={`Aprovado: ${fmtMoney(totals.savingAprov)}`}
            icon={<DollarSign className="h-5 w-5" />}
          />
          <Kpi
            label="ROI Estimado"
            value={totals.roi == null ? "—" : `${totals.roi.toFixed(1)}x`}
            sub={`Investimento: ${fmtMoney(totals.investimento)}`}
            icon={<TrendingUp className="h-5 w-5" />}
          />
        </div>

        {/* Time KPIs */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi
            tone="info"
            label="Tempo Médio de Projeto"
            value={`${Math.round(prazo.tempoMedio)} d`}
            icon={<Clock className="h-5 w-5" />}
          />
          <Kpi
            tone="success"
            label="No Prazo"
            value={prazo.noPrazo}
          />
          <Kpi tone="danger" label="Atrasados" value={prazo.atrasados} icon={<AlertTriangle className="h-5 w-5" />} />
          <Kpi tone="warning" label="Sem Prazo Definido" value={prazo.semPrazo} />
        </div>

        <Tabs defaultValue="visao" className="w-full">
          <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
            <TabsTrigger value="visao">Visão Geral</TabsTrigger>
            <TabsTrigger value="pessoas">Pessoas</TabsTrigger>
            <TabsTrigger value="financeiro">Financeiro</TabsTrigger>
            <TabsTrigger value="performance">Performance</TabsTrigger>
            <TabsTrigger value="pareto">Pareto 80/20</TabsTrigger>
            <TabsTrigger value="alertas">
              Alertas
              {Object.values(alertas).reduce((s, a) => s + a.length, 0) > 0 ? (
                <Badge variant="destructive" className="ml-2">
                  {Object.values(alertas).reduce((s, a) => s + a.length, 0)}
                </Badge>
              ) : null}
            </TabsTrigger>
            <TabsTrigger value="projetos">Projetos</TabsTrigger>
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
                  <TableHeader className="sticky top-0 bg-card">
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
              <div className="overflow-auto rounded-md border">
                <Table>
                  <TableHeader>
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
            <div className="grid gap-4 lg:grid-cols-2">
              <SectionCard title="Saving Previsto vs Aprovado por Gerente">
                <ChartWrap>
                  <BarChart data={porGerente}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="gerente" stroke="var(--muted-foreground)" fontSize={10} angle={-25} textAnchor="end" height={70} />
                    <YAxis stroke="var(--muted-foreground)" fontSize={11} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: any) => fmtMoney(Number(v))} contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="saving" name="Previsto" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
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
          </TabsContent>

          {/* PERFORMANCE */}
          <TabsContent value="performance" className="mt-4 space-y-4">
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

          {/* PARETO */}
          <TabsContent value="pareto" className="mt-4 space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <ParetoChart title="Pareto — Saving por Projeto (Top 20)" data={paretoProjetos} />
              <ParetoChart title="Pareto — Saving por Setor" data={paretoSetor} />
              <ParetoChart title="Pareto — Saving por Líder" data={paretoLider} />
              <ParetoChart title="Pareto — Saving por Gerente" data={paretoGerente} />
              <ParetoChart title="Pareto — Investimento por Projeto (Top 20)" data={paretoInvest} className="lg:col-span-2" />
            </div>
          </TabsContent>

          {/* ALERTAS */}
          <TabsContent value="alertas" className="mt-4 space-y-4">
            <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-5">
              <Kpi tone="danger" label="Sem Status" value={alertas.semStatus.length} />
              <Kpi tone="warning" label="Sem Próxima Ação" value={alertas.semProxima.length} />
              <Kpi tone="warning" label="Sem Responsável" value={alertas.semResponsavel.length} />
              <Kpi tone="danger" label="Invest. > Saving" value={alertas.altoInvestBaixoSaving.length} />
              <Kpi tone="warning" label="Parados (>30d)" value={alertas.parados.length} />
            </div>
            <AlertList title="Projetos com alto investimento e baixo saving" items={alertas.altoInvestBaixoSaving} render={(p) => `Inv ${fmtMoney(p.investimento)} · Saving ${fmtMoney(p.saving_previsto)}`} tone="danger" />
            <AlertList title="Projetos parados (sem atualização há mais de 30 dias)" items={alertas.parados} render={(p) => `Última atualização: ${fmtDate(p.dataUltimaFase || (p.ultima_atualizacao ? new Date(p.ultima_atualizacao) : null))}`} tone="warning" />
            <AlertList title="Projetos sem próxima ação definida" items={alertas.semProxima} render={(p) => p.status || "Sem status"} tone="warning" />
            <AlertList title="Projetos sem responsável pela ação" items={alertas.semResponsavel} render={(p) => p.proxima_acao || "Sem próxima ação"} tone="warning" />
            <AlertList title="Projetos sem status" items={alertas.semStatus} render={(p) => p.faseAtual} tone="danger" />
          </TabsContent>

          {/* TABELA COMPLETA */}
          <TabsContent value="projetos" className="mt-4">
            <SectionCard title="Lista de Projetos" description={`${projetos.length} projetos filtrados`}>
              <div className="max-h-[640px] overflow-auto rounded-md border">
                <Table>
                  <TableHeader className="sticky top-0 bg-card">
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