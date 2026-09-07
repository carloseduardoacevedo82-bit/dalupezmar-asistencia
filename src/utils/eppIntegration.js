/**
 * Utilidad de integración con EPP Control (https://epp-control-jmwd.onrender.com)
 * Permite sincronizar en tiempo real altas, modificaciones, bajas y eliminaciones.
 */

const notificarHaciaEPPControl = async (action, data) => {
  const eppUrl = process.env.EPP_CONTROL_URL || 'https://epp-control-jmwd.onrender.com';
  const apiKey = process.env.API_INTEGRATION_KEY || 'ag_erp_live_key_982347102938471209384';

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const payload = {
      action, // 'UPSERT' | 'DELETE' | 'STATUS'
      ...data,
      timestamp: new Date().toISOString()
    };

    const res = await fetch(`${eppUrl}/api/sync-asistencia/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    clearTimeout(timeout);
    if (!res.ok) {
      const errText = await res.text();
      console.warn(`[EPP Integration] Respuesta no OK (${res.status}):`, errText);
    }
  } catch (err) {
    console.warn('[EPP Integration] Error al notificar a EPP Control:', err.message);
  }
};

module.exports = {
  notificarHaciaEPPControl
};
