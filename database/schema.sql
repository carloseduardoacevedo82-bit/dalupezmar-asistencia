-- ============================================================================
-- SISTEMA DE CONTROL DE ASISTENCIA Y EMISIÓN DE FOTOCHECKS
-- Esquema de Base de Datos Relacional Normalizada
-- Compatible con SQLite3 / PostgreSQL / MySQL (ANSI SQL Standard)
-- ============================================================================

PRAGMA foreign_keys = ON;

-- 1. TABLA: USUARIOS DEL SISTEMA (ADMINISTRATIVOS Y KIOSCOS)
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(120) NOT NULL,
    email VARCHAR(100) UNIQUE,
    role VARCHAR(20) NOT NULL DEFAULT 'HR' CHECK (role IN ('ADMIN', 'HR', 'SUPERVISOR', 'KIOSK', 'AUDITOR')),
    is_active INTEGER NOT NULL DEFAULT 1,
    last_login DATETIME,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- 2. TABLA: SEDES Y SUCURSALES (CON GEOFENCE PARA MARCACIÓN)
CREATE TABLE IF NOT EXISTS branches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code VARCHAR(20) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    address VARCHAR(255) NOT NULL,
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    radius_meters INTEGER NOT NULL DEFAULT 150, -- Radio permitido de geocerca en metros
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_branches_code ON branches(code);

-- 3. TABLA: DEPARTAMENTOS / ÁREAS
CREATE TABLE IF NOT EXISTS departments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code VARCHAR(20) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_departments_code ON departments(code);

-- 4. TABLA: CARGOS / PUESTOS DE TRABAJO
CREATE TABLE IF NOT EXISTS positions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    department_id INTEGER NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_positions_dept ON positions(department_id);

-- 5. TABLA: TURNOS Y HORARIOS DE TRABAJO
CREATE TABLE IF NOT EXISTS shifts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(80) NOT NULL,
    code VARCHAR(20) NOT NULL UNIQUE,
    entry_time TIME NOT NULL,                  -- ej: '08:30:00'
    exit_time TIME NOT NULL,                   -- ej: '17:30:00'
    lunch_start TIME,                          -- ej: '13:00:00'
    lunch_end TIME,                            -- ej: '14:00:00'
    tolerance_minutes INTEGER NOT NULL DEFAULT 15, -- Minutos de tolerancia de ingreso
    lunch_duration_minutes INTEGER NOT NULL DEFAULT 60,
    is_flexible INTEGER NOT NULL DEFAULT 0,
    work_days VARCHAR(30) NOT NULL DEFAULT '1,2,3,4,5', -- Días laborales: 1=Lunes .. 7=Domingo
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_shifts_code ON shifts(code);

-- 6. TABLA: PERSONAL / TRABAJADORES (EMPLEADOS)
CREATE TABLE IF NOT EXISTS employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_code VARCHAR(20) NOT NULL UNIQUE, -- Código de fotocheck / ID interno (ej: EMP-1001)
    document_type VARCHAR(10) NOT NULL DEFAULT 'DNI' CHECK (document_type IN ('DNI', 'CE', 'PASAPORTE', 'RUT')),
    document_number VARCHAR(20) NOT NULL UNIQUE,
    first_name VARCHAR(80) NOT NULL,
    last_name VARCHAR(80) NOT NULL,
    email VARCHAR(100) UNIQUE,
    phone VARCHAR(30),
    emergency_contact_name VARCHAR(120),
    emergency_contact_phone VARCHAR(30),
    blood_type VARCHAR(10),
    birth_date DATE,
    hire_date DATE NOT NULL,
    branch_id INTEGER NOT NULL,
    department_id INTEGER NOT NULL,
    position_id INTEGER NOT NULL,
    shift_id INTEGER NOT NULL,
    photo_url VARCHAR(255),
    work_mode VARCHAR(20) NOT NULL DEFAULT 'PRESENTIAL' CHECK (work_mode IN ('PRESENTIAL', 'REMOTE', 'HYBRID')),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'VACATION', 'LEAVE', 'SUSPENDED')),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE RESTRICT,
    FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE RESTRICT,
    FOREIGN KEY (position_id) REFERENCES positions(id) ON DELETE RESTRICT,
    FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_employees_code ON employees(employee_code);
CREATE INDEX IF NOT EXISTS idx_employees_doc ON employees(document_number);
CREATE INDEX IF NOT EXISTS idx_employees_status ON employees(status);
CREATE INDEX IF NOT EXISTS idx_employees_dept ON employees(department_id);
CREATE INDEX IF NOT EXISTS idx_employees_shift ON employees(shift_id);

-- 7. TABLA: FOTOCHECKS / CREDENCIALES EMITIDAS
CREATE TABLE IF NOT EXISTS badges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL,
    badge_code VARCHAR(50) NOT NULL UNIQUE,      -- Identificador de tarjeta
    qr_token_hash VARCHAR(255) NOT NULL UNIQUE,  -- Hash criptográfico seguro embebido en el QR
    barcode_value VARCHAR(50) NOT NULL,         -- Código para lector de barras (Code 128)
    issue_date DATE NOT NULL,
    expiration_date DATE,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'REVOKED', 'EXPIRED', 'REPLACED')),
    template_theme VARCHAR(30) NOT NULL DEFAULT 'CORPORATE_BLUE',
    notes TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_badges_employee ON badges(employee_id);
CREATE INDEX IF NOT EXISTS idx_badges_qr_hash ON badges(qr_token_hash);
CREATE INDEX IF NOT EXISTS idx_badges_barcode ON badges(barcode_value);

-- 8. TABLA: JORNADAS / ASISTENCIAS DIARIAS CONSOLIDADAS
CREATE TABLE IF NOT EXISTS attendances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL,
    attendance_date DATE NOT NULL,
    shift_id INTEGER NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PRESENT' CHECK (status IN ('PRESENT', 'LATE', 'ABSENT', 'JUSTIFIED', 'ON_LEAVE', 'HOLIDAY')),
    expected_entry TIME NOT NULL,
    expected_exit TIME NOT NULL,
    first_entry_time DATETIME,
    lunch_start_time DATETIME,
    lunch_end_time DATETIME,
    last_exit_time DATETIME,
    total_minutes_worked INTEGER NOT NULL DEFAULT 0,
    total_minutes_late INTEGER NOT NULL DEFAULT 0,
    total_minutes_overtime INTEGER NOT NULL DEFAULT 0,
    is_complete INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE RESTRICT,
    FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE RESTRICT,
    UNIQUE (employee_id, attendance_date)
);

CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendances(attendance_date);
CREATE INDEX IF NOT EXISTS idx_attendance_emp_date ON attendances(employee_id, attendance_date);
CREATE INDEX IF NOT EXISTS idx_attendance_status ON attendances(status);

-- 9. TABLA: MARCACIONES INDIVIDUALES (LOGS BIOMÉTRICOS / QR / WEB)
CREATE TABLE IF NOT EXISTS attendance_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    attendance_id INTEGER,
    employee_id INTEGER NOT NULL,
    punch_type VARCHAR(20) NOT NULL CHECK (punch_type IN ('ENTRY', 'LUNCH_START', 'LUNCH_END', 'EXIT')),
    punch_time DATETIME NOT NULL,
    punch_source VARCHAR(20) NOT NULL DEFAULT 'KIOSK_QR' CHECK (punch_source IN ('KIOSK_QR', 'BARCODE', 'REMOTE_WEB', 'MANUAL_OVERRIDE')),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    is_within_geofence INTEGER DEFAULT 1,
    device_info VARCHAR(255),
    ip_address VARCHAR(45),
    raw_token VARCHAR(255),
    verification_status VARCHAR(20) NOT NULL DEFAULT 'VERIFIED' CHECK (verification_status IN ('VERIFIED', 'FLAGGED', 'REJECTED')),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (attendance_id) REFERENCES attendances(id) ON DELETE SET NULL,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_logs_employee_time ON attendance_logs(employee_id, punch_time);
CREATE INDEX IF NOT EXISTS idx_logs_punch_type ON attendance_logs(punch_type);

-- 10. TABLA: JUSTIFICACIONES Y REGULARIZACIONES DE ASISTENCIA
CREATE TABLE IF NOT EXISTS justifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL,
    attendance_id INTEGER,
    reason_type VARCHAR(30) NOT NULL CHECK (reason_type IN ('MEDICAL_REST', 'WORK_COMMISSION', 'PERSONAL_LEAVE', 'TARDINESS_EXCUSE', 'OMITTED_PUNCH', 'OTHER')),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    description TEXT NOT NULL,
    document_url VARCHAR(255),
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
    reviewed_by INTEGER,
    reviewed_at DATETIME,
    reviewer_comment TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE RESTRICT,
    FOREIGN KEY (attendance_id) REFERENCES attendances(id) ON DELETE SET NULL,
    FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_justifications_status ON justifications(status);
CREATE INDEX IF NOT EXISTS idx_justifications_emp ON justifications(employee_id);

-- 11. TABLA: CLIENTES API / INTEROPERABILIDAD EXTERNA (ERP / PLANILLAS)
CREATE TABLE IF NOT EXISTS api_clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_name VARCHAR(100) NOT NULL,
    api_key_hash VARCHAR(255) NOT NULL UNIQUE,
    permissions VARCHAR(255) NOT NULL DEFAULT 'READ_ATTENDANCE,WRITE_EMPLOYEE',
    is_active INTEGER NOT NULL DEFAULT 1,
    last_used_at DATETIME,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 12. TABLA: LOGS DE AUDITORÍA DE SISTEMA
CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    action VARCHAR(50) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id VARCHAR(50),
    details TEXT,
    ip_address VARCHAR(45),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
