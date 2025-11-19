-- ============================================
-- CHARIOT PLATFORM - COMPLETE DATABASE SCHEMA
-- ============================================
-- Based on Shopmonkey but optimized for marine services
-- Created: Nov 17, 2025

-- ============================================
-- CORE BUSINESS TABLES
-- ============================================

-- LOCATION - Your service locations (Tampa, Miami, etc)
CREATE TABLE IF NOT EXISTS location (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  name VARCHAR(255) NOT NULL,
  address1 TEXT,
  address2 TEXT,
  city VARCHAR(100),
  state VARCHAR(50),
  postal_code VARCHAR(20),
  country VARCHAR(100) DEFAULT 'USA',
  phone VARCHAR(20),
  email VARCHAR(255),
  time_zone VARCHAR(50),
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- USER - Team members (technicians, managers, admins)
CREATE TABLE IF NOT EXISTS "user" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  phone VARCHAR(20),
  location_ids JSONB NOT NULL DEFAULT '[]',
  color VARCHAR(64),
  active BOOLEAN DEFAULT true,
  role VARCHAR(100),
  can_track_time BOOLEAN DEFAULT false,
  assigned_technician BOOLEAN DEFAULT false,
  assigned_service_writer BOOLEAN DEFAULT false,
  hq_access BOOLEAN DEFAULT false,
  labor_rate_id UUID,
  custom_fields JSONB,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deactivated_date TIMESTAMP,
  deactivated_by_user_id UUID
);

-- CUSTOMER - Your customers
CREATE TABLE IF NOT EXISTS customer (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  location_ids JSONB NOT NULL DEFAULT '[]',
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  company_name VARCHAR(255),
  customer_type VARCHAR(50) DEFAULT 'personal',
  address1 TEXT,
  address2 TEXT,
  city VARCHAR(100),
  state VARCHAR(50),
  postal_code VARCHAR(20),
  country VARCHAR(100) DEFAULT 'USA',
  website TEXT,
  note TEXT,
  discount_percent NUMERIC(5,2) DEFAULT 0,
  tax_exempt BOOLEAN DEFAULT false,
  preferred_contact_method VARCHAR(50),
  preferred_language VARCHAR(50) DEFAULT 'en',
  marketing_opt_in BOOLEAN DEFAULT false,
  external_id TEXT,
  labels JSONB DEFAULT '[]',
  custom_fields JSONB,
  appointment_count BIGINT DEFAULT 0,
  message_count BIGINT DEFAULT 0,
  order_count BIGINT DEFAULT 0,
  statement_count BIGINT DEFAULT 0,
  vehicle_count BIGINT DEFAULT 0,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted BOOLEAN DEFAULT false,
  deleted_date TIMESTAMP,
  deleted_reason TEXT
);

-- EMAIL - Customer email addresses
CREATE TABLE IF NOT EXISTS email (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  location_id UUID NOT NULL,
  customer_id UUID NOT NULL REFERENCES customer(id),
  email VARCHAR(255) NOT NULL,
  "primary" BOOLEAN DEFAULT false,
  subscribed BOOLEAN DEFAULT true,
  marketing_opt_in BOOLEAN DEFAULT false,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- PHONE_NUMBER - Customer phone numbers
CREATE TABLE IF NOT EXISTS phone_number (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  location_id UUID NOT NULL,
  customer_id UUID NOT NULL REFERENCES customer(id),
  phone_number VARCHAR(20) NOT NULL,
  phone_type VARCHAR(50),
  "primary" BOOLEAN DEFAULT false,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- VEHICLE - Boats/vessels
CREATE TABLE IF NOT EXISTS vehicle (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  location_ids JSONB NOT NULL DEFAULT '[]',
  name VARCHAR(255),
  make VARCHAR(100),
  model VARCHAR(100),
  year BIGINT,
  vin TEXT,
  hin TEXT,
  serial TEXT,
  license_plate TEXT,
  color VARCHAR(64),
  body_style VARCHAR(100),
  engine VARCHAR(255),
  transmission VARCHAR(100),
  size VARCHAR(50),
  unit VARCHAR(50),
  length NUMERIC(10,2),
  bed_length VARCHAR(50),
  type VARCHAR(100),
  mileage NUMERIC(10,2),
  note TEXT,
  labels JSONB DEFAULT '[]',
  custom_fields JSONB,
  order_count BIGINT DEFAULT 0,
  appointment_count BIGINT DEFAULT 0,
  deferred_service_count BIGINT DEFAULT 0,
  message_count BIGINT DEFAULT 0,
  last_serviced_date TIMESTAMP,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted BOOLEAN DEFAULT false,
  deleted_date TIMESTAMP
);

-- VEHICLE_OWNER - Links customer to vehicle
CREATE TABLE IF NOT EXISTS vehicle_owner (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  customer_id UUID NOT NULL REFERENCES customer(id),
  vehicle_id UUID NOT NULL REFERENCES vehicle(id),
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- VEHICLE_LOCATION - Vehicle available at locations
CREATE TABLE IF NOT EXISTS vehicle_location (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  vehicle_id UUID NOT NULL REFERENCES vehicle(id),
  location_id UUID NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- SERVICE & CATALOG TABLES
-- ============================================

-- SERVICE - Services/repairs you offer
CREATE TABLE IF NOT EXISTS service (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  location_id UUID NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(100),
  price_base NUMERIC(10,2),
  labor_hours NUMERIC(10,2),
  parts_estimated NUMERIC(10,2),
  active BOOLEAN DEFAULT true,
  labor_type VARCHAR(100),
  taxable BOOLEAN DEFAULT true,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- LABOR - Labor types and rates
CREATE TABLE IF NOT EXISTS labor (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  location_id UUID NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  rate_cents BIGINT NOT NULL,
  vehicle_type VARCHAR(100),
  active BOOLEAN DEFAULT true,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- INVENTORY_PART - Parts inventory
CREATE TABLE IF NOT EXISTS inventory_part (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  location_id UUID NOT NULL,
  name VARCHAR(255) NOT NULL,
  number VARCHAR(100),
  sku VARCHAR(100),
  category_id UUID,
  brand_id UUID,
  description TEXT,
  quantity NUMERIC(10,2) NOT NULL DEFAULT 0,
  available_quantity NUMERIC(10,2) NOT NULL DEFAULT 0,
  reserved_quantity NUMERIC(10,2) NOT NULL DEFAULT 0,
  on_estimate_quantity NUMERIC(10,2) NOT NULL DEFAULT 0,
  reorder_quantity NUMERIC(10,2) NOT NULL DEFAULT 0,
  min_critical_quantity NUMERIC(10,2),
  max_critical_quantity NUMERIC(10,2),
  retail_cost_cents BIGINT NOT NULL DEFAULT 0,
  bin_location VARCHAR(100),
  taxable BOOLEAN DEFAULT true,
  show_cost_and_quantity BOOLEAN DEFAULT true,
  show_part_number BOOLEAN DEFAULT true,
  show_note BOOLEAN DEFAULT true,
  note TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted BOOLEAN DEFAULT false,
  deleted_date TIMESTAMP
);

-- VENDOR_TABLE - Parts suppliers
CREATE TABLE IF NOT EXISTS vendor_table (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  location_id UUID NOT NULL,
  name VARCHAR(255) NOT NULL,
  contact_first_name VARCHAR(100),
  contact_last_name VARCHAR(100),
  contact_email VARCHAR(255),
  contact_phone JSONB,
  account_number VARCHAR(100),
  address1 TEXT,
  address2 TEXT,
  city VARCHAR(100),
  state VARCHAR(50),
  postal_code VARCHAR(20),
  country VARCHAR(100),
  url TEXT,
  purchase_order_count BIGINT DEFAULT 0,
  purchase_order_total_cost_cents BIGINT,
  purchase_order_average_cost_cents BIGINT,
  purchase_order_last_date TIMESTAMP,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted BOOLEAN DEFAULT false,
  deleted_date TIMESTAMP
);

-- ============================================
-- ORDER & APPOINTMENT TABLES
-- ============================================

-- APPOINTMENT - Scheduled visits
CREATE TABLE IF NOT EXISTS appointment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  location_id UUID NOT NULL,
  customer_id UUID REFERENCES customer(id),
  vehicle_id UUID REFERENCES vehicle(id),
  order_id UUID,
  name VARCHAR(255) NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  color VARCHAR(64) NOT NULL DEFAULT 'blue',
  all_day BOOLEAN NOT NULL DEFAULT false,
  start_date TIMESTAMP NOT NULL,
  end_date TIMESTAMP NOT NULL,
  duration BIGINT,
  original_start_date TIMESTAMP,
  original_end_date TIMESTAMP,
  status VARCHAR(50) DEFAULT 'scheduled',
  confirmation_status VARCHAR(50),
  send_confirmation BOOLEAN DEFAULT false,
  send_reminder BOOLEAN DEFAULT false,
  use_email BOOLEAN DEFAULT true,
  use_sms BOOLEAN DEFAULT true,
  recurring BOOLEAN DEFAULT false,
  recurring_appointment_id UUID,
  is_recurring_parent BOOLEAN DEFAULT false,
  removed_from_recurrency BOOLEAN DEFAULT false,
  rruleset TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- APPOINTMENT_USER_CONNECTION - Assign technician to appointment
CREATE TABLE IF NOT EXISTS appointment_user_connection (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  location_id UUID NOT NULL,
  appointment_id UUID NOT NULL REFERENCES appointment(id),
  user_id UUID NOT NULL REFERENCES "user"(id),
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ORDER - Work orders/jobs (replaces your "jobs" table)
CREATE TABLE IF NOT EXISTS "order" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  location_id UUID NOT NULL,
  customer_id UUID NOT NULL REFERENCES customer(id),
  vehicle_id UUID REFERENCES vehicle(id),
  appointment_id UUID REFERENCES appointment(id),
  order_number VARCHAR(100),
  status VARCHAR(50) DEFAULT 'open',
  priority VARCHAR(50) DEFAULT 'normal',
  note TEXT NOT NULL DEFAULT '',
  service_writer_id UUID REFERENCES "user"(id),
  
  -- Calculated totals
  calculated_labor_cents BIGINT DEFAULT 0,
  calculated_parts_cents BIGINT DEFAULT 0,
  calculated_subcontracts_cents BIGINT DEFAULT 0,
  calculated_shop_supplies_cents BIGINT DEFAULT 0,
  calculated_discount_cents BIGINT DEFAULT 0,
  calculated_tax_cents BIGINT DEFAULT 0,
  calculated_subtotal_cents BIGINT DEFAULT 0,
  calculated_total_cents BIGINT DEFAULT 0,
  
  discount_percent NUMERIC(5,2) DEFAULT 0,
  tax_percent NUMERIC(5,2) DEFAULT 0,
  deferred BOOLEAN DEFAULT false,
  deferred_date TIMESTAMP,
  deferred_reason VARCHAR(100),
  
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_date TIMESTAMP,
  deleted BOOLEAN DEFAULT false
);

-- ORDER_LINE_ITEM - Labor, parts, services on order
CREATE TABLE IF NOT EXISTS order_line_item (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  location_id UUID NOT NULL,
  order_id UUID NOT NULL REFERENCES "order"(id),
  source_service_id UUID REFERENCES service(id),
  
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(100),
  line_item_order VARCHAR(50),
  pricing VARCHAR(50),
  ordinal NUMERIC(10,2) DEFAULT 0,
  
  -- Pricing
  labor_rate_cents BIGINT,
  labor_hours NUMERIC(10,2),
  parts_cost_cents BIGINT,
  quantity NUMERIC(10,2),
  fixed_price_cents BIGINT,
  lump_sum BOOLEAN DEFAULT false,
  
  -- Discounts and taxes
  discount_cents BIGINT DEFAULT 0,
  discount_percent NUMERIC(5,2) DEFAULT 0,
  discount_value_type VARCHAR(50),
  
  tax_cents BIGINT DEFAULT 0,
  tax_percent NUMERIC(5,2) DEFAULT 0,
  tax_value_type VARCHAR(50),
  
  -- Totals
  total_cents BIGINT DEFAULT 0,
  
  status VARCHAR(50) DEFAULT 'pending',
  hidden BOOLEAN DEFAULT false,
  recommended BOOLEAN DEFAULT false,
  revived BOOLEAN DEFAULT false,
  revived_from_id UUID,
  
  note TEXT NOT NULL DEFAULT '',
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- INSPECTION TABLES
-- ============================================

-- INSPECTION - Pre-service inspection forms
CREATE TABLE IF NOT EXISTS inspection (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  location_id UUID NOT NULL,
  order_id UUID NOT NULL REFERENCES "order"(id),
  
  name VARCHAR(255) NOT NULL,
  note TEXT,
  template_id UUID,
  
  completed BOOLEAN DEFAULT false,
  completed_by_id UUID REFERENCES "user"(id),
  completed_date TIMESTAMP,
  created_by_id UUID REFERENCES "user"(id),
  
  ordinal NUMERIC(10,2) DEFAULT 0,
  recommended BOOLEAN DEFAULT false,
  
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- INSPECTION_ITEM - Individual inspection items
CREATE TABLE IF NOT EXISTS inspection_item (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  location_id UUID NOT NULL,
  inspection_id UUID NOT NULL REFERENCES inspection(id),
  
  name VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  status VARCHAR(50),
  
  ordinal NUMERIC(10,2) DEFAULT 0,
  inspection_date TIMESTAMP,
  inspector_user_id UUID REFERENCES "user"(id),
  
  review_status VARCHAR(50),
  reviewed_by_user_id UUID REFERENCES "user"(id),
  reviewed_by_customer_id UUID REFERENCES customer(id),
  reviewed_date TIMESTAMP,
  
  recommended_canned_service_ids JSONB DEFAULT '[]',
  
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- PAYMENT & FINANCIAL TABLES
-- ============================================

-- TRANSACTION - Payments, invoices, credit memos
CREATE TABLE IF NOT EXISTS "transaction" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  location_id UUID NOT NULL,
  order_id UUID NOT NULL REFERENCES "order"(id),
  customer_id UUID NOT NULL REFERENCES customer(id),
  
  transaction_type VARCHAR(50) NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  amount_cents BIGINT NOT NULL,
  
  payment_method VARCHAR(50),
  payment_reference VARCHAR(255),
  
  applied_date TIMESTAMP,
  due_date TIMESTAMP,
  
  note TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- AUTHORIZATION - Payment authorizations
CREATE TABLE IF NOT EXISTS "authorization" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  location_id UUID NOT NULL,
  order_id UUID NOT NULL REFERENCES "order"(id),
  customer_id UUID NOT NULL REFERENCES customer(id),
  
  authorized_cost_cents BIGINT NOT NULL,
  method VARCHAR(50) NOT NULL,
  date TIMESTAMP NOT NULL,
  
  service_authorization_reset BOOLEAN DEFAULT false,
  service_writer_id UUID REFERENCES "user"(id),
  
  note TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- AUTHORIZATION_SERVICE - Services under authorization
CREATE TABLE IF NOT EXISTS authorization_service (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  location_id UUID NOT NULL,
  authorization_id UUID NOT NULL REFERENCES "authorization"(id),
  service_id UUID NOT NULL REFERENCES service(id),
  
  name VARCHAR(255) NOT NULL,
  authorized_cost_cents BIGINT NOT NULL,
  authorization_status VARCHAR(50) NOT NULL,
  
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- TIME & LABOR TABLES
-- ============================================

-- TIMESHEET - Time tracking entries
CREATE TABLE IF NOT EXISTS timesheet (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  location_id UUID NOT NULL,
  technician_id UUID NOT NULL REFERENCES "user"(id),
  order_id UUID REFERENCES "order"(id),
  service_id UUID REFERENCES service(id),
  labor_id UUID REFERENCES labor(id),
  
  number VARCHAR(100) NOT NULL,
  activity VARCHAR(50) NOT NULL,
  type VARCHAR(50) NOT NULL,
  
  clock_in TIMESTAMP NOT NULL,
  clock_in_latitude NUMERIC(10,6),
  clock_in_longitude NUMERIC(10,6),
  clock_in_at_location BOOLEAN DEFAULT false,
  clock_in_platform VARCHAR(50),
  
  clock_out TIMESTAMP,
  clock_out_latitude NUMERIC(10,6),
  clock_out_longitude NUMERIC(10,6),
  clock_out_at_location BOOLEAN DEFAULT false,
  clock_out_platform VARCHAR(50),
  
  duration NUMERIC(10,2),
  rate_cents BIGINT,
  flat_rate BOOLEAN DEFAULT false,
  in_progress BOOLEAN DEFAULT true,
  
  note TEXT NOT NULL DEFAULT '',
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- MESSAGE TABLE
-- ============================================

-- MESSAGE - Customer communications
CREATE TABLE IF NOT EXISTS message (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  location_id UUID NOT NULL,
  customer_id UUID NOT NULL REFERENCES customer(id),
  order_id UUID REFERENCES "order"(id),
  
  message_type VARCHAR(50),
  direction VARCHAR(50),
  channel VARCHAR(50),
  
  body TEXT NOT NULL,
  subject TEXT,
  
  from_user_id UUID REFERENCES "user"(id),
  to_user_id UUID REFERENCES "user"(id),
  
  read BOOLEAN DEFAULT false,
  read_date TIMESTAMP,
  
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- CREATE INDEXES FOR PERFORMANCE
-- ============================================

CREATE INDEX IF NOT EXISTS idx_customer_company ON customer(company_id);
CREATE INDEX IF NOT EXISTS idx_customer_deleted ON customer(deleted);
CREATE INDEX IF NOT EXISTS idx_order_company ON "order"(company_id);
CREATE INDEX IF NOT EXISTS idx_order_customer ON "order"(customer_id);
CREATE INDEX IF NOT EXISTS idx_order_status ON "order"(status);
CREATE INDEX IF NOT EXISTS idx_appointment_company ON appointment(company_id);
CREATE INDEX IF NOT EXISTS idx_appointment_customer ON appointment(customer_id);
CREATE INDEX IF NOT EXISTS idx_appointment_start_date ON appointment(start_date);
CREATE INDEX IF NOT EXISTS idx_timesheet_technician ON timesheet(technician_id);
CREATE INDEX IF NOT EXISTS idx_timesheet_clock_in ON timesheet(clock_in);
CREATE INDEX IF NOT EXISTS idx_transaction_order ON "transaction"(order_id);
CREATE INDEX IF NOT EXISTS idx_transaction_customer ON "transaction"(customer_id);
CREATE INDEX IF NOT EXISTS idx_message_customer ON message(customer_id);
CREATE INDEX IF NOT EXISTS idx_inventory_location ON inventory_part(location_id);