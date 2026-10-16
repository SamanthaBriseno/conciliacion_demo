// ============================================================
// SERVIDOR EXPRESS · Conciliación de pagos
// ============================================================

require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 5000;

// ============================================================
// MIDDLEWARES
// ============================================================
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ============================================================
// POSTGRES
// ============================================================
const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT) || 5432,
  database: process.env.PG_DATABASE || 'tesoreria',
  user: process.env.PG_USER || 'n8n',
  password: process.env.PG_PASSWORD,
});

pool.on('error', (err) => {
  console.error('❌ Error en Postgres pool:', err.message);
});

// ============================================================
// MULTER
// ============================================================
const upload = multer({
  dest: path.join(__dirname, 'uploads'),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Solo se aceptan PDFs'));
  },
});

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

// ============================================================
// HELPERS
// ============================================================
const CLIENTE_ID_DEFAULT = process.env.CLIENTE_ID || '11111111-1111-1111-1111-111111111111';

function archivoABase64(filePath) {
  const buffer = fs.readFileSync(filePath);
  return buffer.toString('base64');
}

function limpiarArchivo(filePath) {
  try { fs.unlinkSync(filePath); } catch (e) { /* ignore */ }
}

// ============================================================
// ENDPOINT 1: Recibir PDF y mandarlo a n8n
// ============================================================
app.post('/api/conciliar', upload.single('documento'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Falta el PDF' });
  }

  try {
    const base64 = archivoABase64(req.file.path);
    const cliente_id = req.body.cliente_id || CLIENTE_ID_DEFAULT;

    const payload = {
      cliente_id,
      archivo_nombre: req.file.originalname,
      archivo_base64: base64,
      extension: 'pdf',
    };

    console.log('📤 Enviando a n8n:', {
      cliente_id,
      archivo_nombre: req.file.originalname,
      base64_length: base64.length,
    });

    const resp = await fetch(process.env.N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) throw new Error(`n8n respondió ${resp.status}`);

    const resultado = await resp.json();
    console.log('✅ Respuesta de n8n:', resultado);

    limpiarArchivo(req.file.path);
    res.json(resultado);

  } catch (err) {
    console.error('❌ Error:', err.message);
    limpiarArchivo(req.file.path);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// ENDPOINT 2: KPIs
// ============================================================
app.get('/api/kpis', async (req, res) => {
  const clienteId = req.query.cliente_id || CLIENTE_ID_DEFAULT;

  try {
    const kpisQuery = `
      SELECT
        COUNT(*) FILTER (WHERE resultado = 'conciliado') AS conciliados,
        COUNT(*) FILTER (WHERE resultado = 'excepcion')  AS excepciones,
        COUNT(*)                                          AS total_movimientos,
        COALESCE(AVG(tiempo_conciliacion_ms), 0)::int    AS tiempo_promedio_ms,
        COALESCE(MIN(tiempo_conciliacion_ms), 0)::int    AS tiempo_minimo_ms,
        COALESCE(MAX(tiempo_conciliacion_ms), 0)::int    AS tiempo_maximo_ms,
        COALESCE(SUM(monto_conciliado), 0)               AS monto_conciliado,
        COALESCE(SUM(monto_discrepancia), 0)             AS monto_discrepancia
      FROM resultados_conciliacion
      WHERE cliente_id = $1::uuid;
    `;

    const causasQuery = `
      SELECT
        causa_excepcion AS causa,
        COUNT(*) AS total,
        COALESCE(SUM(monto_discrepancia), 0) AS monto
      FROM resultados_conciliacion
      WHERE cliente_id = $1::uuid
        AND causa_excepcion IS NOT NULL
      GROUP BY causa_excepcion
      ORDER BY total DESC;
    `;

    const [kpisRes, causasRes] = await Promise.all([
      pool.query(kpisQuery, [clienteId]),
      pool.query(causasQuery, [clienteId]),
    ]);

    const k = kpisRes.rows[0] || {};

    res.json({
      conciliados: Number(k.conciliados) || 0,
      excepciones: Number(k.excepciones) || 0,
      total_movimientos: Number(k.total_movimientos) || 0,
      tiempo_promedio_ms: Number(k.tiempo_promedio_ms) || 0,
      tiempo_minimo_ms: Number(k.tiempo_minimo_ms) || 0,
      tiempo_maximo_ms: Number(k.tiempo_maximo_ms) || 0,
      monto_conciliado: Number(k.monto_conciliado) || 0,
      monto_discrepancia: Number(k.monto_discrepancia) || 0,
      causas: causasRes.rows.map(c => ({
        causa: c.causa,
        total: Number(c.total) || 0,
        monto: Number(c.monto) || 0,
      })),
    });

  } catch (err) {
    console.error('❌ Error KPIs:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// ENDPOINT 3: Movimientos recientes
// ============================================================
app.get('/api/movimientos', async (req, res) => {
  const clienteId = req.query.cliente_id || CLIENTE_ID_DEFAULT;

  try {
    const query = `
      SELECT
        m.fecha,
        m.referencia,
        m.monto,
        m.tipo,
        c.resultado,
        c.causa_excepcion,
        c.regla_aplicada,
        c.tiempo_conciliacion_ms,
        e.folio_factura
      FROM movimientos_bancarios m
      LEFT JOIN conciliaciones c ON c.movimiento_id = m.movimiento_id
      LEFT JOIN erp_cxc_cxp e ON e.erp_id = c.erp_id
      WHERE m.cliente_id = $1::uuid
      ORDER BY m.created_at DESC
      LIMIT 20;
    `;

    const result = await pool.query(query, [clienteId]);
    res.json(result.rows);

  } catch (err) {
    console.error('❌ Error movimientos:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// ENDPOINT 4a: Última recomendación guardada
// ============================================================
app.get('/api/ia-recomendaciones', async (req, res) => {
  const clienteId = req.query.cliente_id || CLIENTE_ID_DEFAULT;
  try {
    const result = await pool.query(
      `SELECT r.*,
        (SELECT COUNT(*) FILTER (WHERE resultado='conciliado') FROM resultados_conciliacion WHERE cliente_id=$1::uuid) AS conciliados,
        (SELECT COUNT(*) FILTER (WHERE resultado='excepcion')  FROM resultados_conciliacion WHERE cliente_id=$1::uuid) AS excepciones,
        (SELECT COUNT(*)                                        FROM resultados_conciliacion WHERE cliente_id=$1::uuid) AS total,
        (SELECT json_agg(q) FROM (
          SELECT causa_excepcion AS causa, COUNT(*) AS total, COALESCE(SUM(monto_discrepancia),0) AS monto
          FROM resultados_conciliacion
          WHERE cliente_id=$1::uuid AND causa_excepcion IS NOT NULL
          GROUP BY causa_excepcion ORDER BY total DESC
        ) q) AS causas
       FROM recomendaciones_ia r
       WHERE r.cliente_id=$1::uuid
       ORDER BY r.created_at DESC LIMIT 1`,
      [clienteId]
    );
    if (result.rows.length === 0) return res.json(null);
    const row = result.rows[0];
    let recs = row.recomendaciones;
    if (typeof recs === 'string') { try { recs = JSON.parse(recs); } catch(e) { recs = []; } }
    const total = Number(row.total) || 0;
    const conciliados = Number(row.conciliados) || 0;
    res.json({
      resumen: row.resumen,
      recomendaciones: Array.isArray(recs) ? recs : [],
      quick_wins: row.quick_wins || [],
      riesgos: row.riesgos || [],
      modelo: row.modelo,
      causas: row.causas || [],
      total,
      conciliados,
      excepciones: Number(row.excepciones) || 0,
      tasa_conciliacion: total > 0 ? Number(((conciliados / total) * 100).toFixed(1)) : 0,
      created_at: row.created_at,
      periodo: row.periodo,
    });
  } catch (err) {
    console.error('❌ Error IA GET:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// ENDPOINT 4b: Generar nueva recomendación IA
// ============================================================
app.post('/api/ia-recomendaciones', async (req, res) => {
  const clienteId = req.body.cliente_id || CLIENTE_ID_DEFAULT;

  try {
    const causasQuery = `
      SELECT
        causa_excepcion AS causa,
        COUNT(*) AS total,
        COALESCE(SUM(monto_discrepancia), 0) AS monto_total
      FROM resultados_conciliacion
      WHERE cliente_id = $1::uuid
        AND causa_excepcion IS NOT NULL
      GROUP BY causa_excepcion
      ORDER BY total DESC;
    `;

    const totalesQuery = `
      SELECT
        COUNT(*) FILTER (WHERE resultado = 'conciliado') AS conciliados,
        COUNT(*) FILTER (WHERE resultado = 'excepcion')  AS excepciones,
        COUNT(*)                                          AS total
      FROM resultados_conciliacion
      WHERE cliente_id = $1::uuid;
    `;

    const [causasRes, totalesRes] = await Promise.all([
      pool.query(causasQuery, [clienteId]),
      pool.query(totalesQuery, [clienteId]),
    ]);

    const causas = causasRes.rows;
    const t = totalesRes.rows[0] || {};
    const total = Number(t.total) || 0;
    const conciliados = Number(t.conciliados) || 0;
    const excepciones = Number(t.excepciones) || 0;
    const tasaConciliacion = total > 0 ? ((conciliados / total) * 100).toFixed(1) : 0;

    const causasTexto = causas.length > 0
      ? causas.map(c => `- ${c.causa}: ${c.total} casos, $${Number(c.monto_total).toLocaleString('es-MX')}`).join('\n')
      : '- No hay excepciones registradas';

    const prompt = `Eres un analista de tesorería. Analiza estos datos de conciliación de pagos y genera recomendaciones concretas para mejorar el proceso.

=== RESUMEN ===
- Total movimientos: ${total}
- Conciliados automáticamente: ${conciliados} (${tasaConciliacion}%)
- En excepción: ${excepciones}

=== CAUSAS DE EXCEPCIÓN ===
${causasTexto}

=== INSTRUCCIONES ===
Responde en español, en formato JSON con esta estructura exacta (sin texto extra fuera del JSON):
{
  "resumen": "Una frase de 1-2 líneas sobre el estado general",
  "recomendaciones": [
    { "titulo": "Título corto", "descripcion": "Descripción accionable", "impacto": "alto|medio|bajo", "esfuerzo": "alto|medio|bajo" }
  ],
  "quick_wins": ["Acción rápida 1", "Acción rápida 2"],
  "riesgos": ["Riesgo 1 a monitorear", "Riesgo 2"]
}

Sé específico. Menciona las causas principales y sugiere acciones concretas de tesorería.`;

    console.log('🤖 Llamando a Ollama...');
    const ollamaResp = await fetch(process.env.OLLAMA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OLLAMA_MODEL || 'llama3.2',
        prompt,
        stream: false,
      }),
    });

    if (!ollamaResp.ok) throw new Error(`Ollama respondió ${ollamaResp.status}`);

    const ollamaData = await ollamaResp.json();
    const respuestaTexto = ollamaData.response || '';
    console.log('✅ Respuesta de Ollama recibida');

    let parsed;
    try {
      const match = respuestaTexto.match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : null;
    } catch (e) {
      console.warn('No se pudo parsear JSON de Ollama:', e.message);
      parsed = null;
    }

    if (!parsed || !parsed.recomendaciones) {
      parsed = {
        resumen: 'Análisis generado. Revisa las causas principales para priorizar acciones.',
        recomendaciones: [
          { titulo: 'Revisar referencias de pago', descripcion: 'Validar que los comprobantes incluyan la referencia exacta del ERP.', impacto: 'alto', esfuerzo: 'bajo' },
          { titulo: 'Ajustar tolerancias de monto', descripcion: 'Considerar una tolerancia del 0.5% para diferencias por redondeo.', impacto: 'medio', esfuerzo: 'bajo' },
          { titulo: 'Capacitar al equipo', descripcion: 'Revisar el proceso de captura de fechas y montos con el equipo de tesorería.', impacto: 'medio', esfuerzo: 'medio' },
        ],
        quick_wins: [
          'Estandarizar el formato de referencia en todos los comprobantes.',
          'Activar alertas automáticas para excepciones de monto mayor a $10,000.',
        ],
        riesgos: [
          'Acumulación de excepciones sin resolver puede afectar el flujo de caja.',
          'Referencias duplicadas pueden generar conciliaciones incorrectas.',
        ],
      };
    }

    await pool.query(
      `INSERT INTO recomendaciones_ia
        (cliente_id, periodo, resumen, recomendaciones, modelo)
       VALUES ($1::uuid, $2, $3, $4::jsonb, $5)`,
      [
        clienteId,
        new Date().toISOString().slice(0, 7),
        parsed.resumen,
        JSON.stringify(parsed.recomendaciones),
        process.env.OLLAMA_MODEL || 'llama3.2',
      ]
    );

    res.json({
      resumen: parsed.resumen,
      recomendaciones: parsed.recomendaciones,
      quick_wins: parsed.quick_wins || [],
      riesgos: parsed.riesgos || [],
      modelo: process.env.OLLAMA_MODEL || 'llama3.2',
      causas,
      total,
      conciliados,
      excepciones,
      tasa_conciliacion: Number(tasaConciliacion),
      created_at: new Date().toISOString(),
    });

  } catch (err) {
    console.error('❌ Error IA:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// ENDPOINT 5: Reset demo
// ============================================================
app.post('/api/reset-demo', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Borrar resultados_conciliacion ligados a conciliaciones DEMO
    //    (por erp_id de facturas DEMO o por movimiento_id de movimientos DEMO)
    await client.query(`
      DELETE FROM resultados_conciliacion
      WHERE conciliacion_id IN (
        SELECT c.conciliacion_id FROM conciliaciones c
        LEFT JOIN erp_cxc_cxp e ON e.erp_id = c.erp_id
        WHERE e.folio_factura LIKE 'DEMO-%'
           OR c.movimiento_id IN (
             SELECT movimiento_id FROM movimientos_bancarios
             WHERE referencia IN ('REF-1001','REF-1004','REF-1006','REF-1010')
           )
      )`);

    // 2. Borrar conciliaciones DEMO
    await client.query(`
      DELETE FROM conciliaciones
      WHERE erp_id IN (SELECT erp_id FROM erp_cxc_cxp WHERE folio_factura LIKE 'DEMO-%')
         OR movimiento_id IN (
           SELECT movimiento_id FROM movimientos_bancarios
           WHERE referencia IN ('REF-1001','REF-1004','REF-1006','REF-1010')
         )`);

    // 3. Borrar movimientos bancarios DEMO
    await client.query(`
      DELETE FROM movimientos_bancarios
      WHERE referencia IN ('REF-1001','REF-1004','REF-1006','REF-1010')`);

    // 4. Regresar facturas DEMO a pendiente
    await client.query(`
      UPDATE erp_cxc_cxp SET estatus = 'pendiente'
      WHERE folio_factura LIKE 'DEMO-%'`);

    const facturas = await client.query(`
      SELECT folio_factura, referencia_esperada, monto, estatus
      FROM erp_cxc_cxp WHERE folio_factura LIKE 'DEMO-%'
      ORDER BY folio_factura`);

    const [conciliaciones, resultados] = await Promise.all([
      client.query(`SELECT COUNT(*) AS total FROM conciliaciones`),
      client.query(`SELECT COUNT(*) AS total FROM resultados_conciliacion`),
    ]);

    await client.query('COMMIT');
    console.log('🔄 Reset demo ejecutado');

    res.json({
      ok: true,
      facturas_demo: facturas.rows,
      conciliaciones_historicas: Number(conciliaciones.rows[0].total),
      resultados_historicos: Number(resultados.rows[0].total),
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error reset demo:', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ============================================================
// INICIO
// ============================================================
app.listen(PORT, () => {
  console.log('============================================================');
  console.log(`🚀 Servidor Express escuchando en http://localhost:${PORT}`);
  console.log(`📁 Sirviendo frontend desde ./public`);
  console.log(`🌐 Webhook n8n: ${process.env.N8N_WEBHOOK_URL}`);
  console.log(`🗄️  Postgres: ${process.env.PG_DATABASE}@${process.env.PG_HOST}:${process.env.PG_PORT}`);
  console.log(`🤖 Ollama: ${process.env.OLLAMA_URL} (${process.env.OLLAMA_MODEL})`);
  console.log('============================================================');
});
