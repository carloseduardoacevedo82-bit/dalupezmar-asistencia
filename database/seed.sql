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

-- 6. EMPLEADOS DE DEMOSTRACIÓN
INSERT OR IGNORE INTO employees (id, employee_code, document_type, document_number, first_name, last_name, email, phone, emergency_contact_name, emergency_contact_phone, blood_type, birth_date, hire_date, branch_id, department_id, position_id, shift_id, photo_url, work_mode, status) VALUES 
(1, 'EMP-1001', 'DNI', '45892147', 'Carlos Alberto', 'Mendoza Quispe', 'carlos.mendoza@globaltech.com', '+51 987654321', 'Elena Quispe (Madre)', '+51 981122334', 'O+', '1992-05-14', '2023-01-15', 1, 1, 1, 1, '/uploads/photos/emp-1001.png', 'HYBRID', 'ACTIVE'),
(2, 'EMP-1002', 'DNI', '72314569', 'Valeria Sofia', 'Rojas Benítez', 'valeria.rojas@globaltech.com', '+51 976543210', 'Marco Rojas (Padre)', '+51 982233445', 'A+', '1995-09-22', '2023-03-01', 1, 2, 3, 1, '/uploads/photos/emp-1002.png', 'PRESENTIAL', 'ACTIVE'),
(3, 'EMP-1003', 'DNI', '48123908', 'Diego Alejandro', 'Vargas Salazar', 'diego.vargas@globaltech.com', '+51 965432109', 'Ana Salazar (Esposa)', '+51 983344556', 'O+', '1989-11-03', '2022-08-10', 2, 3, 4, 2, '/uploads/photos/emp-1003.png', 'PRESENTIAL', 'ACTIVE'),
(4, 'EMP-1004', 'DNI', '70984512', 'Camila Lucia', 'Navarro Castro', 'camila.navarro@globaltech.com', '+51 954321098', 'Patricia Castro (Madre)', '+51 984455667', 'B+', '1998-02-18', '2024-02-01', 1, 1, 2, 3, '/uploads/photos/emp-1004.png', 'REMOTE', 'ACTIVE');

-- 7. FOTOCHECKS / CREDENCIALES
INSERT OR IGNORE INTO badges (id, employee_id, badge_code, qr_token_hash, barcode_value, issue_date, expiration_date, status, template_theme) VALUES 
(1, 1, 'BADGE-EMP-1001', 'AGY_SEC_QR_EMP1001_8f9a2b4c6e8d1a3b5c7e9f0', '45892147', '2026-01-01', '2028-12-31', 'ACTIVE', 'CORPORATE_BLUE'),
(2, 2, 'BADGE-EMP-1002', 'AGY_SEC_QR_EMP1002_1a2b3c4d5e6f7a8b9c0d1e2', '72314569', '2026-01-01', '2028-12-31', 'ACTIVE', 'MODERN_PURPLE'),
(3, 3, 'BADGE-EMP-1003', 'AGY_SEC_QR_EMP1003_3f4e5d6c7b8a9f0e1d2c3b4', '48123908', '2026-01-01', '2028-12-31', 'ACTIVE', 'INDUSTRIAL_EMERALD'),
(4, 4, 'BADGE-EMP-1004', 'AGY_SEC_QR_EMP1004_7a8b9c0d1e2f3a4b5c6d7e8', '70984512', '2026-01-01', '2028-12-31', 'ACTIVE', 'TECH_DARK');

-- 8. CLIENTE API DE INTEROPERABILIDAD
INSERT OR IGNORE INTO api_clients (id, client_name, api_key_hash, permissions, is_active) VALUES 
(1, 'ERP SAP / Planillas RRHH Externa', 'ag_erp_live_key_982347102938471209384', 'READ_ATTENDANCE,WRITE_EMPLOYEE,READ_BADGES', 1);
