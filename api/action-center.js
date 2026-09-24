const { getRows } = require('../lib/sheets');
const { requireManager } = require('../lib/auth');

function parseSheetDate(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (dmy) {
    const year = dmy[3].length === 2 ? 2000 + Number(dmy[3]) : Number(dmy[3]);
    return new Date(Date.UTC(year, Number(dmy[2]) - 1, Number(dmy[1])));
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function startOfTodayIST() {
  const now = new Date();
  const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  return new Date(Date.UTC(ist.getFullYear(), ist.getMonth(), ist.getDate()));
}

function num(v) {
  const n = parseFloat(String(v == null ? '' : v).replace(/[^0-9.\-]/g, ''));
  return Number.isNaN(n) ? 0 : n;
}

function isClosed(stage) {
  return /^(Deal Won|Deal Lost)$/i.test(String(stage || '').trim());
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const tenant = await requireManager(req);
    const { rows } = await getRows(tenant.bridge);
    const today = startOfTodayIST();

    const active = rows.filter(r => !isClosed(r['Sales Stage']));
    const overdue = [];
    const todayItems = [];
    const stale = [];

    active.forEach(r => {
      const followup = parseSheetDate(r['Next Follow-up Date']);
      if (followup) {
        if (followup.getTime() < today.getTime()) overdue.push(r);
        else if (followup.getTime() === today.getTime()) todayItems.push(r);
      }

      const lastInteraction = parseSheetDate(r['Last Interaction Date']);
      if (lastInteraction) {
        const ageDays = Math.floor((today.getTime() - lastInteraction.getTime()) / 86400000);
        if (ageDays >= 14) stale.push({ row: r, ageDays });
      } else {
        const firstContact = parseSheetDate(r['First Contact Date']);
        if (firstContact) {
          const ageDays = Math.floor((today.getTime() - firstContact.getTime()) / 86400000);
          if (ageDays >= 7) stale.push({ row: r, ageDays });
        }
      }
    });

    const topPriority = active
      .filter(r => String(r.Priority || '').trim().toLowerCase() === 'topmost')
      .sort((a, b) => num(b['Expected Deal Value (₹)']) - num(a['Expected Deal Value (₹)']))
      .slice(0, 5);

    const actions = [
      ...overdue.map(r => ({
        kind: 'overdue',
        urgency: 'high',
        row: r._row,
        institution: r['Institution Name'] || 'Unnamed lead',
        stage: r['Sales Stage'] || '—',
        value: num(r['Expected Deal Value (₹)']),
        dueDate: r['Next Follow-up Date'] || '',
        message: 'Follow-up overdue'
      })),
      ...todayItems.map(r => ({
        kind: 'today',
        urgency: 'medium',
        row: r._row,
        institution: r['Institution Name'] || 'Unnamed lead',
        stage: r['Sales Stage'] || '—',
        value: num(r['Expected Deal Value (₹)']),
        dueDate: r['Next Follow-up Date'] || '',
        message: 'Follow-up due today'
      })),
      ...stale.map(x => ({
        kind: 'stale',
        urgency: 'medium',
        row: x.row._row,
        institution: x.row['Institution Name'] || 'Unnamed lead',
        stage: x.row['Sales Stage'] || '—',
        value: num(x.row['Expected Deal Value (₹)']),
        dueDate: x.row['Last Interaction Date'] || x.row['First Contact Date'] || '',
        message: x.ageDays + ' days without interaction'
      }))
    ].slice(0, 20);

    const activePipeline = active.reduce((sum, r) => sum + num(r['Expected Deal Value (₹)']), 0);
    const topValue = topPriority.reduce((sum, r) => sum + num(r['Expected Deal Value (₹)']), 0);

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({
      ok: true,
      summary: {
        overdue: overdue.length,
        today: todayItems.length,
        stale: stale.length,
        topPriority: topPriority.length,
        activeLeads: active.length,
        activePipeline,
        topPriorityPipeline: topValue
      },
      actions,
      topPriority: topPriority.map(r => ({
        row: r._row,
        institution: r['Institution Name'] || 'Unnamed lead',
        stage: r['Sales Stage'] || '—',
        value: num(r['Expected Deal Value (₹)']),
        probability: num(r['Probability (%)']),
        followup: r['Next Follow-up Date'] || ''
      }))
    });
  } catch (err) {
    console.error('api/action-center error:', err);
    res.status(err.status || 500).json({ error: String(err.message || err) });
  }
};
