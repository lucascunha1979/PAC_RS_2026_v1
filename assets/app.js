const CONFIG = {
  dataFile: "data/pac_rs_painel_detalhado.csv",
  defaultUpdateLabel: "março de 2026",
  chartFont: "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
};

const APP = {
  raw: [],
  filters: {
    municipio: null, eixo: null, subeixo: null, modalidade: null,
    empreendimento: null, inclusao_novo_pac: null, tipo_executor: null,
    estagio: null, fontes_financiamento: null, classificacao: null,
    ano_prev_conclusao: null, ministerio: null
  }
};

let heatmapMode = "count"; // "count" | "value"
const ELS = {};
const SEP = "\u2060"; // word-joiner – separador seguro nos IDs do treemap

// ══ INIT ══════════════════════════════════════════════════════════════════════
document.addEventListener("DOMContentLoaded", () => {
  captureEls();
  bindUI();
  initTabs();
  loadData();
});

function captureEls() {
  ELS.heroAtualizacao = document.getElementById("heroAtualizacao");
  ELS.statusLine      = document.getElementById("statusLine");
  ELS.municipioSearch = document.getElementById("municipioSearch");
  ELS.municipioSelect = document.getElementById("municipioSelect");
  ELS.activeFilters   = document.getElementById("activeFilters");
  ELS.btnReset        = document.getElementById("btnReset");
  ELS.btnPdf          = document.getElementById("btnPdf");
  ELS.btnPdfSecondary = document.getElementById("btnPdfSecondary");
  ELS.kpiValor        = document.getElementById("kpiValor");
  ELS.kpiExec         = document.getElementById("kpiExec");
  ELS.kpiEmp          = document.getElementById("kpiEmp");
  ELS.kpiMun          = document.getElementById("kpiMun");
  ELS.hierSummary     = document.getElementById("hierSummary");
  ELS.hierBreadcrumb  = document.getElementById("hierBreadcrumb");
  ELS.tables          = document.getElementById("tables");
  ELS.empPanel        = document.getElementById("emp-panel");
  ELS.btnHeatmapToggle= document.getElementById("btnHeatmapToggle");
  ELS.plots = {
    treemap:           document.getElementById("plotTreemap"),
    empreendimento:    document.getElementById("plotEmpreendimento"),
    heatmap:           document.getElementById("plotHeatmap"),
    inclusao_novo_pac: document.getElementById("plotInclusao"),
    tipo_executor:     document.getElementById("plotExecutor"),
    estagio:           document.getElementById("plotEstagio"),
    fontes_financiamento: document.getElementById("plotFontes"),
    classificacao:     document.getElementById("plotClassificacao"),
    ministerio:        document.getElementById("plotMinisterio"),
    ano_prev_conclusao:document.getElementById("plotAno"),
    sankey:            document.getElementById("plotSankey"),
    scatter:           document.getElementById("plotScatter")
  };
}

function bindUI() {
  ELS.municipioSearch.addEventListener("input", () => populateMunicipioSelect(ELS.municipioSearch.value));
  ELS.municipioSelect.addEventListener("change", () => {
    APP.filters.municipio = ELS.municipioSelect.value === "__TODOS__" ? null : ELS.municipioSelect.value;
    renderAll();
  });
  ELS.btnReset.addEventListener("click", resetFilters);
  ELS.btnPdf.addEventListener("click", makePDF);
  ELS.btnPdfSecondary.addEventListener("click", makePDF);
  ELS.btnHeatmapToggle?.addEventListener("click", () => {
    heatmapMode = heatmapMode === "count" ? "value" : "count";
    ELS.btnHeatmapToggle.textContent = heatmapMode === "count"
      ? "Ver: Empreendimentos" : "Ver: Valor total";
    renderHeatmap(getFilteredRows());
  });
}

// ══ TABS ══════════════════════════════════════════════════════════════════════
function initTabs() {
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => showTab(btn.dataset.tab));
  });
  showTab("hierarquia");
}

function showTab(tabId) {
  document.querySelectorAll(".tab-panel").forEach(p => { p.hidden = true; });
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  const panel = document.getElementById("panel-" + tabId);
  const btn   = document.querySelector(".tab-btn[data-tab='" + tabId + "']");
  if (panel) panel.hidden = false;
  if (btn)   btn.classList.add("active");
  // Redimensiona os gráficos Plotly no painel recém-visível
  setTimeout(() => {
    document.querySelectorAll("#panel-" + tabId + " .plot").forEach(el => {
      try { Plotly.Plots.resize(el); } catch(e) { /* ainda não renderizado */ }
    });
  }, 80);
}

// ══ DATA ══════════════════════════════════════════════════════════════════════
function loadData() {
  Papa.parse(CONFIG.dataFile, {
    download: true, header: true, skipEmptyLines: true,
    complete: ({ data }) => {
      APP.raw = data.map(normalizeRow).filter(r => r.municipio || r.empreendimento || r.eixo);
      if (!APP.raw.length) { setStatus("Nenhum dado encontrado no CSV."); return; }
      ELS.heroAtualizacao.textContent = CONFIG.defaultUpdateLabel;
      populateMunicipioSelect();
      renderAll();
    },
    error: (err) => { console.error(err); setStatus("Erro ao carregar a base. Verifique a pasta data/."); }
  });
}

function normalizeRow(r) {
  const row = {
    municipio:           cleanText(pick(r, ["municipio","Município","Municipio"])),
    empreendimento:      cleanText(pick(r, ["empreendimento","Empreendimento"])),
    eixo:                cleanText(pick(r, ["eixo","Eixo"])),
    subeixo:             cleanText(pick(r, ["subeixo","Subeixo"])),
    modalidade:          cleanText(pick(r, ["modalidade","Modalidade"])),
    classificacao:       cleanText(pick(r, ["classificacao","Classificação","Classificacao"])),
    estagio:             cleanText(pick(r, ["estagio","Estágio","Estagio"])),
    tipo_executor:       cleanText(pick(r, ["tipo_executor","Tipo de Executor"])),
    inclusao_novo_pac:   cleanText(pick(r, ["inclusao_novo_pac","Inclusão no Novo PAC","Inclusao no Novo PAC"])),
    fontes_financiamento:cleanText(pick(r, ["fontes_financiamento","Fontes de financiamento"])),
    ano_prev_conclusao:  cleanText(pick(r, ["ano_prev_conclusao","Ano de previsão de conclusão"])),
    ministerio:          cleanText(pick(r, ["ministerio","Ministério","Ministerio"])),
    link:                cleanLink(pick(r, ["link","Link"])),
    uf:                  cleanText(pick(r, ["uf","UF"])),
    valor_total_rs:      toNumber(pick(r, ["valor_total_rs","Estimativa de valor total do empreendimento (2023-2030), R$"])),
    execucao_fisica_pct: normalizeExecPct(toNumber(pick(r, ["execucao_fisica_pct","Execução física (%)"])))
  };
  row.ano_prev_conclusao = row.ano_prev_conclusao || "Não informado";
  row.valor_total_rs = Number.isFinite(row.valor_total_rs) ? row.valor_total_rs : 0;
  row._empreendimento_uid = row.empreendimento + "__" + row.municipio;
  return row;
}

function pick(obj, keys) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(obj, key) && obj[key] !== undefined
        && obj[key] !== null && String(obj[key]).trim() !== "") return obj[key];
  }
  return "";
}
function cleanText(v) {
  if (v === null || v === undefined) return "Não informado";
  const t = String(v).replace(/\s+/g, " ").trim();
  return t || "Não informado";
}
function cleanLink(v) {
  if (!v) return "";
  const t = String(v).trim();
  return (!t || t === "Não informado" || t.toLowerCase() === "nan") ? "" : t;
}
function toNumber(v) {
  if (v === null || v === undefined || v === "") return NaN;
  if (typeof v === "number") return v;
  const raw = String(v).trim();
  if (!raw) return NaN;
  const c = raw.replace(/R\$|%|\s/g, "");
  const n = c.includes(",") ? c.replace(/\./g,"").replace(/,/g,".") : c.replace(/,/g,"");
  const num = Number(n);
  return Number.isFinite(num) ? num : NaN;
}
function normalizeExecPct(v) {
  if (!Number.isFinite(v) || v < 0) return null;
  if (v > 1000) return null;
  while (v > 100) v = v / 10;
  return round2(v);
}

// ══ FILTERING ════════════════════════════════════════════════════════════════
function populateMunicipioSelect(term = "") {
  const search  = String(term).toLocaleLowerCase("pt-BR").trim();
  const options = [...new Set(APP.raw.map(d => d.municipio))].filter(Boolean).sort((a,b) => a.localeCompare(b,"pt-BR"));
  const filtered= search ? options.filter(v => v.toLocaleLowerCase("pt-BR").includes(search)) : options;
  ELS.municipioSelect.innerHTML = "";
  const allOpt = document.createElement("option");
  allOpt.value = "__TODOS__"; allOpt.textContent = "Todos os municípios";
  ELS.municipioSelect.appendChild(allOpt);
  filtered.forEach(v => { const o = document.createElement("option"); o.value = v; o.textContent = v; ELS.municipioSelect.appendChild(o); });
  ELS.municipioSelect.value = APP.filters.municipio || "__TODOS__";
}

function resetFilters() {
  Object.keys(APP.filters).forEach(k => APP.filters[k] = null);
  ELS.municipioSearch.value = "";
  populateMunicipioSelect();
  renderAll();
}

function getFilteredRows()         { return APP.raw.filter(row => Object.entries(APP.filters).every(([k,v]) => !v || row[k] === v)); }
function getRowsExcluding(tKey)    { return APP.raw.filter(row => Object.entries(APP.filters).every(([k,v]) => k === tKey || !v || row[k] === v)); }

// ══ RENDER ALL ════════════════════════════════════════════════════════════════
function renderAll() {
  const rows = getFilteredRows();
  setStatus(rows.length.toLocaleString("pt-BR") + " registros no recorte atual.");
  renderActiveFilters();
  renderKpis(rows);
  renderHierarchySummary(rows);
  renderBreadcrumb();

  // ── Tab 1: Hierarquia ──────────────────────────────────────────────────────
  renderTreemap(getRowsExcluding("eixo")); // treemap usa exclusão de eixo para mostrar todos os eixos mesmo com filtro de subeixo

  const hasHierFilter = APP.filters.eixo || APP.filters.subeixo || APP.filters.modalidade;
  if (ELS.empPanel) ELS.empPanel.hidden = !hasHierFilter;
  if (hasHierFilter) {
    renderBarChart({ key:"empreendimento", rows:getRowsExcluding("empreendimento"), element:ELS.plots.empreendimento,
      color:"#0a7f61", sort:"desc", uniqueField:"_empreendimento_uid",
      labeler:(d) => APP.filters.municipio ? d.categoria : d.categoria + " — " + d.municipio_ref,
      showLink: true });
  }

  // ── Tab 2: Perfil ──────────────────────────────────────────────────────────
  renderHeatmap(rows);
  renderPieChart({ key:"inclusao_novo_pac",    rows:getRowsExcluding("inclusao_novo_pac"),    element:ELS.plots.inclusao_novo_pac,    colors:["#0f4c81","#0a7f61","#d03b2d","#7b8aa0","#a855f7"] });
  renderPieChart({ key:"tipo_executor",        rows:getRowsExcluding("tipo_executor"),        element:ELS.plots.tipo_executor,        colors:["#0f4c81","#0a7f61","#d03b2d","#f59e0b","#7b8aa0"] });
  renderPieChart({ key:"estagio",              rows:getRowsExcluding("estagio"),              element:ELS.plots.estagio,              colors:["#0f4c81","#0a7f61","#d03b2d","#f59e0b"] });
  renderPieChart({ key:"fontes_financiamento", rows:getRowsExcluding("fontes_financiamento"), element:ELS.plots.fontes_financiamento, colors:["#0f4c81","#0a7f61","#d03b2d","#7b8aa0","#a855f7","#f59e0b"] });
  renderBarChart({ key:"classificacao", rows:getRowsExcluding("classificacao"), element:ELS.plots.classificacao, color:"#d03b2d", sort:"asc" });
  renderBarChart({ key:"ministerio",    rows:getRowsExcluding("ministerio"),    element:ELS.plots.ministerio,    color:"#7c3aed", sort:"asc" });
  renderYearChart(getRowsExcluding("ano_prev_conclusao"));

  // ── Tab 3: Relações ────────────────────────────────────────────────────────
  renderSankey(rows);
  renderScatter(rows);

  buildTablesForPDF();
}

// ══ TAB 1: HIERARQUIA — TREEMAP ═══════════════════════════════════════════════
function renderTreemap(rows) {
  const el = ELS.plots.treemap;
  if (!el) return;

  let idc = 0;
  const cache = new Map();
  const tid = (k) => { if (!cache.has(k)) cache.set(k, "t" + idc++); return cache.get(k); };

  const eixoAgg  = new Map(); // eixo → {v, ep[]}
  const subAgg   = new Map(); // "e SEP s" → {eixo,subeixo,v,ep[]}
  const modalAgg = new Map(); // "e SEP s SEP m" → {...}

  rows.forEach(row => {
    if (!row.eixo || row.eixo === "Não informado") return;
    const v  = row.valor_total_rs || 0;
    const ep = Number.isFinite(row.execucao_fisica_pct) ? row.execucao_fisica_pct : null;

    if (!eixoAgg.has(row.eixo)) eixoAgg.set(row.eixo, {v:0, ep:[]});
    const ea = eixoAgg.get(row.eixo); ea.v += v; if (ep !== null) ea.ep.push(ep);

    const sk = row.eixo + SEP + row.subeixo;
    if (!subAgg.has(sk)) subAgg.set(sk, {eixo:row.eixo, subeixo:row.subeixo, v:0, ep:[]});
    const sa = subAgg.get(sk); sa.v += v; if (ep !== null) sa.ep.push(ep);

    const mk = sk + SEP + row.modalidade;
    if (!modalAgg.has(mk)) modalAgg.set(mk, {eixo:row.eixo, subeixo:row.subeixo, modalidade:row.modalidade, v:0, ep:[]});
    const ma = modalAgg.get(mk); ma.v += v; if (ep !== null) ma.ep.push(ep);
  });

  if (!eixoAgg.size) return renderEmptyPlot(el, "Sem dados para este recorte.");

  // Valor total da raiz deve ser >= soma dos filhos (obrigatório com branchvalues:"total")
  const totalValue = sum([...eixoAgg.values()].map(a => a.v));
  const allExec    = [...eixoAgg.values()].flatMap(a => a.ep);
  const ids   = [tid("root")];
  const labels = ["Novo PAC RS"];
  const parents = [""];
  const values = [totalValue];
  const cdata  = [{level:"root", valorFmt:fmtMoney(totalValue), execFmt:fmtPct(average(allExec))}];

  eixoAgg.forEach(({v,ep}, eixo) => {
    const id = tid("e" + SEP + eixo);
    ids.push(id); labels.push(trimLabel(eixo,28)); parents.push(tid("root"));
    values.push(v); cdata.push({level:"eixo", eixo, valorFmt:fmtMoney(v), execFmt:fmtPct(average(ep))});
  });

  subAgg.forEach(({eixo,subeixo,v,ep}) => {
    const id = tid("s" + SEP + eixo + SEP + subeixo);
    ids.push(id); labels.push(trimLabel(subeixo,28)); parents.push(tid("e" + SEP + eixo));
    values.push(v); cdata.push({level:"subeixo", eixo, subeixo, valorFmt:fmtMoney(v), execFmt:fmtPct(average(ep))});
  });

  modalAgg.forEach(({eixo,subeixo,modalidade,v,ep}) => {
    const id = tid("m" + SEP + eixo + SEP + subeixo + SEP + modalidade);
    ids.push(id); labels.push(trimLabel(modalidade,28)); parents.push(tid("s" + SEP + eixo + SEP + subeixo));
    values.push(v); cdata.push({level:"modalidade", eixo, subeixo, modalidade, valorFmt:fmtMoney(v), execFmt:fmtPct(average(ep))});
  });

  // level="" = mostra a partir da raiz. Plotly não aceita o ID da raiz como level.
  let startLevel = "", maxdepth = 2;
  if (APP.filters.subeixo && APP.filters.eixo) {
    startLevel = tid("s" + SEP + APP.filters.eixo + SEP + APP.filters.subeixo); maxdepth = 2;
  } else if (APP.filters.eixo) {
    startLevel = tid("e" + SEP + APP.filters.eixo); maxdepth = 2;
  }

  const trace = {
    type:"treemap", ids, labels, parents, values, customdata:cdata,
    branchvalues:"total", maxdepth, level:startLevel,
    tiling:{packing:"squarify"},
    pathbar:{visible:true, edgeshape:">", thickness:22, textfont:{size:11}},
    textinfo:"label+percent entry",
    hovertemplate:"<b>%{label}</b><br>Valor: %{customdata.valorFmt}<br>Execução média: %{customdata.execFmt}<br>Participação: %{percentEntry:.1%}<extra></extra>"
  };

  const layout = baseLayout({height:520, margin:{l:4,r:4,t:26,b:4}});
  layout.colorway = ["#0f4c81","#0a7f61","#7c3aed","#d03b2d","#f59e0b","#146c94","#198f9b","#7b8aa0"];

  if (typeof el.removeAllListeners === "function") el.removeAllListeners("plotly_click");
  Plotly.react(el, [trace], layout, plotConfig()).then(() => {
    el.on("plotly_click", ev => {
      const cd = ev.points?.[0]?.customdata;
      if (!cd) return;
      const toggle = (k, v) => APP.filters[k] === v ? null : v;
      if (cd.level === "eixo") {
        APP.filters.eixo = toggle("eixo", cd.eixo);
        APP.filters.subeixo = APP.filters.modalidade = APP.filters.empreendimento = null;
      } else if (cd.level === "subeixo") {
        APP.filters.eixo = cd.eixo;
        APP.filters.subeixo = toggle("subeixo", cd.subeixo);
        APP.filters.modalidade = APP.filters.empreendimento = null;
      } else if (cd.level === "modalidade") {
        APP.filters.eixo = cd.eixo;
        APP.filters.subeixo = cd.subeixo;
        APP.filters.modalidade = toggle("modalidade", cd.modalidade);
        APP.filters.empreendimento = null;
      }
      renderAll();
    });
  });
}

// ══ TAB 2: PERFIL — HEATMAP ═══════════════════════════════════════════════════
function renderHeatmap(rows) {
  const el = ELS.plots.heatmap;
  if (!el) return;

  const eixos    = [...new Set(APP.raw.map(r => r.eixo).filter(v => v && v !== "Não informado"))].sort();
  const estagios = ["Em ação preparatória","Em licitação / Leilão","Em execução","Concluído"];
  const estagiosX= ["Ação preparatória","Em licitação","Em execução","Concluído"];

  const z = eixos.map(eixo =>
    estagios.map(est => {
      const r2 = rows.filter(r => r.eixo === eixo && r.estagio === est);
      return heatmapMode === "count" ? r2.length : sum(r2.map(r => r.valor_total_rs || 0));
    })
  );

  const cdata = eixos.map(eixo => estagios.map(est => ({eixo, estagio:est})));

  const trace = {
    type:"heatmap", z, x:estagiosX, y:eixos,
    colorscale:[[0,"#f5f7fb"],[0.3,"#9bcfda"],[0.65,"#0a7f61"],[1,"#0f4c81"]],
    showscale:true, customdata:cdata, xgap:3, ygap:3,
    colorbar:{thickness:10, tickfont:{size:10}, len:0.8, title:{text: heatmapMode==="count" ? "Emp." : "R$", side:"right"}},
    hovertemplate: heatmapMode === "count"
      ? "<b>%{y}</b><br>%{x}<br>Empreendimentos: %{z:,d}<extra></extra>"
      : "<b>%{y}</b><br>%{x}<br>Valor: R$ %{z:,.0f}<extra></extra>"
  };

  const layout = baseLayout({height:370, margin:{l:210, r:60, t:16, b:70}});
  layout.xaxis = {tickfont:{size:11}, tickangle:-20};
  layout.yaxis = {tickfont:{size:11}, automargin:true};

  // Destaque visual para filtros ativos
  const shapes = [];
  if (APP.filters.eixo) {
    const yi = eixos.indexOf(APP.filters.eixo);
    if (yi >= 0) shapes.push({type:"rect", xref:"paper", yref:"y", x0:0, x1:1, y0:yi-0.5, y1:yi+0.5, fillcolor:"rgba(255,200,0,0.12)", line:{color:"rgba(200,150,0,0.5)", width:1.5}});
  }
  if (APP.filters.estagio) {
    const xi = estagios.indexOf(APP.filters.estagio);
    if (xi >= 0) shapes.push({type:"rect", xref:"x", yref:"paper", x0:xi-0.5, x1:xi+0.5, y0:0, y1:1, fillcolor:"rgba(255,200,0,0.12)", line:{color:"rgba(200,150,0,0.5)", width:1.5}});
  }
  layout.shapes = shapes;

  if (typeof el.removeAllListeners === "function") el.removeAllListeners("plotly_click");
  Plotly.react(el, [trace], layout, plotConfig()).then(() => {
    el.on("plotly_click", ev => {
      const cd = ev.points?.[0]?.customdata;
      if (!cd) return;
      const same = APP.filters.eixo === cd.eixo && APP.filters.estagio === cd.estagio;
      APP.filters.eixo    = same ? null : cd.eixo;
      APP.filters.estagio = same ? null : cd.estagio;
      APP.filters.subeixo = APP.filters.modalidade = APP.filters.empreendimento = null;
      renderAll();
    });
  });
}

// ══ TAB 2: PERFIL — PIE + BAR ═════════════════════════════════════════════════
function renderPieChart({ key, rows, element, colors }) {
  const summary = summarizeBy(rows, key).sort((a,b) => a.valor_total_rs - b.valor_total_rs);
  if (!summary.length) return renderEmptyPlot(element, "Sem dados para este recorte.");
  const total = sum(summary.map(d => d.valor_total_rs));
  const trace = {
    type:"pie", labels:summary.map(d=>d.categoria_raw), values:summary.map(d=>d.valor_total_rs),
    textinfo:"percent",      // só % dentro das fatias — rótulos completos ficam na legenda
    textposition:"auto",     // Plotly coloca dentro se couber, fora se não couber
    textfont:{size:11},
    sort:false, hole:0.34,
    marker:{colors, line:{color:"#fff",width:2}},
    // customdata como OBJETO com chaves nomeadas — indexação [N] não funciona em pie charts Plotly
    customdata:summary.map(d=>({
      valor: fmtMoney(d.valor_total_rs),
      exec:  fmtPct(d.execucao_media),
      emp:   d.qtd_empreendimentos.toLocaleString("pt-BR"),
      mun:   d.qtd_municipios.toLocaleString("pt-BR"),
      pct:   pctValue(d.valor_total_rs,total)
    })),
    hovertemplate:"<b>%{label}</b><br>Valor: %{customdata.valor}<br>Participação: %{customdata.pct}<br>Execução média: %{customdata.exec}<br>Empreendimentos: %{customdata.emp}<br>Municípios: %{customdata.mun}<extra></extra>"
  };
  const layout = baseLayout({height:420, margin:{l:10,r:10,t:10,b:10}, showlegend:true,
    legend:{orientation:"v", x:1.02, xanchor:"left", y:0.5, font:{size:11}}});
  if (typeof element.removeAllListeners === "function") element.removeAllListeners("plotly_click");
  Plotly.react(element, [trace], layout, plotConfig()).then(() =>
    element.on("plotly_click", ev => {
      const label=ev.points?.[0]?.label; if(!label) return;
      APP.filters[key]=APP.filters[key]===label?null:label; renderAll();
    })
  );
}

function renderBarChart({ key, rows, element, color, sort="asc", clearChildren=[], uniqueField=null, labeler=null, showLink=false }) {
  const summary = summarizeBy(rows, key, uniqueField, labeler)
    .sort((a,b) => sort==="asc" ? a.valor_total_rs-b.valor_total_rs : b.valor_total_rs-a.valor_total_rs);
  if (!summary.length) return renderEmptyPlot(element, "Sem dados para este recorte.");

  const maxLabelChars = key === "empreendimento" ? 72 : 36;
  const cats  = summary.map(d => trimLabel(d.categoria, maxLabelChars));
  const vals  = summary.map(d => d.valor_total_rs);
  const custom= summary.map(d => [d.categoria_raw, fmtMoney(d.valor_total_rs), fmtPct(d.execucao_media),
    d.qtd_empreendimentos.toLocaleString("pt-BR"), d.qtd_municipios.toLocaleString("pt-BR"),
    d.registros.toLocaleString("pt-BR"), d.link_ref||""]);

  // Margem esquerda dinâmica: proporcional ao rótulo mais longo real
  const longestCat = Math.max(...cats.map(c => c.length), 4);
  const lMargin = key === "empreendimento" ? 420
    : Math.min(Math.max(Math.ceil(longestCat * 6.5 + 18), 80), 260);

  // Gradiente de opacidade: barras maiores ficam mais sólidas (0.42 → 1.0)
  const maxVal = Math.max(...vals, 1);
  const opacities = vals.map(v => Math.round((0.42 + 0.58 * (v / maxVal)) * 100) / 100);

  const linkLine = showLink ? "<br>%{customdata[6]}<extra></extra>" : "<extra></extra>";

  const trace = {
    type:"bar", orientation:"h", x:vals, y:cats,
    marker:{
      color,
      opacity: opacities,
      line:{color:"rgba(255,255,255,0.9)", width:1.2}
    },
    // Valor curto exibido fora da barra — elimina necessidade de hover para ler
    text: vals.map(shortMoney),
    textposition: "outside",
    textfont: {size: 10.5, color: "#56657a"},
    cliponaxis: false,
    customdata: custom,
    hovertemplate:"<b>%{customdata[0]}</b><br>Valor: %{customdata[1]}<br>Execução média: %{customdata[2]}<br>Empreendimentos: %{customdata[3]}<br>Municípios: %{customdata[4]}<br>Registros: %{customdata[5]}" + linkLine
  };

  // Altura por barra: 36px (empreendimento 28px pois pode ter muitos itens)
  const barH = key === "empreendimento" ? 28 : 36;
  const layout = baseLayout({
    height: Math.max(360, summary.length * barH + 110),
    margin: {l: lMargin, r: 96, t: 14, b: 52}   // r: 96 para os rótulos externos
  });
  layout.xaxis = {
    title: {text:"Valor total (R$)", standoff:14},
    tickmode:"array", ...buildCurrencyTicks(vals),
    gridcolor:"rgba(15,76,129,0.08)", zerolinecolor:"rgba(15,76,129,0.18)",
    automargin: true, tickfont:{size:11}
  };
  layout.yaxis = {
    automargin: true, autorange:"reversed",
    categoryorder:"array", categoryarray:cats,
    tickfont:{size: key==="empreendimento" ? 10 : 12}
  };

  if (typeof element.removeAllListeners === "function") element.removeAllListeners("plotly_click");
  Plotly.react(element, [trace], layout, plotConfig()).then(() => {
    element.on("plotly_click", ev => {
      const label = ev.points?.[0]?.customdata?.[0]; if(!label) return;
      APP.filters[key] = APP.filters[key]===label ? null : label;
      clearChildren.forEach(c => APP.filters[c] = null);
      renderAll();
    });
  });
}

function renderYearChart(rows) {
  const el = ELS.plots.ano_prev_conclusao;
  const summary = summarizeBy(rows,"ano_prev_conclusao").sort((a,b)=>Number(a.categoria_raw)-Number(b.categoria_raw));
  if (!summary.length) return renderEmptyPlot(el, "Sem dados para este recorte.");
  const vals = summary.map(d => d.valor_total_rs);
  const maxVal = Math.max(...vals, 1);
  const trace = {
    type:"bar",
    x: summary.map(d => d.categoria_raw),
    y: vals,
    marker:{
      color: "#0f4c81",
      opacity: vals.map(v => Math.round((0.38 + 0.62 * (v / maxVal)) * 100) / 100),
      line:{color:"rgba(255,255,255,0.9)", width:1.2}
    },
    // Rótulo de valor acima de cada barra — legível com largura total
    text: vals.map(shortMoney),
    textposition: "outside",
    textangle: 0,
    textfont: {size: 10, color: "#56657a"},
    cliponaxis: false,
    customdata:summary.map(d=>({
      valor: fmtMoney(d.valor_total_rs),
      exec:  fmtPct(d.execucao_media),
      emp:   d.qtd_empreendimentos.toLocaleString("pt-BR"),
      mun:   d.qtd_municipios.toLocaleString("pt-BR")
    })),
    hovertemplate:"<b>Ano %{x}</b><br>Valor: %{customdata.valor}<br>Execução média: %{customdata.exec}<br>Empreendimentos: %{customdata.emp}<br>Municípios: %{customdata.mun}<extra></extra>"
  };
  const layout = baseLayout({height:420, margin:{l:72,r:20,t:52,b:64}});
  layout.xaxis = {
    title:{text:"Ano de previsão de conclusão", standoff:12},
    type:"category", tickangle:-30, automargin:true, tickfont:{size:11}
  };
  layout.yaxis = {
    tickmode:"array", ...buildCurrencyTicks(vals),
    gridcolor:"rgba(15,76,129,0.08)", automargin:true, tickfont:{size:11}
  };
  if (typeof el.removeAllListeners === "function") el.removeAllListeners("plotly_click");
  Plotly.react(el, [trace], layout, plotConfig()).then(() =>
    el.on("plotly_click", ev => {
      const label=ev.points?.[0]?.x; if(!label) return;
      APP.filters.ano_prev_conclusao = APP.filters.ano_prev_conclusao===String(label)?null:String(label);
      renderAll();
    })
  );
}

// ══ TAB 3: RELAÇÕES — SANKEY ══════════════════════════════════════════════════
function renderSankey(rows) {
  const el = ELS.plots.sankey;
  if (!el) return;

  // Coletar valores únicos e agregar valores
  const fonteVal = {}, miniVal = {}, execVal = {};
  rows.forEach(r => {
    const v = r.valor_total_rs || 0;
    if (r.fontes_financiamento !== "Não informado") fonteVal[r.fontes_financiamento] = (fonteVal[r.fontes_financiamento]||0)+v;
    if (r.ministerio !== "Não informado")           miniVal[r.ministerio]            = (miniVal[r.ministerio]||0)+v;
    if (r.tipo_executor !== "Não informado")        execVal[r.tipo_executor]         = (execVal[r.tipo_executor]||0)+v;
  });

  // Top 8 ministérios; resto → "Outros Ministérios"
  const MAX_MINIS = 8;
  const minisSorted = Object.entries(miniVal).sort((a,b)=>b[1]-a[1]);
  const topMinis    = minisSorted.slice(0, MAX_MINIS).map(([k])=>k);
  const hasOthers   = minisSorted.length > MAX_MINIS;
  const minis       = hasOthers ? [...topMinis, "Outros Ministérios"] : topMinis;

  const fontes    = Object.keys(fonteVal).filter(f => f !== "Não informado");
  const executores= Object.keys(execVal).filter(e => e !== "Não informado");

  if (!fontes.length || !minis.length || !executores.length)
    return renderEmptyPlot(el, "Sem dados suficientes para o diagrama de fluxo.");

  const allLabels = [...fontes, ...minis, ...executores];
  const fi = (l) => fontes.indexOf(l);
  const mi = (l) => fontes.length + minis.indexOf(l);
  const ei = (l) => fontes.length + minis.length + executores.indexOf(l);

  const nodeColors = [
    ...fontes.map(() => "#185FA5"),
    ...minis.map((m, i) => {
      if (m === "Outros Ministérios") return "#7b8aa0";
      const p = ["#0F6E56","#1D9E75","#085041","#0a7f61","#5DCAA5","#3B6D11","#0b5345","#27ae60"];
      return p[i % p.length];
    }),
    ...executores.map(() => "#7c3aed")
  ];

  const nodeCdata = [
    ...fontes.map(f    => ({type:"fonte",      value:f})),
    ...minis.map(m     => ({type:"ministerio",  value:m})),
    ...executores.map(e=> ({type:"executor",    value:e}))
  ];

  // Links fonte → ministério
  const fmMap = new Map(), meMap = new Map();
  rows.forEach(r => {
    const fonte  = r.fontes_financiamento;
    const miniRaw= r.ministerio;
    const mini   = topMinis.includes(miniRaw) ? miniRaw : (hasOthers ? "Outros Ministérios" : miniRaw);
    const exec   = r.tipo_executor;
    const v      = r.valor_total_rs || 0;
    if (fonte === "Não informado" || mini === "Não informado") return;
    const fk = fonte+SEP+mini;
    fmMap.set(fk, {fonte, mini, v:(fmMap.get(fk)?.v||0)+v});
    if (exec === "Não informado") return;
    const mk = mini+SEP+exec;
    meMap.set(mk, {mini, exec, v:(meMap.get(mk)?.v||0)+v});
  });

  const lSrc=[], lTgt=[], lVal=[], lColor=[], lCdata=[];
  fmMap.forEach(({fonte,mini,v}) => {
    if (fi(fonte)<0 || mi(mini)<fontes.length) return;
    lSrc.push(fi(fonte)); lTgt.push(mi(mini)); lVal.push(v);
    lColor.push("rgba(24,95,165,0.14)");
    lCdata.push(fonte+" → "+mini+": "+fmtMoney(v));
  });
  meMap.forEach(({mini,exec,v}) => {
    if (mi(mini)<fontes.length || ei(exec)<fontes.length+minis.length) return;
    lSrc.push(mi(mini)); lTgt.push(ei(exec)); lVal.push(v);
    lColor.push("rgba(15,110,86,0.14)");
    lCdata.push(mini+" → "+exec+": "+fmtMoney(v));
  });

  if (!lSrc.length) return renderEmptyPlot(el, "Sem fluxo de recursos para exibir neste recorte.");

  const trace = {
    type:"sankey", orientation:"h",
    node:{label:allLabels, color:nodeColors, customdata:nodeCdata, pad:14, thickness:18,
          line:{color:"rgba(255,255,255,0.4)",width:0.5},
          hovertemplate:"<b>%{label}</b><br>Total: %{value:,.0f}<extra></extra>"},
    link:{source:lSrc, target:lTgt, value:lVal, color:lColor, customdata:lCdata,
          hovertemplate:"%{customdata}<extra></extra>"}
  };

  const layout = baseLayout({height:460, margin:{l:8,r:8,t:20,b:8}});
  layout.font = {family:CONFIG.chartFont, size:11};

  if (typeof el.removeAllListeners === "function") el.removeAllListeners("plotly_click");
  Plotly.react(el, [trace], layout, plotConfig()).then(() => {
    el.on("plotly_click", ev => {
      const pt = ev.points?.[0];
      if (!pt || pt.source !== undefined) return; // ignorar cliques em links

      // Tentar customdata primeiro, fallback por posição no array
      let cd = pt.customdata;
      if (!cd) {
        const label = pt.label;
        if (fontes.includes(label))     cd = {type:"fonte",     value:label};
        else if (minis.includes(label)) cd = {type:"ministerio", value:label};
        else if (executores.includes(label)) cd = {type:"executor", value:label};
      }
      if (!cd) return;

      if      (cd.type === "fonte")      APP.filters.fontes_financiamento = APP.filters.fontes_financiamento === cd.value ? null : cd.value;
      else if (cd.type === "ministerio") APP.filters.ministerio           = APP.filters.ministerio           === cd.value ? null : cd.value;
      else if (cd.type === "executor")   APP.filters.tipo_executor        = APP.filters.tipo_executor        === cd.value ? null : cd.value;
      renderAll();
    });
  });
}

// ══ TAB 3: RELAÇÕES — SCATTER ═════════════════════════════════════════════════
function renderScatter(rows) {
  const el = ELS.plots.scatter;
  if (!el) return;

  // Apenas municípios simples (sem vírgulas = não é lista de municípios)
  const single = rows.filter(r =>
    r.municipio && r.municipio !== "Não informado" &&
    !r.municipio.includes(",") && !r.municipio.includes("Rio Grande do Sul")
  );

  if (!single.length) return renderEmptyPlot(el, "Sem dados de municípios individuais neste recorte.");

  const byMuni = new Map();
  single.forEach(row => {
    const m = row.municipio;
    if (!byMuni.has(m)) byMuni.set(m, {municipio:m, valor:0, epArr:[], empSet:new Set()});
    const item = byMuni.get(m);
    item.valor += row.valor_total_rs || 0;
    if (Number.isFinite(row.execucao_fisica_pct)) item.epArr.push(row.execucao_fisica_pct);
    item.empSet.add(row.empreendimento);
  });

  const data = [...byMuni.values()].filter(d => d.valor > 0 || d.epArr.length > 0);
  if (!data.length) return renderEmptyPlot(el, "Sem dados para o gráfico de dispersão.");

  const x    = data.map(d => d.valor);
  const y    = data.map(d => average(d.epArr) || 0);
  const ns   = data.map(d => d.empSet.size);
  const sizes= ns.map(n => Math.max(6, Math.min(42, Math.sqrt(n)*8)));

  // Labels apenas para top 15 por valor
  const top15 = new Set([...data].sort((a,b)=>b.valor-a.valor).slice(0,15).map(d=>d.municipio));

  const colorArr = data.map(d =>
    APP.filters.municipio === d.municipio ? "#d03b2d" :
    d.valor > 600_000_000 ? "#0f4c81" :
    d.valor > 150_000_000 ? "#146c94" : "#7b8aa0"
  );

  const avgExec = average(y.filter(v => v > 0));

  const traceMain = {
    type:"scatter", mode:"markers+text", x, y,
    marker:{size:sizes, color:colorArr, opacity:0.72, line:{color:"rgba(255,255,255,0.8)",width:1}},
    text: data.map(d => top15.has(d.municipio) ? d.municipio : ""),
    textposition:"top center", textfont:{size:9, color:"#56657a"},
    customdata:data.map(d => ({
      municipio:d.municipio, valor:fmtMoney(d.valor),
      exec:fmtPct(average(d.epArr)||0), nemp:d.empSet.size
    })),
    hovertemplate:"<b>%{customdata.municipio}</b><br>Valor total: %{customdata.valor}<br>Execução média: %{customdata.exec}<br>Empreendimentos: %{customdata.nemp}<extra></extra>",
    name:"Municípios"
  };

  // Linha de referência: execução média
  const traceRef = {
    type:"scatter", mode:"lines",
    x:[0, Math.max(...x)*1.04], y:[avgExec, avgExec],
    line:{dash:"dot", color:"rgba(80,80,80,0.45)", width:1.2},
    hoverinfo:"skip", name:"Execução média (" + fmtPct(avgExec) + ")",
    showlegend:true
  };

  const layout = baseLayout({height:460, margin:{l:72,r:28,t:28,b:62}});
  layout.xaxis = {title:"Valor total investido (R$)", tickmode:"array", ...buildCurrencyTicks(x), automargin:true, gridcolor:"rgba(15,76,129,0.07)"};
  layout.yaxis = {title:"Execução física média (%)", range:[-2,107], gridcolor:"rgba(15,76,129,0.07)", automargin:true};
  layout.showlegend = true;
  layout.legend = {x:1, xanchor:"right", y:1.02, font:{size:10}};
  layout.annotations = [{
    text:"Tamanho = n° de empreendimentos", xref:"paper", yref:"paper",
    x:0, y:-0.12, showarrow:false, font:{size:10, color:"#7b8aa0"}
  }];

  if (typeof el.removeAllListeners === "function") el.removeAllListeners("plotly_click");
  Plotly.react(el, [traceMain, traceRef], layout, plotConfig()).then(() => {
    el.on("plotly_click", ev => {
      const cd = ev.points?.[0]?.customdata;
      if (!cd?.municipio) return;
      APP.filters.municipio = APP.filters.municipio === cd.municipio ? null : cd.municipio;
      if (ELS.municipioSelect) ELS.municipioSelect.value = APP.filters.municipio || "__TODOS__";
      renderAll();
    });
  });
}

// ══ GENÉRICO ══════════════════════════════════════════════════════════════════
function renderEmptyPlot(el, msg) {
  Plotly.react(el, [], {height:240, paper_bgcolor:"rgba(0,0,0,0)", plot_bgcolor:"rgba(0,0,0,0)",
    margin:{l:20,r:20,t:20,b:20}, xaxis:{visible:false}, yaxis:{visible:false},
    annotations:[{text:msg, showarrow:false, font:{family:CONFIG.chartFont, size:13, color:"#56657a"}}]
  }, plotConfig());
}

function summarizeBy(rows, key, uniqueField=null, labeler=null) {
  const groups = new Map();
  rows.forEach(row => {
    const groupKey = uniqueField ? row[uniqueField] : (row[key] || "Não informado");
    const label    = row[key] || "Não informado";
    if (!groups.has(groupKey)) groups.set(groupKey, {
      categoria:label, municipio_ref:row.municipio, link_ref:row.link||"",
      valor_total_rs:0, execValues:[], empreendimentos:new Set(), municipios:new Set(), registros:0
    });
    const item = groups.get(groupKey);
    item.valor_total_rs += row.valor_total_rs || 0;
    if (Number.isFinite(row.execucao_fisica_pct)) item.execValues.push(row.execucao_fisica_pct);
    item.empreendimentos.add(row.empreendimento);
    item.municipios.add(row.municipio);
    item.registros += 1;
    if (!item.link_ref && row.link) item.link_ref = row.link;
  });
  return [...groups.values()].map(item => ({
    categoria:         labeler ? labeler(item) : item.categoria,
    categoria_raw:     item.categoria,
    municipio_ref:     item.municipio_ref,
    link_ref:          item.link_ref,
    valor_total_rs:    item.valor_total_rs,
    execucao_media:    average(item.execValues),
    qtd_empreendimentos:item.empreendimentos.size,
    qtd_municipios:    item.municipios.size,
    registros:         item.registros
  }));
}

// ══ UI STATE ══════════════════════════════════════════════════════════════════
function renderActiveFilters() {
  const labels = {
    municipio:"Município", eixo:"Eixo", subeixo:"Subeixo", modalidade:"Modalidade",
    empreendimento:"Empreendimento", inclusao_novo_pac:"Inclusão no Novo PAC",
    tipo_executor:"Tipo de Executor", estagio:"Estágio",
    fontes_financiamento:"Fontes de financiamento", classificacao:"Classificação",
    ano_prev_conclusao:"Ano de previsão de conclusão", ministerio:"Ministério"
  };
  const active = Object.entries(APP.filters).filter(([,v]) => Boolean(v));
  if (!active.length) {
    ELS.activeFilters.className = "chip-wrap empty-state small-empty";
    ELS.activeFilters.textContent = "Nenhum filtro ativo além do recorte geral.";
    return;
  }
  ELS.activeFilters.className = "chip-wrap";
  ELS.activeFilters.innerHTML = active.map(([k,v]) =>
    '<span class="chip">' + labels[k] + ": " + escapeHtml(v) + ' <button data-filter="' + k + '">×</button></span>'
  ).join("");
  ELS.activeFilters.querySelectorAll("button").forEach(btn =>
    btn.addEventListener("click", () => clearFilter(btn.dataset.filter))
  );
}

function clearFilter(key) {
  APP.filters[key] = null;
  if (key === "eixo")    APP.filters.subeixo = APP.filters.modalidade = APP.filters.empreendimento = null;
  if (key === "subeixo") APP.filters.modalidade = APP.filters.empreendimento = null;
  if (key === "modalidade") APP.filters.empreendimento = null;
  renderAll();
}

function renderKpis(rows) {
  ELS.kpiValor.textContent = fmtMoney(sum(rows.map(d => d.valor_total_rs)));
  ELS.kpiExec.textContent  = fmtPct(average(rows.map(d => d.execucao_fisica_pct)));
  ELS.kpiEmp.textContent   = uniqueCount(rows,"empreendimento").toLocaleString("pt-BR");
  ELS.kpiMun.textContent   = uniqueCount(rows,"municipio").toLocaleString("pt-BR");
}

function renderHierarchySummary(rows) {
  ELS.hierSummary.innerHTML = [
    "<span class='summary-pill'><b>" + uniqueCount(rows,"eixo").toLocaleString("pt-BR") + "</b> eixos</span>",
    "<span class='summary-pill'><b>" + uniqueCount(rows,"subeixo").toLocaleString("pt-BR") + "</b> subeixos</span>",
    "<span class='summary-pill'><b>" + uniqueCount(rows,"modalidade").toLocaleString("pt-BR") + "</b> modalidades</span>",
    "<span class='summary-pill'><b>" + uniqueCount(rows,"empreendimento").toLocaleString("pt-BR") + "</b> empreendimentos</span>"
  ].join("");
}

function renderBreadcrumb() {
  const parts = ["Todos"];
  if (APP.filters.eixo)          parts.push(APP.filters.eixo);
  if (APP.filters.subeixo)       parts.push(APP.filters.subeixo);
  if (APP.filters.modalidade)    parts.push(APP.filters.modalidade);
  if (APP.filters.empreendimento)parts.push(APP.filters.empreendimento);
  let html = escapeHtml(parts.join(" › "));
  if (APP.filters.empreendimento) {
    const row = APP.raw.find(r => r.empreendimento === APP.filters.empreendimento && r.link);
    if (row?.link) html += ' <a href="' + escapeHtml(row.link) + '" target="_blank" rel="noopener noreferrer" class="btn btn-secondary" style="font-size:0.78rem;min-height:26px;padding:0 10px;margin-left:8px;display:inline-flex">Ver detalhes ↗</a>';
  }
  ELS.hierBreadcrumb.innerHTML = html;
}

function setStatus(msg) { ELS.statusLine.textContent = msg; }

// ══ PDF ═══════════════════════════════════════════════════════════════════════
function buildTablesForPDF() {
  const rows = getFilteredRows();
  const sections = [
    ["Inclusão no Novo PAC","inclusao_novo_pac"],["Tipo de Executor","tipo_executor"],
    ["Estágio","estagio"],["Fontes de financiamento","fontes_financiamento"],
    ["Ministério","ministerio"],["Classificação","classificacao"],
    ["Eixo","eixo"],["Subeixo","subeixo"],["Modalidade","modalidade"],
    ["Empreendimento","empreendimento"],["Ano de previsão de conclusão","ano_prev_conclusao"]
  ];
  const totalValor = sum(rows.map(r => r.valor_total_rs));
  const execMedia  = average(rows.map(r => r.execucao_fisica_pct));
  const html = [
    '<div class="pdf-head"><h1>Novo PAC (2023–2030) – Rio Grande do Sul</h1><div class="pdf-meta">Casa Civil – Governo Federal – Brasil</div><div class="pdf-meta">Atualização da base: ' + CONFIG.defaultUpdateLabel + '</div></div>',
    '<div class="pdf-grid"><div class="pdf-kpi"><div class="lbl">Valor total</div><div class="val">' + fmtMoney(totalValor) + '</div></div><div class="pdf-kpi"><div class="lbl">Execução média</div><div class="val">' + fmtPct(execMedia) + '</div></div><div class="pdf-kpi"><div class="lbl">Empreendimentos</div><div class="val">' + uniqueCount(rows,"empreendimento").toLocaleString("pt-BR") + '</div></div><div class="pdf-kpi"><div class="lbl">Municípios</div><div class="val">' + uniqueCount(rows,"municipio").toLocaleString("pt-BR") + '</div></div></div>',
    '<div class="pdf-meta"><strong>Filtros ativos:</strong> ' + buildFilterText() + '</div>'
  ];
  sections.forEach(([title,key]) => html.push(buildOnePdfTable(title,rows,key)));
  html.push('<div class="source">Fonte: Novo PAC (2023–2030) – Casa Civil – Governo Federal – Brasil. Atualização: ' + CONFIG.defaultUpdateLabel + '.</div>');
  ELS.tables.innerHTML = html.join("");
}

function buildOnePdfTable(title, rows, key) {
  const grouped    = summarizeBy(rows,key).sort((a,b)=>b.valor_total_rs-a.valor_total_rs);
  const totalValor = sum(grouped.map(d=>d.valor_total_rs));
  const body       = grouped.map(d =>
    "<tr><td>" + escapeHtml(d.categoria_raw) + "</td><td>" + d.registros.toLocaleString("pt-BR") + "</td><td>" + fmtPct(d.execucao_media) + "</td><td>" + fmtMoney(d.valor_total_rs) + "</td><td>" + pctValue(d.valor_total_rs,totalValor) + "</td></tr>"
  ).join("");
  return '<div class="pdf-section"><h2>' + title + '</h2><table class="report"><thead><tr><th>Categoria</th><th>Registros</th><th>Execução média (%)</th><th>Soma do valor (R$)</th><th>% do total (valor)</th></tr></thead><tbody>' + body + '</tbody><tfoot><tr><td><b>TOTAL</b></td><td><b>' + rows.length.toLocaleString("pt-BR") + '</b></td><td><b>' + fmtPct(average(rows.map(r=>r.execucao_fisica_pct))) + '</b></td><td><b>' + fmtMoney(sum(rows.map(r=>r.valor_total_rs))) + '</b></td><td><b>100,00%</b></td></tr></tfoot></table></div>';
}

function makePDF() {
  buildTablesForPDF();
  ELS.tables.classList.add("show");
  const opt = {
    margin:[10,10,10,10], filename:"relatorio_pac_tabelas.pdf",
    image:{type:"jpeg",quality:0.98},
    html2canvas:{scale:2,useCORS:true,backgroundColor:"#ffffff"},
    jsPDF:{unit:"pt",format:"a4",orientation:"landscape"},
    pagebreak:{mode:["css","legacy"]}
  };
  html2pdf().set(opt).from(ELS.tables).save().then(() => ELS.tables.classList.remove("show"))
    .catch(err => { ELS.tables.classList.remove("show"); console.error(err); alert("Erro ao gerar PDF."); });
}

function buildFilterText() {
  const labels = {
    municipio:"Município",eixo:"Eixo",subeixo:"Subeixo",modalidade:"Modalidade",
    empreendimento:"Empreendimento",inclusao_novo_pac:"Inclusão no Novo PAC",
    tipo_executor:"Tipo de Executor",estagio:"Estágio",
    fontes_financiamento:"Fontes de financiamento",classificacao:"Classificação",
    ano_prev_conclusao:"Ano de previsão de conclusão",ministerio:"Ministério"
  };
  const active = Object.entries(APP.filters).filter(([,v]) => Boolean(v));
  return active.length ? active.map(([k,v]) => labels[k]+": "+v).join(" | ") : "Nenhum filtro ativo.";
}

// ══ UTILS ════════════════════════════════════════════════════════════════════
function sum(values)          { return values.reduce((a,v) => a+Number(v||0), 0); }
function average(values)      { const vl=values.filter(v=>Number.isFinite(v)); return vl.length ? vl.reduce((a,b)=>a+b,0)/vl.length : 0; }
function uniqueCount(rows,key){ return new Set(rows.map(d=>d[key]).filter(v=>v&&v!=="Não informado")).size; }
function round2(v)            { return Math.round((Number(v||0)+Number.EPSILON)*100)/100; }
function fmtMoney(v)          { return new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL",minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(v||0)); }
function fmtPct(v)            { const n=Number.isFinite(v)?v:0; return n.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})+"%"; }
function pctValue(v,total)    { if(!total) return "0,00%"; return ((v/total)*100).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})+"%"; }
function trimLabel(t,max=42)  { const s=String(t||""); return s.length>max ? s.slice(0,max-1)+"…" : s; }
function escapeHtml(v)        { return String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;"); }
function buildCurrencyTicks(values){ const mx=Math.max(...values,0); const steps=mx>=1e9?[0,mx/3,2*mx/3,mx]:mx>=1e6?[0,mx/2,mx]:[0,mx]; return {tickvals:steps,ticktext:steps.map(shortMoney)}; }
function shortMoney(v)        { const a=Math.abs(v); if(a>=1e9) return "R$ "+(v/1e9).toLocaleString("pt-BR",{maximumFractionDigits:1})+" bi"; if(a>=1e6) return "R$ "+(v/1e6).toLocaleString("pt-BR",{maximumFractionDigits:1})+" mi"; if(a>=1e3) return "R$ "+(v/1e3).toLocaleString("pt-BR",{maximumFractionDigits:1})+" mil"; return "R$ "+Number(v).toLocaleString("pt-BR",{maximumFractionDigits:0}); }
function baseLayout({height=420,margin={l:64,r:24,t:18,b:48},showlegend=false,legend={}}={}){ return {height,margin,showlegend,legend,paper_bgcolor:"rgba(0,0,0,0)",plot_bgcolor:"rgba(0,0,0,0)",hoverlabel:{font:{family:CONFIG.chartFont,size:12}},font:{family:CONFIG.chartFont,color:"#122033",size:12}}; }
function plotConfig()         { return {displayModeBar:true,responsive:true,locale:"pt-BR",displaylogo:false,modeBarButtonsToRemove:["select2d","lasso2d","autoScale2d","hoverClosestCartesian","hoverCompareCartesian","toggleSpikelines"]}; }
