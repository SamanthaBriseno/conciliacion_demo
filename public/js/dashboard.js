// ============================================================
// DASHBOARD · KPIs, tabla, gráficas y recomendaciones IA
// ============================================================

const CHART_DEFAULTS = {
  plugins: { legend: { labels: { color: '#8a90a3' } } },
  scales: {
    x: { ticks: { color: '#666' }, grid: { color: '#1a1e28' } },
    y: { ticks: { color: '#666' }, grid: { color: '#1a1e28' }, beginAtZero: true }
  }
};

// ---------- Navegación entre tabs ----------
document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
    if (btn.dataset.tab === 'dashboard') cargarDashboard();
  });
});

// ---------- Cargar KPIs + tabla ----------
async function cargarDashboard() {
  const clienteId = document.getElementById('cliente-tablero').value;
  try {
    const [kpis, movs] = await Promise.all([
      fetch(`${API_KPIS}?cliente_id=${clienteId}`).then(r => r.json()),
      fetch(`${API_MOVIMIENTOS}?cliente_id=${clienteId}`).then(r => r.json())
    ]);
    pintarKPIs(kpis);
    pintarTabla(movs);
    pintarGraficas(kpis, movs);
  } catch (err) {
    console.error('Error cargando dashboard:', err);
  }
}

// ---------- Pintar KPIs ----------
function pintarKPIs(k) {
  const total = k.total_movimientos || 0;
  const conc  = k.conciliados || 0;
  const exc   = k.excepciones || 0;
  const tasa  = total > 0 ? ((conc / total) * 100).toFixed(1) : '0.0';

  document.getElementById('kpi-total').textContent       = total;
  document.getElementById('kpi-total-sub').textContent   = `${conc} conciliados · ${exc} excepciones`;
  document.getElementById('kpi-conciliados').textContent = conc;
  document.getElementById('kpi-excepciones').textContent = exc;
  document.getElementById('kpi-tasa').textContent        = `${tasa}%`;
  document.getElementById('kpi-monto').textContent       = formatMXN(k.monto_conciliado || 0);
  document.getElementById('kpi-discrepancia').textContent= formatMXN(k.monto_discrepancia || 0);
  document.getElementById('kpi-tiempo').textContent      =
    k.tiempo_promedio_ms ? (k.tiempo_promedio_ms / 1000).toFixed(2) : '—';
  document.getElementById('kpi-tiempo-max').textContent  =
    k.tiempo_maximo_ms  ? (k.tiempo_maximo_ms  / 1000).toFixed(2) : '—';
}

// ---------- Pintar tabla ----------
function pintarTabla(movs) {
  const tbody = document.querySelector('#tabla-movimientos tbody');
  tbody.innerHTML = '';

  if (!movs || movs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:#8a90a3;padding:20px;">Sin movimientos para este cliente</td></tr>`;
    return;
  }

  movs.forEach(m => {
    const badge = m.resultado === 'conciliado'
      ? `<span class="badge-resultado conciliado">✅ conciliado</span>`
      : `<span class="badge-resultado excepcion">⚠️ excepción</span>`;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${formatFecha(m.fecha)}</td>
      <td>${formatFecha(m.fecha_emision)}</td>
      <td>${formatFecha(m.fecha_vencimiento)}</td>
      <td>${formatFecha(m.created_at)}</td>
      <td>${m.referencia || '—'}</td>
      <td>${formatMXN(m.monto)}</td>
      <td>${m.tipo || '—'}</td>
      <td>${badge}</td>
      <td>${m.causa_excepcion || '—'}</td>
      <td>${m.tiempo_conciliacion_ms ? (m.tiempo_conciliacion_ms / 1000).toFixed(2) : '—'}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ---------- Gráficas con Chart.js ----------
const charts = {};

function destroyAll() {
  Object.values(charts).forEach(c => c?.destroy());
}

function pintarGraficas(k, movs) {
  destroyAll();

  // 1. Doughnut: composición por resultado
  charts.resultado = new Chart(document.getElementById('chart-resultado'), {
    type: 'doughnut',
    data: {
      labels: ['Conciliados', 'En excepción'],
      datasets: [{ data: [k.conciliados || 0, k.excepciones || 0], backgroundColor: ['#2ecc71', '#f39c12'] }]
    },
    options: { responsive: true, plugins: { legend: { labels: { color: '#8a90a3' } } } }
  });

  // 2. Barras horizontales: causas de excepción
  const causas = k.causas || [];
  charts.causas = new Chart(document.getElementById('chart-causas'), {
    type: 'bar',
    data: {
      labels: causas.length ? causas.map(c => c.causa) : ['Sin datos'],
      datasets: [{ data: causas.length ? causas.map(c => c.total) : [0], backgroundColor: '#e74c3c', borderRadius: 4 }]
    },
    options: {
      indexAxis: 'y', responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#666' }, grid: { color: '#1a1e28' }, beginAtZero: true },
        y: { ticks: { color: '#8a90a3' }, grid: { color: '#1a1e28' } }
      }
    }
  });

  // 3. Barras: monto conciliado vs discrepancia
  charts.montos = new Chart(document.getElementById('chart-montos'), {
    type: 'bar',
    data: {
      labels: ['Conciliado', 'Discrepancia'],
      datasets: [{
        data: [k.monto_conciliado || 0, k.monto_discrepancia || 0],
        backgroundColor: ['#2ecc71', '#f39c12'],
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#888' }, grid: { color: '#1a1e28' } },
        y: { ticks: { color: '#666', callback: v => '$' + (v / 1000).toFixed(0) + 'k' }, grid: { color: '#1a1e28' }, beginAtZero: true }
      }
    }
  });

  // 4. Línea: tendencia por fecha (últimos movimientos agrupados)
  const tendencia = agruparPorFecha(movs);
  charts.tendencia = new Chart(document.getElementById('chart-tendencia'), {
    type: 'line',
    data: {
      labels: tendencia.labels,
      datasets: [
        { label: 'Conciliados', data: tendencia.conciliados, borderColor: '#2ecc71', backgroundColor: 'rgba(46,204,113,.1)', tension: 0.3 },
        { label: 'Excepciones', data: tendencia.excepciones, borderColor: '#f39c12', backgroundColor: 'rgba(243,156,18,.1)', tension: 0.3 }
      ]
    },
    options: {
      responsive: true,
      plugins: { legend: { labels: { color: '#8a90a3' } } },
      scales: {
        x: { ticks: { color: '#666' }, grid: { color: '#1a1e28' } },
        y: { ticks: { color: '#666' }, grid: { color: '#1a1e28' }, beginAtZero: true }
      }
    }
  });
}

function agruparPorFecha(movs) {
  const mapa = {};
  (movs || []).forEach(m => {
    const dia = (m.fecha || '').toString().slice(0, 10);
    if (!dia) return;
    if (!mapa[dia]) mapa[dia] = { conciliados: 0, excepciones: 0 };
    if (m.resultado === 'conciliado') mapa[dia].conciliados++;
    else mapa[dia].excepciones++;
  });
  const dias = Object.keys(mapa).sort();
  return {
    labels:      dias.map(d => d.slice(5)),
    conciliados: dias.map(d => mapa[d].conciliados),
    excepciones: dias.map(d => mapa[d].excepciones),
  };
}

// ---------- Recomendaciones IA ----------
async function cargarIAGuardada() {
  const clienteId = document.getElementById('cliente-ia').value;
  const content = document.getElementById('ia-content');
  const errBox  = document.getElementById('ia-error');
  const empty   = document.getElementById('ia-empty');
  errBox.innerHTML = '';
  try {
    const r = await fetch(`${API_IA}?cliente_id=${clienteId}`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    if (!data) {
      content.classList.add('hidden');
      empty.classList.remove('hidden');
      return;
    }
    empty.classList.add('hidden');
    renderIA(data, false);
    content.classList.remove('hidden');
  } catch (err) {
    errBox.innerHTML = `<div class="ia-error-box">❌ Error cargando análisis guardado: ${err.message}</div>`;
  }
}

async function cargarIA() {
  const clienteId = document.getElementById('cliente-ia').value;
  const btn     = document.getElementById('btn-ia-refresh');
  const loading = document.getElementById('ia-loading');
  const content = document.getElementById('ia-content');
  const errBox  = document.getElementById('ia-error');
  const empty   = document.getElementById('ia-empty');

  btn.disabled = true;
  loading.classList.remove('hidden');
  content.classList.add('hidden');
  empty.classList.add('hidden');
  errBox.innerHTML = '';

  try {
    const r = await fetch(API_IA, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cliente_id: clienteId })
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    renderIA(data, true);
    content.classList.remove('hidden');
  } catch (err) {
    errBox.innerHTML = `<div class="ia-error-box">❌ <strong>Error:</strong> ${err.message}<br><small>Asegúrate de que Ollama esté corriendo: <code>ollama serve</code></small></div>`;
  } finally {
    loading.classList.add('hidden');
    btn.disabled = false;
  }
}

function renderIA(data, esNuevo) {
  const fmt = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
  const total = data.total || 0;
  const tasa  = data.tasa_conciliacion ?? (total > 0 ? ((data.conciliados / total) * 100).toFixed(1) : '0.0');
  const causas = data.causas || [];

  // Badge de fecha
  const fechaEl = document.getElementById('ia-fecha-badge');
  if (data.created_at) {
    const d = new Date(data.created_at);
    const label = esNuevo ? 'Generado ahora' : `Último análisis: ${d.toLocaleDateString('es-MX', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })}`;
    fechaEl.textContent = label;
    fechaEl.classList.remove('hidden');
  } else {
    fechaEl.classList.add('hidden');
  }

  // Stats mini — ahora incluye monto en excepción y tasa visual
  const montoExc = causas.reduce((s, c) => s + Number(c.monto || 0), 0);
  document.getElementById('ia-stats').innerHTML = `
    <div class="stat-mini">
      <div class="l">Total movimientos</div>
      <div class="v">${total}</div>
    </div>
    <div class="stat-mini">
      <div class="l">Conciliados</div>
      <div class="v" style="color:var(--ok)">${data.conciliados || 0}</div>
    </div>
    <div class="stat-mini">
      <div class="l">Excepciones</div>
      <div class="v" style="color:var(--warn)">${data.excepciones || 0}</div>
    </div>
    <div class="stat-mini">
      <div class="l">Tasa conciliación</div>
      <div class="v ${Number(tasa) >= 70 ? 'stat-ok' : 'stat-warn'}">${tasa}%</div>
    </div>
    <div class="stat-mini">
      <div class="l">Monto en excepción</div>
      <div class="v" style="color:var(--err)">${fmt.format(montoExc)}</div>
    </div>
    <div class="stat-mini">
      <div class="l">Periodo analizado</div>
      <div class="v" style="font-size:1em">${data.periodo || '—'}</div>
    </div>
  `;

  // Barra de progreso de tasa
  document.getElementById('ia-tasa-bar-fill').style.width = `${Math.min(Number(tasa), 100)}%`;
  document.getElementById('ia-tasa-bar-fill').style.background = Number(tasa) >= 70 ? 'var(--ok)' : 'var(--warn)';
  document.getElementById('ia-tasa-label').textContent = `${tasa}% de conciliación automática`;

  // Tabla de causas
  const causasHtml = causas.length === 0
    ? '<tr><td colspan="3" style="color:var(--text-dim);text-align:center">Sin excepciones registradas</td></tr>'
    : causas.map(c => {
        const pct = total > 0 ? ((Number(c.total) / total) * 100).toFixed(1) : 0;
        return `<tr>
          <td>${c.causa}</td>
          <td><span class="badge-causa">${c.total}</span> <span style="color:var(--text-dim);font-size:11px">(${pct}%)</span></td>
          <td style="color:var(--err)">${fmt.format(Number(c.monto || 0))}</td>
        </tr>`;
      }).join('');
  document.getElementById('ia-causas-body').innerHTML = causasHtml;

  // Resumen
  document.getElementById('ia-resumen-texto').textContent = data.resumen || 'Sin diagnóstico disponible.';

  // Recomendaciones con número de orden y color de borde por impacto
  const recs = data.recomendaciones || [];
  document.getElementById('ia-recomendaciones').innerHTML = recs.length === 0
    ? '<div class="rec-card"><p>Sin recomendaciones generadas.</p></div>'
    : recs.map((r, i) => {
        const texto   = typeof r === 'string' ? r : (r.descripcion || r.titulo || JSON.stringify(r));
        const titulo  = typeof r === 'object' && r.titulo ? r.titulo : `Recomendación ${i + 1}`;
        const impacto  = (typeof r === 'object' && r.impacto)  ? r.impacto.toLowerCase()  : 'medio';
        const esfuerzo = (typeof r === 'object' && r.esfuerzo) ? r.esfuerzo.toLowerCase() : 'medio';
        const borderColor = impacto === 'alto' ? 'var(--err)' : impacto === 'medio' ? 'var(--warn)' : 'var(--ok)';
        return `
          <div class="rec-card" style="border-left:3px solid ${borderColor}">
            <div class="rec-num">${i + 1}</div>
            <h4>${titulo}</h4>
            <p>${texto}</p>
            <div class="rec-tags">
              <span class="rec-tag ${impacto}">💥 Impacto: ${impacto}</span>
              <span class="rec-tag esfuerzo-${esfuerzo}">⏱ Esfuerzo: ${esfuerzo}</span>
            </div>
          </div>`;
      }).join('');

  // Quick wins
  const qw = data.quick_wins || [];
  document.getElementById('ia-quick-wins').innerHTML = qw.length === 0
    ? '<li>Sin quick wins identificados</li>'
    : qw.map(x => `<li>${x}</li>`).join('');

  // Riesgos
  const riesgos = data.riesgos || [];
  document.getElementById('ia-riesgos').innerHTML = riesgos.length === 0
    ? '<li>Sin riesgos identificados</li>'
    : riesgos.map(x => `<li>${x}</li>`).join('');
}

// ---------- Eventos ----------
document.getElementById('cliente-tablero')?.addEventListener('change', cargarDashboard);
document.getElementById('btn-ia-refresh')?.addEventListener('click', cargarIA);
document.getElementById('cliente-ia')?.addEventListener('change', cargarIAGuardada);

// Cargar última recomendación al abrir el tab IA
document.querySelectorAll('.tab-btn').forEach((btn) => {
  if (btn.dataset.tab === 'ia') {
    btn.addEventListener('click', cargarIAGuardada);
  }
});

// ---------- Reset demo ----------
document.getElementById('btn-reset-demo')?.addEventListener('click', async () => {
  const btn = document.getElementById('btn-reset-demo');
  const result = document.getElementById('config-reset-result');
  const preview = document.getElementById('config-facturas-preview');

  if (!confirm('¿Ejecutar reset de demo? Se borrarán los movimientos y conciliaciones de los casos DEMO-*.')) return;

  btn.disabled = true;
  btn.textContent = '⏳ Ejecutando...';
  result.classList.add('hidden');

  try {
    const r = await fetch(API_RESET_DEMO, { method: 'POST' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();

    // Tabla de facturas demo
    const filas = (data.facturas_demo || []).map(f => `
      <tr>
        <td>${f.folio_factura}</td>
        <td>${f.referencia_esperada}</td>
        <td>${formatMXN(f.monto)}</td>
        <td><span class="badge-resultado conciliado" style="background:rgba(46,204,113,.15);color:var(--ok)">&#10003; ${f.estatus}</span></td>
      </tr>`).join('');

    preview.innerHTML = `
      <table>
        <thead><tr><th>Folio</th><th>Referencia esperada</th><th>Monto</th><th>Estatus</th></tr></thead>
        <tbody>${filas}</tbody>
      </table>`;

    result.className = 'config-result-ok';
    result.innerHTML = `
      ✅ <strong>Reset ejecutado correctamente.</strong>
      <span class="config-stat">Conciliaciones históricas: <strong>${data.conciliaciones_historicas}</strong></span>
      <span class="config-stat">Resultados históricos: <strong>${data.resultados_historicos}</strong></span>`;
    result.classList.remove('hidden');

  } catch (err) {
    result.className = 'config-result-err';
    result.innerHTML = `❌ <strong>Error:</strong> ${err.message}`;
    result.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.textContent = '🔄 Ejecutar reset de demo';
  }
});
