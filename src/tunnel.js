const localtunnel = require('localtunnel');

async function startTunnel() {
  try {
    const tunnel = await localtunnel({
      port: 3050,
      subdomain: 'dalupezmar-asistencia-' + Math.floor(1000 + Math.random() * 9000)
    });

    console.log('===========================================================');
    console.log('🌐 CONEXIÓN EN LA NUBE ACTIVA (HTTPS)');
    console.log(`🔗 URL Nube Pública: ${tunnel.url}`);
    console.log('📱 Kiosco Móvil: ' + tunnel.url + '/kiosk.html');
    console.log('📲 Marcación Remota Móvil: ' + tunnel.url + '/remote-attendance.html');
    console.log('💻 Panel Administrativo: ' + tunnel.url + '/dashboard.html');
    console.log('===========================================================');

    tunnel.on('close', () => {
      console.log('⚠️ Túnel en la nube cerrado, reconectando...');
      setTimeout(startTunnel, 5000);
    });

    tunnel.on('error', (err) => {
      console.error('❌ Error en túnel:', err.message);
      try { tunnel.close(); } catch(e){}
    });
  } catch (err) {
    console.error('❌ Error al iniciar túnel:', err.message);
    setTimeout(startTunnel, 5000);
  }
}

startTunnel();
