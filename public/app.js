function esc(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
}

function fmtDate(v) {
    if (!v) return '—'
    const s = String(v).slice(0, 10)
    const p = s.split('-')
    if (p.length !== 3) return esc(s)
    return p[2] + '.' + p[1] + '.' + p[0]
}

function fmtDt(v) {
    if (!v) return '—'
    const d = new Date(v)
    if (Number.isNaN(d.getTime())) return fmtDate(v)
    const pad = n => String(n).padStart(2, '0')
    return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear() +
        ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes())
}

function money(n) {
    return (Number(n) || 0).toLocaleString('ru-RU') + ' ₽'
}

function badge(status) {
    let cls = 'st-none'
    if (status === 'Действует') cls = 'st-ok'
    if (status === 'Последнее посещение') cls = 'st-last'
    if (status === 'Истёк') cls = 'st-dead'
    return '<span class="badge ' + cls + '">' + esc(status) + '</span>'
}

function todayISO() {
    const d = new Date()
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}

async function api(url, opts) {
    const r = await fetch(url, opts)
    const d = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(d.error || 'Ошибка запроса')
    return d
}

function addDays(dateStr, days) {
    const d = new Date(dateStr + 'T12:00:00')
    d.setDate(d.getDate() + days)
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}

function previewSale(type, saleDate) {
    if (!type) return { end: null, visits: null }
    let end = null
    if (type.duration_days != null) {
        end = type.duration_days <= 1 ? saleDate : addDays(saleDate, type.duration_days)
    }
    return { end, visits: type.visits_count }
}
