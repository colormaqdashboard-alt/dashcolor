import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fmtMoney } from "@/lib/dashboard";
import type { NovoProjeto } from "@/lib/data-source";
import { Kpi } from "./Kpi";
import { SectionCard } from "./SectionCard";
import { Lightbulb, ListChecks, Package } from "lucide-react";

export function NovosProjetosPanel({ novos }: { novos: NovoProjeto[] }) {
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return novos;
    return novos.filter((n) =>
      [n.projeto, n.objetivo, n.codigo_produto]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term)),
    );
  }, [novos, q]);

  const totalDescartado = useMemo(
    () => rows.reduce((s, n) => s + (Number(n.total_descartado) || 0), 0),
    [rows],
  );
  const comCodigo = useMemo(
    () => rows.filter((n) => !!n.codigo_produto).length,
    [rows],
  );

  if (!novos.length) {
    return (
      <SectionCard
        title="Novos Projetos"
        description="Base independente — aba 'Novos Projetos' da planilha"
      >
        <p className="py-8 text-center text-sm text-muted-foreground">
          Nenhum registro encontrado. Sincronize a planilha e verifique se a aba
          "Novos Projetos" possui dados nas colunas A a D.
        </p>
      </SectionCard>
    );
  }

  return (
    <>
      <div className="grid gap-3 md:grid-cols-3">
        <Kpi
          label="Novos Projetos"
          value={String(rows.length)}
          sub="REGISTROS LISTADOS"
          icon={<Lightbulb className="h-4 w-4" />}
        />
        <Kpi
          label="Total Descartado"
          value={fmtMoney(totalDescartado)}
          sub="SOMA DA COLUNA B"
          icon={<ListChecks className="h-4 w-4" />}
        />
        <Kpi
          label="Com Código de Produto"
          value={String(comCodigo)}
          sub="COLUNA D PREENCHIDA"
          icon={<Package className="h-4 w-4" />}
        />
      </div>

      <SectionCard
        title="Lista de Novos Projetos"
        description="Colunas: Projeto, Total Descartado, Objetivo e Código do Produto"
      >
        <div className="mb-3">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por projeto, objetivo ou código..."
            className="max-w-sm"
          />
        </div>
        <div className="max-h-[640px] overflow-auto rounded-md border">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0_var(--border)]">
              <TableRow>
                <TableHead className="whitespace-normal leading-tight">Projeto</TableHead>
                <TableHead className="whitespace-normal text-right leading-tight">
                  Total Descartado
                </TableHead>
                <TableHead className="whitespace-normal leading-tight">Objetivo</TableHead>
                <TableHead className="whitespace-normal leading-tight">
                  Código do Produto
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((n, i) => (
                <TableRow key={`${n.projeto}-${i}`}>
                  <TableCell className="max-w-[320px] font-medium">{n.projeto}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {n.total_descartado == null ? "—" : fmtMoney(n.total_descartado)}
                  </TableCell>
                  <TableCell className="max-w-[420px] text-sm">{n.objetivo || "—"}</TableCell>
                  <TableCell className="text-sm">{n.codigo_produto || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </SectionCard>
    </>
  );
}
