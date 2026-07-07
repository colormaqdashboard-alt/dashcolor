import * as XLSX from "xlsx";
import { fmtMoney, type EnrichedProjeto } from "@/lib/dashboard";

export type RankingMetricKey =
  | "saving_previsto"
  | "savingAprovadoEfetivo"
  | "investimento";

export type RankingKind = "prev" | "aprov" | "invest";

const KIND_META: Record<
  RankingKind,
  { title: string; metricKey: RankingMetricKey; metricLabel: string; fileBase: string; sheetName: string }
> = {
  prev: {
    title: "Top 20 — Saving Previsto",
    metricKey: "saving_previsto",
    metricLabel: "Saving Previsto",
    fileBase: "Ranking - Saving Previsto",
    sheetName: "Saving Previsto",
  },
  aprov: {
    title: "Top 20 — Saving Aprovado",
    metricKey: "savingAprovadoEfetivo",
    metricLabel: "Saving Aprovado",
    fileBase: "Ranking - Saving Aprovado",
    sheetName: "Saving Aprovado",
  },
  invest: {
    title: "Top 20 — Investimento",
    metricKey: "investimento",
    metricLabel: "Investimento",
    fileBase: "Ranking - Investimento",
    sheetName: "Investimento",
  },
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function timestamp(now = new Date()) {
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}-${pad(now.getMinutes())}`;
  return { date, time, stamp: `${date} ${time}` };
}

function metricValue(p: EnrichedProjeto, key: RankingMetricKey): number {
  if (key === "savingAprovadoEfetivo") return p.savingAprovadoEfetivo;
  return Number(p[key]) || 0;
}

function summary(rows: EnrichedProjeto[], key: RankingMetricKey) {
  const values = rows.map((p) => metricValue(p, key));
  const soma = values.reduce((s, v) => s + v, 0);
  const maior = values.length ? Math.max(...values) : 0;
  const menor = values.length ? Math.min(...values) : 0;
  return { qtd: rows.length, soma, maior, menor };
}

function escapeHTML(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function downloadBlob(data: BlobPart, mime: string, filename: string) {
  const blob = new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportRankingXLSX(kind: RankingKind, rows: EnrichedProjeto[]) {
  const meta = KIND_META[kind];
  const ts = timestamp();
  const wb = XLSX.utils.book_new();
  const header = [
    "#",
    "Projeto",
    "Matrícula",
    "Líder",
    "Gerente",
    "Fase",
    "Status",
    "Saving Previsto",
    "Saving Aprovado",
    "Investimento",
  ];
  const aoa: (string | number)[][] = [
    ["Relatório de Ranking de Projetos"],
    [meta.title],
    [`Gerado em ${ts.date} ${ts.time.replace("-", ":")}`],
    [],
  ];
  const s = summary(rows, meta.metricKey);
  aoa.push(["Resumo Executivo"]);
  aoa.push(["Quantidade de projetos", s.qtd]);
  aoa.push([`Soma ${meta.metricLabel}`, s.soma]);
  aoa.push([`Maior ${meta.metricLabel}`, s.maior]);
  aoa.push([`Menor ${meta.metricLabel}`, s.menor]);
  if (kind === "aprov") {
    aoa.push(["Observação", "Todos os projetos deste relatório encontram-se validados pela Controladoria."]);
  }
  aoa.push([]);
  aoa.push(header);
  rows.forEach((p, i) => {
    aoa.push([
      i + 1,
      p.projeto,
      p.matricula,
      p.lider || "—",
      p.gerente || "—",
      p.faseAtual,
      p.status || "—",
      Number(p.saving_previsto) || 0,
      p.savingAprovadoEfetivo,
      Number(p.investimento) || 0,
    ]);
  });
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [
    { wch: 4 },
    { wch: 46 },
    { wch: 12 },
    { wch: 22 },
    { wch: 22 },
    { wch: 34 },
    { wch: 28 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
  ];
  // Formatação de moeda BRL para colunas H, I, J a partir da linha do header + 1
  const headerRowIndex = aoa.findIndex((r) => r[0] === "#");
  const firstDataRow = headerRowIndex + 1; // 0-based
  const fmt = '"R$" #,##0;[Red]("R$" #,##0)';
  for (let i = 0; i < rows.length; i++) {
    ["H", "I", "J"].forEach((col) => {
      const ref = `${col}${firstDataRow + i + 1}`;
      if (ws[ref]) ws[ref].z = fmt;
    });
  }
  XLSX.utils.book_append_sheet(wb, ws, meta.sheetName);
  XLSX.writeFile(wb, `${meta.fileBase} - ${ts.stamp}.xlsx`);
}

export function exportRankingHTML(kind: RankingKind, rows: EnrichedProjeto[]) {
  const meta = KIND_META[kind];
  const ts = timestamp();
  const s = summary(rows, meta.metricKey);

  const resumoCards = [
    { label: "Quantidade de projetos", value: String(s.qtd) },
    { label: `Soma ${meta.metricLabel}`, value: fmtMoney(s.soma) },
    { label: `Maior ${meta.metricLabel}`, value: fmtMoney(s.maior) },
    { label: `Menor ${meta.metricLabel}`, value: fmtMoney(s.menor) },
  ];
  const resumoHTML = `<div class="resumo">${resumoCards
    .map((c) => `<div><span>${escapeHTML(c.label)}</span><b>${escapeHTML(c.value)}</b></div>`)
    .join("")}</div>`;

  const nota = kind === "aprov"
    ? `<p class="nota">Todos os projetos deste relatório encontram-se validados pela Controladoria.</p>`
    : "";

  const trs = rows
    .map(
      (p, i) => `<tr>
        <td>${i + 1}</td>
        <td>${escapeHTML(p.projeto)}<div class="mat">#${p.matricula}</div></td>
        <td>${escapeHTML(p.lider || "—")}</td>
        <td>${escapeHTML(p.gerente || "—")}</td>
        <td>${escapeHTML(p.faseAtual)}</td>
        <td>${escapeHTML(p.status || "—")}</td>
        <td class="num${meta.metricKey === "saving_previsto" ? " hl" : ""}">${fmtMoney(p.saving_previsto)}</td>
        <td class="num${meta.metricKey === "savingAprovadoEfetivo" ? " hl" : ""}">${fmtMoney(p.savingAprovadoEfetivo)}</td>
        <td class="num${meta.metricKey === "investimento" ? " hl" : ""}">${fmtMoney(p.investimento)}</td>
      </tr>`,
    )
    .join("");

  const tabela = rows.length
    ? `<table><thead><tr>
        <th>#</th><th>Projeto</th><th>Líder</th><th>Gerente</th><th>Fase</th><th>Status</th>
        <th class="num">Saving Previsto</th><th class="num">Saving Aprovado</th><th class="num">Investimento</th>
      </tr></thead><tbody>${trs}</tbody></table>`
    : `<p class="empty">Nenhum projeto disponível.</p>`;

  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"/>
  <title>Relatório de Ranking de Projetos — ${escapeHTML(meta.title)}</title>
  <style>
    :root{--bg:#f7f8fa;--card:#fff;--border:#e4e6eb;--muted:#6b7280;--pri:#0f172a;--acc:#2563eb;--succ:#16a34a;}
    *{box-sizing:border-box}
    body{margin:0;padding:32px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:var(--bg);color:var(--pri)}
    header{border-bottom:2px solid var(--pri);padding-bottom:16px;margin-bottom:24px}
    header h1{margin:0;font-size:22px;letter-spacing:1px;text-transform:uppercase}
    header h2{margin:6px 0 0;font-size:14px;color:var(--acc);text-transform:uppercase;letter-spacing:.5px}
    header .meta{color:var(--muted);font-size:12px;margin-top:6px;display:flex;gap:20px;flex-wrap:wrap}
    section.bloco{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:20px;margin-bottom:20px;box-shadow:0 1px 2px rgba(0,0,0,.04)}
    .resumo{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin-bottom:12px}
    .resumo div{background:#f3f4f6;border-radius:6px;padding:8px 10px}
    .resumo span{display:block;font-size:10px;text-transform:uppercase;color:var(--muted);margin-bottom:2px}
    .resumo b{font-size:14px}
    .nota{margin:0 0 12px;padding:8px 12px;background:#ecfdf5;border-left:3px solid var(--succ);border-radius:4px;color:#065f46;font-size:12px}
    table{width:100%;border-collapse:collapse;font-size:12px;margin-top:4px}
    th,td{border-bottom:1px solid var(--border);padding:6px 8px;text-align:left;vertical-align:top}
    th{background:#f3f4f6;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.3px}
    td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}
    td.hl{font-weight:600}
    .mat{font-size:10px;color:var(--muted)}
    .empty{color:var(--muted);font-size:12px;font-style:italic;padding:8px 0}
    footer{margin-top:32px;padding-top:16px;border-top:1px solid var(--border);color:var(--muted);font-size:11px;text-align:center;line-height:1.5}
    @media print{body{background:#fff;padding:16px}section.bloco{break-inside:avoid;box-shadow:none}}
  </style></head><body>
  <header>
    <h1>Relatório de Ranking de Projetos</h1>
    <h2>${escapeHTML(meta.title)}</h2>
    <div class="meta">
      <span>Data: <b>${ts.date}</b></span>
      <span>Hora: <b>${ts.time.replace("-", ":")}</b></span>
      <span>Projetos: <b>${s.qtd}</b></span>
    </div>
  </header>
  <section class="bloco">
    ${resumoHTML}
    ${nota}
    ${tabela}
  </section>
  <footer>Relatório gerado automaticamente pelo Dashboard de Gestão de Projetos. Os dados refletem exatamente o estado da tabela no momento da exportação.</footer>
  </body></html>`;

  downloadBlob(html, "text/html;charset=utf-8", `${meta.fileBase} - ${ts.stamp}.html`);
}