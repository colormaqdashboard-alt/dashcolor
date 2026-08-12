import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Download, FileSpreadsheet, FileCode2, User, Infinity as InfinityIcon } from "lucide-react";
import {
  computePayback,
  computePaybackValidado,
  fmtMoney,
  fmtPayback,
  paybackToneClass,
  type EnrichedProjeto,
} from "@/lib/dashboard";

function hasBlackStatusTreatment(status: string) {
  const low = status.trim().toLowerCase();
  return low === "inviabilizado" || low === "reprovado pela controladoria";
}

const isLevantamento = (raw: string | null | undefined) =>
  (raw || "").trim().toLowerCase() === "fazer levantamento";

type RowCalc = {
  p: EnrichedProjeto;
  investimento: number;
  savingPrev: number;
  savingVal: number;
  roi: number | null; // usa validado com fallback
  levantamento: boolean;
};

function buildRows(projetos: EnrichedProjeto[]): RowCalc[] {
  return projetos.map((p) => {
    const investimento = Number(p.investimento) || 0;
    const savingPrev = p.savingPrevistoEfetivo;
    const savingVal = p.savingAprovadoEfetivo;
    const levantamento = isLevantamento(p.investimento_raw);
    return {
      p,
      investimento,
      savingPrev,
      savingVal,
      roi: levantamento ? null : computePaybackValidado(investimento, savingVal, savingPrev),
      levantamento,
    };
  });
}

function isAtivo(p: EnrichedProjeto) {
  const s = (p.status || "").trim().toLowerCase();
  if (s === "inviabilizado" || s === "reprovado pela controladoria") return false;
  if (p.concluido) return false; // considerar carteira em andamento
  return true;
}

// Prioritário: ROI Infinito primeiro, depois maior Saving Validado, depois maior Saving Previsto
function sortPrioritario(a: RowCalc, b: RowCalc) {
  const ai = a.roi != null && !isFinite(a.roi) ? 1 : 0;
  const bi = b.roi != null && !isFinite(b.roi) ? 1 : 0;
  if (ai !== bi) return bi - ai;
  if (b.savingVal !== a.savingVal) return b.savingVal - a.savingVal;
  return b.savingPrev - a.savingPrev;
}

// Prolongado: maior ROI primeiro (excluindo infinitos e nulos)
function sortProlongado(a: RowCalc, b: RowCalc) {
  return (b.roi as number) - (a.roi as number);
}

type GerenteBucket = {
  gerente: string;
  rows: RowCalc[];
  ativos: RowCalc[];
  savingPrevTotal: number;
  savingValTotal: number;
  roiInfinitoQtd: number;
  roiMedio: number | null;
  maiorSaving: RowCalc | null;
  maiorROI: RowCalc | null;
  prioritario: RowCalc[];
  prolongado: RowCalc[];
};

function computeBuckets(projetos: EnrichedProjeto[]): GerenteBucket[] {
  const map = new Map<string, RowCalc[]>();
  buildRows(projetos).forEach((r) => {
    const k = (r.p.gerente || "Sem Gerente").trim() || "Sem Gerente";
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(r);
  });
  return Array.from(map, ([gerente, rows]) => {
    const ativos = rows.filter((r) => isAtivo(r.p));
    const savingPrevTotal = rows.reduce((s, r) => s + r.savingPrev, 0);
    const savingValTotal = rows.reduce((s, r) => s + r.savingVal, 0);
    const roiInfinitoQtd = rows.filter((r) => r.roi != null && !isFinite(r.roi)).length;
    const finitos = rows.filter((r) => r.roi != null && isFinite(r.roi) && r.roi >= 0);
    const roiMedio = finitos.length
      ? finitos.reduce((s, r) => s + (r.roi as number), 0) / finitos.length
      : null;
    const maiorSaving = rows.slice().sort((a, b) => Math.max(b.savingVal, b.savingPrev) - Math.max(a.savingVal, a.savingPrev))[0] || null;
    const maiorROI = rows
      .filter((r) => r.roi != null && isFinite(r.roi))
      .sort((a, b) => (b.roi as number) - (a.roi as number))[0] || null;
    const prioritario = rows.slice().sort(sortPrioritario).slice(0, 5);
    const prolongado = rows
      .filter((r) => r.roi != null && isFinite(r.roi))
      .sort(sortProlongado)
      .slice(0, 5);
    return {
      gerente,
      rows,
      ativos,
      savingPrevTotal,
      savingValTotal,
      roiInfinitoQtd,
      roiMedio,
      maiorSaving,
      maiorROI,
      prioritario,
      prolongado,
    };
  }).sort((a, b) => a.gerente.localeCompare(b.gerente));
}

type CardConfig = {
  incluir: boolean;
  viewPrioritario: boolean;
  viewProlongado: boolean;
  reportPrioritario: boolean;
  reportProlongado: boolean;
};

const DEFAULT_CFG: CardConfig = {
  incluir: true,
  viewPrioritario: true,
  viewProlongado: true,
  reportPrioritario: true,
  reportProlongado: true,
};

function StatusBadge({ status }: { status: string | null }) {
  const s = (status || "").trim();
  if (!s) return <Badge variant="secondary">Sem status</Badge>;
  const low = s.toLowerCase();
  if (low === "validado pela controladoria")
    return <Badge className="bg-success text-success-foreground hover:bg-success">{s}</Badge>;
  if (low === "atrasado") return <Badge variant="destructive">{s}</Badge>;
  if (hasBlackStatusTreatment(s))
    return <Badge className="bg-black text-white hover:bg-black">{s}</Badge>;
  return <Badge variant="secondary">{s}</Badge>;
}

function RoiCell({ r }: { r: RowCalc }) {
  if (r.levantamento) return <span className="text-muted-foreground">-</span>;
  if (r.roi != null && !isFinite(r.roi))
    return (
      <span className="inline-flex items-center gap-1 font-semibold text-success">
        <InfinityIcon className="h-4 w-4" /> Imediato
      </span>
    );
  return <span className={paybackToneClass(r.roi)}>{fmtPayback(r.roi)}</span>;
}

function RankingTable({ rows, empty }: { rows: RowCalc[]; empty: string }) {
  if (!rows.length) {
    return <p className="py-4 text-center text-sm text-muted-foreground">{empty}</p>;
  }
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader className="bg-muted/50">
          <TableRow>
            <TableHead className="w-[32px] text-xs">#</TableHead>
            <TableHead className="text-xs">Projeto</TableHead>
            <TableHead className="text-xs">Matrícula</TableHead>
            <TableHead className="text-xs">Líder</TableHead>
            <TableHead className="text-right text-xs">Saving Previsto</TableHead>
            <TableHead className="text-right text-xs">Saving Validado</TableHead>
            <TableHead className="text-right text-xs">Investimento</TableHead>
            <TableHead className="text-right text-xs">ROI</TableHead>
            <TableHead className="text-xs">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, i) => (
            <TableRow key={r.p.matricula}>
              <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
              <TableCell className="max-w-[220px] truncate text-sm font-medium" title={r.p.projeto}>
                {r.p.projeto}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">#{r.p.matricula}</TableCell>
              <TableCell className="text-sm">{r.p.lider || "—"}</TableCell>
              <TableCell className="text-right text-sm tabular-nums">{fmtMoney(r.savingPrev)}</TableCell>
              <TableCell className="text-right text-sm tabular-nums">{fmtMoney(r.savingVal)}</TableCell>
              <TableCell className="text-right text-sm tabular-nums">
                {r.levantamento ? "-" : fmtMoney(r.investimento)}
              </TableCell>
              <TableCell className="text-right text-sm tabular-nums">
                <RoiCell r={r} />
              </TableCell>
              <TableCell>
                <StatusBadge status={r.p.status} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ToggleRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 py-1">
      <span className="text-sm">{label}</span>
      <Switch checked={value} onCheckedChange={onChange} />
    </div>
  );
}

function ManagerCard({
  bucket,
  cfg,
  setCfg,
}: {
  bucket: GerenteBucket;
  cfg: CardConfig;
  setCfg: (c: CardConfig) => void;
}) {
  return (
    <Card className="flex h-full flex-col shadow-[var(--shadow-card)]">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 border-b pb-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
            <User className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-bold uppercase tracking-wide">{bucket.gerente}</div>
            <div className="text-xs text-muted-foreground">
              {bucket.rows.length} projeto{bucket.rows.length === 1 ? "" : "s"} · {bucket.ativos.length} ativo{bucket.ativos.length === 1 ? "" : "s"}
            </div>
          </div>
        </div>
        {cfg.incluir ? (
          <Badge className="bg-success text-success-foreground hover:bg-success">No relatório</Badge>
        ) : (
          <Badge variant="secondary">Fora do relatório</Badge>
        )}
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4 pt-4">
        {/* Resumo executivo */}
        <div className="grid grid-cols-2 gap-2 rounded-md border bg-muted/30 p-3 text-sm">
          <div>
            <div className="text-[10px] uppercase text-muted-foreground">Projetos Ativos</div>
            <div className="font-semibold tabular-nums">{bucket.ativos.length}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-muted-foreground">ROI Infinito</div>
            <div className="font-semibold tabular-nums text-success">{bucket.roiInfinitoQtd}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-muted-foreground">Saving Previsto</div>
            <div className="font-semibold tabular-nums">{fmtMoney(bucket.savingPrevTotal)}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-muted-foreground">Saving Validado</div>
            <div className="font-semibold tabular-nums">{fmtMoney(bucket.savingValTotal)}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-muted-foreground">ROI Médio</div>
            <div className={`font-semibold tabular-nums ${paybackToneClass(bucket.roiMedio)}`}>
              {bucket.roiMedio == null ? "—" : fmtPayback(bucket.roiMedio)}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-muted-foreground">Maior Saving</div>
            <div className="truncate text-xs font-medium" title={bucket.maiorSaving?.p.projeto || ""}>
              {bucket.maiorSaving?.p.projeto || "—"}
            </div>
          </div>
          <div className="col-span-2">
            <div className="text-[10px] uppercase text-muted-foreground">Maior tempo de ROI</div>
            <div className="truncate text-xs font-medium" title={bucket.maiorROI?.p.projeto || ""}>
              {bucket.maiorROI ? `${bucket.maiorROI.p.projeto} · ${fmtPayback(bucket.maiorROI.roi)}` : "—"}
            </div>
          </div>
        </div>

        {/* Config */}
        <div className="rounded-md border p-3">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Configuração do Card
          </div>
          <ToggleRow
            label="Incluir gerente no relatório"
            value={cfg.incluir}
            onChange={(v) => setCfg({ ...cfg, incluir: v })}
          />
          <div className="mt-2 border-t pt-2">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Visualização
            </div>
            <ToggleRow
              label="ROI Prioritário"
              value={cfg.viewPrioritario}
              onChange={(v) => setCfg({ ...cfg, viewPrioritario: v })}
            />
            <ToggleRow
              label="ROI Prolongado"
              value={cfg.viewProlongado}
              onChange={(v) => setCfg({ ...cfg, viewProlongado: v })}
            />
          </div>
          <div className="mt-2 border-t pt-2">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Relatório
            </div>
            <ToggleRow
              label="ROI Prioritário"
              value={cfg.reportPrioritario}
              onChange={(v) => setCfg({ ...cfg, reportPrioritario: v })}
            />
            <ToggleRow
              label="ROI Prolongado"
              value={cfg.reportProlongado}
              onChange={(v) => setCfg({ ...cfg, reportProlongado: v })}
            />
          </div>
        </div>

        {/* Rankings */}
        {cfg.viewPrioritario && (
          <div className="space-y-2">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wide">ROI Prioritário</h3>
              <p className="text-xs text-muted-foreground">Top 5 projetos com maior potencial de retorno financeiro</p>
            </div>
            <RankingTable rows={bucket.prioritario} empty="Nenhum projeto disponível" />
          </div>
        )}
        {cfg.viewProlongado && (
          <div className="space-y-2">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wide">ROI Prolongado</h3>
              <p className="text-xs text-muted-foreground">Top 5 projetos com maior horizonte de retorno</p>
            </div>
            <RankingTable rows={bucket.prolongado} empty="Nenhum projeto com ROI mensurável" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------- Export helpers ----------

function fmtPaybackPlain(years: number | null | undefined): string {
  if (years == null) return "-";
  if (!isFinite(years)) return "Imediato";
  return fmtPayback(years);
}

function buildReportContext(
  buckets: GerenteBucket[],
  cfgs: Record<string, CardConfig>,
) {
  const incluidos = buckets.filter((b) => cfgs[b.gerente]?.incluir);
  const totalProjetos = incluidos.reduce((s, b) => {
    const cfg = cfgs[b.gerente];
    let n = 0;
    if (cfg.reportPrioritario) n += b.prioritario.length;
    if (cfg.reportProlongado) n += b.prolongado.length;
    return s + n;
  }, 0);
  const now = new Date();
  return {
    incluidos,
    totalProjetos,
    dataStr: now.toLocaleDateString("pt-BR"),
    horaStr: now.toLocaleTimeString("pt-BR"),
  };
}

function exportXLSX(buckets: GerenteBucket[], cfgs: Record<string, CardConfig>) {
  const ctx = buildReportContext(buckets, cfgs);
  const wb = XLSX.utils.book_new();

  // Aba Resumo
  const resumo: (string | number)[][] = [
    ["PAINEL ESTRATÉGICO DE ROI"],
    ["Data", ctx.dataStr, "Hora", ctx.horaStr],
    ["Gerentes incluídos", ctx.incluidos.length, "Projetos apresentados", ctx.totalProjetos],
    [],
    ["Gerente", "Projetos Ativos", "Saving Previsto", "Saving Validado", "ROI Médio", "ROI Infinito"],
    ...ctx.incluidos.map((b) => [
      b.gerente,
      b.ativos.length,
      b.savingPrevTotal,
      b.savingValTotal,
      b.roiMedio == null ? "—" : fmtPayback(b.roiMedio),
      b.roiInfinitoQtd,
    ]),
  ];
  const wsResumo = XLSX.utils.aoa_to_sheet(resumo);
  XLSX.utils.book_append_sheet(wb, wsResumo, "Resumo");

  const header = [
    "Projeto",
    "Matrícula",
    "Líder",
    "Saving Previsto",
    "Saving Validado",
    "Investimento",
    "ROI",
    "Status",
  ];

  ctx.incluidos.forEach((b) => {
    const cfg = cfgs[b.gerente];
    const aoa: (string | number)[][] = [[`Gerente: ${b.gerente}`], []];
    if (cfg.reportPrioritario) {
      aoa.push(["ROI PRIORITÁRIO — Top 5 Projetos com Maior Potencial de Retorno"], header);
      b.prioritario.forEach((r) =>
        aoa.push([
          r.p.projeto,
          r.p.matricula,
          r.p.lider || "—",
          r.savingPrev,
          r.savingVal,
          r.levantamento ? "-" : r.investimento,
          fmtPaybackPlain(r.roi),
          r.p.status || "—",
        ]),
      );
      aoa.push([]);
    }
    if (cfg.reportProlongado) {
      aoa.push(["ROI PROLONGADO — Top 5 Projetos com Maior Horizonte de Retorno"], header);
      b.prolongado.forEach((r) =>
        aoa.push([
          r.p.projeto,
          r.p.matricula,
          r.p.lider || "—",
          r.savingPrev,
          r.savingVal,
          r.levantamento ? "-" : r.investimento,
          fmtPaybackPlain(r.roi),
          r.p.status || "—",
        ]),
      );
      aoa.push([]);
    }
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const name = b.gerente.substring(0, 28).replace(/[\\/*?:\[\]]/g, "");
    XLSX.utils.book_append_sheet(wb, ws, name || "Gerente");
  });

  XLSX.writeFile(wb, `painel-estrategico-roi-${Date.now()}.xlsx`);
}

function escapeHTML(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function tableHTML(rows: RowCalc[]) {
  if (!rows.length) return `<p class="empty">Nenhum projeto disponível.</p>`;
  const trs = rows
    .map(
      (r, i) => `<tr>
      <td>${i + 1}</td>
      <td>${escapeHTML(r.p.projeto)}</td>
      <td>#${r.p.matricula}</td>
      <td>${escapeHTML(r.p.lider || "—")}</td>
      <td class="num">${fmtMoney(r.savingPrev)}</td>
      <td class="num">${fmtMoney(r.savingVal)}</td>
      <td class="num">${r.levantamento ? "-" : fmtMoney(r.investimento)}</td>
      <td class="num">${fmtPaybackPlain(r.roi)}</td>
      <td>${escapeHTML(r.p.status || "—")}</td>
    </tr>`,
    )
    .join("");
  return `<table><thead><tr>
    <th>#</th><th>Projeto</th><th>Matrícula</th><th>Líder</th>
    <th class="num">Saving Previsto</th><th class="num">Saving Validado</th>
    <th class="num">Investimento</th><th class="num">ROI</th><th>Status</th>
  </tr></thead><tbody>${trs}</tbody></table>`;
}

function exportHTML(buckets: GerenteBucket[], cfgs: Record<string, CardConfig>) {
  const ctx = buildReportContext(buckets, cfgs);
  const secoes = ctx.incluidos
    .map((b) => {
      const cfg = cfgs[b.gerente];
      const partes: string[] = [];
      partes.push(`<section class="gerente">
        <h2>Gerente · ${escapeHTML(b.gerente)}</h2>
        <div class="resumo">
          <div><span>Projetos ativos</span><b>${b.ativos.length}</b></div>
          <div><span>Saving Previsto Total</span><b>${fmtMoney(b.savingPrevTotal)}</b></div>
          <div><span>Saving Validado Total</span><b>${fmtMoney(b.savingValTotal)}</b></div>
          <div><span>ROI Médio</span><b>${b.roiMedio == null ? "—" : fmtPayback(b.roiMedio)}</b></div>
          <div><span>ROI Infinito</span><b>${b.roiInfinitoQtd}</b></div>
        </div>`);
      if (cfg.reportPrioritario) {
        partes.push(
          `<h3>ROI Prioritário</h3><p class="sub">Top 5 projetos com maior potencial de retorno financeiro</p>${tableHTML(b.prioritario)}`,
        );
      }
      if (cfg.reportProlongado) {
        partes.push(
          `<h3>ROI Prolongado</h3><p class="sub">Top 5 projetos com maior horizonte de retorno</p>${tableHTML(b.prolongado)}`,
        );
      }
      partes.push(`</section>`);
      return partes.join("");
    })
    .join("");

  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"/>
  <title>Painel Estratégico de ROI</title>
  <style>
    :root{--bg:#f7f8fa;--card:#fff;--border:#e4e6eb;--muted:#6b7280;--pri:#0f172a;--acc:#2563eb;--succ:#16a34a;}
    *{box-sizing:border-box}
    body{margin:0;padding:32px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:var(--bg);color:var(--pri)}
    header{border-bottom:2px solid var(--pri);padding-bottom:16px;margin-bottom:24px}
    header h1{margin:0;font-size:22px;letter-spacing:1px;text-transform:uppercase}
    header .meta{color:var(--muted);font-size:12px;margin-top:6px;display:flex;gap:20px;flex-wrap:wrap}
    section.gerente{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:20px;margin-bottom:20px;box-shadow:0 1px 2px rgba(0,0,0,.04)}
    section.gerente h2{margin:0 0 12px;font-size:16px;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid var(--border);padding-bottom:8px}
    section.gerente h3{margin:18px 0 4px;font-size:13px;text-transform:uppercase;letter-spacing:.5px;color:var(--acc)}
    .sub{margin:0 0 8px;color:var(--muted);font-size:11px}
    .resumo{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:8px}
    .resumo div{background:#f3f4f6;border-radius:6px;padding:8px 10px}
    .resumo span{display:block;font-size:10px;text-transform:uppercase;color:var(--muted);margin-bottom:2px}
    .resumo b{font-size:14px}
    table{width:100%;border-collapse:collapse;font-size:12px;margin-top:4px}
    th,td{border-bottom:1px solid var(--border);padding:6px 8px;text-align:left;vertical-align:top}
    th{background:#f3f4f6;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.3px}
    td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}
    .empty{color:var(--muted);font-size:12px;font-style:italic;padding:8px 0}
    footer{margin-top:32px;padding-top:16px;border-top:1px solid var(--border);color:var(--muted);font-size:11px;text-align:center;line-height:1.5}
    @media print{body{background:#fff;padding:16px}section.gerente{break-inside:avoid;box-shadow:none}}
  </style></head><body>
  <header>
    <h1>Painel Estratégico de ROI</h1>
    <div class="meta">
      <span>Data: <b>${ctx.dataStr}</b></span>
      <span>Hora: <b>${ctx.horaStr}</b></span>
      <span>Gerentes: <b>${ctx.incluidos.length}</b></span>
      <span>Projetos: <b>${ctx.totalProjetos}</b></span>
    </div>
  </header>
  ${secoes || '<p style="color:#6b7280">Nenhum gerente selecionado para o relatório.</p>'}
  <footer>Este relatório foi gerado automaticamente pelo Painel Estratégico de ROI do Dashboard de Gestão de Projetos. As informações apresentadas refletem exatamente os filtros e configurações selecionados pelo usuário no momento da exportação.</footer>
  </body></html>`;

  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `painel-estrategico-roi-${Date.now()}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------- Main ----------

export function PainelEstrategicoROI({ projetos }: { projetos: EnrichedProjeto[] }) {
  const buckets = useMemo(() => computeBuckets(projetos), [projetos]);
  const reportBuckets = useMemo(
    () =>
      computeBuckets(
        projetos.filter((p) => !hasBlackStatusTreatment(p.status || "")),
      ),
    [projetos],
  );
  const [cfgs, setCfgs] = useState<Record<string, CardConfig>>({});

  // Garante configs default para novos gerentes sem recriar as existentes
  const effectiveCfgs = useMemo(() => {
    const next: Record<string, CardConfig> = { ...cfgs };
    buckets.forEach((b) => {
      if (!next[b.gerente]) next[b.gerente] = { ...DEFAULT_CFG };
    });
    return next;
  }, [buckets, cfgs]);

  const setOne = (gerente: string, cfg: CardConfig) => {
    setCfgs((prev) => ({ ...prev, [gerente]: cfg }));
  };

  const incluidosCount = buckets.filter((b) => effectiveCfgs[b.gerente]?.incluir).length;

  // Buckets do relatório usam somente projetos ativos (exclui Inviabilizado / Reprovado pela Controladoria),
  // mas preservam as configurações por gerente já definidas.
  const reportCfgs = effectiveCfgs;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4 shadow-[var(--shadow-card)]">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">Painel Estratégico de ROI</h2>
          <p className="text-xs text-muted-foreground">
            Visão executiva por gerente · {buckets.length} gerente{buckets.length === 1 ? "" : "s"} · {incluidosCount} no relatório
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="gap-2">
              <Download className="h-4 w-4" /> Exportar Relatório
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => exportXLSX(reportBuckets, reportCfgs)}>
              <FileSpreadsheet className="mr-2 h-4 w-4" /> Excel (.xlsx)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => exportHTML(reportBuckets, reportCfgs)}>
              <FileCode2 className="mr-2 h-4 w-4" /> HTML
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {buckets.length === 0 ? (
        <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
          Nenhum projeto disponível para exibir.
        </div>
      ) : (
        <div className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-2 xl:grid-cols-3">
          {buckets.map((b) => (
            <ManagerCard
              key={b.gerente}
              bucket={b}
              cfg={effectiveCfgs[b.gerente]}
              setCfg={(c) => setOne(b.gerente, c)}
            />
          ))}
        </div>
      )}
    </div>
  );
}