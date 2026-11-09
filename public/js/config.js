// ============================================================
// CONFIGURACIÓN GLOBAL
// ============================================================

// Rutas relativas — funcionan sin importar host ni puerto
const WEBHOOK_URL       = `/api/conciliar`;
const API_KPIS          = `/api/kpis`;
const API_MOVIMIENTOS   = `/api/movimientos`;
const API_IA            = `/api/ia-recomendaciones`;
const API_RESET_DEMO    = `/api/reset-demo`;
const API_LOGS          = `/api/logs`;

// Cliente demo
const CLIENTE_ID = '11111111-1111-1111-1111-111111111111';

// Session ID único por visita
const SESSION_ID = crypto.randomUUID();

function logAction(accion) {
  fetch(API_LOGS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: SESSION_ID, accion }),
  }).catch(() => {});
}

// Helpers
const formatMXN = (n) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n || 0);

const formatFecha = (iso) => {
  if (!iso) return '—';
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  const fecha = new Date(y, m - 1, d);
  return fecha.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
};