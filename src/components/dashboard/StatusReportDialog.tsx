import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FileCode2 } from "lucide-react";
import { contaNaQuintaFase, norm, PCT_QUINTA_FASE } from "@/lib/dashboard";
import {
  downloadHtml,
  generateStatusReportHTML,
  type StatusReportRow,
} from "@/lib/status-report";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  rows: StatusReportRow[];
  logoDataUri: string | null;
  novosTotal?: number;
};

const SEM_GERENTE = "— Sem gerente —";

/** Fases disponíveis no filtro (mesmos percentuais usados em todo o DashColor). */
const FASES: { label: string; pct: number }[] = [
  { label: "Não iniciado", pct: 0 },
  { label: "1ª Fase", pct: 20 },
  { label: "2ª Fase", pct: 40 },
  { label: "3ª Fase", pct: 60 },
  { label: "4ª Fase", pct: 80 },
  { label: "5ª Fase", pct: PCT_QUINTA_FASE },
  { label: "Finalizado", pct: 100 },
];

const STATUS_OPCOES = [
  "Validado pela controladoria",
  "Inviabilizado",
  "Reprovado pela controladoria",
  "Em validação pela controladoria",
  "Bloqueado",
  "Fazer levantamento",
];

/**
 * Fase apresentada de uma linha. REGRA DA 5ª FASE preservada: projeto na 5ª fase
 * "Em validação pela controladoria" não é apresentado como 5ª Fase (retorna null).
 */
function faseLabelDaLinha(r: StatusReportRow): string | null {
  const pct = Math.round(r.pctConclusao * 100);
  if (pct === PCT_QUINTA_FASE && !contaNaQuintaFase(r.pctConclusao, r.status)) return null;
  return FASES.find((f) => f.pct === pct)?.label ?? null;
}

function statusLabelDaLinha(r: StatusReportRow): string | null {
  return STATUS_OPCOES.find((s) => norm(s) === norm(r.status)) ?? null;
}

type SelMap = Record<string, boolean>;

function SelectionSection({
  title,
  items,
  counts,
  selected,
  onChange,
  info,
}: {
  title: string;
  items: string[];
  counts?: Record<string, number>;
  selected: SelMap;
  onChange: (next: SelMap) => void;
  info?: React.ReactNode;
}) {
  const setAll = (v: boolean) => onChange(Object.fromEntries(items.map((i) => [i, v])));
  const invert = () => onChange(Object.fromEntries(items.map((i) => [i, !selected[i]])));
  const selectedCount = items.filter((i) => selected[i]).length;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">{title}</span>
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
          {title} selecionados: <b>{selectedCount}</b> de {items.length}
          {info}
        </div>
      </div>

      <div className="max-h-[220px] overflow-auto rounded-md border p-2">
        {items.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">Nenhum item encontrado.</p>
        ) : (
          <ul className="divide-y">
            {items.map((m) => {
              const on = !!selected[m];
              return (
                <li key={m} className="flex items-center justify-between gap-3 py-2 px-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onChange({ ...selected, [m]: !selected[m] })}
                      className={`text-lg leading-none transition-colors ${on ? "text-success" : "text-muted-foreground"}`}
                      aria-label={on ? `Desmarcar ${m}` : `Selecionar ${m}`}
                      title={on ? "Selecionado" : "Não selecionado"}
                    >
                      {on ? "🟢" : "⚪"}
                    </button>
                    <span className="text-sm font-medium">{m}</span>
                    {counts && (
                      <span className="text-xs text-muted-foreground">({counts[m] ?? 0})</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

export function StatusReportDialog({ open, onOpenChange, rows, logoDataUri, novosTotal = 0 }: Props) {
  const managers = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => set.add(r.gerente || SEM_GERENTE));
    return Array.from(set).sort();
  }, [rows]);

  const [selected, setSelected] = useState<SelMap>({});
  const [fasesSel, setFasesSel] = useState<SelMap>(() =>
    Object.fromEntries(FASES.map((f) => [f.label, true])),
  );
  const [statusSel, setStatusSel] = useState<SelMap>(() =>
    Object.fromEntries(STATUS_OPCOES.map((s) => [s, true])),
  );

  useEffect(() => {
    if (!open) return;
    setSelected((prev) => {
      const next: SelMap = {};
      managers.forEach((m) => (next[m] = prev[m] ?? true));
      return next;
    });
  }, [open, managers]);

  const faseLabels = FASES.map((f) => f.label);
  const selectedCount = managers.filter((m) => selected[m]).length;
  const fasesCount = faseLabels.filter((f) => fasesSel[f]).length;
  const statusCount = STATUS_OPCOES.filter((s) => statusSel[s]).length;
  const todasFases = fasesCount === faseLabels.length;
  const todosStatus = statusCount === STATUS_OPCOES.length;

  const managerCounts = useMemo(() => {
    const m: Record<string, number> = {};
    rows.forEach((r) => {
      const k = r.gerente || SEM_GERENTE;
      m[k] = (m[k] || 0) + 1;
    });
    return m;
  }, [rows]);

  const faseCountsMap = useMemo(() => {
    const m: Record<string, number> = {};
    rows.forEach((r) => {
      const k = faseLabelDaLinha(r);
      if (k) m[k] = (m[k] || 0) + 1;
    });
    return m;
  }, [rows]);

  const statusCountsMap = useMemo(() => {
    const m: Record<string, number> = {};
    rows.forEach((r) => {
      const k = statusLabelDaLinha(r);
      if (k) m[k] = (m[k] || 0) + 1;
    });
    return m;
  }, [rows]);

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (!selected[r.gerente || SEM_GERENTE]) return false;
        // Quando todas as fases/status estão marcados, nada é filtrado (relatório atual).
        if (!todasFases) {
          const fase = faseLabelDaLinha(r);
          if (!fase || !fasesSel[fase]) return false;
        }
        if (!todosStatus) {
          const st = statusLabelDaLinha(r);
          if (!st || !statusSel[st]) return false;
        }
        return true;
      }),
    [rows, selected, fasesSel, statusSel, todasFases, todosStatus],
  );

  const faseCounts = useMemo(() => {
    const base = filtered.filter(
      (r) => (r.status || "").trim().toLowerCase() !== "inviabilizado",
    );
    // REGRA CENTRAL: a 5ª Fase não contabiliza projetos "Em validação pela controladoria".
    const cnt = (pct: number) =>
      base.filter(
        (r) =>
          Math.round(r.pctConclusao * 100) === pct &&
          (pct !== PCT_QUINTA_FASE || contaNaQuintaFase(r.pctConclusao, r.status)),
      ).length;
    return {
      novos: novosTotal,
      p0: cnt(0),
      p20: cnt(20),
      p40: cnt(40),
      p60: cnt(60),
      p80: cnt(80),
      p90: cnt(90),
      emValidacao: filtered.filter(
        (r) => (r.status || "").trim().toLowerCase() === "em validação pela controladoria",
      ).length,
    };
  }, [filtered, novosTotal]);

  const aviso =
    fasesCount === 0
      ? "Selecione pelo menos uma Fase para gerar o relatório."
      : statusCount === 0
        ? "Selecione pelo menos um Status para gerar o relatório."
        : null;

  const handleGenerate = () => {
    if (aviso) return;
    const html = generateStatusReportHTML(filtered, {
      logoDataUri,
      selectedManagers: selectedCount,
      totalManagers: managers.length,
      faseCounts,
    });
    const stamp = new Date()
      .toISOString()
      .replace(/[:T]/g, "-")
      .replace(/\..+/, "");
    downloadHtml(`Status dos Projetos - ${stamp}.html`, html);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configurar Relatório HTML</DialogTitle>
          <DialogDescription>
            Selecione os gerentes, fases e status que devem ser incluídos no relatório.
          </DialogDescription>
        </DialogHeader>

        <SelectionSection
          title="Gerentes"
          items={managers}
          counts={managerCounts}
          selected={selected}
          onChange={setSelected}
          info={
            <>
              {" "}
              · Projetos incluídos: <b>{filtered.length}</b>
            </>
          }
        />

        <SelectionSection
          title="Fases"
          items={faseLabels}
          counts={faseCountsMap}
          selected={fasesSel}
          onChange={setFasesSel}
        />

        <SelectionSection
          title="Status"
          items={STATUS_OPCOES}
          counts={statusCountsMap}
          selected={statusSel}
          onChange={setStatusSel}
        />

        {aviso && (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {aviso}
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleGenerate} disabled={!!aviso || filtered.length === 0}>
            <FileCode2 className="mr-2 h-4 w-4" />
            Gerar Relatório HTML
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
