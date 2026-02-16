#!/usr/bin/env node

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

async function setupDatabase() {
    try {
        console.log('🔗 Connecting to Supabase database...');
        
        // Test connection
        const client = await pool.connect();
        const result = await client.query('SELECT NOW()');
        console.log('✅ Connected to database:', result.rows[0].now);
        client.release();

        // Read schema file
        const schemaPath = path.join(__dirname, 'database', 'schema.sql');
        const schema = fs.readFileSync(schemaPath, 'utf8');

        console.log('📝 Running schema migrations...');
        
        // Execute schema
        await pool.query(schema);
        console.log('✅ Schema created successfully!');

        // Read seed file (optional)
        try {
            const seedPath = path.join(__dirname, 'database', 'seed.sql');
            if (fs.existsSync(seedPath)) {
                const seed = fs.readFileSync(seedPath, 'utf8');
                console.log('🌱 Running seed data...');
                await pool.query(seed);
                console.log('✅ Seed data inserted successfully!');
            }
        } catch (err) {
            console.warn('⚠️  Seed file optional, skipping:', err.message);
        }

        console.log('\n🎉 Database setup complete!');
        console.log('📊 Your Supabase database is ready to use.');
        
    } catch (error) {
        console.error('❌ Database setup failed:', error.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

setupDatabase();
