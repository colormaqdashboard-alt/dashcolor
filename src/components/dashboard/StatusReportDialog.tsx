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
import { Switch } from "@/components/ui/switch";
import { FileCode2 } from "lucide-react";
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
};

export function StatusReportDialog({ open, onOpenChange, rows, logoDataUri }: Props) {
  const managers = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => set.add(r.gerente || "— Sem gerente —"));
    return Array.from(set).sort();
  }, [rows]);

  const [selected, setSelected] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!open) return;
    setSelected((prev) => {
      const next: Record<string, boolean> = {};
      managers.forEach((m) => (next[m] = prev[m] ?? true));
      return next;
    });
  }, [open, managers]);

  const setAll = (v: boolean) =>
    setSelected(Object.fromEntries(managers.map((m) => [m, v])));
  const invert = () =>
    setSelected(Object.fromEntries(managers.map((m) => [m, !selected[m]])));

  const selectedCount = managers.filter((m) => selected[m]).length;
  const filtered = useMemo(
    () => rows.filter((r) => selected[r.gerente || "— Sem gerente —"]),
    [rows, selected],
  );

  const handleGenerate = () => {
    const html = generateStatusReportHTML(filtered, {
      logoDataUri,
      selectedManagers: selectedCount,
      totalManagers: managers.length,
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
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Configurar Relatório HTML</DialogTitle>
          <DialogDescription>
            Selecione os gerentes que devem ser incluídos no relatório.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
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
            Gerentes selecionados: <b>{selectedCount}</b> de {managers.length} · Projetos incluídos:{" "}
            <b>{filtered.length}</b>
          </div>
        </div>

        <div className="max-h-[360px] overflow-auto rounded-md border p-2">
          {managers.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">Nenhum gerente encontrado.</p>
          ) : (
            <ul className="divide-y">
              {managers.map((m) => {
                const on = !!selected[m];
                const count = rows.filter((r) => (r.gerente || "— Sem gerente —") === m).length;
                return (
                  <li key={m} className="flex items-center justify-between gap-3 py-2 px-2">
                    <div className="flex items-center gap-2">
                      <span className={on ? "text-success" : "text-muted-foreground"}>
                        {on ? "🟢" : "⚪"}
                      </span>
                      <span className="text-sm font-medium">{m}</span>
                      <span className="text-xs text-muted-foreground">({count})</span>
                    </div>
                    <Switch
                      checked={on}
                      onCheckedChange={(v) => setSelected((prev) => ({ ...prev, [m]: v }))}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleGenerate} disabled={filtered.length === 0}>
            <FileCode2 className="mr-2 h-4 w-4" />
            Gerar Relatório HTML
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}