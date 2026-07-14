import { useMemo, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Users,
  UserCircle2,
  FolderKanban,
  DollarSign,
  ShieldCheck,
  Target,
  PieChart as PieIcon,
  Hourglass,
  RotateCcw,
  RefreshCw,
} from "lucide-react";
import {
  fmtMoney,
  fmtPct,
  uniq,
  type EnrichedProjeto,
} from "@/lib/dashboard";
import { Card, CardContent } from "@/components/ui/card";
import { SectionCard } from "./SectionCard";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

const ALL = "__all__";
const META_TOTAL_FIXO = 8_000_000;
const INACTIVE_STATUS = new Set([
  "inviabilizado",
  "reprovado pela controladoria",
]);
const isActive = (status?: string | null) =>
  !INACTIVE_STATUS.has((status || "").trim().toLowerCase());

type Props = {
  all: EnrichedProjeto[];
  metas: { gerente: string; meta: number }[];
  updatedAt: Date;
  onRefresh?: () => void;
  refreshing?: boolean;
};

type IconCardProps = {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  value: React.ReactNode;
  valueClass?: string;
};

function IconCard({ icon, iconBg, label, value, valueClass }: IconCardProps) {
  return (
    <Card className="shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-elev)]">
      <CardContent className="flex items-center gap-4 p-4 sm:p-5">
        <div
          className={cn(
            "flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-white",
            iconBg,
          )}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-xs font-medium text-muted-foreground">
            {label}
          </div>
          <div
            className={cn(
              "mt-0.5 text-xl font-bold tabular-nums sm:text-2xl truncate",
              valueClass,
            )}
          >
            {value}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function PerformanceExecutivoPanel({
  all,
  metas,
  updatedAt,
  onRefresh,
  refreshing,
}: Props) {
  const [fGerente, setFGerente] = useState(ALL);
  const [fLider, setFLider] = useState(ALL);
  const [fStatus, setFStatus] = useState(ALL);

  const gerenteOpts = useMemo(
    () => uniq(all.map((p) => p.gerente)).sort(),
    [all],
  );
  const liderOpts = useMemo(
    () =>
      uniq(
        all
          .filter((p) => fGerente === ALL || (p.gerente || "") === fGerente)
          .map((p) => p.lider),
      ).sort(),
    [all, fGerente],
  );
  const statusOpts = useMemo(() => uniq(all.map((p) => p.status)), [all]);

  const projetos = useMemo(
    () =>
      all.filter((p) => {
        if (fGerente !== ALL && (p.gerente || "") !== fGerente) return false;
        if (fLider !== ALL && (p.lider || "") !== fLider) return false;
        if (fStatus !== ALL && (p.status || "") !== fStatus) return false;
        return true;
      }),
    [all, fGerente, fLider, fStatus],
  );

  const totals = useMemo(() => {
    const gerentes = uniq(projetos.map((p) => p.gerente)).length;
    const lideres = uniq(projetos.map((p) => p.lider)).length;
    const ativos = projetos.filter((p) => isActive(p.status));
    const savingPrev = projetos.reduce(
      (s, p) => s + (Number(p.saving_previsto) || 0),
      0,
    );
    const savingAprov = projetos.reduce(
      (s, p) => s + p.savingAprovadoEfetivo,
      0,
    );
    return {
      gerentes,
      lideres,
      projetos: ativos.length,
      savingPrev,
      savingAprov,
    };
  }, [projetos]);

  const metaGerencial = useMemo(() => {
    if (fGerente === ALL) return META_TOTAL_FIXO;
    const m = (metas || [])
      .filter((x) => (x.gerente || "").trim() === fGerente)
      .reduce((s, x) => s + (Number(x.meta) || 0), 0);
    return m;
  }, [metas, fGerente]);

  const pctMeta =
    metaGerencial > 0 ? totals.savingAprov / metaGerencial : 0;
  const faltaMeta = Math.max(0, metaGerencial - totals.savingAprov);
  const pctClamped = Math.min(1, Math.max(0, pctMeta));

  const comparativo = useMemo(() => {
    const metaByGerente = new Map<string, number>();
    (metas || []).forEach((m) => {
      const g = (m.gerente || "").trim();
      if (!g) return;
      metaByGerente.set(g, (metaByGerente.get(g) || 0) + (Number(m.meta) || 0));
    });
    const gerentesAtivos =
      fGerente === ALL
        ? uniq(projetos.map((p) => (p.gerente || "").trim())).filter(Boolean).sort()
        : [fGerente];
    return gerentesAtivos.map((g) => {
      const lista = projetos.filter((p) => (p.gerente || "").trim() === g);
      return {
        name: g,
        previsto: lista.reduce((s, p) => s + (Number(p.saving_previsto) || 0), 0),
        aprovado: lista.reduce((s, p) => s + p.savingAprovadoEfetivo, 0),
        meta: metaByGerente.get(g) || 0,
      };
    });
  }, [projetos, metas, fGerente]);

  const top5 = useMemo(
    () =>
      projetos
        .slice()
        .sort(
          (a, b) =>
            (Number(b.saving_previsto) || 0) -
            (Number(a.saving_previsto) || 0),
        )
        .slice(0, 5),
    [projetos],
  );

  const clearFilters = () => {
    setFGerente(ALL);
    setFLider(ALL);
    setFStatus(ALL);
  };

  const pctColor =
    pctMeta >= 1
      ? "text-success"
      : pctMeta >= 0.8
        ? "text-warning"
        : "text-destructive";
  const barColor =
    pctMeta >= 1
      ? "var(--success, #16a34a)"
      : pctMeta >= 0.8
        ? "var(--warning, #f59e0b)"
        : "var(--chart-1)";

  return (
    <div className="space-y-4">
      {/* Cabeçalho */}
      <SectionCard
        title="Performance"
        description="Visão geral do desempenho da carteira de projetos"
        action={
          <div className="flex items-center gap-3">
            {onRefresh ? (
              <Button
                size="sm"
                variant="outline"
                onClick={onRefresh}
                disabled={refreshing}
              >
                <RefreshCw
                  className={cn(
                    "mr-2 h-4 w-4",
                    refreshing && "animate-spin",
                  )}
                />
                Atualizar dados
              </Button>
            ) : null}
            <div className="text-right text-xs text-muted-foreground">
              <div>Última atualização:</div>
              <div className="font-medium text-foreground tabular-nums">
                {updatedAt.toLocaleString("pt-BR")}
              </div>
            </div>
          </div>
        }
      >
        {/* Linha 1 — Filtros */}
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Gerente
            </label>
            <Select
              value={fGerente}
              onValueChange={(v) => {
                setFGerente(v);
                setFLider(ALL);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos</SelectItem>
                {gerenteOpts.map((g) => (
                  <SelectItem key={g} value={g}>
                    {g}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Líder
            </label>
            <Select value={fLider} onValueChange={setFLider}>
              <SelectTrigger>
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos</SelectItem>
                {liderOpts.map((l) => (
                  <SelectItem key={l} value={l}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Status
            </label>
            <Select value={fStatus} onValueChange={setFStatus}>
              <SelectTrigger>
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos</SelectItem>
                {statusOpts.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button
              variant="outline"
              className="w-full"
              onClick={clearFilters}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Limpar filtros
            </Button>
          </div>
        </div>
      </SectionCard>

      {/* Linha 2 — Cards principais */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-7">
        <div className="lg:col-span-1"><IconCard
          icon={<Users className="h-6 w-6" />}
          iconBg="bg-sky-500"
          label="Gerentes"
          value={totals.gerentes}
        /></div>
        <div className="lg:col-span-1"><IconCard
          icon={<UserCircle2 className="h-6 w-6" />}
          iconBg="bg-emerald-500"
          label="Líderes"
          value={totals.lideres}
        /></div>
        <div className="lg:col-span-1"><IconCard
          icon={<FolderKanban className="h-6 w-6" />}
          iconBg="bg-violet-500"
          label="Projetos"
          value={totals.projetos}
        /></div>
        <div className="lg:col-span-2"><IconCard
          icon={<DollarSign className="h-6 w-6" />}
          iconBg="bg-amber-500"
          label="Saving Previsto (12 meses)"
          value={fmtMoney(totals.savingPrev)}
        /></div>
        <div className="lg:col-span-2"><IconCard
          icon={<ShieldCheck className="h-6 w-6" />}
          iconBg="bg-green-600"
          label="Saving Aprovado pela Controladoria"
          value={fmtMoney(totals.savingAprov)}
        /></div>
      </div>

      {/* Linha 3 — Indicadores Estratégicos */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-6">
        <Card className="shadow-[var(--shadow-card)] lg:col-span-1 bg-sky-50/60 dark:bg-sky-950/20 border-sky-100 dark:border-sky-900">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sky-500 text-white">
              <Target className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-medium text-muted-foreground">
                Meta Gerencial
              </div>
              <div className="mt-0.5 text-xl font-bold tabular-nums truncate">
                {fmtMoney(metaGerencial)}
              </div>
              <div className="text-[11px] text-muted-foreground">
                Meta considerando os gerentes selecionados
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-[var(--shadow-card)] lg:col-span-1 bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-100 dark:border-emerald-900">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
              <PieIcon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-medium text-muted-foreground">
                Percentual da Meta
              </div>
              <div
                className={cn(
                  "mt-0.5 text-xl font-bold tabular-nums",
                  pctColor,
                )}
              >
                {metaGerencial > 0 ? fmtPct(pctMeta) : "—"}
              </div>
              <div className="text-[11px] text-muted-foreground">
                do total previsto
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-[var(--shadow-card)] lg:col-span-1 bg-amber-50/60 dark:bg-amber-950/20 border-amber-100 dark:border-amber-900">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-500 text-white">
              <Hourglass className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-medium text-muted-foreground">
                Falta para atingir a Meta
              </div>
              <div className="mt-0.5 text-xl font-bold tabular-nums truncate">
                {fmtMoney(faltaMeta)}
              </div>
              <div className="text-[11px] text-muted-foreground">
                para alcançar 100% da meta
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-[var(--shadow-card)] lg:col-span-3 bg-card">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs font-medium text-muted-foreground">
                Indicador da Meta
              </div>
              <div
                className={cn(
                  "text-lg font-bold tabular-nums",
                  pctColor,
                )}
              >
                {metaGerencial > 0 ? fmtPct(pctMeta) : "—"}
              </div>
            </div>
            <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${pctClamped * 100}%`,
                  backgroundColor: barColor,
                }}
              />
            </div>
            <div className="mt-2 text-xs text-muted-foreground tabular-nums">
              {fmtMoney(totals.savingAprov)} de {fmtMoney(metaGerencial)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Comparativo Executivo */}
      <SectionCard
        title="Comparativo Executivo"
        description="Meta Gerencial vs Saving Previsto vs Saving Aprovado"
      >
        <div className="h-[340px] w-full">
          <ResponsiveContainer>
            <BarChart
              data={comparativo}
              margin={{ top: 30, right: 20, left: 10, bottom: 10 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="name"
                stroke="var(--muted-foreground)"
                fontSize={11}
              />
              <YAxis
                stroke="var(--muted-foreground)"
                fontSize={11}
                tickFormatter={(v) =>
                  v >= 1_000_000
                    ? `${(v / 1_000_000).toFixed(0)}M`
                    : v >= 1_000
                      ? `${(v / 1_000).toFixed(0)}k`
                      : String(v)
                }
              />
              <Tooltip
                formatter={(v) => fmtMoney(Number(v))}
                contentStyle={{
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar
                dataKey="previsto"
                name="Saving Previsto (12 meses)"
                fill="#16a34a"
                radius={[6, 6, 0, 0]}
              />
              <Bar
                dataKey="aprovado"
                name="Saving Aprovado pela Controladoria"
                fill="#2563eb"
                radius={[6, 6, 0, 0]}
              />
              <Bar
                dataKey="meta"
                name="Meta Gerencial"
                fill="#dc2626"
                radius={[6, 6, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </SectionCard>

      {/* Top 5 */}
      <SectionCard
        title="Top 5 Projetos por Previsão de Saving (12 meses)"
        description="Ordenado do maior para o menor"
      >
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0_var(--border)]">
              <TableRow>
                <TableHead className="w-20 text-center">Ranking</TableHead>
                <TableHead>Projeto</TableHead>
                <TableHead>Líder</TableHead>
                <TableHead>Gerente</TableHead>
                <TableHead className="text-right">
                  Previsão de Saving (12 meses)
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {top5.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-center text-sm text-muted-foreground"
                  >
                    Nenhum projeto encontrado com os filtros atuais.
                  </TableCell>
                </TableRow>
              ) : (
                top5.map((p, i) => {
                  const medal =
                    i === 0
                      ? "bg-amber-400 text-amber-950"
                      : i === 1
                        ? "bg-slate-300 text-slate-800"
                        : i === 2
                          ? "bg-orange-400 text-orange-950"
                          : "bg-muted text-foreground";
                  return (
                    <TableRow key={p.matricula}>
                      <TableCell className="text-center">
                        <span
                          className={cn(
                            "inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold",
                            medal,
                          )}
                        >
                          {i + 1}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-[420px]">
                        <div className="truncate font-medium">
                          {p.projeto}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {p.lider || "—"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {p.gerente || "—"}
                      </TableCell>
                      <TableCell className="text-right text-sm font-semibold tabular-nums">
                        {fmtMoney(Number(p.saving_previsto) || 0)}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </SectionCard>
    </div>
  );
}
