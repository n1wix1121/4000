require('dotenv').config()
const { Client } = require('pg')
const fs = require('fs')

async function main() {
    const c = new Client({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD
    })
    await c.connect()
    const sql = fs.readFileSync('./migrations/001_init.sql', 'utf8')
    await c.query(sql)
    await c.query("INSERT INTO migrations (name) VALUES ('001') ON CONFLICT DO NOTHING")
    console.log('OK')
    await c.end()
}
main().catch(console.log)