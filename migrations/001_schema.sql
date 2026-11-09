-- ============ CLIENTES ============
CREATE TABLE IF NOT EXISTS clientes (
  cliente_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre      VARCHAR(200) NOT NULL,
  rfc         VARCHAR(13),
  activo      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO clientes (cliente_id, nombre) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Tesorería Demo SA de CV'),
  ('11111111-1111-1111-1111-111111111112', 'Grupo Industrial del Norte SA de CV'),
  ('11111111-1111-1111-1111-111111111113', 'Comercializadora del Bajío SA de CV'),
  ('11111111-1111-1111-1111-111111111114', 'Servicios Logísticos del Pacífico SA de CV'),
  ('11111111-1111-1111-1111-111111111115', 'Distribuidora Peninsular SA de CV')
ON CONFLICT (cliente_id) DO NOTHING;

-- ============ ERP CXC/CXP ============
CREATE TABLE IF NOT EXISTS erp_cxc_cxp (
  erp_id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id          UUID NOT NULL REFERENCES clientes(cliente_id),
  folio_factura       VARCHAR(50) NOT NULL,
  referencia_esperada VARCHAR(100),
  monto               NUMERIC(14,2) NOT NULL,
  moneda              VARCHAR(3) NOT NULL DEFAULT 'MXN',
  fecha_emision       DATE,
  fecha_vencimiento   DATE,
  estatus             VARCHAR(20) NOT NULL DEFAULT 'pendiente',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_erp_cliente ON erp_cxc_cxp (cliente_id);
CREATE INDEX IF NOT EXISTS idx_erp_referencia ON erp_cxc_cxp (referencia_esperada);

-- ============ MOVIMIENTOS BANCARIOS ============
CREATE TABLE IF NOT EXISTS movimientos_bancarios (
  movimiento_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id     UUID NOT NULL REFERENCES clientes(cliente_id),
  fecha          DATE NOT NULL,
  referencia     VARCHAR(100),
  monto          NUMERIC(14,2) NOT NULL,
  tipo           VARCHAR(20) NOT NULL DEFAULT 'abono',
  descripcion    TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mov_cliente ON movimientos_bancarios (cliente_id);
CREATE INDEX IF NOT EXISTS idx_mov_referencia ON movimientos_bancarios (referencia);

-- ============ CONCILIACIONES ============
CREATE TABLE IF NOT EXISTS conciliaciones (
  conciliacion_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  movimiento_id    UUID REFERENCES movimientos_bancarios(movimiento_id),
  erp_id           UUID REFERENCES erp_cxc_cxp(erp_id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============ RESULTADOS CONCILIACIÓN ============
CREATE TABLE IF NOT EXISTS resultados_conciliacion (
  id                      SERIAL PRIMARY KEY,
  conciliacion_id         UUID REFERENCES conciliaciones(conciliacion_id),
  cliente_id              UUID NOT NULL REFERENCES clientes(cliente_id),
  resultado               VARCHAR(20) NOT NULL,
  causa_excepcion         VARCHAR(100),
  regla_aplicada          VARCHAR(100),
  monto_conciliado        NUMERIC(14,2) DEFAULT 0,
  monto_discrepancia      NUMERIC(14,2) DEFAULT 0,
  tiempo_conciliacion_ms  INT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_res_cliente ON resultados_conciliacion (cliente_id);
CREATE INDEX IF NOT EXISTS idx_res_resultado ON resultados_conciliacion (resultado);

-- ============ RECOMENDACIONES IA ============
CREATE TABLE IF NOT EXISTS recomendaciones_ia (
  id               SERIAL PRIMARY KEY,
  cliente_id       UUID NOT NULL REFERENCES clientes(cliente_id),
  periodo          VARCHAR(7),
  resumen          TEXT,
  recomendaciones  JSONB,
  quick_wins       JSONB,
  riesgos          JSONB,
  modelo           VARCHAR(50),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ia_cliente ON recomendaciones_ia (cliente_id, created_at DESC);

-- ============ LOGS DE ACTIVIDAD ============
CREATE TABLE IF NOT EXISTS user_activity_logs (
  id          SERIAL PRIMARY KEY,
  session_id  VARCHAR(36),
  accion      VARCHAR(200) NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_logs_created ON user_activity_logs (created_at DESC);
