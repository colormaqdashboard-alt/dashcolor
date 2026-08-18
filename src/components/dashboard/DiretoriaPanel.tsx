import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { SectionCard } from "./SectionCard";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fmtDate } from "@/lib/dashboard";
import type { StatusReportRow } from "@/lib/status-report";

type Props = {
  rows: StatusReportRow[];
  novosTotal?: number;
};

const SEM_GERENTE = "— Sem gerente —";

function statusBadge(status: string) {
  const s = (status || "").trim();
  if (!s) return <span className="text-muted-foreground">—</span>;
  const low = s.toLowerCase();
  if (low === "validado pela controladoria")
    return <Badge className="bg-success text-success-foreground hover:bg-success">{s}</Badge>;
  if (low === "inviabilizado" || low === "reprovado pela controladoria")
    return <Badge className="bg-black text-white hover:bg-black">{s}</Badge>;
  if (low.includes("atras")) return <Badge variant="destructive">{s}</Badge>;
  return <Badge variant="secondary">{s}</Badge>;
}

function Card({
  icon,
  label,
  value,
  iconClass,
}: {
  icon: string;
  label: string;
  value: number;
  iconClass: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm">
      <div className={`grid h-11 w-11 place-items-center rounded-xl text-xl ${iconClass}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div className="text-2xl font-bold">{value}</div>
      </div>
    </div>
  );
}

export function DiretoriaPanel({ rows, novosTotal = 0 }: Props) {
  const managers = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => set.add(r.gerente || SEM_GERENTE));
    return Array.from(set).sort();
  }, [rows]);

  const [unselected, setUnselected] = useState<Record<string, boolean>>({});
  const isOn = (m: string) => !unselected[m];
  const setAll = (v: boolean) =>
    setUnselected(Object.fromEntries(managers.map((m) => [m, !v])));
  const invert = () => setUnselected(Object.fromEntries(managers.map((m) => [m, isOn(m)])));

  const selectedCount = managers.filter(isOn).length;
  const allSelected = managers.length > 0 && selectedCount === managers.length;

  const filtered = useMemo(
    () => rows.filter((r) => isOn(r.gerente || SEM_GERENTE)),
    [rows, unselected],
  );

  const counts = useMemo(() => {
    const base = filtered.filter((r) => (r.status || "").trim().toLowerCase() !== "inviabilizado");
    const cnt = (pct: number) =>
      base.filter((r) => Math.round(r.pctConclusao * 100) === pct).length;
    return {
      total: filtered.length,
      emValidacao: filtered.filter(
        (r) => (r.status || "").trim().toLowerCase() === "em validação pela controladoria",
      ).length,
      finalizados: filtered.filter((r) => r.atencaoOrder === 5).length,
      longaDuracao: filtered.filter((r) => r.atencaoOrder === 1).length,
      inviabilizados: filtered.filter((r) => r.atencaoOrder === 6).length,
      p0: cnt(0),
      p20: cnt(20),
      p40: cnt(40),
      p60: cnt(60),
      p80: cnt(80),
      p90: cnt(90),
    };
  }, [filtered]);

  return (
    <div className="space-y-4">
      <SectionCard
        title="Seleção de Gerentes"
        description="Os cards e a tabela são recalculados conforme os gerentes selecionados."
      >
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setAll(true)}>
            Selecionar Todos
          </Button>
          <Button size="sm" variant="outline" onClick={() => setAll(false)}>
            Desmarcar Todos
          </Button>
          <Button size="sm" variant="outline" onClick={invert}>
            Inverter Seleção
          </Button>
          <div className="ml-auto text-xs text-muted-foreground">
            Gerentes selecionados: <b>{selectedCount}</b> de {managers.length} · Projetos exibidos:{" "}
            <b>{filtered.length}</b>
          </div>
        </div>
        <div className="max-h-[280px] overflow-auto rounded-md border p-2">
          {managers.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">Nenhum gerente encontrado.</p>
          ) : (
            <ul className="divide-y">
              {managers.map((m) => {
                const on = isOn(m);
                const count = rows.filter((r) => (r.gerente || SEM_GERENTE) === m).length;
                return (
                  <li key={m} className="flex items-center justify-between gap-3 px-2 py-2">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setUnselected((prev) => ({ ...prev, [m]: !prev[m] }))}
                        className={`text-lg leading-none transition-colors ${on ? "text-success" : "text-muted-foreground"}`}
                        aria-label={on ? `Desmarcar ${m}` : `Selecionar ${m}`}
                        title={on ? "Selecionado" : "Não selecionado"}
                      >
                        {on ? "🟢" : "⚪"}
                      </button>
                      <span className="text-sm font-medium">{m}</span>
                      <span className="text-xs text-muted-foreground">({count})</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </SectionCard>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card icon="📊" label="Total de Projetos" value={counts.total} iconClass="bg-primary/10 text-primary" />
        <Card icon="🟣" label="Em validação pela controladoria" value={counts.emValidacao} iconClass="bg-purple-100 text-purple-700" />
        <Card icon="🏁" label="Finalizados" value={counts.finalizados} iconClass="bg-muted text-foreground" />
        <Card icon="🔵" label="Longa Duração" value={counts.longaDuracao} iconClass="bg-blue-100 text-blue-700" />
        <Card icon="⚫" label="Inviabilizados" value={counts.inviabilizados} iconClass="bg-black text-white" />
      </div>

      <div className={`grid gap-4 sm:grid-cols-2 ${allSelected ? "lg:grid-cols-7" : "lg:grid-cols-6"}`}>
        {allSelected && (
          <Card icon="🆕" label="Novos Projetos" value={novosTotal} iconClass="bg-primary/10 text-primary" />
        )}
        <Card icon="⏸️" label="Não iniciado" value={counts.p0} iconClass="bg-muted text-foreground" />
        <Card icon="🔎" label="1ª Fase" value={counts.p20} iconClass="bg-blue-100 text-blue-700" />
        <Card icon="📊" label="2ª Fase" value={counts.p40} iconClass="bg-indigo-100 text-indigo-700" />
        <Card icon="⚙️" label="3ª Fase" value={counts.p60} iconClass="bg-amber-100 text-amber-700" />
        <Card icon="🛠️" label="4ª Fase" value={counts.p80} iconClass="bg-orange-100 text-orange-700" />
        <Card icon="✅" label="5ª Fase" value={counts.p90} iconClass="bg-green-100 text-green-700" />
      </div>

      <SectionCard
        title="Status dos Projetos"
        description={`${filtered.length} projetos · visualização executiva`}
      >
        <div className="max-h-[520px] overflow-auto rounded-md border">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0_var(--border)]">
              <TableRow>
                <TableHead className="whitespace-normal align-bottom leading-tight">Projeto</TableHead>
                <TableHead className="whitespace-normal align-bottom leading-tight">Líder</TableHead>
                <TableHead className="whitespace-normal align-bottom leading-tight">Gerente</TableHead>
                <TableHead className="whitespace-normal align-bottom leading-tight">Fase Atual</TableHead>
                <TableHead className="whitespace-normal align-bottom leading-tight">Última fase iniciada</TableHead>
                <TableHead className="whitespace-normal align-bottom leading-tight">Prazo da ação</TableHead>
                <TableHead className="whitespace-normal align-bottom leading-tight text-right">Dias corridos da fase</TableHead>
                <TableHead className="whitespace-normal align-bottom leading-tight">Última atualização</TableHead>
                <TableHead className="whitespace-normal align-bottom leading-tight text-right">Dias desde a última atualização</TableHead>
                <TableHead className="whitespace-normal align-bottom leading-tight">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.matricula}>
                  <TableCell className="max-w-[280px]">
                    <div className="truncate font-medium">{r.projeto}</div>
                    <div className="text-xs text-muted-foreground">#{r.matricula}</div>
                  </TableCell>
                  <TableCell className="text-sm">{r.lider || "—"}</TableCell>
                  <TableCell className="text-sm">{r.gerente || "—"}</TableCell>
                  <TableCell className="text-sm">
                    {r.faseAtualShort ? (
                      <span title={r.faseAtualFull} className="cursor-help whitespace-nowrap">
                        {r.faseAtualShort}
                      </span>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{fmtDate(r.ultimaFase)}</TableCell>
                  <TableCell className="text-sm">{fmtDate(r.prazo)}</TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {r.diasFase != null ? `${r.diasFase} d` : "—"}
                  </TableCell>
                  <TableCell className="text-sm">{fmtDate(r.ultimaAtualizacao)}</TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {r.diasAtualizacao != null ? `${r.diasAtualizacao} d` : "—"}
                  </TableCell>
                  <TableCell>{statusBadge(r.status)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </SectionCard>
    </div>
  );
}
