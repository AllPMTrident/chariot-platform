const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Create database connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Get all SQL files in migrations directory
const getMigrationFiles = () => {
  const migrationsDir = __dirname;
  const files = fs.readdirSync(migrationsDir)
    .filter(file => file.endsWith('.sql'))
    .sort(); // Run in alphabetical order (001_, 002_, etc.)

  return files.map(file => ({
    name: file,
    path: path.join(migrationsDir, file)
  }));
};

// Run a single migration file
const runMigration = async (migration) => {
  console.log(`\n📝 Running migration: ${migration.name}`);

  try {
    const sql = fs.readFileSync(migration.path, 'utf8');
    await pool.query(sql);
    console.log(`✅ Success: ${migration.name}`);
    return true;
  } catch (error) {
    console.error(`❌ Error in ${migration.name}:`);
    console.error(error.message);
    return false;
  }
};

// Main migration runner
const runMigrations = async () => {
  console.log('🚀 Starting database migrations...\n');
  console.log('📦 Database:', process.env.DATABASE_URL?.split('@')[1]?.split('?')[0] || 'Unknown');

  const migrations = getMigrationFiles();

  if (migrations.length === 0) {
    console.log('\n⚠️  No migration files found in migrations/ directory');
    return;
  }

  console.log(`\n📋 Found ${migrations.length} migration(s):\n`);
  migrations.forEach((m, i) => console.log(`   ${i + 1}. ${m.name}`));

  let successCount = 0;
  let errorCount = 0;

  for (const migration of migrations) {
    const success = await runMigration(migration);
    if (success) {
      successCount++;
    } else {
      errorCount++;
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log(`\n📊 Migration Summary:`);
  console.log(`   ✅ Successful: ${successCount}`);
  console.log(`   ❌ Failed: ${errorCount}`);
  console.log(`   📝 Total: ${migrations.length}`);

  if (errorCount === 0) {
    console.log('\n🎉 All migrations completed successfully!\n');
  } else {
    console.log('\n⚠️  Some migrations failed. Please check the errors above.\n');
  }
};

// Run migrations and close connection
runMigrations()
  .then(() => {
    pool.end();
    process.exit(errorCount > 0 ? 1 : 0);
  })
  .catch((error) => {
    console.error('\n💥 Fatal error:', error.message);
    pool.end();
    process.exit(1);
  });
