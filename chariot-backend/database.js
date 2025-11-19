const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

// Database connection pool
// A pool manages multiple connections so you don't create new one every request
const pool = new Pool({
  user: 'postgres',           // PostgreSQL default user
  password: '',               // No password needed for local
  host: 'localhost',          // Your computer
  port: 5434,                 // Port you set (5434, not 5432)
  database: 'chariot_dev'     // Database name (we'll create this)
});

// Test the connection
pool.on('connect', () => {
  console.log('Connected to PostgreSQL');
});

// Handle errors
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

module.exports = pool;