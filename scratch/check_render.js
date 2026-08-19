const https = require('https');

function check() {
  https.get('https://dalupezmar-asistencia.onrender.com/css/styles.css?v=5.0', (res) => {
    let data = '';
    res.on('data', c => data += c);
    res.on('end', () => {
      const isUpdated = data.includes('touch-action: pan-y pinch-zoom');
      console.log('📡 Render Deployment Live Status:', isUpdated ? '✅ ACTUALIZADO AL 100%' : '⏳ Construyendo en Render...');
      if (!isUpdated) {
        setTimeout(check, 5000);
      } else {
        process.exit(0);
      }
    });
  }).on('error', (e) => {
    console.error('Reintentando...', e.message);
    setTimeout(check, 5000);
  });
}

check();
