import { fmtDate } from "@/lib/dashboard";

export type StatusReportRow = {
  matricula: number;
  projeto: string;
  lider: string;
  gerente: string;
  faseAtualShort: string;
  faseAtualFull: string;
  ultimaFase: Date | null;
  prazo: Date | null;
  ultimaAtualizacao: Date | null;
  diasFase: number | null;
  diasAtualizacao: number | null;
  status: string;
  atencaoLabel: string;
  atencaoOrder: number;
  pctConclusao: number;
};

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );

const fmtDateStr = (d: Date | null) => (d ? fmtDate(d) : "—");

function statusBadgeHtml(status: string): string {
  const s = (status || "").trim();
  if (!s) return "—";
  const low = s.toLowerCase();
  const black = low === "inviabilizado" || low === "reprovado pela controladoria";
  const validado = low === "validado pela controladoria";
  let cls = "badge badge-neutral";
  if (black) cls = "badge badge-black";
  else if (validado) cls = "badge badge-success";
  else if (low.includes("atras")) cls = "badge badge-danger";
  else if (low.includes("andamento") || low.includes("execu")) cls = "badge badge-info";
  return `<span class="${cls}">${escapeHtml(s)}</span>`;
}

function atencaoBadgeHtml(label: string): string {
  if (!label) return "—";
  let cls = "att att-ok";
  if (label.includes("Atrasado")) cls = "att att-danger";
  else if (label.includes("Longa")) cls = "att att-info";
  else if (label.includes("Sem atualização")) cls = "att att-orange";
  else if (label.includes("Atenção")) cls = "att att-warn";
  else if (label.includes("Validado")) cls = "att att-muted";
  else if (label.includes("Inviabilizado")) cls = "att att-black";
  return `<span class="${cls}">${escapeHtml(label)}</span>`;
}

export function generateStatusReportHTML(
  rows: StatusReportRow[],
  opts: {
    logoDataUri?: string | null;
    selectedManagers: number;
    totalManagers: number;
    faseCounts?: {
      novos: number;
      p0: number;
      p20: number;
      p40: number;
      p60: number;
      p80: number;
      p90: number;
      emValidacao: number;
    };
  },
): string {
  const now = new Date();
  const geradoEm = now.toLocaleString("pt-BR");
  const total = rows.length;
  const finalizados = rows.filter((r) => r.atencaoOrder === 5).length;
  const longaDuracao = rows.filter((r) => r.atencaoOrder === 1).length;
  const inviabilizados = rows.filter((r) => r.atencaoOrder === 6).length;

  const fc =
    opts.faseCounts ?? { novos: 0, p0: 0, p20: 0, p40: 0, p60: 0, p80: 0, p90: 0, emValidacao: 0 };

  const logoHtml = opts.logoDataUri
    ? `<img src="${opts.logoDataUri}" alt="Logo" class="logo-img" />`
    : `<div class="logo-placeholder"></div>`;

  const bodyRows = rows
    .map((r) => {
      return `<tr>
        <td class="col-projeto sticky-col sticky-1"><div class="proj-name">${escapeHtml(r.projeto)}</div><div class="proj-id">#${r.matricula}</div></td>
        <td class="sticky-col sticky-2">${escapeHtml(r.lider || "—")}</td>
        <td class="sticky-col sticky-3">${escapeHtml(r.gerente || "—")}</td>
        <td class="nowrap col-fase" title="${escapeHtml(r.faseAtualFull)}">${escapeHtml(r.faseAtualShort || "—")}</td>
        <td class="nowrap">${escapeHtml(fmtDateStr(r.ultimaFase))}</td>
        <td class="nowrap">${escapeHtml(fmtDateStr(r.prazo))}</td>
        <td class="num">${r.diasFase != null ? r.diasFase + " d" : "—"}</td>
        <td class="nowrap">${escapeHtml(fmtDateStr(r.ultimaAtualizacao))}</td>
        <td class="num">${r.diasAtualizacao != null ? r.diasAtualizacao + " d" : "—"}</td>
        <td>${statusBadgeHtml(r.status)}</td>
        <td>${atencaoBadgeHtml(r.atencaoLabel)}</td>
      </tr>`;
    })
    .join("\n");

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Status dos Projetos — Relatório Gerencial</title>
<style>
  :root {
    --bg: #f5f7fb;
    --card: #ffffff;
    --border: #e5e9f2;
    --text: #0f172a;
    --muted: #64748b;
    --primary: #1e40af;
    --primary-soft: #eef2ff;
    --success: #16a34a;
    --success-soft: #dcfce7;
    --warn: #ca8a04;
    --warn-soft: #fef9c3;
    --danger: #dc2626;
    --danger-soft: #fee2e2;
    --info: #2563eb;
    --info-soft: #dbeafe;
    --orange: #ea580c;
    --orange-soft: #ffedd5;
    --shadow: 0 1px 2px rgba(15,23,42,.04), 0 8px 24px rgba(15,23,42,.06);
    --radius: 14px;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: var(--bg); color: var(--text);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Inter, Arial, sans-serif;
    font-size: 14px; -webkit-font-smoothing: antialiased; }
  .wrap { max-width: 1600px; margin: 0 auto; padding: 24px; }

  .header {
    background: var(--card); border: 1px solid var(--border); border-radius: var(--radius);
    box-shadow: var(--shadow); padding: 20px 28px; display: flex; align-items: center;
    gap: 24px; min-height: 110px;
  }
  .logo-box { display: flex; align-items: center; justify-content: center; min-width: 160px; max-width: 220px; }
  .logo-img { max-height: 60px; width: auto; max-width: 220px; object-fit: contain; display: block; }
  .logo-placeholder { width: 180px; height: 60px; }
  .header .divider { width: 1px; align-self: stretch; background: var(--border); margin: 8px 0; }
  .header h1 { margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.01em; }
  .header .subtitle { color: var(--muted); font-size: 13px; margin-top: 2px; }
  .header .meta { color: var(--muted); font-size: 12px; margin-top: 6px; display: flex; gap: 12px; flex-wrap: wrap; }

  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 16px; margin-top: 20px; }
  .card { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius);
    padding: 18px 20px; box-shadow: var(--shadow); display: flex; align-items: center; gap: 14px; }
  .card .ic { width: 44px; height: 44px; border-radius: 12px; display: grid; place-items: center;
    font-size: 20px; }
  .ic-total { background: var(--primary-soft); color: var(--primary); }
  .ic-ok { background: var(--success-soft); color: var(--success); }
  .ic-warn { background: var(--warn-soft); color: var(--warn); }
  .ic-danger { background: var(--danger-soft); color: var(--danger); }
  .ic-final { background: #f1f5f9; color: #334155; }
  .card .label { color: var(--muted); font-size: 12px; font-weight: 500; text-transform: uppercase; letter-spacing: .04em; }
  .card .value { font-size: 24px; font-weight: 700; margin-top: 2px; }

  .table-card { margin-top: 20px; background: var(--card); border: 1px solid var(--border);
    border-radius: var(--radius); box-shadow: var(--shadow); overflow: hidden; }
  .table-head { padding: 18px 22px; border-bottom: 1px solid var(--border); display: flex;
    align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
  .table-head h2 { margin: 0; font-size: 16px; font-weight: 700; }
  .table-head .count { color: var(--muted); font-size: 12px; }

  .table-scroll { overflow-x: auto; overflow-y: auto; max-height: 430px; }
  table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 13px; }
  thead th { position: sticky; top: 0; background: #0f172a; color: #fff; text-align: left;
    font-weight: 600; font-size: 12px; letter-spacing: .02em; padding: 12px 14px; z-index: 3;
    white-space: nowrap; user-select: none; cursor: pointer; }
  thead th:hover { background: #1e293b; }
  thead th .arrow { opacity: .4; margin-left: 4px; font-size: 10px; }
  thead th.sorted .arrow { opacity: 1; }
  tbody td { padding: 12px 14px; border-bottom: 1px solid var(--border); vertical-align: top; }
  tbody tr:nth-child(even) td { background: #f8fafc; }
  tbody tr:hover td { background: #eef4ff; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  td.nowrap { white-space: nowrap; }
  .proj-name { font-weight: 600; color: var(--text); }
  .proj-id { color: var(--muted); font-size: 11px; margin-top: 2px; }

  .sticky-col { position: sticky; background: #fff; z-index: 2; }
  .sticky-1 { left: 0; min-width: 240px; width: 240px; }
  .sticky-2 { left: 240px; min-width: 150px; width: 150px; }
  .sticky-3 { left: 390px; min-width: 150px; width: 150px;
    box-shadow: 2px 0 4px rgba(15,23,42,.10); }
  th[data-key="fase"], td.col-fase { min-width: 150px; }
  tbody tr:nth-child(even) td.sticky-col { background: #f8fafc; }
  tbody tr:hover td.sticky-col { background: #eef4ff; }
  thead th.sticky-col { z-index: 4; background: #0f172a; }

  .badge, .att { display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px;
    border-radius: 999px; font-size: 11px; font-weight: 600; white-space: nowrap; }
  .badge-neutral { background: #f1f5f9; color: #334155; }
  .badge-success { background: var(--success-soft); color: var(--success); }
  .badge-info { background: var(--info-soft); color: var(--info); }
  .badge-danger { background: var(--danger-soft); color: var(--danger); }
  .badge-black { background: #0f172a; color: #fff; }
  .att-ok { background: var(--success-soft); color: var(--success); }
  .att-warn { background: var(--warn-soft); color: var(--warn); }
  .att-orange { background: var(--orange-soft); color: var(--orange); }
  .att-danger { background: var(--danger-soft); color: var(--danger); }
  .att-info { background: var(--info-soft); color: var(--info); }
  .att-muted { background: #f1f5f9; color: #475569; }
  .att-black { background: #0f172a; color: #fff; }

  .footer { color: var(--muted); font-size: 11px; text-align: center; margin: 20px 0 8px; }

  @media (max-width: 720px) {
    .wrap { padding: 14px; }
    .header { flex-direction: column; align-items: flex-start; padding: 16px; }
    .header .divider { display: none; }
  }
</style>
</head>
<body>
  <div class="wrap">
    <header class="header">
      <div class="logo-box">${logoHtml}</div>
      <div class="divider"></div>
      <div style="flex:1; min-width:0;">
        <h1>Status dos Projetos</h1>
        <div class="subtitle">Relatório Gerencial</div>
        <div class="meta">
          <span>📅 Gerado em: <b>${escapeHtml(geradoEm)}</b></span>
          <span>👥 Gerentes: <b>${opts.selectedManagers} de ${opts.totalManagers}</b></span>
          <span>📁 Projetos: <b>${total}</b></span>
        </div>
      </div>
    </header>

    <section class="cards">
      <div class="card"><div class="ic ic-total">🆕</div><div><div class="label">Novos Projetos</div><div class="value">${fc.novos}</div></div></div>
      <div class="card"><div class="ic ic-final">⏸️</div><div><div class="label">Não iniciado</div><div class="value">${fc.p0}</div></div></div>
      <div class="card"><div class="ic ic-info" style="background:var(--info-soft); color:var(--info);">🔎</div><div><div class="label">1ª Fase</div><div class="value">${fc.p20}</div></div></div>
      <div class="card"><div class="ic ic-total">📊</div><div><div class="label">2ª Fase</div><div class="value">${fc.p40}</div></div></div>
      <div class="card"><div class="ic ic-warn">⚙️</div><div><div class="label">3ª Fase</div><div class="value">${fc.p60}</div></div></div>
      <div class="card"><div class="ic ic-orange" style="background:var(--orange-soft); color:var(--orange);">🛠️</div><div><div class="label">4ª Fase</div><div class="value">${fc.p80}</div></div></div>
      <div class="card"><div class="ic ic-ok">✅</div><div><div class="label">5ª Fase</div><div class="value">${fc.p90}</div></div></div>
      <div class="card"><div class="ic" style="background:#f3e8ff; color:#7e22ce;">🟣</div><div><div class="label">Em validação pela controladoria</div><div class="value">${fc.emValidacao}</div></div></div>
    </section>

    <section class="cards">
      <div class="card"><div class="ic ic-total">📊</div><div><div class="label">Total de Projetos</div><div class="value">${total}</div></div></div>
      <div class="card"><div class="ic ic-final">🏁</div><div><div class="label">Finalizados</div><div class="value">${finalizados}</div></div></div>
      <div class="card"><div class="ic ic-info" style="background:var(--info-soft); color:var(--info);">🔵</div><div><div class="label">Longa Duração</div><div class="value">${longaDuracao}</div></div></div>
      <div class="card"><div class="ic" style="background:#0f172a; color:#fff;">⚫</div><div><div class="label">Inviabilizados</div><div class="value">${inviabilizados}</div></div></div>
    </section>

    <section class="table-card">
      <div class="table-head">
        <h2>Carteira de Projetos</h2>
        <div class="count">Exibindo <b>${total}</b> projetos</div>
      </div>
      <div class="table-scroll">
        <table id="tbl">
          <thead>
            <tr>
              <th class="sticky-col sticky-1" data-key="projeto" data-type="text">Projeto <span class="arrow">↕</span></th>
              <th class="sticky-col sticky-2" data-key="lider" data-type="text">Líder <span class="arrow">↕</span></th>
              <th class="sticky-col sticky-3" data-key="gerente" data-type="text">Gerente <span class="arrow">↕</span></th>
              <th data-key="fase" data-type="text">Fase Atual <span class="arrow">↕</span></th>
              <th data-key="uf" data-type="date">Última fase iniciada <span class="arrow">↕</span></th>
              <th data-key="prazo" data-type="date">Prazo da ação <span class="arrow">↕</span></th>
              <th data-key="df" data-type="num">Dias corridos da fase <span class="arrow">↕</span></th>
              <th data-key="ua" data-type="date">Última atualização <span class="arrow">↕</span></th>
              <th data-key="da" data-type="num">Dias desde a última atualização <span class="arrow">↕</span></th>
              <th data-key="status" data-type="text">Status <span class="arrow">↕</span></th>
              <th data-key="at" data-type="text">Atenção <span class="arrow">↕</span></th>
            </tr>
          </thead>
          <tbody>
${bodyRows}
          </tbody>
        </table>
      </div>
    </section>

    <div class="footer">Relatório gerado automaticamente · Status dos Projetos</div>
  </div>

<script>
(function(){
  var tbl = document.getElementById('tbl');
  var ths = tbl.querySelectorAll('thead th');
  var tbody = tbl.querySelector('tbody');
  var state = { idx: -1, dir: 1 };
  function syncSticky(){
    var head = tbl.querySelectorAll('thead th');
    var w1 = head[0].getBoundingClientRect().width;
    var w2 = head[1].getBoundingClientRect().width;
    var offsets = [0, w1, w1 + w2];
    for (var c = 0; c < 3; c++) {
      head[c].style.left = offsets[c] + 'px';
      var cells = tbl.querySelectorAll('tbody tr > *:nth-child(' + (c + 1) + ')');
      for (var k = 0; k < cells.length; k++) cells[k].style.left = offsets[c] + 'px';
    }
  }
  syncSticky();
  window.addEventListener('resize', syncSticky);
  window.addEventListener('load', syncSticky);
  function parseDateBR(s){
    var m = s && s.match(/^(\\d{2})\\/(\\d{2})\\/(\\d{4})/);
    if(!m) return null;
    return new Date(+m[3], +m[2]-1, +m[1]).getTime();
  }
  function cellVal(td, type){
    var t = (td.innerText || '').trim();
    if(type==='num'){ var n = parseFloat(t.replace(/[^0-9.-]/g,'')); return isNaN(n)? -Infinity : n; }
    if(type==='date'){ var d = parseDateBR(t); return d==null? -Infinity : d; }
    return t.toLowerCase();
  }
  ths.forEach(function(th, i){
    th.addEventListener('click', function(){
      var type = th.getAttribute('data-type') || 'text';
      var dir = (state.idx === i) ? -state.dir : 1;
      state = { idx: i, dir: dir };
      var rows = Array.prototype.slice.call(tbody.querySelectorAll('tr'));
      rows.sort(function(a,b){
        var va = cellVal(a.children[i], type);
        var vb = cellVal(b.children[i], type);
        if(va < vb) return -1*dir;
        if(va > vb) return 1*dir;
        return 0;
      });
      rows.forEach(function(r){ tbody.appendChild(r); });
      ths.forEach(function(x){ x.classList.remove('sorted'); x.querySelector('.arrow').textContent='↕'; });
      th.classList.add('sorted');
      th.querySelector('.arrow').textContent = dir===1 ? '↑' : '↓';
    });
  });
})();
</script>
</body>
</html>`;
  return html;
}

export function downloadHtml(filename: string, html: string) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}