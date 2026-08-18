-- ============================================================================
-- DATOS INICIALES Y DE PRUEBA (SEED DATA)
-- ============================================================================

-- 1. USUARIOS (Password por defecto: admin123 -> $2a$10$rN2Ziqd8yK5r60n8qCqU0uIq9E3lG.z3E9b9G2jTj5eM6MkWwO/4O o generado en script)
-- Se inserta usuario Admin, RRHH y Kiosco
INSERT OR IGNORE INTO users (id, username, password_hash, full_name, email, role, is_active) VALUES 
(1, 'admin', '$2a$10$wT8hA2k5gD8zHj3bL9sL0O7e4vF6uG8jP9qR0sT1uV2wX3yZ4aB5C', 'Administrador General', 'admin@globaltech.com', 'ADMIN', 1),
(2, 'rrhh', '$2a$10$wT8hA2k5gD8zHj3bL9sL0O7e4vF6uG8jP9qR0sT1uV2wX3yZ4aB5C', 'Coordinador de Talento', 'rrhh@globaltech.com', 'HR', 1),
(3, 'kiosco01', '$2a$10$wT8hA2k5gD8zHj3bL9sL0O7e4vF6uG8jP9qR0sT1uV2wX3yZ4aB5C', 'Kiosco Recepción Principal', 'kiosco@globaltech.com', 'KIOSK', 1);

-- 2. SEDES
INSERT OR IGNORE INTO branches (id, code, name, address, latitude, longitude, radius_meters, is_active) VALUES 
(1, 'SED-01', 'Sede Central San Isidro', 'Av. Javier Prado Este 456, Lima', -12.089722, -77.021111, 200, 1),
(2, 'SED-02', 'Planta Operativa Callao', 'Av. Argentina 2030, Callao', -12.045278, -77.112222, 350, 1),
(3, 'SED-03', 'Oficina Remota / Home Office', 'Trabajo Remoto Digital', 0.0, 0.0, 50000, 1);

-- 3. DEPARTAMENTOS
INSERT OR IGNORE INTO departments (id, code, name, description, is_active) VALUES 
(1, 'DEP-TI', 'Tecnología e Innovación', 'Desarrollo de software e infraestructura TI', 1),
(2, 'DEP-RH', 'Recursos Humanos y Talento', 'Gestión de personal y bienestar laboral', 1),
(3, 'DEP-OP', 'Operaciones y Logística', 'Producción, almacén y despacho', 1),
(4, 'DEP-FN', 'Administración y Finanzas', 'Contabilidad, tesorería y finanzas', 1);

-- 4. CARGOS
INSERT OR IGNORE INTO positions (id, department_id, name, description, is_active) VALUES 
(1, 1, 'Arquitecto de Software', 'Liderazgo técnico y diseño de arquitecturas', 1),
(2, 1, 'Desarrollador Full Stack', 'Desarrollo de aplicaciones web y móviles', 1),
(3, 2, 'Especialista de RRHH', 'Gestión de control de asistencia y contratos', 1),
(4, 3, 'Supervisor de Operaciones', 'Control de planta y turnos rotativos', 1),
(5, 4, 'Analista Contable', 'Gestión de facturación y planillas', 1);

-- 5. TURNOS DE TRABAJO
INSERT OR IGNORE INTO shifts (id, name, code, entry_time, exit_time, lunch_start, lunch_end, tolerance_minutes, lunch_duration_minutes, is_flexible, work_days, is_active) VALUES 
(1, 'Turno Administrativo Central (08:30 - 17:30)', 'TUR-ADM', '08:30:00', '17:30:00', '13:00:00', '14:00:00', 15, 60, 0, '1,2,3,4,5', 1),
(2, 'Turno Operativo Mañana (07:00 - 16:00)', 'TUR-OP-M', '07:00:00', '16:00:00', '12:00:00', '13:00:00', 10, 60, 0, '1,2,3,4,5,6', 1),
(3, 'Turno Flexible Remoto (09:00 - 18:00)', 'TUR-REM-F', '09:00:00', '18:00:00', '13:30:00', '14:30:00', 30, 60, 1, '1,2,3,4,5', 1);

-- 6. EMPLEADOS (Solo personal real de DALUPEZMAR gestionado por el sistema)
-- No se insertan registros demo.

-- 7. FOTOCHECKS / CREDENCIALES
-- Generados automáticamente para el personal real.

-- 8. CLIENTE API DE INTEROPERABILIDAD
INSERT OR IGNORE INTO api_clients (id, client_name, api_key_hash, permissions, is_active) VALUES 
(1, 'ERP SAP / Planillas RRHH Externa', 'ag_erp_live_key_982347102938471209384', 'READ_ATTENDANCE,WRITE_EMPLOYEE,READ_BADGES', 1);
