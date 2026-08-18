# Sistema Integral de Control de Asistencia y Emisión de Fotochecks CR80

Sistema empresarial Full-Stack para gestión de recursos humanos, control de asistencia en tiempo real multimodal (Kiosco con cámara web/móvil, lector de código de barras USB y marcación remota GPS) y emisión/diseño de fotochecks digitales e imprimibles con códigos QR criptográficos y códigos de barras Code 128.

---

## 🏛️ Arquitectura Técnica

- **Backend:** Node.js + Express, motor de base de datos relacional nativo `node:sqlite` con modo WAL de alta velocidad, JWT para RBAC y bcrypt.
- **Frontend:** HTML5 semántico, Tailwind CSS + Glassmorphism UI, `html5-qrcode` para lectura continua de cámara, `qrcode.js` y `JsBarcode` para renderizado vectorial, `jspdf` y `html2canvas` para carnets en alta resolución, `SheetJS` para exportación a Excel.
- **Estándar de Credencial:** Norma ISO/IEC 7810 ID-1 / Formato CR80 (85.60 mm × 53.98 mm).
- **Interoperabilidad:** API REST v1 con cabecera `X-API-KEY` para integración con sistemas ERP/Planillas externos.

---

## 📂 Módulos del Sistema

1. **Panel Administrativo (Dashboard) (`/dashboard.html`):**
   - Métricas en vivo de presentes, tardanzas acumuladas, ausentes calculados en tiempo real y porcentaje de puntualidad.
   - Gráficos interactivos de tendencias semanales y cobertura por departamento con Chart.js.
   - Bandeja de revisión y aprobación/rechazo de solicitudes de justificación y descansos médicos.

2. **Diseñador y Emisor de Fotochecks (`/badge-designer.html`):**
   - Visualizador interactivo 3D con giro (Anverso y Reverso).
   - Generación dinámica de QR con hash criptográfico único y Código de barras Code 128.
   - 6 Temas visuales corporativos intercambiables.
   - Impresión directa individual calibrada (CR80) y descarga en PDF de alta resolución.
   - Emisión masiva en lote optimizada para hojas A4 con líneas de corte.

3. **Modo Kiosco de Asistencia (`/kiosk.html`):**
   - Escaneo continuo mediante cámara web o smartphone.
   - Compatibilidad con pistolas lectoras de barras/QR USB (Hardware Wedge).
   - Síntesis de sonido Web Audio API (bips de confirmación / advertencias).
   - Tarjeta flotante instantánea con foto, nombre, cargo y cálculo de tardanza.
   - Teclado numérico virtual táctil para marcación por DNI.

4. **Portal de Marcación Remota (`/remote-attendance.html`):**
   - Interfaz mobile-first para colaboradores en teletrabajo o en campo.
   - Validación satelital por GPS y cálculo de distancia a la sede más cercana.

5. **Gestión de Personal y Horarios (`/employees.html`):**
   - Ficha maestra de colaboradores con foto, sedes, cargos, turnos y contactos de emergencia.
   - Emisión automática de credencial al crear el colaborador.

6. **Tareo y Exportación para Planillas (`/reports.html`):**
   - Filtros avanzados por rango de fechas, áreas y estado.
   - Cálculo automático de horas efectivas trabajadas y horas extras.
   - Exportación directa a **Excel (.xlsx)** y **CSV**.

---

## 🚀 Puesta en Marcha Rápida

### 1. Requisitos
- Node.js versión 20 o 24 (con motor nativo `node:sqlite`).

### 2. Instalación de Dependencias
```bash
npm install
```

### 3. Inicialización de Base de Datos y Datos Demo
```bash
npm run db:init
```

### 4. Iniciar Servidor
```bash
npm start
```
El sistema estará disponible en: **http://localhost:3000**

---

## 🔑 Credenciales por Defecto

- **Usuario Administrador:** `admin`
- **Contraseña:** `admin123`
- **API Key Maestra para ERP:** `ag_erp_live_key_982347102938471209384`
