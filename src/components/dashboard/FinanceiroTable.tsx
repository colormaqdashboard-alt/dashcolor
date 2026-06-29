import { useMemo, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from "lucide-react";
import { fmtMoney, uniq, type EnrichedProjeto } from "@/lib/dashboard";

const ALL = "__all__";

type SortKey =
  | "projeto"
  | "lider"
  | "gerente"
  | "investimento"
  | "savingPrev"
  | "savingVal"
  | "roiPrev"
  | "roiVal"
  | "status";

type Row = {
  p: EnrichedProjeto;
  investimento: number;
  savingPrev: number;
  savingVal: number;
  roiPrev: number | null; // null => "-"; Infinity => "∞"
  roiVal: number | null;
};

function computeROI(saving: number, invest: number): number | null {
  if (invest > 0) return saving / invest;
  if (saving > 0) return Infinity;
  return null;
}

function roiLabel(v: number | null): string {
  if (v == null) return "—";
  if (!isFinite(v)) return "∞";
  return `${v.toFixed(2)}x`;
}

function roiToneClass(v: number | null): string {
  if (v == null) return "text-muted-foreground";
  if (!isFinite(v)) return "text-success font-semibold";
  if (v >= 3) return "text-success font-semibold";
  if (v >= 1) return "text-warning font-semibold";
  return "text-destructive font-semibold";
}

function roiCompare(a: number | null, b: number | null): number {
  // Sort order for asc: null < finite < ∞
  const va = a == null ? -Infinity : a;
  const vb = b == null ? -Infinity : b;
  return va - vb;
}

export function FinanceiroTable({ projetos }: { projetos: EnrichedProjeto[] }) {
  const [search, setSearch] = useState("");
  const [fGerente, setFGerente] = useState(ALL);
  const [fLider, setFLider] = useState(ALL);
  const [fStatus, setFStatus] = useState(ALL);
  const [sortKey, setSortKey] = useState<SortKey>("savingPrev");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const rows = useMemo<Row[]>(
    () =>
      projetos.map((p) => {
        const investimento = Number(p.investimento) || 0;
        const savingPrev = Number(p.saving_previsto) || 0;
        const savingVal = p.savingAprovadoEfetivo;
        return {
          p,
          investimento,
          savingPrev,
          savingVal,
          roiPrev: computeROI(savingPrev, investimento),
          roiVal: computeROI(savingVal, investimento),
        };
      }),
    [projetos],
  );

  const gerenteOpts = useMemo(() => uniq(rows.map((r) => r.p.gerente)).sort(), [rows]);
  const liderOpts = useMemo(() => uniq(rows.map((r) => r.p.lider)).sort(), [rows]);
  const statusOpts = useMemo(() => uniq(rows.map((r) => r.p.status)).sort(), [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (fGerente !== ALL && (r.p.gerente || "") !== fGerente) return false;
      if (fLider !== ALL && (r.p.lider || "") !== fLider) return false;
      if (fStatus !== ALL && (r.p.status || "") !== fStatus) return false;
      if (q) {
        const hay = `${r.p.projeto} ${r.p.lider || ""} ${r.p.gerente || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, search, fGerente, fLider, fStatus]);

  const sorted = useMemo(() => {
    const arr = filtered.slice();
    const dir = sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "projeto":
          cmp = (a.p.projeto || "").localeCompare(b.p.projeto || "");
          break;
        case "lider":
          cmp = (a.p.lider || "").localeCompare(b.p.lider || "");
          break;
        case "gerente":
          cmp = (a.p.gerente || "").localeCompare(b.p.gerente || "");
          break;
        case "status":
          cmp = (a.p.status || "").localeCompare(b.p.status || "");
          break;
        case "investimento":
          cmp = a.investimento - b.investimento;
          break;
        case "savingPrev":
          cmp = a.savingPrev - b.savingPrev;
          break;
        case "savingVal":
          cmp = a.savingVal - b.savingVal;
          break;
        case "roiPrev":
          cmp = roiCompare(a.roiPrev, b.roiPrev);
          break;
        case "roiVal":
          cmp = roiCompare(a.roiVal, b.roiVal);
          break;
      }
      return cmp * dir;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir(
        k === "projeto" || k === "lider" || k === "gerente" || k === "status" ? "asc" : "desc",
      );
    }
  };

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return <ArrowUpDown className="ml-1 inline h-3 w-3 opacity-40" />;
    return sortDir === "asc" ? (
      <ArrowUp className="ml-1 inline h-3 w-3" />
    ) : (
      <ArrowDown className="ml-1 inline h-3 w-3" />
    );
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-2 md:grid-cols-[1fr_auto_auto_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Pesquisar Projeto..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={fGerente} onValueChange={setFGerente}>
          <SelectTrigger className="md:w-[180px]">
            <SelectValue placeholder="Gerente" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos os Gerentes</SelectItem>
            {gerenteOpts.map((o) => (
              <SelectItem key={o} value={o}>{o}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={fLider} onValueChange={setFLider}>
          <SelectTrigger className="md:w-[180px]">
            <SelectValue placeholder="Líder" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos os Líderes</SelectItem>
            {liderOpts.map((o) => (
              <SelectItem key={o} value={o}>{o}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={fStatus} onValueChange={setFStatus}>
          <SelectTrigger className="md:w-[200px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos os Status</SelectItem>
            {statusOpts.map((o) => (
              <SelectItem key={o} value={o}>{o}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="relative max-h-[360px] overflow-auto rounded-md border">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0_var(--border)]">
            <TableRow>
              <TableHead
                className="cursor-pointer select-none whitespace-nowrap"
                onClick={() => toggleSort("projeto")}
              >
                Projeto<SortIcon k="projeto" />
              </TableHead>
              <TableHead
                className="cursor-pointer select-none whitespace-nowrap"
                onClick={() => toggleSort("lider")}
              >
                Líder<SortIcon k="lider" />
              </TableHead>
              <TableHead
                className="cursor-pointer select-none whitespace-nowrap"
                onClick={() => toggleSort("gerente")}
              >
                Gerente<SortIcon k="gerente" />
              </TableHead>
              <TableHead
                className="cursor-pointer select-none whitespace-nowrap text-right"
                onClick={() => toggleSort("investimento")}
              >
                Investimento<SortIcon k="investimento" />
              </TableHead>
              <TableHead
                className="cursor-pointer select-none whitespace-nowrap text-right"
                onClick={() => toggleSort("savingPrev")}
              >
                Saving Previsto (Anual)<SortIcon k="savingPrev" />
              </TableHead>
              <TableHead
                className="cursor-pointer select-none whitespace-nowrap text-right"
                onClick={() => toggleSort("savingVal")}
              >
                Saving Validado<SortIcon k="savingVal" />
              </TableHead>
              <TableHead
                className="cursor-pointer select-none whitespace-nowrap text-right"
                onClick={() => toggleSort("roiPrev")}
              >
                ROI Previsto<SortIcon k="roiPrev" />
              </TableHead>
              <TableHead
                className="cursor-pointer select-none whitespace-nowrap text-right"
                onClick={() => toggleSort("roiVal")}
              >
                ROI Validado<SortIcon k="roiVal" />
              </TableHead>
              <TableHead
                className="cursor-pointer select-none whitespace-nowrap"
                onClick={() => toggleSort("status")}
              >
                Status<SortIcon k="status" />
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="py-6 text-center text-sm text-muted-foreground">
                  Nenhum projeto encontrado.
                </TableCell>
              </TableRow>
            ) : (
              sorted.map((r) => (
                <TableRow key={r.p.matricula}>
                  <TableCell className="max-w-[280px]">
                    <div className="truncate font-medium">{r.p.projeto}</div>
                    <div className="text-xs text-muted-foreground">#{r.p.matricula}</div>
                  </TableCell>
                  <TableCell className="text-sm">{r.p.lider || "—"}</TableCell>
                  <TableCell className="text-sm">{r.p.gerente || "—"}</TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {fmtMoney(r.investimento)}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {fmtMoney(r.savingPrev)}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {fmtMoney(r.savingVal)}
                  </TableCell>
                  <TableCell className={`text-right text-sm tabular-nums ${roiToneClass(r.roiPrev)}`}>
                    {roiLabel(r.roiPrev)}
                  </TableCell>
                  <TableCell className={`text-right text-sm tabular-nums ${roiToneClass(r.roiVal)}`}>
                    {roiLabel(r.roiVal)}
                  </TableCell>
                  <TableCell className="text-sm">{r.p.status || "—"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">
        Exibindo <b>{sorted.length}</b> de {rows.length} projetos · ROI anual (Saving ÷ Investimento) ·
        <span className="ml-1"><span className="text-success">●</span> Alto (≥3x)</span> ·
        <span className="ml-1"><span className="text-warning">●</span> Médio (1–3x)</span> ·
        <span className="ml-1"><span className="text-destructive">●</span> Baixo (&lt;1x)</span>
      </p>
    </div>
  );
}