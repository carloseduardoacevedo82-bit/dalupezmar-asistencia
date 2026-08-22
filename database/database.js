/**
 * ============================================================================
 * ADAPTADOR DE BASE DE DATOS RESILIENTE PARA POSTGRESQL (DALUPEZMAR)
 * ============================================================================
 * Compatible con Render Managed Postgres, Supabase, Neon y AWS RDS.
 * Gestiona reconexiones automáticas, pooling seguro y tolerancia a cold starts.
 */

require('dotenv').config();
const { Pool } = require('pg');

const rawConnectionString = process.env.DATABASE_URL || 
  'postgresql://postgres.vsqqvpejgmamcwqpdzze:Dalupezmar2026!@aws-0-us-east-1.pooler.supabase.com:6543/postgres';

const poolConfig = {
  connectionString: rawConnectionString,
  ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false },
  max: parseInt(process.env.DB_POOL_MAX || '20', 10),
  min: parseInt(process.env.DB_POOL_MIN || '2', 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  allowExitOnIdle: false
};

const pool = new Pool(poolConfig);

// Manejador de errores en clientes inactivos del pool
pool.on('error', (err, client) => {
  console.error('⚠️ [PostgreSQL Pool Error]: Error inesperado en cliente inactivo:', err.message);
});

pool.on('connect', () => {
  // Conexión exitosa obtenida del pool
});

/**
 * Ejecuta una consulta SQL parametrizada
 * @param {string} text Sentencia SQL con marcadores $1, $2, etc.
 * @param {Array} params Parámetros de la consulta
 * @returns {Promise<import('pg').QueryResult>}
 */
async function query(text, params = []) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    if (process.env.DEBUG_SQL === 'true') {
      console.log(`⏱️ [SQL ${duration}ms]:`, text.substring(0, 100), params);
    }
    return res;
  } catch (error) {
    console.error('❌ [SQL Execution Error]:', error.message, '\nQuery:', text, '\nParams:', params);
    throw error;
  }
}

/**
 * Obtiene un cliente del pool para operaciones manuales o transacciones
 */
async function getClient() {
  const client = await pool.connect();
  return client;
}

/**
 * Ejecuta un bloque de código dentro de una transacción gestionada
 * @param {Function} callback Función asíncrona que recibe el cliente de la transacción
 */
async function transaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Comprueba el estado de la conexión a la base de datos (Healthcheck)
 * @returns {Promise<{ ok: boolean, latencyMs: number, error?: string }>}
 */
async function pingDb() {
  const start = Date.now();
  try {
    const res = await pool.query('SELECT 1 as alive;');
    const latency = Date.now() - start;
    if (res && res.rows && res.rows[0] && res.rows[0].alive === 1) {
      return { ok: true, latencyMs: latency };
    }
    return { ok: false, latencyMs: latency, error: 'Respuesta inesperada de la BD' };
  } catch (error) {
    return { ok: false, latencyMs: Date.now() - start, error: error.message };
  }
}

// Cierre elegante del pool
process.on('SIGINT', async () => {
  try {
    await pool.end();
  } catch (e) {}
  process.exit(0);
});

process.on('SIGTERM', async () => {
  try {
    await pool.end();
  } catch (e) {}
  process.exit(0);
});

module.exports = {
  pool,
  query,
  getClient,
  transaction,
  pingDb
};
