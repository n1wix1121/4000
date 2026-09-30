require('dotenv').config()
const express = require('express')
const { Pool } = require('pg')

const app = express()
app.use(express.json())
app.use(express.static('public'))

const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
})

function todayLocal() {
    const d = new Date()
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
}

function addDays(dateStr, days) {
    const d = new Date(dateStr + 'T12:00:00')
    d.setDate(d.getDate() + days)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
}

function fmtDate(value) {
    if (!value) return null
    if (typeof value === 'string') return value.slice(0, 10)
    const y = value.getFullYear()
    const m = String(value.getMonth() + 1).padStart(2, '0')
    const d = String(value.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
}

function subStatus(sub, today) {
    if (!sub) return 'Нет абонемента'
    const end = fmtDate(sub.end_date)
    const rem = sub.remaining_visits
    if (end && end < today) return 'Истёк'
    if (rem !== null && rem !== undefined && rem <= 0) return 'Истёк'
    if (rem === 1) return 'Последнее посещение'
    if (end && end === today) return 'Последнее посещение'
    return 'Действует'
}

function calcSale(type, saleDate) {
    const visits = type.visits_count
    const duration = type.duration_days
    let end = null
    let remaining = visits

    if (duration != null) {
        if (duration <= 1) end = saleDate
        else end = addDays(saleDate, duration)
    }

    return { end, remaining }
}

function mapClientRow(row, today) {
    const sub = row.sub_id ? {
        id: row.sub_id,
        tname: row.tname,
        end_date: fmtDate(row.end_date),
        remaining_visits: row.remaining_visits,
        sale_date: fmtDate(row.sale_date),
        price: row.sub_price
    } : null
    return {
        id: row.id,
        full_name: row.full_name,
        phone: row.phone,
        birth_date: fmtDate(row.birth_date),
        sub,
        status: subStatus(sub, today)
    }
}

const CURRENT_SUB_SQL = `
    SELECT c.*,
           s.id AS sub_id,
           s.end_date,
           s.remaining_visits,
           s.sale_date,
           s.price AS sub_price,
           st.name AS tname
    FROM clients c
    LEFT JOIN LATERAL (
        SELECT * FROM subscriptions
        WHERE client_id = c.id
        ORDER BY id DESC
        LIMIT 1
    ) s ON true
    LEFT JOIN subscription_types st ON st.id = s.type_id
`

async function getClientWithSub(id) {
    const r = await pool.query(CURRENT_SUB_SQL + ' WHERE c.id = $1', [id])
    return r.rows[0] || null
}

function sendError(res, status, message) {
    res.status(status).json({ error: message })
}

app.get('/api/clients', async (req, res) => {
    try {
        const q = (req.query.q || '').trim()
        const today = todayLocal()
        let r
        if (q) {
            r = await pool.query(
                CURRENT_SUB_SQL + ' WHERE c.full_name ILIKE $1 OR c.phone ILIKE $1 ORDER BY c.full_name',
                ['%' + q + '%']
            )
        } else {
            r = await pool.query(CURRENT_SUB_SQL + ' ORDER BY c.full_name')
        }
        res.json(r.rows.map(row => mapClientRow(row, today)))
    } catch (e) {
        console.error(e)
        sendError(res, 500, 'Не удалось загрузить клиентов')
    }
})

app.get('/api/clients/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10)
        if (!id) return sendError(res, 400, 'Неверный ID')
        const row = await getClientWithSub(id)
        if (!row) return sendError(res, 404, 'Клиент не найден')
        res.json(mapClientRow(row, todayLocal()))
    } catch (e) {
        console.error(e)
        sendError(res, 500, 'Ошибка загрузки клиента')
    }
})

app.post('/api/clients', async (req, res) => {
    try {
        const { name, phone, birth } = req.body
        const fullName = (name || '').trim()
        const phoneVal = (phone || '').trim()
        if (!fullName || !phoneVal) return sendError(res, 400, 'Укажите ФИО и телефон')

        const exists = await pool.query('SELECT id FROM clients WHERE phone = $1', [phoneVal])
        if (exists.rows.length) return sendError(res, 400, 'Клиент с таким номером телефона уже есть')

        const r = await pool.query(
            'INSERT INTO clients (full_name, phone, birth_date) VALUES ($1, $2, $3) RETURNING *',
            [fullName, phoneVal, birth || null]
        )
        res.json({ ok: true, client: r.rows[0] })
    } catch (e) {
        console.error(e)
        sendError(res, 400, 'Не удалось добавить клиента')
    }
})

app.put('/api/clients/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10)
        const { name, phone, birth } = req.body
        const fullName = (name || '').trim()
        const phoneVal = (phone || '').trim()
        if (!id) return sendError(res, 400, 'Неверный ID')
        if (!fullName || !phoneVal) return sendError(res, 400, 'Укажите ФИО и телефон')

        const exists = await pool.query('SELECT id FROM clients WHERE phone = $1 AND id <> $2', [phoneVal, id])
        if (exists.rows.length) return sendError(res, 400, 'Клиент с таким номером телефона уже есть')

        const r = await pool.query(
            'UPDATE clients SET full_name=$1, phone=$2, birth_date=$3 WHERE id=$4 RETURNING *',
            [fullName, phoneVal, birth || null, id]
        )
        if (!r.rows.length) return sendError(res, 404, 'Клиент не найден')
        res.json({ ok: true, client: r.rows[0] })
    } catch (e) {
        console.error(e)
        sendError(res, 400, 'Не удалось сохранить изменения')
    }
})

app.delete('/api/clients/:id', async (req, res) => {
    const client = await pool.connect()
    try {
        const id = parseInt(req.params.id, 10)
        if (!id) return sendError(res, 400, 'Неверный ID')
        await client.query('BEGIN')
        await client.query('DELETE FROM visits WHERE client_id=$1', [id])
        await client.query('DELETE FROM subscriptions WHERE client_id=$1', [id])
        const r = await client.query('DELETE FROM clients WHERE id=$1 RETURNING id', [id])
        await client.query('COMMIT')
        if (!r.rows.length) return sendError(res, 404, 'Клиент не найден')
        res.json({ ok: true })
    } catch (e) {
        await client.query('ROLLBACK')
        console.error(e)
        sendError(res, 400, 'Не удалось удалить клиента')
    } finally {
        client.release()
    }
})

app.get('/api/types', async (req, res) => {
    try {
        const r = await pool.query('SELECT * FROM subscription_types ORDER BY id')
        res.json(r.rows)
    } catch (e) {
        console.error(e)
        sendError(res, 500, 'Не удалось загрузить типы абонементов')
    }
})

app.post('/api/sell', async (req, res) => {
    try {
        const cid = parseInt(req.body.cid, 10)
        const tid = parseInt(req.body.tid, 10)
        const price = Number(req.body.price)
        if (!cid || !tid) return sendError(res, 400, 'Выберите клиента и тип абонемента')
        if (!Number.isFinite(price) || price < 0) return sendError(res, 400, 'Укажите стоимость')

        const t = await pool.query('SELECT * FROM subscription_types WHERE id=$1', [tid])
        if (!t.rows.length) return sendError(res, 400, 'Тип абонемента не найден')
        const client = await pool.query('SELECT id FROM clients WHERE id=$1', [cid])
        if (!client.rows.length) return sendError(res, 400, 'Клиент не найден')

        const saleDate = todayLocal()
        const { end, remaining } = calcSale(t.rows[0], saleDate)

        const r = await pool.query(
            `INSERT INTO subscriptions (client_id, type_id, sale_date, start_date, end_date, remaining_visits, price)
             VALUES ($1,$2,$3,$3,$4,$5,$6) RETURNING *`,
            [cid, tid, saleDate, end, remaining, price]
        )
        res.json({ ok: true, subscription: r.rows[0] })
    } catch (e) {
        console.error(e)
        sendError(res, 400, 'Не удалось продать абонемент')
    }
})

app.get('/api/info/:id', async (req, res) => {
    try {
        const cid = parseInt(req.params.id, 10)
        if (!cid) return sendError(res, 400, 'Неверный ID')
        const row = await getClientWithSub(cid)
        if (!row) return sendError(res, 404, 'Клиент не найден')

        const today = todayLocal()
        const mapped = mapClientRow(row, today)
        const hist = await pool.query(
            `SELECT s.sale_date, st.name, s.price, s.end_date, s.remaining_visits
             FROM subscriptions s
             JOIN subscription_types st ON s.type_id=st.id
             WHERE s.client_id=$1
             ORDER BY s.id DESC`,
            [cid]
        )
        const vis = await pool.query(
            'SELECT visit_date FROM visits WHERE client_id=$1 ORDER BY id DESC',
            [cid]
        )
        res.json({
            client: {
                id: mapped.id,
                full_name: mapped.full_name,
                phone: mapped.phone,
                birth_date: mapped.birth_date
            },
            sub: mapped.sub,
            status: mapped.status,
            history: hist.rows.map(h => ({
                name: h.name,
                sale_date: fmtDate(h.sale_date),
                price: h.price,
                end_date: fmtDate(h.end_date),
                remaining_visits: h.remaining_visits
            })),
            visits: vis.rows.map(v => ({ visit_date: v.visit_date }))
        })
    } catch (e) {
        console.error(e)
        sendError(res, 500, 'Ошибка загрузки карточки')
    }
})

app.post('/api/visit', async (req, res) => {
    const client = await pool.connect()
    try {
        const cid = parseInt(req.body.cid, 10)
        if (!cid) return sendError(res, 400, 'Неверный ID клиента')
        const today = todayLocal()

        await client.query('BEGIN')
        const s = await client.query(
            'SELECT * FROM subscriptions WHERE client_id=$1 ORDER BY id DESC LIMIT 1 FOR UPDATE',
            [cid]
        )
        if (!s.rows.length) {
            await client.query('ROLLBACK')
            return sendError(res, 400, 'У клиента нет абонемента')
        }
        const sub = s.rows[0]
        const status = subStatus({
            end_date: fmtDate(sub.end_date),
            remaining_visits: sub.remaining_visits
        }, today)

        if (status === 'Истёк') {
            await client.query('ROLLBACK')
            if (sub.remaining_visits !== null && sub.remaining_visits <= 0) {
                return sendError(res, 400, 'Нельзя списать посещение: занятий не осталось')
            }
            return sendError(res, 400, 'Абонемент истёк, посещение отметить нельзя')
        }

        let newRem = sub.remaining_visits
        if (newRem !== null) {
            if (newRem <= 0) {
                await client.query('ROLLBACK')
                return sendError(res, 400, 'Нельзя списать посещение: занятий не осталось')
            }
            newRem -= 1
            await client.query('UPDATE subscriptions SET remaining_visits=$1 WHERE id=$2', [newRem, sub.id])
        }

        await client.query('INSERT INTO visits (client_id, sub_id) VALUES ($1, $2)', [cid, sub.id])
        await client.query('COMMIT')
        res.json({ ok: true, rem: newRem, status: subStatus({ end_date: fmtDate(sub.end_date), remaining_visits: newRem }, today) })
    } catch (e) {
        await client.query('ROLLBACK')
        console.error(e)
        sendError(res, 400, 'Не удалось отметить посещение')
    } finally {
        client.release()
    }
})

app.get('/api/expiring', async (req, res) => {
    try {
        const r = await pool.query(`
            SELECT c.id, c.full_name, c.phone, st.name, s.end_date
            FROM subscriptions s
            JOIN clients c ON s.client_id = c.id
            JOIN subscription_types st ON s.type_id = st.id
            WHERE s.end_date = CURRENT_DATE
              AND s.id = (
                  SELECT MAX(s2.id) FROM subscriptions s2 WHERE s2.client_id = s.client_id
              )
            ORDER BY c.full_name
        `)
        res.json(r.rows.map(row => ({
            id: row.id,
            full_name: row.full_name,
            phone: row.phone,
            name: row.name,
            end_date: fmtDate(row.end_date)
        })))
    } catch (e) {
        console.error(e)
        sendError(res, 500, 'Не удалось загрузить список')
    }
})

app.get('/api/sales', async (req, res) => {
    try {
        const r = await pool.query(`
            SELECT s.id, s.sale_date, s.price, s.end_date, c.full_name, c.phone, st.name
            FROM subscriptions s
            JOIN clients c ON s.client_id = c.id
            JOIN subscription_types st ON s.type_id = st.id
            ORDER BY s.id DESC
        `)
        res.json(r.rows.map(row => ({
            id: row.id,
            sale_date: fmtDate(row.sale_date),
            end_date: fmtDate(row.end_date),
            price: row.price,
            full_name: row.full_name,
            phone: row.phone,
            name: row.name
        })))
    } catch (e) {
        console.error(e)
        sendError(res, 500, 'Не удалось загрузить продажи')
    }
})

app.get('/api/report', async (req, res) => {
    try {
        const date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : todayLocal()
        const r = await pool.query(`
            SELECT c.full_name, st.name, s.price, s.sale_date
            FROM subscriptions s
            JOIN clients c ON s.client_id = c.id
            JOIN subscription_types st ON s.type_id = st.id
            WHERE s.sale_date = $1
            ORDER BY s.id
        `, [date])
        let sum = 0
        const rows = r.rows.map(x => {
            sum += Number(x.price) || 0
            return {
                full_name: x.full_name,
                name: x.name,
                price: x.price,
                sale_date: fmtDate(x.sale_date)
            }
        })
        res.json({ rows, sum, date })
    } catch (e) {
        console.error(e)
        sendError(res, 500, 'Не удалось сформировать отчёт')
    }
})

app.listen(process.env.PORT || 3000, () => console.log('Море Парк: http://localhost:' + (process.env.PORT || 3000)))
