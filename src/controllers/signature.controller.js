/**
 * ============================================================================
 * CONTROLADOR TRANSACCIONAL DE DOCUMENTOS Y PORTAL DE FIRMAS
 * ============================================================================
 * Maneja el ciclo de vida seguro de firma de contratos, boletas y fichas.
 */

const db = require('../../database/database');
const { successResponse, errorResponse } = require('../utils/responseHandler');

/**
 * Función auxiliar para realizar el despacho HTTP al portal de firmas
 */
async function callSignaturePortalApi(portalUrl, payload, timeoutMs = 8000) {
  // Si no hay URL configurada en .env, simular despacho exitoso con ID externo
  if (!portalUrl || portalUrl === 'http://mock-signature-portal.local') {
    // Si el payload tiene un flag simulado de error para testing, simular fallo
    if (payload.simulate_error) {
      throw new Error('Timeout / Error simulado de conexión con el portal de firma');
    }
    return {
      success: true,
      external_id: `SIGN-EXT-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      status: 'SENT'
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(portalUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Signature-Source': 'DALUPEZMAR-RRHH-PERSISTENCE'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errText = await response.text().catch(() => 'Error HTTP');
      throw new Error(`Portal de firmas respondió HTTP ${response.status}: ${errText}`);
    }

    const data = await response.json().catch(() => ({}));
    return {
      success: true,
      external_id: data.external_id || data.id || data.signature_id || `PORTAL-${Date.now()}`,
      data
    };
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

/**
 * 1. Envío transaccional a firma electrónica
 * Flujo en 4 pasos:
 *   1. Inserción inicial en BD con estado "PENDIENTE_ENVIO".
 *   2. Llamada a API / webhook del portal de firma.
 *   3. Si responde OK, actualización a "ENVIADO_A_FIRMA" con external_id.
 *   4. Si falla o da timeout, actualización a "FALLO_ENVIO" con log del error sin perder datos.
 */
const sendDocumentForSignature = async (req, res) => {
  try {
    const {
      trabajador_id,
      dni,
      tipo_doc = 'CONTRATO',
      url_documento,
      metadata = {},
      simulate_error = false
    } = req.body;

    if (!url_documento) {
      return errorResponse(res, 'La propiedad url_documento es obligatoria.', null, 400);
    }

    // 1. Identificar al trabajador
    let employee = null;
    if (trabajador_id) {
      const empRes = await db.query('SELECT * FROM employees WHERE id = $1', [Number(trabajador_id)]);
      employee = empRes.rows[0];
    } else if (dni) {
      const empRes = await db.query('SELECT * FROM employees WHERE document_number = $1', [String(dni).trim()]);
      employee = empRes.rows[0];
    }

    if (!employee) {
      return errorResponse(res, 'Trabajador no encontrado en el sistema.', null, 404);
    }

    const validTypes = ['CONTRATO', 'BOLETA', 'FICHA_INGRESO', 'DECLARACION_JURADA', 'ENTREGA_EPP', 'MEMORANDUM', 'OTRO'];
    const resolvedTipoDoc = validTypes.includes(tipo_doc) ? tipo_doc : 'CONTRATO';

    // PASO 1: Guardar primero en BD con estado "PENDIENTE_ENVIO"
    const insertRes = await db.query(`
      INSERT INTO documentos_firma (
        trabajador_id, tipo_doc, url_documento, estado_firma, intentos_envio, metadata
      ) VALUES ($1, $2, $3, 'PENDIENTE_ENVIO', 0, $4)
      RETURNING *;
    `, [employee.id, resolvedTipoDoc, url_documento.trim(), JSON.stringify(metadata)]);

    const docRecord = insertRes.rows[0];

    // PASO 2: Llamada a la API / webhook del portal de firma
    const portalUrl = process.env.SIGNATURE_PORTAL_URL || 'http://mock-signature-portal.local';
    const payload = {
      document_id: docRecord.id,
      worker: {
        id: employee.id,
        dni: employee.document_number,
        name: `${employee.first_name} ${employee.last_name}`,
        email: employee.email,
        phone: employee.phone
      },
      document_type: resolvedTipoDoc,
      document_url: url_documento.trim(),
      metadata,
      simulate_error
    };

    let dispatchResult;
    try {
      dispatchResult = await callSignaturePortalApi(portalUrl, payload, 8000);

      // PASO 3: Si la API responde con éxito, actualizar a "ENVIADO_A_FIRMA"
      const updatedRes = await db.query(`
        UPDATE documentos_firma SET
          estado_firma = 'ENVIADO_A_FIRMA',
          portal_firma_id = $1,
          intentos_envio = intentos_envio + 1,
          fecha_envio = CURRENT_TIMESTAMP,
          ultimo_error = NULL,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING *;
      `, [dispatchResult.external_id, docRecord.id]);

      return successResponse(res, 'Documento despachado y enviado a firma exitosamente.', updatedRes.rows[0], 200);
    } catch (apiError) {
      // PASO 4: Si falla o da timeout, conservar el registro y marcar "FALLO_ENVIO"
      console.warn(`⚠️ [Portal de Firma Error] Fallo al despachar documento #${docRecord.id}:`, apiError.message);

      const failedRes = await db.query(`
        UPDATE documentos_firma SET
          estado_firma = 'FALLO_ENVIO',
          intentos_envio = intentos_envio + 1,
          ultimo_error = $1,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING *;
      `, [apiError.message, docRecord.id]);

      return successResponse(res, 'El documento fue guardado en el sistema pero el portal de firmas no respondió. Se programó para reintento automático.', {
        ...failedRes.rows[0],
        requires_retry: true
      }, 202);
    }
  } catch (error) {
    console.error('Error general en sendDocumentForSignature:', error);
    return errorResponse(res, 'Error al procesar el envío de documento a firma.', error.message);
  }
};

/**
 * 2. Reintento masivo o individual de documentos fallidos
 */
const retryFailedSignatures = async (req, res) => {
  try {
    const { document_id } = req.body;

    let query = `
      SELECT df.*, e.first_name, e.last_name, e.document_number, e.email, e.phone
      FROM documentos_firma df
      JOIN employees e ON df.trabajador_id = e.id
      WHERE df.estado_firma IN ('FALLO_ENVIO', 'PENDIENTE_REINTENTO', 'PENDIENTE_ENVIO')
    `;
    const params = [];

    if (document_id) {
      query += ` AND df.id = $1`;
      params.push(Number(document_id));
    }

    query += ` ORDER BY df.id ASC LIMIT 20`;

    const pendingRes = await db.query(query, params);
    const docs = pendingRes.rows;

    if (docs.length === 0) {
      return successResponse(res, 'No hay documentos pendientes de reintento.', { retried: 0, succeeded: 0, failed: 0 });
    }

    const portalUrl = process.env.SIGNATURE_PORTAL_URL || 'http://mock-signature-portal.local';
    const results = {
      retried: docs.length,
      succeeded: 0,
      failed: 0,
      details: []
    };

    for (const doc of docs) {
      const payload = {
        document_id: doc.id,
        worker: {
          id: doc.trabajador_id,
          dni: doc.document_number,
          name: `${doc.first_name} ${doc.last_name}`,
          email: doc.email,
          phone: doc.phone
        },
        document_type: doc.tipo_doc,
        document_url: doc.url_documento
      };

      try {
        const dispatch = await callSignaturePortalApi(portalUrl, payload, 8000);
        await db.query(`
          UPDATE documentos_firma SET
            estado_firma = 'ENVIADO_A_FIRMA',
            portal_firma_id = $1,
            intentos_envio = intentos_envio + 1,
            fecha_envio = CURRENT_TIMESTAMP,
            ultimo_error = NULL,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = $2
        `, [dispatch.external_id, doc.id]);

        results.succeeded++;
        results.details.push({ id: doc.id, status: 'ENVIADO_A_FIRMA', portal_id: dispatch.external_id });
      } catch (err) {
        await db.query(`
          UPDATE documentos_firma SET
            estado_firma = 'FALLO_ENVIO',
            intentos_envio = intentos_envio + 1,
            ultimo_error = $1,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = $2
        `, [err.message, doc.id]);

        results.failed++;
        results.details.push({ id: doc.id, status: 'FALLO_ENVIO', error: err.message });
      }
    }

    return successResponse(res, `Proceso de reintento finalizado: ${results.succeeded} enviados, ${results.failed} fallidos.`, results);
  } catch (error) {
    return errorResponse(res, 'Error en proceso de reintento de firmas.', error.message);
  }
};

/**
 * 3. Listar documentos por trabajador
 */
const getWorkerDocuments = async (req, res) => {
  try {
    const { workerId } = req.params;

    const docsRes = await db.query(`
      SELECT 
        df.*,
        e.first_name,
        e.last_name,
        e.document_number,
        e.employee_code
      FROM documentos_firma df
      JOIN employees e ON df.trabajador_id = e.id
      WHERE df.trabajador_id = $1 OR e.document_number = $2
      ORDER BY df.created_at DESC
    `, [Number(workerId) || 0, String(workerId).trim()]);

    return successResponse(res, 'Documentos del trabajador recuperados.', docsRes.rows);
  } catch (error) {
    return errorResponse(res, 'Error al consultar documentos del trabajador.', error.message);
  }
};

/**
 * 4. Listar todos los documentos con filtros
 */
const getAllDocuments = async (req, res) => {
  try {
    const { estado_firma, tipo_doc, trabajador_id } = req.query;

    let query = `
      SELECT 
        df.*,
        e.first_name,
        e.last_name,
        e.document_number,
        e.employee_code,
        p.name as position_name,
        d.name as department_name
      FROM documentos_firma df
      JOIN employees e ON df.trabajador_id = e.id
      LEFT JOIN positions p ON e.position_id = p.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE 1=1
    `;
    const params = [];
    let pIdx = 1;

    if (estado_firma) {
      query += ` AND df.estado_firma = $${pIdx}`;
      params.push(estado_firma);
      pIdx++;
    }

    if (tipo_doc) {
      query += ` AND df.tipo_doc = $${pIdx}`;
      params.push(tipo_doc);
      pIdx++;
    }

    if (trabajador_id) {
      query += ` AND df.trabajador_id = $${pIdx}`;
      params.push(Number(trabajador_id));
      pIdx++;
    }

    query += ` ORDER BY df.created_at DESC LIMIT 200`;

    const result = await db.query(query, params);
    return successResponse(res, 'Lista de documentos de firma.', result.rows);
  } catch (error) {
    return errorResponse(res, 'Error al consultar documentos de firma.', error.message);
  }
};

/**
 * 5. Webhook callback del portal de firma para actualizar estado (FIRMADO, RECHAZADO, etc.)
 */
const handleSignatureWebhook = async (req, res) => {
  try {
    const { portal_firma_id, document_id, event, signed_url, timestamp } = req.body;

    if (!portal_firma_id && !document_id) {
      return errorResponse(res, 'portal_firma_id o document_id requerido.', null, 400);
    }

    let newStatus = 'FIRMADO';
    if (event === 'REJECTED' || event === 'RECHAZADO') {
      newStatus = 'RECHAZADO';
    } else if (event === 'EXPIRED' || event === 'EXPIRADO') {
      newStatus = 'EXPIRADO';
    }

    const updatedRes = await db.query(`
      UPDATE documentos_firma SET
        estado_firma = $1::varchar,
        url_documento = COALESCE($2, url_documento),
        fecha_firma = CASE WHEN $1::varchar = 'FIRMADO' THEN CURRENT_TIMESTAMP ELSE fecha_firma END,
        updated_at = CURRENT_TIMESTAMP
      WHERE (portal_firma_id IS NOT NULL AND portal_firma_id = $3) OR id = $4
      RETURNING *;
    `, [newStatus, signed_url || null, portal_firma_id || 'UNKNOWN', Number(document_id) || 0]);

    if (updatedRes.rows.length === 0) {
      return errorResponse(res, 'Documento no encontrado para actualizar vía webhook.', null, 404);
    }

    return successResponse(res, `Estado del documento actualizado a ${newStatus} por webhook.`, updatedRes.rows[0]);
  } catch (error) {
    console.error('Error en webhook de firma:', error);
    return errorResponse(res, 'Error procesando webhook de firma.', error.message);
  }
};

module.exports = {
  sendDocumentForSignature,
  retryFailedSignatures,
  getWorkerDocuments,
  getAllDocuments,
  handleSignatureWebhook
};
