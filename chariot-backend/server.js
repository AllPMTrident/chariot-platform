const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

// Load environment variables FIRST
dotenv.config();

const { v4: uuidv4 } = require('uuid');
const pool = require('./database');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { router: authRouter, authenticateToken, requireRole } = require('./auth');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// ============================================
// UTILITY FUNCTIONS
// ============================================

// Async error wrapper
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Standard error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ 
    error: err.message || 'Internal server error' 
  });
});

// ============================================
// ADVANCED QUERY UTILITIES
// ============================================

// Parse query parameters for filtering, sorting, pagination
const parseQueryParams = (req) => {
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const offset = (page - 1) * limit;
  const sort = req.query.sort || 'created_at';
  const order = req.query.order === 'asc' ? 'ASC' : 'DESC';
  const search = req.query.search || '';
  
  return { page, limit, offset, sort, order, search };
};

// Build WHERE clause for search
const buildSearchWhere = (searchFields, search) => {
  if (!search) return '';
  const conditions = searchFields.map(field => `${field} ILIKE $1`).join(' OR ');
  return ` AND (${conditions})`;
};

// Build WHERE clause for filters
const buildFilterWhere = (filters) => {
  let where = '';
  const params = [];
  let paramIndex = 1;
  
  if (filters.status) {
    where += ` AND status = $${paramIndex}`;
    params.push(filters.status);
    paramIndex++;
  }
  
  if (filters.location_id) {
    where += ` AND location_id = $${paramIndex}`;
    params.push(filters.location_id);
    paramIndex++;
  }
  
  if (filters.customer_id) {
    where += ` AND customer_id = $${paramIndex}`;
    params.push(filters.customer_id);
    paramIndex++;
  }
  
  if (filters.technician_id) {
    where += ` AND technician_id = $${paramIndex}`;
    params.push(filters.technician_id);
    paramIndex++;
  }
  
  if (filters.start_date) {
    where += ` AND created_at >= $${paramIndex}`;
    params.push(filters.start_date);
    paramIndex++;
  }
  
  if (filters.end_date) {
    where += ` AND created_at <= $${paramIndex}`;
    params.push(filters.end_date);
    paramIndex++;
  }
  
  return { where, params, nextParamIndex: paramIndex };
};

// ============================================
// AUTH ROUTES
// ============================================

app.use('/api/auth', authRouter);

// ============================================
// HEALTH CHECK
// ============================================

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date() });
});

app.get('/', (req, res) => {
  res.json({
    message: 'Chariot API - Marine Service Platform',
    version: '1.0.0',
    status: 'running',
    database: 'PostgreSQL',
    tables: 24
  });
});

// ============================================
// LOCATION ENDPOINTS
// ============================================

app.get('/api/locations', asyncHandler(async (req, res) => {
  const result = await pool.query('SELECT * FROM location ORDER BY created_at DESC');
  res.json(result.rows);
}));

app.post('/api/locations', asyncHandler(async (req, res) => {
  const { company_id, name, address1, city, state, postal_code, phone, email } = req.body;
  
  if (!name) return res.status(400).json({ error: 'Name is required' });
  
  const result = await pool.query(
    'INSERT INTO location (company_id, name, address1, city, state, postal_code, phone, email) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
    [company_id || uuidv4(), name, address1, city, state, postal_code, phone, email]
  );
  
  res.status(201).json(result.rows[0]);
}));

app.get('/api/locations/:id', asyncHandler(async (req, res) => {
  const result = await pool.query('SELECT * FROM location WHERE id = $1', [req.params.id]);
  
  if (result.rows.length === 0) return res.status(404).json({ error: 'Location not found' });
  res.json(result.rows[0]);
}));

app.put('/api/locations/:id', asyncHandler(async (req, res) => {
  const { name, address1, city, state, postal_code, phone, email } = req.body;
  
  const result = await pool.query(
    'UPDATE location SET name = COALESCE($1, name), address1 = COALESCE($2, address1), city = COALESCE($3, city), state = COALESCE($4, state), postal_code = COALESCE($5, postal_code), phone = COALESCE($6, phone), email = COALESCE($7, email), updated_at = CURRENT_TIMESTAMP WHERE id = $8 RETURNING *',
    [name, address1, city, state, postal_code, phone, email, req.params.id]
  );
  
  if (result.rows.length === 0) return res.status(404).json({ error: 'Location not found' });
  res.json(result.rows[0]);
}));

// ============================================
// USER (TECHNICIAN) ENDPOINTS
// ============================================

app.get('/api/users', asyncHandler(async (req, res) => {
  const result = await pool.query('SELECT * FROM "user" WHERE active = true ORDER BY first_name ASC');
  res.json(result.rows);
}));

app.post('/api/users', asyncHandler(async (req, res) => {
  const { company_id, email, first_name, last_name, phone, role, location_ids } = req.body;
  
  if (!email || !first_name || !last_name) {
    return res.status(400).json({ error: 'Email, first_name, and last_name are required' });
  }
  
  const result = await pool.query(
    'INSERT INTO "user" (company_id, email, first_name, last_name, phone, role, location_ids, active) VALUES ($1, $2, $3, $4, $5, $6, $7, true) RETURNING *',
    [company_id || uuidv4(), email, first_name, last_name, phone, role, JSON.stringify(location_ids || [])]
  );
  
  res.status(201).json(result.rows[0]);
}));

app.get('/api/users/:id', asyncHandler(async (req, res) => {
  const result = await pool.query('SELECT * FROM "user" WHERE id = $1', [req.params.id]);
  
  if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
  res.json(result.rows[0]);
}));

app.put('/api/users/:id', asyncHandler(async (req, res) => {
  const { first_name, last_name, phone, role, active, location_ids } = req.body;
  
  const result = await pool.query(
    'UPDATE "user" SET first_name = COALESCE($1, first_name), last_name = COALESCE($2, last_name), phone = COALESCE($3, phone), role = COALESCE($4, role), active = COALESCE($5, active), location_ids = COALESCE($6, location_ids), updated_at = CURRENT_TIMESTAMP WHERE id = $7 RETURNING *',
    [first_name, last_name, phone, role, active, location_ids ? JSON.stringify(location_ids) : null, req.params.id]
  );
  
  if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
  res.json(result.rows[0]);
}));

// ============================================
// CUSTOMER ENDPOINTS
// ============================================

app.get('/api/customers', asyncHandler(async (req, res) => {
  const { page, limit, offset, sort, order, search } = parseQueryParams(req);
  const deleted = req.query.deleted === 'true' ? true : false;
  
  let query = 'SELECT * FROM customer WHERE deleted = $1';
  let params = [deleted];
  let paramIndex = 2;
  
  if (search) {
    const searchWhere = ` AND (first_name ILIKE $${paramIndex} OR last_name ILIKE $${paramIndex} OR company_name ILIKE $${paramIndex})`;
    query += searchWhere;
    params.push(`%${search}%`);
    paramIndex++;
  }
  
  const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as count');
  const countResult = await pool.query(countQuery, params);
  const total = parseInt(countResult.rows[0].count);
  
  query += ` ORDER BY ${sort} ${order} LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
  params.push(limit, offset);
  
  const result = await pool.query(query, params);
  
  res.json({
    data: result.rows,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  });
}));

app.post('/api/customers', asyncHandler(async (req, res) => {
  const { company_id, location_ids, first_name, last_name, company_name, email, phone, address1, city, state, postal_code } = req.body;
  
  if (!first_name && !company_name) {
    return res.status(400).json({ error: 'First name or company name is required' });
  }
  
  const result = await pool.query(
    'INSERT INTO customer (company_id, location_ids, first_name, last_name, company_name, address1, city, state, postal_code) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *',
    [company_id || uuidv4(), JSON.stringify(location_ids || []), first_name, last_name, company_name, address1, city, state, postal_code]
  );
  
  const customerId = result.rows[0].id;
  
  // Create email if provided
  if (email && location_ids && location_ids.length > 0) {
    await pool.query(
      'INSERT INTO email (company_id, location_id, customer_id, email, "primary") VALUES ($1, $2, $3, $4, true)',
      [company_id || uuidv4(), location_ids[0], customerId, email]
    );
  }
  
  // Create phone if provided
  if (phone && location_ids && location_ids.length > 0) {
    await pool.query(
      'INSERT INTO phone_number (company_id, location_id, customer_id, phone_number, "primary") VALUES ($1, $2, $3, $4, true)',
      [company_id || uuidv4(), location_ids[0], customerId, phone]
    );
  }
  
  res.status(201).json(result.rows[0]);
}));

app.get('/api/customers/:id', asyncHandler(async (req, res) => {
  const customer = await pool.query('SELECT * FROM customer WHERE id = $1 AND deleted = false', [req.params.id]);
  
  if (customer.rows.length === 0) return res.status(404).json({ error: 'Customer not found' });
  
  const emails = await pool.query('SELECT * FROM email WHERE customer_id = $1', [req.params.id]);
  const phones = await pool.query('SELECT * FROM phone_number WHERE customer_id = $1', [req.params.id]);
  const vehicles = await pool.query('SELECT v.* FROM vehicle v JOIN vehicle_owner vo ON v.id = vo.vehicle_id WHERE vo.customer_id = $1', [req.params.id]);
  
  res.json({
    ...customer.rows[0],
    emails: emails.rows,
    phones: phones.rows,
    vehicles: vehicles.rows
  });
}));

app.put('/api/customers/:id', asyncHandler(async (req, res) => {
  const { first_name, last_name, company_name, address1, city, state, postal_code, note } = req.body;
  
  const result = await pool.query(
    'UPDATE customer SET first_name = COALESCE($1, first_name), last_name = COALESCE($2, last_name), company_name = COALESCE($3, company_name), address1 = COALESCE($4, address1), city = COALESCE($5, city), state = COALESCE($6, state), postal_code = COALESCE($7, postal_code), note = COALESCE($8, note), updated_at = CURRENT_TIMESTAMP WHERE id = $9 RETURNING *',
    [first_name, last_name, company_name, address1, city, state, postal_code, note, req.params.id]
  );
  
  if (result.rows.length === 0) return res.status(404).json({ error: 'Customer not found' });
  res.json(result.rows[0]);
}));

// ============================================
// EMAIL ENDPOINTS
// ============================================

app.post('/api/emails', asyncHandler(async (req, res) => {
  const { company_id, location_id, customer_id, email, primary, marketing_opt_in } = req.body;
  
  if (!customer_id || !email || !location_id) {
    return res.status(400).json({ error: 'customer_id, email, and location_id are required' });
  }
  
  const result = await pool.query(
    'INSERT INTO email (company_id, location_id, customer_id, email, "primary", marketing_opt_in) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
    [company_id || uuidv4(), location_id, customer_id, email, primary || false, marketing_opt_in || false]
  );
  
  res.status(201).json(result.rows[0]);
}));

app.get('/api/customers/:id/emails', asyncHandler(async (req, res) => {
  const result = await pool.query('SELECT * FROM email WHERE customer_id = $1', [req.params.id]);
  res.json(result.rows);
}));

// ============================================
// PHONE_NUMBER ENDPOINTS
// ============================================

app.post('/api/phone-numbers', asyncHandler(async (req, res) => {
  const { company_id, location_id, customer_id, phone_number, phone_type, primary } = req.body;
  
  if (!customer_id || !phone_number || !location_id) {
    return res.status(400).json({ error: 'customer_id, phone_number, and location_id are required' });
  }
  
  const result = await pool.query(
    'INSERT INTO phone_number (company_id, location_id, customer_id, phone_number, phone_type, "primary") VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
    [company_id || uuidv4(), location_id, customer_id, phone_number, phone_type, primary || false]
  );
  
  res.status(201).json(result.rows[0]);
}));

app.get('/api/customers/:id/phones', asyncHandler(async (req, res) => {
  const result = await pool.query('SELECT * FROM phone_number WHERE customer_id = $1', [req.params.id]);
  res.json(result.rows);
}));

// ============================================
// VEHICLE ENDPOINTS
// ============================================

app.get('/api/vehicles', asyncHandler(async (req, res) => {
  const result = await pool.query('SELECT * FROM vehicle WHERE deleted = false ORDER BY created_at DESC');
  res.json(result.rows);
}));

app.post('/api/vehicles', asyncHandler(async (req, res) => {
  const { company_id, location_ids, name, make, model, year, vin, hin, color, engine, note } = req.body;
  
  if (!name) return res.status(400).json({ error: 'Vehicle name is required' });
  
  const result = await pool.query(
    'INSERT INTO vehicle (company_id, location_ids, name, make, model, year, vin, hin, color, engine, note) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *',
    [company_id || uuidv4(), JSON.stringify(location_ids || []), name, make, model, year, vin, hin, color, engine, note]
  );
  
  res.status(201).json(result.rows[0]);
}));

app.get('/api/vehicles/:id', asyncHandler(async (req, res) => {
  const result = await pool.query('SELECT * FROM vehicle WHERE id = $1 AND deleted = false', [req.params.id]);
  
  if (result.rows.length === 0) return res.status(404).json({ error: 'Vehicle not found' });
  res.json(result.rows[0]);
}));

app.put('/api/vehicles/:id', asyncHandler(async (req, res) => {
  const { name, make, model, year, vin, hin, color, engine, note } = req.body;
  
  const result = await pool.query(
    'UPDATE vehicle SET name = COALESCE($1, name), make = COALESCE($2, make), model = COALESCE($3, model), year = COALESCE($4, year), vin = COALESCE($5, vin), hin = COALESCE($6, hin), color = COALESCE($7, color), engine = COALESCE($8, engine), note = COALESCE($9, note), updated_at = CURRENT_TIMESTAMP WHERE id = $10 RETURNING *',
    [name, make, model, year, vin, hin, color, engine, note, req.params.id]
  );
  
  if (result.rows.length === 0) return res.status(404).json({ error: 'Vehicle not found' });
  res.json(result.rows[0]);
}));

// ============================================
// VEHICLE_OWNER ENDPOINTS
// ============================================

app.post('/api/vehicle-owners', asyncHandler(async (req, res) => {
  const { company_id, customer_id, vehicle_id } = req.body;
  
  if (!customer_id || !vehicle_id) {
    return res.status(400).json({ error: 'customer_id and vehicle_id are required' });
  }
  
  const result = await pool.query(
    'INSERT INTO vehicle_owner (company_id, customer_id, vehicle_id) VALUES ($1, $2, $3) RETURNING *',
    [company_id || uuidv4(), customer_id, vehicle_id]
  );
  
  res.status(201).json(result.rows[0]);
}));

app.get('/api/vehicles/:id/owners', asyncHandler(async (req, res) => {
  const result = await pool.query(
    'SELECT c.* FROM customer c JOIN vehicle_owner vo ON c.id = vo.customer_id WHERE vo.vehicle_id = $1',
    [req.params.id]
  );
  res.json(result.rows);
}));

// ============================================
// SERVICE ENDPOINTS
// ============================================

app.get('/api/services', asyncHandler(async (req, res) => {
  const result = await pool.query('SELECT * FROM service WHERE active = true ORDER BY name ASC');
  res.json(result.rows);
}));

app.post('/api/services', asyncHandler(async (req, res) => {
  const { company_id, location_id, name, description, category, price_base, labor_hours } = req.body;
  
  if (!name || !location_id) {
    return res.status(400).json({ error: 'Name and location_id are required' });
  }
  
  const result = await pool.query(
    'INSERT INTO service (company_id, location_id, name, description, category, price_base, labor_hours, active) VALUES ($1, $2, $3, $4, $5, $6, $7, true) RETURNING *',
    [company_id || uuidv4(), location_id, name, description, category, price_base, labor_hours]
  );
  
  res.status(201).json(result.rows[0]);
}));

app.get('/api/services/:id', asyncHandler(async (req, res) => {
  const result = await pool.query('SELECT * FROM service WHERE id = $1', [req.params.id]);
  
  if (result.rows.length === 0) return res.status(404).json({ error: 'Service not found' });
  res.json(result.rows[0]);
}));

app.put('/api/services/:id', asyncHandler(async (req, res) => {
  const { name, description, category, price_base, labor_hours, active } = req.body;
  
  const result = await pool.query(
    'UPDATE service SET name = COALESCE($1, name), description = COALESCE($2, description), category = COALESCE($3, category), price_base = COALESCE($4, price_base), labor_hours = COALESCE($5, labor_hours), active = COALESCE($6, active), updated_at = CURRENT_TIMESTAMP WHERE id = $7 RETURNING *',
    [name, description, category, price_base, labor_hours, active, req.params.id]
  );
  
  if (result.rows.length === 0) return res.status(404).json({ error: 'Service not found' });
  res.json(result.rows[0]);
}));

// ============================================
// LABOR ENDPOINTS
// ============================================

app.get('/api/labor-rates', asyncHandler(async (req, res) => {
  const result = await pool.query('SELECT * FROM labor WHERE active = true ORDER BY name ASC');
  res.json(result.rows);
}));

app.post('/api/labor-rates', asyncHandler(async (req, res) => {
  const { company_id, location_id, name, description, rate_cents, vehicle_type } = req.body;
  
  if (!name || !rate_cents || !location_id) {
    return res.status(400).json({ error: 'Name, rate_cents, and location_id are required' });
  }
  
  const result = await pool.query(
    'INSERT INTO labor (company_id, location_id, name, description, rate_cents, vehicle_type, active) VALUES ($1, $2, $3, $4, $5, $6, true) RETURNING *',
    [company_id || uuidv4(), location_id, name, description, rate_cents, vehicle_type]
  );
  
  res.status(201).json(result.rows[0]);
}));

// ============================================
// INVENTORY_PART ENDPOINTS
// ============================================

app.get('/api/inventory-parts', asyncHandler(async (req, res) => {
  const result = await pool.query('SELECT * FROM inventory_part WHERE deleted = false ORDER BY name ASC');
  res.json(result.rows);
}));

app.post('/api/inventory-parts', asyncHandler(async (req, res) => {
  const { company_id, location_id, name, sku, category_id, quantity, retail_cost_cents, taxable } = req.body;
  
  if (!name || !location_id) {
    return res.status(400).json({ error: 'Name and location_id are required' });
  }
  
  const result = await pool.query(
    'INSERT INTO inventory_part (company_id, location_id, name, sku, category_id, quantity, available_quantity, retail_cost_cents, taxable) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *',
    [company_id || uuidv4(), location_id, name, sku, category_id, quantity || 0, quantity || 0, retail_cost_cents || 0, taxable !== false]
  );
  
  res.status(201).json(result.rows[0]);
}));

app.get('/api/inventory-parts/:id', asyncHandler(async (req, res) => {
  const result = await pool.query('SELECT * FROM inventory_part WHERE id = $1 AND deleted = false', [req.params.id]);
  
  if (result.rows.length === 0) return res.status(404).json({ error: 'Part not found' });
  res.json(result.rows[0]);
}));

app.put('/api/inventory-parts/:id', asyncHandler(async (req, res) => {
  const { name, sku, quantity, retail_cost_cents, bin_location } = req.body;
  
  const result = await pool.query(
    'UPDATE inventory_part SET name = COALESCE($1, name), sku = COALESCE($2, sku), quantity = COALESCE($3, quantity), available_quantity = COALESCE($3, available_quantity), retail_cost_cents = COALESCE($4, retail_cost_cents), bin_location = COALESCE($5, bin_location), updated_at = CURRENT_TIMESTAMP WHERE id = $6 RETURNING *',
    [name, sku, quantity, retail_cost_cents, bin_location, req.params.id]
  );
  
  if (result.rows.length === 0) return res.status(404).json({ error: 'Part not found' });
  res.json(result.rows[0]);
}));

// ============================================
// APPOINTMENT ENDPOINTS
// ============================================

app.get('/api/appointments', asyncHandler(async (req, res) => {
  const result = await pool.query('SELECT a.*, c.first_name, c.last_name, v.name as vehicle_name FROM appointment a LEFT JOIN customer c ON a.customer_id = c.id LEFT JOIN vehicle v ON a.vehicle_id = v.id ORDER BY a.start_date DESC');
  res.json(result.rows);
}));

app.post('/api/appointments', asyncHandler(async (req, res) => {
  const { company_id, location_id, customer_id, vehicle_id, name, start_date, end_date, note, all_day } = req.body;
  
  if (!name || !start_date || !end_date || !location_id) {
    return res.status(400).json({ error: 'Name, start_date, end_date, and location_id are required' });
  }
  
  const result = await pool.query(
    'INSERT INTO appointment (company_id, location_id, customer_id, vehicle_id, name, start_date, end_date, note, all_day) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *',
    [company_id || uuidv4(), location_id, customer_id, vehicle_id, name, start_date, end_date, note || '', all_day || false]
  );
  
  res.status(201).json(result.rows[0]);
}));

app.get('/api/appointments/:id', asyncHandler(async (req, res) => {
  const result = await pool.query('SELECT * FROM appointment WHERE id = $1', [req.params.id]);
  
  if (result.rows.length === 0) return res.status(404).json({ error: 'Appointment not found' });
  res.json(result.rows[0]);
}));

app.put('/api/appointments/:id', asyncHandler(async (req, res) => {
  const { name, start_date, end_date, note, status } = req.body;
  
  const result = await pool.query(
    'UPDATE appointment SET name = COALESCE($1, name), start_date = COALESCE($2, start_date), end_date = COALESCE($3, end_date), note = COALESCE($4, note), status = COALESCE($5, status), updated_at = CURRENT_TIMESTAMP WHERE id = $6 RETURNING *',
    [name, start_date, end_date, note, status, req.params.id]
  );
  
  if (result.rows.length === 0) return res.status(404).json({ error: 'Appointment not found' });
  res.json(result.rows[0]);
}));

// ============================================
// APPOINTMENT_USER_CONNECTION ENDPOINTS
// ============================================

app.post('/api/appointment-assignments', asyncHandler(async (req, res) => {
  const { company_id, location_id, appointment_id, user_id } = req.body;
  
  if (!appointment_id || !user_id || !location_id) {
    return res.status(400).json({ error: 'appointment_id, user_id, and location_id are required' });
  }
  
  const result = await pool.query(
    'INSERT INTO appointment_user_connection (company_id, location_id, appointment_id, user_id) VALUES ($1, $2, $3, $4) RETURNING *',
    [company_id || uuidv4(), location_id, appointment_id, user_id]
  );
  
  res.status(201).json(result.rows[0]);
}));

app.get('/api/appointments/:id/technicians', asyncHandler(async (req, res) => {
  const result = await pool.query(
    'SELECT u.* FROM "user" u JOIN appointment_user_connection auc ON u.id = auc.user_id WHERE auc.appointment_id = $1',
    [req.params.id]
  );
  res.json(result.rows);
}));

// ============================================
// ORDER (JOB) ENDPOINTS
// ============================================

app.get('/api/orders', asyncHandler(async (req, res) => {
  const { page, limit, offset, sort, order, search } = parseQueryParams(req);
  const status = req.query.status;
  const location_id = req.query.location_id;
  const customer_id = req.query.customer_id;
  
  let whereClause = 'WHERE o.deleted = false';
  let params = [];
  let paramIndex = 1;
  
  if (status) {
    whereClause += ` AND o.status = $${paramIndex}`;
    params.push(status);
    paramIndex++;
  }
  
  if (location_id) {
    whereClause += ` AND o.location_id = $${paramIndex}`;
    params.push(location_id);
    paramIndex++;
  }
  
  if (customer_id) {
    whereClause += ` AND o.customer_id = $${paramIndex}`;
    params.push(customer_id);
    paramIndex++;
  }
  
  if (search) {
    whereClause += ` AND (c.first_name ILIKE $${paramIndex} OR c.last_name ILIKE $${paramIndex} OR o.order_number ILIKE $${paramIndex})`;
    params.push(`%${search}%`);
    paramIndex++;
  }
  
  // Build the main query
  const mainQuery = `
    SELECT o.*, c.first_name, c.last_name, c.company_name, v.name as vehicle_name, u.first_name as sw_first_name, u.last_name as sw_last_name
    FROM "order" o
    LEFT JOIN customer c ON o.customer_id = c.id
    LEFT JOIN vehicle v ON o.vehicle_id = v.id
    LEFT JOIN "user" u ON o.service_writer_id = u.id
    ${whereClause}
    ORDER BY o.${sort} ${order} LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;
  
  // Build the count query separately
  const countQuery = `
    SELECT COUNT(*) as count
    FROM "order" o
    LEFT JOIN customer c ON o.customer_id = c.id
    LEFT JOIN vehicle v ON o.vehicle_id = v.id
    LEFT JOIN "user" u ON o.service_writer_id = u.id
    ${whereClause}
  `;
  
  params.push(limit, offset);
  
  const countResult = await pool.query(countQuery, params.slice(0, paramIndex - 1));
  const total = parseInt(countResult.rows[0].count);
  
  const result = await pool.query(mainQuery, params);
  
  res.json({
    data: result.rows,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  });
}));

app.post('/api/orders', asyncHandler(async (req, res) => {
  const {
    company_id,
    location_id,
    customer_id,
    vehicle_id,
    appointment_id,
    service_writer_id,
    note,
    priority,
    status,
    appointment_date,
    due_date,
    payment_terms,
    customer_po,
    campaign,
    workflow_status
  } = req.body;

  if (!customer_id || !location_id) {
    return res.status(400).json({ error: 'customer_id and location_id are required' });
  }

  const result = await pool.query(
    `INSERT INTO "order" (
      company_id, location_id, customer_id, vehicle_id, appointment_id,
      service_writer_id, note, priority, status, appointment_date, due_date,
      payment_terms, customer_po, campaign, workflow_status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING *`,
    [
      company_id || uuidv4(),
      location_id,
      customer_id,
      vehicle_id,
      appointment_id,
      service_writer_id,
      note || '',
      priority || 'normal',
      status || 'open',
      appointment_date,
      due_date,
      payment_terms,
      customer_po,
      campaign,
      workflow_status
    ]
  );

  res.status(201).json(result.rows[0]);
}));

app.get('/api/orders/:id', asyncHandler(async (req, res) => {
  const order = await pool.query('SELECT * FROM "order" WHERE id = $1 AND deleted = false', [req.params.id]);

  if (order.rows.length === 0) return res.status(404).json({ error: 'Order not found' });

  const lineItems = await pool.query('SELECT * FROM order_line_item WHERE order_id = $1 ORDER BY ordinal', [req.params.id]);

  res.json({
    ...order.rows[0],
    line_items: lineItems.rows
  });
}));

// GET comprehensive order details with all related data
app.get('/api/orders/:id/details', asyncHandler(async (req, res) => {
  const orderId = req.params.id;

  // Get order with service writer info
  const orderResult = await pool.query(`
    SELECT o.*,
           sw.id as sw_id, sw.first_name as sw_first_name, sw.last_name as sw_last_name, sw.email as sw_email,
           l.name as location_name, l.address1, l.city, l.state, l.phone as location_phone
    FROM "order" o
    LEFT JOIN "user" sw ON o.service_writer_id = sw.id
    LEFT JOIN location l ON o.location_id = l.id
    WHERE o.id = $1 AND o.deleted = false
  `, [orderId]);

  if (orderResult.rows.length === 0) {
    return res.status(404).json({ error: 'Order not found' });
  }

  const order = orderResult.rows[0];

  // Get customer with emails and phones
  const customerResult = await pool.query(`
    SELECT c.*
    FROM customer c
    WHERE c.id = $1
  `, [order.customer_id]);

  const customer = customerResult.rows[0] || null;

  if (customer) {
    const emails = await pool.query('SELECT * FROM email WHERE customer_id = $1 ORDER BY "primary" DESC', [customer.id]);
    const phones = await pool.query('SELECT * FROM phone_number WHERE customer_id = $1 ORDER BY "primary" DESC', [customer.id]);
    customer.emails = emails.rows;
    customer.phones = phones.rows;
  }

  // Get vehicle
  const vehicleResult = await pool.query('SELECT * FROM vehicle WHERE id = $1', [order.vehicle_id]);
  const vehicle = vehicleResult.rows[0] || null;

  // Get assigned technicians
  const techniciansResult = await pool.query(`
    SELECT DISTINCT u.id, u.first_name, u.last_name, u.email, u.phone, u.role
    FROM "user" u
    JOIN timesheet t ON u.id = t.technician_id
    WHERE t.order_id = $1
  `, [orderId]);
  const technicians = techniciansResult.rows;

  // Get order line items (services)
  const lineItemsResult = await pool.query(`
    SELECT * FROM order_line_item
    WHERE order_id = $1
    ORDER BY ordinal, created_at
  `, [orderId]);
  const lineItems = lineItemsResult.rows;

  // Get inspections with items
  const inspectionsResult = await pool.query(`
    SELECT i.*,
           u.first_name as completed_by_first_name,
           u.last_name as completed_by_last_name
    FROM inspection i
    LEFT JOIN "user" u ON i.completed_by_id = u.id
    WHERE i.order_id = $1
    ORDER BY i.created_at DESC
  `, [orderId]);

  const inspections = inspectionsResult.rows;

  // Get inspection items for each inspection
  for (let inspection of inspections) {
    const itemsResult = await pool.query(`
      SELECT * FROM inspection_item
      WHERE inspection_id = $1
      ORDER BY ordinal, created_at
    `, [inspection.id]);
    inspection.items = itemsResult.rows;
  }

  // Get timesheets (time clocks)
  const timesheetsResult = await pool.query(`
    SELECT t.*,
           u.first_name as technician_first_name,
           u.last_name as technician_last_name,
           s.name as service_name
    FROM timesheet t
    LEFT JOIN "user" u ON t.technician_id = u.id
    LEFT JOIN service s ON t.service_id = s.id
    WHERE t.order_id = $1
    ORDER BY t.clock_in DESC
  `, [orderId]);
  const timesheets = timesheetsResult.rows;

  // Get transactions/payments
  const transactionsResult = await pool.query(`
    SELECT * FROM "transaction"
    WHERE order_id = $1
    ORDER BY created_at DESC
  `, [orderId]);
  const transactions = transactionsResult.rows;

  // Get messages (internal notes)
  const messagesResult = await pool.query(`
    SELECT m.*,
           u.first_name as author_first_name,
           u.last_name as author_last_name
    FROM message m
    LEFT JOIN "user" u ON m.author_id = u.id
    WHERE m.order_id = $1
    ORDER BY m.created_at DESC
  `, [orderId]);
  const messages = messagesResult.rows;

  // Get appointment if linked
  let appointment = null;
  if (order.appointment_id) {
    const appointmentResult = await pool.query('SELECT * FROM appointment WHERE id = $1', [order.appointment_id]);
    appointment = appointmentResult.rows[0] || null;
  }

  // Return comprehensive order details
  res.json({
    order: {
      ...order,
      service_writer: order.sw_id ? {
        id: order.sw_id,
        first_name: order.sw_first_name,
        last_name: order.sw_last_name,
        email: order.sw_email
      } : null
    },
    customer,
    vehicle,
    technicians,
    line_items: lineItems,
    inspections,
    timesheets,
    transactions,
    messages,
    appointment
  });
}));

app.put('/api/orders/:id', asyncHandler(async (req, res) => {
  const { note, priority, status, service_writer_id } = req.body;
  
  const result = await pool.query(
    'UPDATE "order" SET note = COALESCE($1, note), priority = COALESCE($2, priority), status = COALESCE($3, status), service_writer_id = COALESCE($4, service_writer_id), updated_at = CURRENT_TIMESTAMP WHERE id = $5 RETURNING *',
    [note, priority, status, service_writer_id, req.params.id]
  );
  
  if (result.rows.length === 0) return res.status(404).json({ error: 'Order not found' });
  res.json(result.rows[0]);
}));

// ============================================
// ORDER_LINE_ITEM ENDPOINTS
// ============================================

app.post('/api/order-line-items', asyncHandler(async (req, res) => {
  const { company_id, location_id, order_id, name, category, pricing, quantity, fixed_price_cents, labor_hours, note } = req.body;
  
  if (!order_id || !name || !location_id) {
    return res.status(400).json({ error: 'order_id, name, and location_id are required' });
  }
  
  const result = await pool.query(
    'INSERT INTO order_line_item (company_id, location_id, order_id, name, category, pricing, quantity, fixed_price_cents, labor_hours, note) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *',
    [company_id || uuidv4(), location_id, order_id, name, category, pricing || 'fixed', quantity, fixed_price_cents || 0, labor_hours, note || '']
  );
  
  res.status(201).json(result.rows[0]);
}));

app.get('/api/orders/:id/line-items', asyncHandler(async (req, res) => {
  const result = await pool.query('SELECT * FROM order_line_item WHERE order_id = $1 ORDER BY ordinal', [req.params.id]);
  res.json(result.rows);
}));

app.put('/api/order-line-items/:id', asyncHandler(async (req, res) => {
  const { name, quantity, fixed_price_cents, labor_hours, note } = req.body;
  
  const result = await pool.query(
    'UPDATE order_line_item SET name = COALESCE($1, name), quantity = COALESCE($2, quantity), fixed_price_cents = COALESCE($3, fixed_price_cents), labor_hours = COALESCE($4, labor_hours), note = COALESCE($5, note), updated_at = CURRENT_TIMESTAMP WHERE id = $6 RETURNING *',
    [name, quantity, fixed_price_cents, labor_hours, note, req.params.id]
  );
  
  if (result.rows.length === 0) return res.status(404).json({ error: 'Line item not found' });
  res.json(result.rows[0]);
}));

// ============================================
// INSPECTION ENDPOINTS
// ============================================

app.get('/api/inspections', asyncHandler(async (req, res) => {
  const result = await pool.query('SELECT i.*, o.order_number FROM inspection i LEFT JOIN "order" o ON i.order_id = o.id ORDER BY i.created_at DESC');
  res.json(result.rows);
}));

app.post('/api/inspections', asyncHandler(async (req, res) => {
  const { company_id, location_id, order_id, name, note } = req.body;
  
  if (!order_id || !name || !location_id) {
    return res.status(400).json({ error: 'order_id, name, and location_id are required' });
  }
  
  const result = await pool.query(
    'INSERT INTO inspection (company_id, location_id, order_id, name, note) VALUES ($1, $2, $3, $4, $5) RETURNING *',
    [company_id || uuidv4(), location_id, order_id, name, note || '']
  );
  
  res.status(201).json(result.rows[0]);
}));

app.put('/api/inspections/:id', asyncHandler(async (req, res) => {
  const { name, note, completed, completed_by_id } = req.body;
  
  const result = await pool.query(
    'UPDATE inspection SET name = COALESCE($1, name), note = COALESCE($2, note), completed = COALESCE($3, completed), completed_by_id = COALESCE($4, completed_by_id), completed_date = CASE WHEN $3 = true THEN CURRENT_TIMESTAMP ELSE completed_date END, updated_at = CURRENT_TIMESTAMP WHERE id = $5 RETURNING *',
    [name, note, completed, completed_by_id, req.params.id]
  );
  
  if (result.rows.length === 0) return res.status(404).json({ error: 'Inspection not found' });
  res.json(result.rows[0]);
}));

// ============================================
// INSPECTION_ITEM ENDPOINTS
// ============================================

app.post('/api/inspection-items', asyncHandler(async (req, res) => {
  const { company_id, location_id, inspection_id, name, message, status } = req.body;
  
  if (!inspection_id || !name || !message || !location_id) {
    return res.status(400).json({ error: 'inspection_id, name, message, and location_id are required' });
  }
  
  const result = await pool.query(
    'INSERT INTO inspection_item (company_id, location_id, inspection_id, name, message, status) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
    [company_id || uuidv4(), location_id, inspection_id, name, message, status || 'pending']
  );
  
  res.status(201).json(result.rows[0]);
}));

app.get('/api/inspections/:id/items', asyncHandler(async (req, res) => {
  const result = await pool.query('SELECT * FROM inspection_item WHERE inspection_id = $1 ORDER BY ordinal', [req.params.id]);
  res.json(result.rows);
}));

// ============================================
// TRANSACTION ENDPOINTS
// ============================================

app.get('/api/transactions', asyncHandler(async (req, res) => {
  const result = await pool.query(`
    SELECT t.*, c.first_name, c.last_name, o.order_number
    FROM "transaction" t
    LEFT JOIN customer c ON t.customer_id = c.id
    LEFT JOIN "order" o ON t.order_id = o.id
    ORDER BY t.created_at DESC
  `);
  res.json(result.rows);
}));

app.post('/api/transactions', asyncHandler(async (req, res) => {
  const { company_id, location_id, order_id, customer_id, transaction_type, amount_cents, payment_method, note } = req.body;
  
  if (!order_id || !customer_id || !amount_cents || !location_id) {
    return res.status(400).json({ error: 'order_id, customer_id, amount_cents, and location_id are required' });
  }
  
  const result = await pool.query(
    'INSERT INTO "transaction" (company_id, location_id, order_id, customer_id, transaction_type, amount_cents, payment_method, status, note) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *',
    [company_id || uuidv4(), location_id, order_id, customer_id, transaction_type || 'payment', amount_cents, payment_method, 'pending', note || '']
  );
  
  res.status(201).json(result.rows[0]);
}));

app.put('/api/transactions/:id', asyncHandler(async (req, res) => {
  const { status, applied_date, note } = req.body;
  
  const result = await pool.query(
    'UPDATE "transaction" SET status = COALESCE($1, status), applied_date = COALESCE($2, applied_date), note = COALESCE($3, note), updated_at = CURRENT_TIMESTAMP WHERE id = $4 RETURNING *',
    [status, applied_date, note, req.params.id]
  );
  
  if (result.rows.length === 0) return res.status(404).json({ error: 'Transaction not found' });
  res.json(result.rows[0]);
}));

// ============================================
// TIMESHEET ENDPOINTS
// ============================================

app.get('/api/timesheets', asyncHandler(async (req, res) => {
  const result = await pool.query(`
    SELECT t.*, u.first_name, u.last_name, o.order_number, s.name as service_name
    FROM timesheet t
    LEFT JOIN "user" u ON t.technician_id = u.id
    LEFT JOIN "order" o ON t.order_id = o.id
    LEFT JOIN service s ON t.service_id = s.id
    ORDER BY t.clock_in DESC
  `);
  res.json(result.rows);
}));

app.post('/api/timesheets', asyncHandler(async (req, res) => {
  const { company_id, location_id, technician_id, order_id, service_id, activity, type, clock_in, note } = req.body;
  
  if (!technician_id || !activity || !type || !clock_in || !location_id) {
    return res.status(400).json({ error: 'technician_id, activity, type, clock_in, and location_id are required' });
  }
  
  const result = await pool.query(
    'INSERT INTO timesheet (company_id, location_id, technician_id, order_id, service_id, activity, type, clock_in, note, number) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *',
    [company_id || uuidv4(), location_id, technician_id, order_id, service_id, activity, type, clock_in, note || '', `TS-${Date.now()}`]
  );
  
  res.status(201).json(result.rows[0]);
}));

app.put('/api/timesheets/:id', asyncHandler(async (req, res) => {
  const { clock_out, in_progress, note } = req.body;
  
  const result = await pool.query(
    'UPDATE timesheet SET clock_out = COALESCE($1, clock_out), in_progress = COALESCE($2, in_progress), note = COALESCE($3, note), updated_at = CURRENT_TIMESTAMP WHERE id = $4 RETURNING *',
    [clock_out, in_progress, note, req.params.id]
  );
  
  if (result.rows.length === 0) return res.status(404).json({ error: 'Timesheet not found' });
  res.json(result.rows[0]);
}));

// ============================================
// MESSAGE ENDPOINTS
// ============================================

app.get('/api/messages', asyncHandler(async (req, res) => {
  const result = await pool.query(`
    SELECT m.*, c.first_name, c.last_name, o.order_number
    FROM message m
    LEFT JOIN customer c ON m.customer_id = c.id
    LEFT JOIN "order" o ON m.order_id = o.id
    ORDER BY m.created_at DESC
  `);
  res.json(result.rows);
}));

app.post('/api/messages', asyncHandler(async (req, res) => {
  const { company_id, location_id, customer_id, order_id, message_type, channel, body, subject, direction } = req.body;
  
  if (!customer_id || !body || !location_id) {
    return res.status(400).json({ error: 'customer_id, body, and location_id are required' });
  }
  
  const result = await pool.query(
    'INSERT INTO message (company_id, location_id, customer_id, order_id, message_type, channel, body, subject, direction) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *',
    [company_id || uuidv4(), location_id, customer_id, order_id, message_type, channel, body, subject, direction || 'outbound']
  );
  
  res.status(201).json(result.rows[0]);
}));

app.get('/api/messages/:id', asyncHandler(async (req, res) => {
  const result = await pool.query('SELECT * FROM message WHERE id = $1', [req.params.id]);
  
  if (result.rows.length === 0) return res.status(404).json({ error: 'Message not found' });
  res.json(result.rows[0]);
}));

// ============================================
// SEARCH ENDPOINTS
// ============================================

app.get('/api/search', asyncHandler(async (req, res) => {
  const { search } = parseQueryParams(req);
  
  if (!search || search.length < 2) {
    return res.status(400).json({ error: 'Search term must be at least 2 characters' });
  }
  
  const searchTerm = `%${search}%`;
  
  const customers = await pool.query(
    'SELECT id, first_name, last_name, company_name, \'customer\' as type FROM customer WHERE (first_name ILIKE $1 OR last_name ILIKE $1 OR company_name ILIKE $1) AND deleted = false LIMIT 10',
    [searchTerm]
  );
  
  const vehicles = await pool.query(
    'SELECT id, name, make, model, year, \'vehicle\' as type FROM vehicle WHERE (name ILIKE $1 OR make ILIKE $1 OR model ILIKE $1) AND deleted = false LIMIT 10',
    [searchTerm]
  );
  
  const orders = await pool.query(
    'SELECT id, order_number, \'order\' as type FROM "order" WHERE order_number ILIKE $1 AND deleted = false LIMIT 10',
    [searchTerm]
  );
  
  res.json({
    results: {
      customers: customers.rows,
      vehicles: vehicles.rows,
      orders: orders.rows
    }
  });
}));

// ============================================
// APPOINTMENTS - WITH FILTERING
// ============================================

app.get('/api/appointments/filter', asyncHandler(async (req, res) => {
  const { page, limit, offset, sort, order } = parseQueryParams(req);
  const status = req.query.status;
  const location_id = req.query.location_id;
  const customer_id = req.query.customer_id;
  const start_date = req.query.start_date;
  const end_date = req.query.end_date;
  
  let whereClause = '';
  let params = [];
  let paramIndex = 1;
  
  if (status) {
    whereClause += ` AND a.status = $${paramIndex}`;
    params.push(status);
    paramIndex++;
  }
  
  if (location_id) {
    whereClause += ` AND a.location_id = $${paramIndex}`;
    params.push(location_id);
    paramIndex++;
  }
  
  if (customer_id) {
    whereClause += ` AND a.customer_id = $${paramIndex}`;
    params.push(customer_id);
    paramIndex++;
  }
  
  if (start_date) {
    whereClause += ` AND a.start_date >= $${paramIndex}`;
    params.push(start_date);
    paramIndex++;
  }
  
  if (end_date) {
    whereClause += ` AND a.end_date <= $${paramIndex}`;
    params.push(end_date);
    paramIndex++;
  }
  
  const countQuery = `
    SELECT COUNT(*) as count FROM appointment a
    WHERE 1=1 ${whereClause}
  `;
  
  const countResult = await pool.query(countQuery, params);
  const total = parseInt(countResult.rows[0].count);
  
  const mainQuery = `
    SELECT a.*, c.first_name, c.last_name, v.name as vehicle_name
    FROM appointment a
    LEFT JOIN customer c ON a.customer_id = c.id
    LEFT JOIN vehicle v ON a.vehicle_id = v.id
    WHERE 1=1 ${whereClause}
    ORDER BY a.${sort} ${order}
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;
  
  params.push(limit, offset);
  
  const result = await pool.query(mainQuery, params);
  
  res.json({
    data: result.rows,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  });
}));

// ============================================
// REPORTS - BUSINESS INTELLIGENCE
// ============================================

// Revenue Report
app.get('/api/reports/revenue', asyncHandler(async (req, res) => {
  const start_date = req.query.start_date;
  const end_date = req.query.end_date;
  const location_id = req.query.location_id;
  
  let whereClause = 'WHERE t.status = \'completed\' OR t.status = \'paid\'';
  let params = [];
  let paramIndex = 1;
  
  if (start_date) {
    whereClause += ` AND t.created_at >= $${paramIndex}`;
    params.push(start_date);
    paramIndex++;
  }
  
  if (end_date) {
    whereClause += ` AND t.created_at <= $${paramIndex}`;
    params.push(end_date);
    paramIndex++;
  }
  
  if (location_id) {
    whereClause += ` AND t.location_id = $${paramIndex}`;
    params.push(location_id);
    paramIndex++;
  }
  
  const result = await pool.query(`
    SELECT 
      SUM(amount_cents) as total_revenue_cents,
      COUNT(*) as transaction_count,
      AVG(amount_cents) as avg_transaction_cents,
      MAX(amount_cents) as max_transaction_cents,
      MIN(amount_cents) as min_transaction_cents
    FROM "transaction" t
    ${whereClause}
  `, params);
  
  const data = result.rows[0];
  
  res.json({
    total_revenue_cents: data.total_revenue_cents || 0,
    total_revenue: ((data.total_revenue_cents || 0) / 100).toFixed(2),
    transaction_count: parseInt(data.transaction_count) || 0,
    avg_transaction: ((data.avg_transaction_cents || 0) / 100).toFixed(2),
    max_transaction: ((data.max_transaction_cents || 0) / 100).toFixed(2),
    min_transaction: ((data.min_transaction_cents || 0) / 100).toFixed(2)
  });
}));

// Orders by Status Report
app.get('/api/reports/orders-by-status', asyncHandler(async (req, res) => {
  const location_id = req.query.location_id;
  
  let whereClause = 'WHERE o.deleted = false';
  let params = [];
  let paramIndex = 1;
  
  if (location_id) {
    whereClause += ` AND o.location_id = $${paramIndex}`;
    params.push(location_id);
    paramIndex++;
  }
  
  const result = await pool.query(`
    SELECT 
      status,
      COUNT(*) as count,
      AVG(calculated_total_cents) as avg_value_cents
    FROM "order" o
    ${whereClause}
    GROUP BY status
    ORDER BY count DESC
  `, params);
  
  res.json({
    data: result.rows.map(row => ({
      status: row.status,
      count: parseInt(row.count),
      avg_value: ((row.avg_value_cents || 0) / 100).toFixed(2)
    }))
  });
}));

// Technician Performance Report
app.get('/api/reports/technician-performance', asyncHandler(async (req, res) => {
  const location_id = req.query.location_id;
  const start_date = req.query.start_date;
  const end_date = req.query.end_date;
  
  let whereClause = 'WHERE t.in_progress = false';
  let params = [];
  let paramIndex = 1;
  
  if (location_id) {
    whereClause += ` AND t.location_id = $${paramIndex}`;
    params.push(location_id);
    paramIndex++;
  }
  
  if (start_date) {
    whereClause += ` AND t.clock_in >= $${paramIndex}`;
    params.push(start_date);
    paramIndex++;
  }
  
  if (end_date) {
    whereClause += ` AND t.clock_out <= $${paramIndex}`;
    params.push(end_date);
    paramIndex++;
  }
  
  const result = await pool.query(`
    SELECT 
      u.id,
      u.first_name,
      u.last_name,
      COUNT(t.id) as hours_logged,
      SUM(EXTRACT(EPOCH FROM (t.clock_out - t.clock_in)) / 3600) as total_hours,
      COUNT(DISTINCT t.order_id) as orders_completed
    FROM timesheet t
    LEFT JOIN "user" u ON t.technician_id = u.id
    ${whereClause}
    GROUP BY u.id, u.first_name, u.last_name
    ORDER BY total_hours DESC
  `, params);
  
  res.json({
    data: result.rows.map(row => ({
      technician_id: row.id,
      technician_name: `${row.first_name} ${row.last_name}`,
      hours_logged: parseInt(row.hours_logged),
      total_hours: parseFloat(row.total_hours || 0).toFixed(2),
      orders_completed: parseInt(row.orders_completed)
    }))
  });
}));

// Customer Activity Report
app.get('/api/reports/customer-activity', asyncHandler(async (req, res) => {
  const location_id = req.query.location_id;
  const min_orders = parseInt(req.query.min_orders) || 0;
  
  let whereClause = 'WHERE c.deleted = false';
  let params = [];
  let paramIndex = 1;
  
  if (location_id) {
    whereClause += ` AND c.location_ids::text LIKE $${paramIndex}`;
    params.push(`%${location_id}%`);
    paramIndex++;
  }
  
  const result = await pool.query(`
    SELECT 
      c.id,
      c.first_name,
      c.last_name,
      c.company_name,
      COUNT(o.id) as total_orders,
      SUM(o.calculated_total_cents) as total_spent_cents,
      MAX(o.created_at) as last_order_date,
      COUNT(DISTINCT v.id) as vehicle_count
    FROM customer c
    LEFT JOIN "order" o ON c.id = o.customer_id
    LEFT JOIN vehicle_owner vo ON c.id = vo.customer_id
    LEFT JOIN vehicle v ON vo.vehicle_id = v.id
    ${whereClause}
    GROUP BY c.id, c.first_name, c.last_name, c.company_name
    HAVING COUNT(o.id) >= $${paramIndex}
    ORDER BY total_spent_cents DESC
  `, [
    ...params,
    min_orders
  ]);
  
  res.json({
    data: result.rows.map(row => ({
      customer_id: row.id,
      customer_name: row.company_name || `${row.first_name} ${row.last_name}`,
      total_orders: parseInt(row.total_orders),
      total_spent: ((row.total_spent_cents || 0) / 100).toFixed(2),
      last_order_date: row.last_order_date,
      vehicle_count: parseInt(row.vehicle_count)
    }))
  });
}));

// Inventory Status Report
app.get('/api/reports/inventory-status', asyncHandler(async (req, res) => {
  const location_id = req.query.location_id;
  const low_stock_threshold = parseInt(req.query.low_stock_threshold) || 5;
  
  let whereClause = 'WHERE ip.deleted = false';
  let params = [];
  let paramIndex = 1;
  
  if (location_id) {
    whereClause += ` AND ip.location_id = $${paramIndex}`;
    params.push(location_id);
    paramIndex++;
  }
  
  const result = await pool.query(`
    SELECT 
      SUM(quantity) as total_parts,
      SUM(quantity * retail_cost_cents) as total_inventory_value_cents,
      COUNT(CASE WHEN available_quantity <= ${low_stock_threshold} THEN 1 END) as low_stock_items,
      COUNT(CASE WHEN available_quantity = 0 THEN 1 END) as out_of_stock_items,
      AVG(retail_cost_cents) as avg_part_cost_cents
    FROM inventory_part
    ${whereClause}
  `, params);
  
  const data = result.rows[0];
  
  res.json({
    total_parts: parseInt(data.total_parts) || 0,
    total_inventory_value: ((data.total_inventory_value_cents || 0) / 100).toFixed(2),
    low_stock_items: parseInt(data.low_stock_items) || 0,
    out_of_stock_items: parseInt(data.out_of_stock_items) || 0,
    avg_part_cost: ((data.avg_part_cost_cents || 0) / 100).toFixed(2)
  });
}));

// ============================================
// STRIPE PAYMENT ENDPOINTS
// ============================================

// Create Payment Intent for an order
app.post('/api/payments/create-intent', asyncHandler(async (req, res) => {
  const { order_id, amount_cents, customer_id, description } = req.body;
  
  if (!order_id || !amount_cents || !customer_id) {
    return res.status(400).json({ error: 'order_id, amount_cents, and customer_id are required' });
  }
  
  // Get customer info from database
  const customerResult = await pool.query('SELECT * FROM customer WHERE id = $1', [customer_id]);
  
  if (customerResult.rows.length === 0) {
    return res.status(404).json({ error: 'Customer not found' });
  }
  
  const customer = customerResult.rows[0];
  
  try {
    // Create Stripe Customer if they don't have one
    let stripeCustomerId = customer.stripe_customer_id;
    
    if (!stripeCustomerId) {
      const stripeCustomer = await stripe.customers.create({
        email: customer.email || undefined,
        name: customer.company_name || `${customer.first_name} ${customer.last_name}`,
        description: `Poseidon Marine Customer - ${customer_id}`
      });
      
      stripeCustomerId = stripeCustomer.id;
      
      // Save Stripe customer ID to database
      await pool.query(
        'UPDATE customer SET stripe_customer_id = $1 WHERE id = $2',
        [stripeCustomerId, customer_id]
      );
    }
    
    // Create Payment Intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount_cents,
      currency: 'usd',
      customer: stripeCustomerId,
      metadata: {
        order_id,
        customer_id,
        company: 'Poseidon Marine'
      },
      description: description || `Payment for Order ${order_id}`
    });
    
    res.json({
      client_secret: paymentIntent.client_secret,
      payment_intent_id: paymentIntent.id,
      amount: amount_cents,
      status: paymentIntent.status
    });
    
  } catch (error) {
    console.error('Stripe error:', error);
    res.status(500).json({ error: error.message });
  }
}));

// Confirm Payment and Create Transaction
app.post('/api/payments/confirm', asyncHandler(async (req, res) => {
  const { payment_intent_id, order_id, customer_id, location_id } = req.body;
  
  if (!payment_intent_id || !order_id || !customer_id) {
    return res.status(400).json({ error: 'payment_intent_id, order_id, and customer_id are required' });
  }
  
  try {
    // Get payment intent from Stripe
    const paymentIntent = await stripe.paymentIntents.retrieve(payment_intent_id);
    
    if (paymentIntent.status !== 'succeeded') {
      return res.status(400).json({ 
        error: `Payment not successful. Status: ${paymentIntent.status}` 
      });
    }
    
    // Create transaction record in database
    const result = await pool.query(
      'INSERT INTO "transaction" (company_id, location_id, order_id, customer_id, transaction_type, amount_cents, payment_method, status, payment_reference) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *',
      [
        paymentIntent.metadata.company_id || 'default',
        location_id || paymentIntent.metadata.location_id,
        order_id,
        customer_id,
        'payment',
        paymentIntent.amount,
        'stripe',
        'paid',
        paymentIntent.id
      ]
    );
    
    res.json({
      success: true,
      transaction: result.rows[0],
      payment_status: paymentIntent.status,
      amount: paymentIntent.amount
    });
    
  } catch (error) {
    console.error('Stripe error:', error);
    res.status(500).json({ error: error.message });
  }
}));

// Get Payment Intent Status
app.get('/api/payments/:payment_intent_id', asyncHandler(async (req, res) => {
  try {
    const paymentIntent = await stripe.paymentIntents.retrieve(req.params.payment_intent_id);
    
    res.json({
      payment_intent_id: paymentIntent.id,
      status: paymentIntent.status,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      created: paymentIntent.created
    });
    
  } catch (error) {
    console.error('Stripe error:', error);
    res.status(500).json({ error: error.message });
  }
}));

// Get all transactions for an order
app.get('/api/orders/:id/payments', asyncHandler(async (req, res) => {
  const result = await pool.query(
    'SELECT * FROM "transaction" WHERE order_id = $1 ORDER BY created_at DESC',
    [req.params.id]
  );
  
  res.json(result.rows);
}));

// Refund a payment
app.post('/api/payments/refund', asyncHandler(async (req, res) => {
  const { payment_intent_id, reason } = req.body;
  
  if (!payment_intent_id) {
    return res.status(400).json({ error: 'payment_intent_id is required' });
  }
  
  try {
    const refund = await stripe.refunds.create({
      payment_intent: payment_intent_id,
      reason: reason || 'requested_by_customer'
    });
    
    res.json({
      refund_id: refund.id,
      status: refund.status,
      amount: refund.amount
    });
    
  } catch (error) {
    console.error('Stripe error:', error);
    res.status(500).json({ error: error.message });
  }
}));

// ============================================
// SERVER STARTUP
// ============================================

app.listen(PORT, () => {
  console.log(`Chariot API running on http://localhost:${PORT}`);
  console.log('Database: PostgreSQL');
  console.log('Tables: 24');
  console.log('Endpoints: 60+');
});