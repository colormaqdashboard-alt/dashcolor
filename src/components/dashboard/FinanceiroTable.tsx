import { useEffect, useMemo, useRef, useState } from "react";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from "lucide-react";
import { fmtMoney, uniq, type EnrichedProjeto } from "@/lib/dashboard";

const ALL = "__all__";
const COL_ORDER_KEY = "financeiro-table-col-order-v1";

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

type ColDef = {
  key: SortKey;
  label: string;
  align?: "right";
};

const DEFAULT_COLS: ColDef[] = [
  { key: "projeto", label: "Projeto" },
  { key: "lider", label: "Líder" },
  { key: "gerente", label: "Gerente" },
  { key: "investimento", label: "Investimento", align: "right" },
  { key: "savingPrev", label: "Saving Previsto (Anual)", align: "right" },
  { key: "savingVal", label: "Saving Validado", align: "right" },
  { key: "roiPrev", label: "ROI Previsto", align: "right" },
  { key: "roiVal", label: "ROI Validado", align: "right" },
  { key: "status", label: "Status" },
];

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
  const [colOrder, setColOrder] = useState<SortKey[]>(() => DEFAULT_COLS.map((c) => c.key));
  const [dragKey, setDragKey] = useState<SortKey | null>(null);
  const [overKey, setOverKey] = useState<SortKey | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(COL_ORDER_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as SortKey[];
      const valid = saved.filter((k) => DEFAULT_COLS.some((c) => c.key === k));
      const missing = DEFAULT_COLS.map((c) => c.key).filter((k) => !valid.includes(k));
      setColOrder([...valid, ...missing]);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(COL_ORDER_KEY, JSON.stringify(colOrder));
    } catch {
      /* ignore */
    }
  }, [colOrder]);

  const cols = useMemo<ColDef[]>(
    () =>
      colOrder
        .map((k) => DEFAULT_COLS.find((c) => c.key === k))
        .filter((c): c is ColDef => !!c),
    [colOrder],
  );

  const handleDragStart = (key: SortKey) => (e: React.DragEvent) => {
    setDragKey(key);
    e.dataTransfer.effectAllowed = "move";
    try {
      e.dataTransfer.setData("text/plain", key);
    } catch {
      /* ignore */
    }
  };
  const handleDragOver = (key: SortKey) => (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (overKey !== key) setOverKey(key);
  };
  const handleDrop = (key: SortKey) => (e: React.DragEvent) => {
    e.preventDefault();
    const from = dragKey;
    setDragKey(null);
    setOverKey(null);
    if (!from || from === key) return;
    setColOrder((prev) => {
      const next = prev.filter((k) => k !== from);
      const idx = next.indexOf(key);
      if (idx === -1) return prev;
      next.splice(idx, 0, from);
      return next;
    });
  };
  const handleDragEnd = () => {
    setDragKey(null);
    setOverKey(null);
  };

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

  const renderCell = (r: Row, key: SortKey) => {
    switch (key) {
      case "projeto":
        return (
          <TableCell className="max-w-[280px]">
            <ProjectNameCell name={r.p.projeto} matricula={r.p.matricula} />
          </TableCell>
        );
      case "lider":
        return <TableCell className="text-sm">{r.p.lider || "—"}</TableCell>;
      case "gerente":
        return <TableCell className="text-sm">{r.p.gerente || "—"}</TableCell>;
      case "investimento":
        return (
          <TableCell className="text-right text-sm tabular-nums">{fmtMoney(r.investimento)}</TableCell>
        );
      case "savingPrev":
        return (
          <TableCell className="text-right text-sm tabular-nums">{fmtMoney(r.savingPrev)}</TableCell>
        );
      case "savingVal":
        return (
          <TableCell className="text-right text-sm tabular-nums">{fmtMoney(r.savingVal)}</TableCell>
        );
      case "roiPrev":
        return (
          <TableCell className={`text-right text-sm tabular-nums ${roiToneClass(r.roiPrev)}`}>
            {roiLabel(r.roiPrev)}
          </TableCell>
        );
      case "roiVal":
        return (
          <TableCell className={`text-right text-sm tabular-nums ${roiToneClass(r.roiVal)}`}>
            {roiLabel(r.roiVal)}
          </TableCell>
        );
      case "status":
        return <TableCell className="text-sm">{r.p.status || "—"}</TableCell>;
    }
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

      <TooltipProvider delayDuration={150}>
      <div className="relative max-h-[360px] overflow-auto rounded-md border">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0_var(--border)]">
            <TableRow>
              {cols.map((c) => (
                <TableHead
                  key={c.key}
                  draggable
                  onDragStart={handleDragStart(c.key)}
                  onDragOver={handleDragOver(c.key)}
                  onDrop={handleDrop(c.key)}
                  onDragEnd={handleDragEnd}
                  onClick={() => toggleSort(c.key)}
                  title="Arraste para reordenar · Clique para ordenar"
                  className={`cursor-grab select-none whitespace-nowrap active:cursor-grabbing ${
                    c.align === "right" ? "text-right" : ""
                  } ${dragKey === c.key ? "opacity-50" : ""} ${
                    overKey === c.key && dragKey && dragKey !== c.key
                      ? "bg-muted/60 outline outline-2 outline-primary/40"
                      : ""
                  }`}
                >
                  {c.label}
                  <SortIcon k={c.key} />
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.length === 0 ? (
              <TableRow>
                <TableCell colSpan={cols.length} className="py-6 text-center text-sm text-muted-foreground">
                  Nenhum projeto encontrado.
                </TableCell>
              </TableRow>
            ) : (
              sorted.map((r) => (
                <TableRow key={r.p.matricula}>
                  {cols.map((c) => (
                    <React.Fragment key={c.key}>{renderCell(r, c.key)}</React.Fragment>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      </TooltipProvider>
      <p className="text-xs text-muted-foreground">
        Exibindo <b>{sorted.length}</b> de {rows.length} projetos · Arraste o cabeçalho para reordenar colunas · ROI anual (Saving ÷ Investimento) ·
        <span className="ml-1"><span className="text-success">●</span> Alto (≥3x)</span> ·
        <span className="ml-1"><span className="text-warning">●</span> Médio (1–3x)</span> ·
        <span className="ml-1"><span className="text-destructive">●</span> Baixo (&lt;1x)</span>
      </p>
    </div>
  );
}

function ProjectNameCell({ name, matricula }: { name: string; matricula: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [truncated, setTruncated] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setTruncated(el.scrollWidth > el.clientWidth + 1);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [name]);

  const label = (
    <div ref={ref} className="truncate font-medium">
      {name}
    </div>
  );

  return (
    <>
      {truncated ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="cursor-default">{label}</div>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-md break-words">
            {name}
          </TooltipContent>
        </Tooltip>
      ) : (
        label
      )}
      <div className="text-xs text-muted-foreground">#{matricula}</div>
    </>
  );
}