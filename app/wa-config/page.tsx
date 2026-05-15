'use client';

// ============================================================
// File: app/wa-config/page.tsx
// OWNER-only: kelola config WhatsApp (Wablas) per outlet
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import AppShell from '@/components/ui/AppShell';
import PinModal from '@/components/ui/PinModal';
import { useAuth } from '@/components/auth/AuthProvider';

interface OutletRow {
  outlet_id: number;
  outlet_name: string;
  active_config: {
    id: number;
    provider: string;
    api_key_masked: string;
    nomor_pengirim: string;
    nomor_backup: string | null;
    api_base_url: string | null;
    enabled: boolean;
    status: string;
    daily_quota: number;
    last_test_at: string | null;
    last_test_ok: boolean | null;
  } | null;
  all_configs_count: number;
  stats_24h: { sent: number; failed: number; skipped: number };
}

export default function WaConfigPage() {
  const { isOwner } = useAuth();
  const [outlets, setOutlets] = useState<OutletRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingOutlet, setEditingOutlet] = useState<OutletRow | null>(null);
  const [error, setError] = useState('');

  // Form state
  const [provider, setProvider] = useState('WABLAS');
  const [apiKey, setApiKey] = useState('');
  const [apiBaseUrl, setApiBaseUrl] = useState('');
  const [nomorPengirim, setNomorPengirim] = useState('');
  const [nomorBackup, setNomorBackup] = useState('');
  const [dailyQuota, setDailyQuota] = useState('1000');

  // PIN modal
  const [pinOpen, setPinOpen] = useState(false);
  const [pinAction, setPinAction] = useState('');
  const [pendingFn, setPendingFn] = useState<((pin: string) => Promise<void> | void) | null>(null);

  // Test modal
  const [testOpen, setTestOpen] = useState<OutletRow | null>(null);
  const [testTo, setTestTo] = useState('');
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [testing, setTesting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/wa/config');
      const json = await res.json();
      if (json.ok) setOutlets(json.outlets || []);
      else setError(json.msg || 'Gagal load');
    } catch (e) {
      setError('Error: ' + (e as Error).message);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function openEdit(o: OutletRow) {
    setEditingOutlet(o);
    setError('');
    if (o.active_config) {
      setProvider(o.active_config.provider);
      setApiKey(''); // jangan auto-fill kunci lama, kasir harus retype
      setApiBaseUrl(o.active_config.api_base_url || '');
      setNomorPengirim(o.active_config.nomor_pengirim);
      setNomorBackup(o.active_config.nomor_backup || '');
      setDailyQuota(String(o.active_config.daily_quota || 1000));
    } else {
      setProvider('WABLAS');
      setApiKey('');
      setApiBaseUrl('');
      setNomorPengirim('');
      setNomorBackup('');
      setDailyQuota('1000');
    }
  }

  function closeEdit() {
    setEditingOutlet(null);
    setError('');
  }

  function requestSave() {
    if (!editingOutlet) return;
    if (!apiKey.trim()) { setError('API Key wajib diisi (paste dari dashboard Wablas)'); return; }
    if (!nomorPengirim.trim()) { setError('Nomor pengirim wajib diisi'); return; }
    setError('');
    setPinAction(`Simpan WA Config — ${editingOutlet.outlet_name}`);
    setPendingFn(() => async (pin: string) => {
      try {
        const res = await fetch('/api/wa/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pin,
            outletId: editingOutlet.outlet_id,
            provider,
            apiKey: apiKey.trim(),
            apiBaseUrl: apiBaseUrl.trim() || undefined,
            nomorPengirim: nomorPengirim.trim(),
            nomorBackup: nomorBackup.trim() || undefined,
            dailyQuota: Number(dailyQuota) || 1000,
          }),
        });
        const json = await res.json();
        if (!json.ok) { setError(json.msg); return; }
        closeEdit();
        await load();
      } catch (e) {
        setError('Error: ' + (e as Error).message);
      }
    });
    setPinOpen(true);
  }

  function requestDelete() {
    if (!editingOutlet) return;
    if (!confirm(`Nonaktifkan config WA untuk ${editingOutlet.outlet_name}? Auto-WA akan berhenti untuk outlet ini.`)) return;
    setPinAction(`Nonaktifkan WA — ${editingOutlet.outlet_name}`);
    setPendingFn(() => async (pin: string) => {
      try {
        const res = await fetch('/api/wa/config?action=del', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin, outletId: editingOutlet.outlet_id }),
        });
        const json = await res.json();
        if (!json.ok) { setError(json.msg); return; }
        closeEdit();
        await load();
      } catch (e) { setError('Error: ' + (e as Error).message); }
    });
    setPinOpen(true);
  }

  function openTest(o: OutletRow) {
    setTestOpen(o);
    setTestTo('');
    setTestResult(null);
  }

  function requestTestSend() {
    if (!testOpen) return;
    if (!testTo.trim()) { setTestResult({ ok: false, msg: 'Isi nomor tujuan dulu' }); return; }
    setPinAction(`Test WA — ${testOpen.outlet_name}`);
    setPendingFn(() => async (pin: string) => {
      setTesting(true);
      try {
        const res = await fetch('/api/wa/config/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pin,
            outletId: testOpen.outlet_id,
            toNumber: testTo.trim(),
          }),
        });
        const json = await res.json();
        setTestResult({ ok: !!json.ok, msg: json.msg || (json.ok ? 'Sukses' : 'Gagal') });
        if (json.ok) await load(); // refresh last_test_*
      } catch (e) {
        setTestResult({ ok: false, msg: 'Error: ' + (e as Error).message });
      }
      setTesting(false);
    });
    setPinOpen(true);
  }

  if (!isOwner) {
    return <AppShell title="📱 WhatsApp Config" subtitle=""><div style={{ padding: 60, textAlign: 'center', color: 'var(--text3)' }}>⛔ Hanya untuk OWNER</div></AppShell>;
  }

  return (
    <AppShell title="📱 WhatsApp Config" subtitle="Setup auto-WA per outlet (Wablas / Fonnte)">
      <div style={{ padding: 20, maxWidth: 1100, margin: '0 auto' }}>
        {/* Info banner */}
        <div style={{ background: 'rgba(59,130,246,.1)', border: '1px solid rgba(59,130,246,.3)', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 12, color: 'var(--text2)' }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>ℹ️ Cara setup:</div>
          <ol style={{ paddingLeft: 18, lineHeight: 1.6 }}>
            <li>Daftar di <b>wablas.com</b>, beli paket, scan QR untuk konek nomor.</li>
            <li>Copy <b>API Token</b> + <b>Server URL</b> dari dashboard Wablas.</li>
            <li>Paste ke form di bawah, simpan.</li>
            <li>Klik <b>Test Kirim</b> ke nomor sendiri untuk verifikasi.</li>
            <li>Setelah OK, auto-WA reminder + konfirmasi transaksi akan jalan untuk outlet itu.</li>
          </ol>
        </div>

        {error && <div className="alert-error" style={{ marginBottom: 12 }}>⚠️ {error}</div>}

        {loading ? <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>⏳ Loading...</div> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {outlets.map(o => (
              <OutletCard key={o.outlet_id} outlet={o} onEdit={() => openEdit(o)} onTest={() => openTest(o)} />
            ))}
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {editingOutlet && (
        <div className="success-overlay" onClick={closeEdit}>
          <div className="success-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <h3 style={{ margin: '0 0 16px' }}>Config WA — {editingOutlet.outlet_name}</h3>

            <div className="form-group">
              <label>Provider</label>
              <select value={provider} onChange={e => setProvider(e.target.value)}>
                <option value="WABLAS">Wablas (Recommended)</option>
                <option value="FONNTE">Fonnte</option>
                <option value="WHACENTER">Whacenter</option>
                <option value="MOCK">Mock (untuk testing — TIDAK kirim WA beneran)</option>
              </select>
            </div>

            <div className="form-group">
              <label>API Token / Key *</label>
              <input value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="Paste token dari dashboard provider" type="password" />
              <div className="hint">
                {editingOutlet.active_config
                  ? <>Saat ini tersimpan: <code>{editingOutlet.active_config.api_key_masked}</code>. Kosongkan field ini = pakai yang lama (kalau tidak diisi ulang, simpan akan gagal).</>
                  : 'Belum ada token. Wajib isi.'}
              </div>
            </div>

            <div className="form-group">
              <label>API Base URL (optional)</label>
              <input value={apiBaseUrl} onChange={e => setApiBaseUrl(e.target.value)} placeholder="mis. https://pati.wablas.com (kosongin pakai default)" />
              <div className="hint">Server Wablas kadang berbeda — cek di dashboard mereka. Kalau ragu, kosongin.</div>
            </div>

            <div className="form-row">
              <div className="form-group" style={{ flex: 2 }}>
                <label>Nomor Pengirim *</label>
                <input value={nomorPengirim} onChange={e => setNomorPengirim(e.target.value)} placeholder="628xxx (nomor WA yang sudah di-scan)" />
              </div>
              <div className="form-group">
                <label>Quota Harian</label>
                <input value={dailyQuota} type="number" onChange={e => setDailyQuota(e.target.value)} />
              </div>
            </div>

            <div className="form-group">
              <label>Nomor Backup (optional)</label>
              <input value={nomorBackup} onChange={e => setNomorBackup(e.target.value)} placeholder="628xxx — nomor cadangan kalau utama banned" />
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button className="btn btn-success" onClick={requestSave}>💾 Simpan</button>
              {editingOutlet.active_config && <button className="btn btn-outline" onClick={requestDelete} style={{ color: 'var(--red)' }}>🚫 Nonaktifkan</button>}
              <button className="btn btn-outline" onClick={closeEdit}>Batal</button>
            </div>
          </div>
        </div>
      )}

      {/* Test Modal */}
      {testOpen && (
        <div className="success-overlay" onClick={() => setTestOpen(null)}>
          <div className="success-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
            <h3 style={{ margin: '0 0 16px' }}>🧪 Test Kirim WA — {testOpen.outlet_name}</h3>
            <div className="form-group">
              <label>Nomor Tujuan Test</label>
              <input value={testTo} onChange={e => setTestTo(e.target.value)} placeholder="628xxx (mis. nomor sendiri)" />
              <div className="hint">Test message akan dikirim ke nomor ini via config aktif outlet.</div>
            </div>

            {testResult && (
              <div className={testResult.ok ? 'alert-success' : 'alert-error'} style={{ marginTop: 12 }}>
                {testResult.ok ? '✅' : '⚠️'} {testResult.msg}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button className="btn btn-success" onClick={requestTestSend} disabled={testing}>
                {testing ? '⏳ Mengirim...' : '📲 Kirim Test'}
              </button>
              <button className="btn btn-outline" onClick={() => setTestOpen(null)}>Tutup</button>
            </div>
          </div>
        </div>
      )}

      <PinModal open={pinOpen} action={pinAction}
        onSuccess={(pin) => { setPinOpen(false); pendingFn?.(pin); }}
        onCancel={() => setPinOpen(false)} />
    </AppShell>
  );
}

// ─────────────────────────────────────────────────────────────
function OutletCard({ outlet, onEdit, onTest }: { outlet: OutletRow; onEdit: () => void; onTest: () => void }) {
  const cfg = outlet.active_config;
  const cfgActive = !!cfg;
  const lastTestLabel = cfg?.last_test_at
    ? new Date(cfg.last_test_at).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })
    : null;

  return (
    <div style={{ background: 'var(--surface)', borderRadius: 10, padding: 16, border: `1px solid ${cfgActive ? 'var(--green)' : 'var(--border)'}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>
            {outlet.outlet_name}
            <span style={{
              marginLeft: 10, fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 500,
              background: cfgActive ? 'rgba(34,197,94,.15)' : 'rgba(148,163,184,.15)',
              color: cfgActive ? 'var(--green)' : 'var(--text3)',
            }}>
              {cfgActive ? `✓ ${cfg!.provider} aktif` : '○ Belum setup'}
            </span>
          </div>
          {cfgActive && (
            <div style={{ fontSize: 12, color: 'var(--text2)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px' }}>
              <div>Nomor pengirim: <b style={{ fontFamily: 'var(--mono)' }}>{cfg!.nomor_pengirim}</b></div>
              <div>API Key: <code style={{ fontSize: 11 }}>{cfg!.api_key_masked}</code></div>
              <div>Backup: {cfg!.nomor_backup || '—'}</div>
              <div>Quota: {cfg!.daily_quota}/hari</div>
              {lastTestLabel && (
                <div style={{ gridColumn: 'span 2' }}>
                  Last test: {lastTestLabel} → {cfg!.last_test_ok === true ? '✓ OK' : cfg!.last_test_ok === false ? '✗ Gagal' : '—'}
                </div>
              )}
            </div>
          )}
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 8 }}>
            📊 24 jam terakhir: <b>{outlet.stats_24h.sent}</b> terkirim, <b>{outlet.stats_24h.failed}</b> gagal, <b>{outlet.stats_24h.skipped}</b> skip
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <button className="btn btn-outline btn-sm" onClick={onEdit}>{cfgActive ? '✏️ Edit' : '+ Setup'}</button>
          {cfgActive && <button className="btn btn-outline btn-sm" onClick={onTest}>🧪 Test</button>}
        </div>
      </div>
    </div>
  );
}
