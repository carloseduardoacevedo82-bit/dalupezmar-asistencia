/**
 * Utilidad de integración con EPP Control (https://epp-control-jmwd.onrender.com)
 * Permite sincronizar en tiempo real altas, modificaciones, bajas y eliminaciones con tolerancia a cold starts.
 */

const notificarHaciaEPPControl = async (action, data, maxRetries = 2) => {
  const eppUrl = process.env.EPP_CONTROL_URL || 'https://epp-control-jmwd.onrender.com';
  const apiKey = process.env.API_INTEGRATION_KEY || 'ag_erp_live_key_982347102938471209384';

  const payload = {
    action, // 'UPSERT' | 'DELETE' | 'STATUS'
    ...data,
    timestamp: new Date().toISOString()
  };

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000); // 15 segundos para tolerar cold-starts

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

      if (res.ok) {
        console.log(`[EPP Integration] Notificación exitosa (${action}) enviada a EPP Control.`);
        return true;
      } else {
        const errText = await res.text();
        console.warn(`[EPP Integration] Intento ${attempt}/${maxRetries} - Respuesta (${res.status}):`, errText);
      }
    } catch (err) {
      console.warn(`[EPP Integration] Intento ${attempt}/${maxRetries} - Error:`, err.message);
    }

    if (attempt < maxRetries) {
      await new Promise(r => setTimeout(r, 2500)); // Esperar 2.5s antes del siguiente intento
    }
  }

  return false;
};

module.exports = {
  notificarHaciaEPPControl
};
