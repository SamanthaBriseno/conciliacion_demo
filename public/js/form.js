// ============================================================
// FORMULARIO DE SUBIDA DE COMPROBANTE
// ============================================================

const dropZone      = document.getElementById('drop-zone');
const fileInput     = document.getElementById('file-input');
const fileName      = document.getElementById('file-name');
const pdfPreview    = document.getElementById('pdf-preview');
const pdfFrame      = document.getElementById('pdf-frame');
const btnSubmit     = document.getElementById('btn-submit');
const resultado     = document.getElementById('resultado');
const clienteSelect = document.getElementById('cliente-select');

let archivoSeleccionado = null;

// ---------- Drag & drop ----------
dropZone.addEventListener('click', () => fileInput.click());

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('dragover');
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file) manejarArchivo(file);
});

fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) manejarArchivo(file);
});

// ---------- Procesar archivo seleccionado ----------
function manejarArchivo(file) {
  if (file.type !== 'application/pdf') {
    alert('Solo se aceptan archivos PDF');
    return;
  }
  archivoSeleccionado = file;
  fileName.textContent = `${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
  btnSubmit.disabled = false;

  const url = URL.createObjectURL(file);
  pdfFrame.src = url;
  pdfPreview.classList.remove('hidden');
}

// ---------- Enviar al backend Express ----------
btnSubmit.addEventListener('click', async () => {
  if (!archivoSeleccionado) return;

  btnSubmit.disabled = true;
  btnSubmit.textContent = 'Procesando…';
  resultado.classList.add('hidden');

  try {
    const clienteId = clienteSelect ? clienteSelect.value : '';

    if (!clienteId) {
      throw new Error('No se pudo leer el cliente del selector');
    }

    // Construir FormData
    const formData = new FormData();
    formData.append('documento', archivoSeleccionado);
    formData.append('cliente_id', clienteId);

    console.log('📤 Enviando a Express:', {
      archivo: archivoSeleccionado.name,
      cliente_id: clienteId,
    });

    const resp = await fetch(WEBHOOK_URL, {
      method: 'POST',
      body: formData,   // ⚠️ SIN headers, el navegador pone el Content-Type
    });

    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    const data = await resp.json();
    console.log('✅ Respuesta:', data);
    mostrarResultado(data);

  } catch (err) {
    console.error('❌ Error:', err);
    resultado.className = 'resultado error';
    resultado.innerHTML = `<h4>Error al procesar</h4><p>${err.message}</p>`;
    resultado.classList.remove('hidden');
  } finally {
    btnSubmit.disabled = false;
    btnSubmit.textContent = 'Enviar y conciliar';
  }
});

// ---------- Render del resultado ----------
function mostrarResultado(data) {
  if (!data.resultado) {
    resultado.className = 'resultado';
    resultado.innerHTML = `
      <h4>📥 Movimiento registrado (pendiente de conciliar)</h4>
      <dl>
        <dt>Movimiento ID</dt> <dd>${data.movimiento_id || '—'}</dd>
        <dt>Referencia</dt>    <dd>${data.referencia || '—'}</dd>
        <dt>Monto</dt>         <dd>${formatMXN(data.monto)}</dd>
        <dt>Fecha</dt>         <dd>${formatFecha(data.fecha)}</dd>
      </dl>
    `;
    resultado.classList.remove('hidden');
    return;
  }

  const esExcepcion = data.resultado === 'excepcion';
  resultado.className = `resultado ${esExcepcion ? 'excepcion' : ''}`;
  resultado.innerHTML = `
    <h4>${esExcepcion ? '⚠️ Movimiento en excepción' : '✅ Movimiento conciliado'}</h4>
    <dl>
      <dt>Referencia</dt>       <dd>${data.referencia || '—'}</dd>
      <dt>Monto</dt>            <dd>${formatMXN(data.monto)}</dd>
      <dt>Fecha</dt>            <dd>${formatFecha(data.fecha)}</dd>
      <dt>Factura ERP</dt>      <dd>${data.folio_factura || 'Sin match'}</dd>
      <dt>Regla aplicada</dt>   <dd>${data.regla_aplicada || '—'}</dd>
      <dt>Causa</dt>            <dd>${data.causa_excepcion || '—'}</dd>
      <dt>Tiempo</dt>           <dd>${data.tiempo_conciliacion_ms || 0} ms</dd>
    </dl>
  `;
  resultado.classList.remove('hidden');
}