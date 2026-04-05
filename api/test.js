const { supabaseAdmin } = require('../lib/supabase');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { data, error } = await supabaseAdmin.from('outlets').select('*');
    if (error) throw error;
    res.status(200).json({ ok: true, outlets: data });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
};