-- ============================================================================
-- SISTEMA DE CONTROL DE ASISTENCIA Y EMISIÓN DE FOTOCHECKS (DALUPEZMAR)
-- Esquema de Base de Datos Relacional Normalizada para PostgreSQL
-- Compatible con Render PostgreSQL, Supabase, Neon y AWS RDS
-- ============================================================================

-- 1. TABLA: USUARIOS DEL SISTEMA (ADMINISTRATIVOS Y KIOSCOS)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(120) NOT NULL,
    email VARCHAR(100) UNIQUE,
    role VARCHAR(20) NOT NULL DEFAULT 'HR' CHECK (role IN ('ADMIN', 'HR', 'SUPERVISOR', 'KIOSK', 'AUDITOR', 'WORKER')),
    is_active SMALLINT NOT NULL DEFAULT 1,
    last_login TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- 2. TABLA: SEDES Y SUCURSALES (CON GEOFENCE PARA MARCACIÓN)
CREATE TABLE IF NOT EXISTS branches (
    id SERIAL PRIMARY KEY,
    code VARCHAR(20) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    address VARCHAR(255) NOT NULL,
    latitude NUMERIC(10, 8),
    longitude NUMERIC(11, 8),
    radius_meters INTEGER NOT NULL DEFAULT 150,
    is_active SMALLINT NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_branches_code ON branches(code);

-- 3. TABLA: DEPARTAMENTOS / ÁREAS
CREATE TABLE IF NOT EXISTS departments (
    id SERIAL PRIMARY KEY,
    code VARCHAR(20) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    is_active SMALLINT NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_departments_code ON departments(code);

-- 4. TABLA: CARGOS / PUESTOS DE TRABAJO
CREATE TABLE IF NOT EXISTS positions (
    id SERIAL PRIMARY KEY,
    department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    is_active SMALLINT NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_positions_dept ON positions(department_id);

-- 5. TABLA: TURNOS Y HORARIOS DE TRABAJO
CREATE TABLE IF NOT EXISTS shifts (
    id SERIAL PRIMARY KEY,
    name VARCHAR(80) NOT NULL,
    code VARCHAR(20) NOT NULL UNIQUE,
    entry_time TIME NOT NULL,
    exit_time TIME NOT NULL,
    lunch_start TIME,
    lunch_end TIME,
    tolerance_minutes INTEGER NOT NULL DEFAULT 15,
    lunch_duration_minutes INTEGER NOT NULL DEFAULT 60,
    is_flexible SMALLINT NOT NULL DEFAULT 0,
    work_days VARCHAR(30) NOT NULL DEFAULT '1,2,3,4,5',
    is_active SMALLINT NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_shifts_code ON shifts(code);

-- 6. TABLA: PERSONAL / TRABAJADORES (EMPLEADOS)
CREATE TABLE IF NOT EXISTS employees (
    id SERIAL PRIMARY KEY,
    employee_code VARCHAR(20) NOT NULL UNIQUE,
    document_type VARCHAR(10) NOT NULL DEFAULT 'DNI' CHECK (document_type IN ('DNI', 'CE', 'PASAPORTE', 'RUT')),
    document_number VARCHAR(20) NOT NULL UNIQUE,
    first_name VARCHAR(80) NOT NULL,
    last_name VARCHAR(80) NOT NULL,
    email VARCHAR(100) UNIQUE,
    phone VARCHAR(30),
    password_hash VARCHAR(255),
    emergency_contact_name VARCHAR(120),
    emergency_contact_phone VARCHAR(30),
    blood_type VARCHAR(10),
    birth_date DATE,
    hire_date DATE NOT NULL,
    branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
    position_id INTEGER NOT NULL REFERENCES positions(id) ON DELETE RESTRICT,
    shift_id INTEGER NOT NULL REFERENCES shifts(id) ON DELETE RESTRICT,
    photo_url VARCHAR(255),
    work_mode VARCHAR(20) NOT NULL DEFAULT 'PRESENTIAL' CHECK (work_mode IN ('PRESENTIAL', 'REMOTE', 'HYBRID')),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'VACATION', 'LEAVE', 'SUSPENDED', 'BAJA')),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_employees_code ON employees(employee_code);
CREATE INDEX IF NOT EXISTS idx_employees_doc ON employees(document_number);
CREATE INDEX IF NOT EXISTS idx_employees_status ON employees(status);
CREATE INDEX IF NOT EXISTS idx_employees_dept ON employees(department_id);
CREATE INDEX IF NOT EXISTS idx_employees_shift ON employees(shift_id);
CREATE INDEX IF NOT EXISTS idx_employees_branch ON employees(branch_id);

-- 7. TABLA: FOTOCHECKS / CREDENCIALES EMITIDAS
CREATE TABLE IF NOT EXISTS badges (
    id SERIAL PRIMARY KEY,
    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    badge_code VARCHAR(50) NOT NULL UNIQUE,
    qr_token_hash VARCHAR(255) NOT NULL UNIQUE,
    barcode_value VARCHAR(50) NOT NULL,
    issue_date DATE NOT NULL,
    expiration_date DATE,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'REVOKED', 'EXPIRED', 'REPLACED')),
    template_theme VARCHAR(30) NOT NULL DEFAULT 'DALUPEZMAR_OFFICIAL',
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_badges_employee ON badges(employee_id);
CREATE INDEX IF NOT EXISTS idx_badges_qr_hash ON badges(qr_token_hash);
CREATE INDEX IF NOT EXISTS idx_badges_barcode ON badges(barcode_value);

-- 8. TABLA: JORNADAS / ASISTENCIAS DIARIAS CONSOLIDADAS
CREATE TABLE IF NOT EXISTS attendances (
    id SERIAL PRIMARY KEY,
    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    attendance_date DATE NOT NULL,
    shift_id INTEGER NOT NULL REFERENCES shifts(id) ON DELETE RESTRICT,
    status VARCHAR(20) NOT NULL DEFAULT 'PRESENT' CHECK (status IN ('PRESENT', 'LATE', 'ABSENT', 'JUSTIFIED', 'ON_LEAVE', 'HOLIDAY')),
    expected_entry TIME NOT NULL,
    expected_exit TIME NOT NULL,
    first_entry_time TIMESTAMP WITH TIME ZONE,
    lunch_start_time TIMESTAMP WITH TIME ZONE,
    lunch_end_time TIMESTAMP WITH TIME ZONE,
    last_exit_time TIMESTAMP WITH TIME ZONE,
    total_minutes_worked INTEGER NOT NULL DEFAULT 0,
    total_minutes_late INTEGER NOT NULL DEFAULT 0,
    total_minutes_overtime INTEGER NOT NULL DEFAULT 0,
    is_complete SMALLINT NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_attendances_emp_date UNIQUE (employee_id, attendance_date)
);

CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendances(attendance_date);
CREATE INDEX IF NOT EXISTS idx_attendance_emp_date ON attendances(employee_id, attendance_date);
CREATE INDEX IF NOT EXISTS idx_attendance_status ON attendances(status);

-- 9. TABLA: MARCACIONES INDIVIDUALES (LOGS BIOMÉTRICOS / QR / WEB)
CREATE TABLE IF NOT EXISTS attendance_logs (
    id SERIAL PRIMARY KEY,
    attendance_id INTEGER REFERENCES attendances(id) ON DELETE SET NULL,
    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    punch_type VARCHAR(20) NOT NULL CHECK (punch_type IN ('ENTRY', 'LUNCH_START', 'LUNCH_END', 'EXIT')),
    punch_time TIMESTAMP WITH TIME ZONE NOT NULL,
    punch_source VARCHAR(30) NOT NULL DEFAULT 'KIOSK_QR' CHECK (punch_source IN ('KIOSK_QR', 'BARCODE', 'REMOTE_WEB', 'MANUAL_OVERRIDE', 'MOBILE_SCAN', 'WORKER_PORTAL')),
    latitude NUMERIC(10, 8),
    longitude NUMERIC(11, 8),
    is_within_geofence SMALLINT DEFAULT 1,
    device_info VARCHAR(255),
    ip_address VARCHAR(45),
    raw_token VARCHAR(255),
    verification_status VARCHAR(20) NOT NULL DEFAULT 'VERIFIED' CHECK (verification_status IN ('VERIFIED', 'FLAGGED', 'REJECTED')),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_logs_employee_time ON attendance_logs(employee_id, punch_time);
CREATE INDEX IF NOT EXISTS idx_logs_punch_type ON attendance_logs(punch_type);
CREATE INDEX IF NOT EXISTS idx_logs_punch_time ON attendance_logs(punch_time);

-- 10. TABLA: JUSTIFICACIONES Y REGULARIZACIONES DE ASISTENCIA
CREATE TABLE IF NOT EXISTS justifications (
    id SERIAL PRIMARY KEY,
    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    attendance_id INTEGER REFERENCES attendances(id) ON DELETE SET NULL,
    reason_type VARCHAR(30) NOT NULL CHECK (reason_type IN ('MEDICAL_REST', 'WORK_COMMISSION', 'PERSONAL_LEAVE', 'TARDINESS_EXCUSE', 'OMITTED_PUNCH', 'OTHER')),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    description TEXT NOT NULL,
    document_url VARCHAR(255),
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
    reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMP WITH TIME ZONE,
    reviewer_comment TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_justificaciones_status ON justifications(status);
CREATE INDEX IF NOT EXISTS idx_justificaciones_emp ON justifications(employee_id);

-- 11. TABLA: DOCUMENTOS DE FIRMA ELECTRÓNICA (PORTAL DE FIRMAS)
CREATE TABLE IF NOT EXISTS documentos_firma (
    id SERIAL PRIMARY KEY,
    trabajador_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    tipo_doc VARCHAR(50) NOT NULL CHECK (tipo_doc IN ('CONTRATO', 'BOLETA', 'FICHA_INGRESO', 'DECLARACION_JURADA', 'ENTREGA_EPP', 'MEMORANDUM', 'OTRO')),
    url_documento VARCHAR(500) NOT NULL,
    portal_firma_id VARCHAR(100),
    estado_firma VARCHAR(30) NOT NULL DEFAULT 'PENDIENTE_ENVIO' CHECK (estado_firma IN ('PENDIENTE_ENVIO', 'ENVIADO_A_FIRMA', 'FIRMADO', 'RECHAZADO', 'EXPIRADO', 'FALLO_ENVIO', 'PENDIENTE_REINTENTO')),
    intentos_envio INTEGER NOT NULL DEFAULT 0,
    ultimo_error TEXT,
    metadata JSONB,
    fecha_envio TIMESTAMP WITH TIME ZONE,
    fecha_firma TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_docfirma_trabajador ON documentos_firma(trabajador_id);
CREATE INDEX IF NOT EXISTS idx_docfirma_estado ON documentos_firma(estado_firma);
CREATE INDEX IF NOT EXISTS idx_docfirma_portal_id ON documentos_firma(portal_firma_id);
CREATE INDEX IF NOT EXISTS idx_docfirma_tipo ON documentos_firma(tipo_doc);

-- 12. TABLA: CLIENTES API / INTEROPERABILIDAD EXTERNA (ERP / PLANILLAS)
CREATE TABLE IF NOT EXISTS api_clients (
    id SERIAL PRIMARY KEY,
    client_name VARCHAR(100) NOT NULL,
    api_key_hash VARCHAR(255) NOT NULL UNIQUE,
    permissions VARCHAR(255) NOT NULL DEFAULT 'READ_ATTENDANCE,WRITE_EMPLOYEE',
    is_active SMALLINT NOT NULL DEFAULT 1,
    last_used_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 13. TABLA: LOGS DE AUDITORÍA DE SISTEMA
CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(50) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id VARCHAR(50),
    details TEXT,
    ip_address VARCHAR(45),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);

-- 14. VISTAS DE COMPATIBILIDAD
CREATE OR REPLACE VIEW trabajadores AS
SELECT 
    e.id,
    e.document_number AS dni,
    CONCAT(e.first_name, ' ', e.last_name) AS nombres,
    e.first_name,
    e.last_name,
    p.name AS cargo,
    e.hire_date AS fecha_ingreso,
    e.status AS estado,
    e.email,
    e.phone,
    d.name AS departamento,
    b.name AS sede
FROM employees e
LEFT JOIN positions p ON e.position_id = p.id
LEFT JOIN departments d ON e.department_id = d.id
LEFT JOIN branches b ON e.branch_id = b.id;

CREATE OR REPLACE VIEW asistencias AS
SELECT 
    a.id,
    a.employee_id AS trabajador_id,
    e.document_number AS dni,
    CONCAT(e.first_name, ' ', e.last_name) AS trabajador_nombre,
    a.attendance_date AS fecha,
    a.first_entry_time AS timestamp_entrada,
    a.last_exit_time AS timestamp_salida,
    a.notes AS observaciones,
    a.status AS estado,
    a.total_minutes_worked,
    a.total_minutes_late,
    a.total_minutes_overtime
FROM attendances a
JOIN employees e ON a.employee_id = e.id;
