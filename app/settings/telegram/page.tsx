'use client';

// ============================================================
// ACEH GADAI SYARIAH - Settings Telegram (Owner only)
// File: app/settings/telegram/page.tsx
//
// Section:
// 1. Status Bot & Webhook (setup one-time)
// 2. Daftar Approver (username Telegram yang boleh approve/reject)
// 3. Register Outlet (generate kode pairing grup)
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import AppShell from '@/components/ui/AppShell';
import PinModal from '@/components/ui/PinModal';
import { useSessionUser } from '@/components/auth/AuthProvider';

interface Approver {
  id: number; username: string; nama: string | null;
  telegram_user_id: number | null; active: boolean;
  last_action_at: string | null; created_at: string;
}
interface OutletRow {
  id: number; nama: string;
  telegram_chat_id: number | null;
  telegram_group_title: string | null;
  telegram_registered_at: string | null;
}
interface BotInfo {
  me?: { id: number; username: string; first_name: string } | null;
  webhook?: { url: string; has_custom_certificate: boolean; pending_update_count: number; last_error_message?: string } | null;
}

export default function TelegramSettingsPage() {
  const user = useSessionUser();
  const isOwner = user?.role === 'OWNER';

  const [botInfo, setBotInfo] = useState<BotInfo | null>(null);
  const [approvers, setApprovers] = useState<Approver[]>([]);
  const [outlets, setOutlets] = useState<OutletRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Approver form
  const [apUsername, setApUsername] = useState('');
  const [apNama, setApNama] = useState('');

  // Register code state (per outlet)
  const [codeInfo, setCodeInfo] = useState<Record<number, { kode: string; expiresAt: string }>>({});

  // PIN modal
  const [pinAction, setPinAction] = useState<null | { kind: string; payload?: any; title: string }>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [bot, aps, outs] = await Promise.all([
        fetch('/api/telegram/set-webhook').then(r => r.json()),
        fetch('/api/settings/telegram/approvers').then(r => r.json()),
        fetch('/api/settings/telegram/register-code').then(r => r.json()),
      ]);
      if (bot.ok) setBotInfo({ me: bot.me, webhook: bot.webhook });
      if (aps.ok) setApprovers(aps.rows);
      if (outs.ok) setOutlets(outs.outlets);
    } catch (err) {
      setMsg({ type: 'err', text: 'Gagal load data: ' + String(err) });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (isOwner) loadAll(); }, [isOwner, loadAll]);

  const showMsg = (type: 'ok' | 'err', text: string) => {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 5000);
  };

  // ── PIN-gated actions ──
  const handlePinSubmit = async (pin: string) => {
    if (!pinAction) return;
    const { kind, payload } = pinAction;
    setPinAction(null);
    setLoading(true);
    try {
      if (kind === 'setWebhook') {
        const r = await fetch('/api/telegram/set-webhook', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin }),
        }).then(x => x.json());
        if (r.ok) { showMsg('ok', `Webhook aktif: ${r.url}`); loadAll(); }
        else showMsg('err', r.msg ?? 'Gagal');
      } else if (kind === 'addApprover') {
        const r = await fetch('/api/settings/telegram/approvers', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin, username: apUsername, nama: apNama, active: true }),
        }).then(x => x.json());
        if (r.ok) { showMsg('ok', 'Approver disimpan'); setApUsername(''); setApNama(''); loadAll(); }
        else showMsg('err', r.msg ?? 'Gagal');
      } else if (kind === 'deleteApprover') {
        const r = await fetch(`/api/settings/telegram/approvers?id=${payload.id}&pin=${encodeURIComponent(pin)}`, {
          method: 'DELETE',
        }).then(x => x.json());
        if (r.ok) { showMsg('ok', 'Approver dihapus'); loadAll(); }
        else showMsg('err', r.msg ?? 'Gagal');
      } else if (kind === 'genCode') {
        const r = await fetch('/api/settings/telegram/register-code', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin, outletId: payload.outletId }),
        }).then(x => x.json());
        if (r.ok) {
          setCodeInfo(prev => ({ ...prev, [payload.outletId]: { kode: r.kode, expiresAt: r.expiresAt } }));
          showMsg('ok', 'Kode dibuat. Berlaku 15 menit.');
        } else showMsg('err', r.msg ?? 'Gagal');
      } else if (kind === 'unregister') {
        const r = await fetch(`/api/settings/telegram/register-code?outletId=${payload.outletId}&pin=${encodeURIComponent(pin)}`, {
          method: 'DELETE',
        }).then(x => x.json());
        if (r.ok) { showMsg('ok', 'Outlet di-unlink dari grup'); loadAll(); }
        else showMsg('err', r.msg ?? 'Gagal');
      } else if (kind === 'testSend') {
        const r = await fetch('/api/settings/telegram/test', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin, outletId: payload.outletId }),
        }).then(x => x.json());
        if (r.ok) showMsg('ok', 'Test terkirim ke grup');
        else showMsg('err', r.msg ?? 'Gagal');
      }
    } catch (err) {
      showMsg('err', 'Error: ' + String(err));
    } finally {
      setLoading(false);
    }
  };

  if (!isOwner) {
    return (
      <AppShell>
        <div className="container" style={{ padding: 40 }}>
          <h1>Akses Ditolak</h1>
          <p>Halaman ini hanya untuk Owner.</p>
        </div>
      </AppShell>
    );
  }

  const webhookOk = !!botInfo?.webhook?.url;
  const botUsername = botInfo?.me?.username ?? '-';

  return (
    <AppShell>
      <div className="container" style={{ padding: 20, maxWidth: 1000 }}>
        <h1 style={{ marginBottom: 4 }}>⚙️ Settings Telegram</h1>
        <p style={{ color: 'var(--text3)', fontSize: 12, marginBottom: 20 }}>
          Konfigurasi bot Telegram untuk notifikasi transfer & approval diskon.
        </p>

        {msg && (
          <div className={`alert alert-${msg.type === 'ok' ? 'success' : 'danger'}`} style={{ marginBottom: 16 }}>
            {msg.text}
          </div>
        )}

        {/* ── Section 1: Bot & Webhook ── */}
        <section className="card" style={{ marginBottom: 20, padding: 16 }}>
          <h2 style={{ fontSize: 16, marginBottom: 12 }}>🤖 Status Bot</h2>
          <div style={{ fontSize: 13, lineHeight: 1.8 }}>
            <div><b>Bot:</b> @{botUsername}</div>
            <div><b>Webhook:</b> {webhookOk
              ? <span style={{ color: 'var(--green)' }}>✅ {botInfo?.webhook?.url}</span>
              : <span style={{ color: 'var(--red)' }}>❌ Belum terdaftar</span>}</div>
            {botInfo?.webhook?.pending_update_count != null && (
              <div><b>Pending updates:</b> {botInfo.webhook.pending_update_count}</div>
            )}
            {botInfo?.webhook?.last_error_message && (
              <div style={{ color: 'var(--red)' }}>
                <b>Last error:</b> {botInfo.webhook.last_error_message}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn btn-primary btn-sm"
              onClick={() => setPinAction({ kind: 'setWebhook', title: 'Daftarkan Webhook' })}>
              {webhookOk ? '🔄 Re-register Webhook' : '▶️ Daftarkan Webhook'}
            </button>
            <button className="btn btn-sm" onClick={loadAll}>🔄 Refresh</button>
          </div>
        </section>

        {/* ── Section 2: Approvers ── */}
        <section className="card" style={{ marginBottom: 20, padding: 16 }}>
          <h2 style={{ fontSize: 16, marginBottom: 4 }}>👤 Daftar Approver</h2>
          <p style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 12 }}>
            Username Telegram yang boleh tap tombol Approve/Reject di grup mana pun.
          </p>

          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <label style={{ fontSize: 10, display: 'block' }}>Username Telegram (tanpa @)</label>
              <input type="text" value={apUsername} onChange={e => setApUsername(e.target.value)}
                placeholder="misal: fendy_lhok"
                style={{ fontSize: 12, padding: '6px 10px', minWidth: 180 }} />
            </div>
            <div>
              <label style={{ fontSize: 10, display: 'block' }}>Nama (display)</label>
              <input type="text" value={apNama} onChange={e => setApNama(e.target.value)}
                placeholder="misal: Fendy"
                style={{ fontSize: 12, padding: '6px 10px', minWidth: 180 }} />
            </div>
            <button className="btn btn-primary btn-sm"
              disabled={!apUsername.trim()}
              onClick={() => setPinAction({ kind: 'addApprover', title: 'Tambah Approver' })}>
              ➕ Tambah
            </button>
          </div>

          <div className="tbl-wrap">
            <table>
              <thead><tr>
                <th>Username</th><th>Nama</th><th>User ID</th><th>Status</th>
                <th>Terakhir Aksi</th><th style={{ width: 80 }}></th>
              </tr></thead>
              <tbody>
                {approvers.length === 0 ? (
                  <tr><td colSpan={6} className="empty-state">Belum ada approver. Tambahkan Fendy dan admin dulu.</td></tr>
                ) : approvers.map(a => (
                  <tr key={a.id}>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>@{a.username}</td>
                    <td>{a.nama || '—'}</td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{a.telegram_user_id ?? '—'}</td>
                    <td>{a.active
                      ? <span className="badge" style={{ background: 'var(--green-dim)', color: 'var(--green)' }}>Aktif</span>
                      : <span className="badge">Nonaktif</span>}</td>
                    <td style={{ fontSize: 11 }}>{a.last_action_at ? new Date(a.last_action_at).toLocaleString('id-ID') : '—'}</td>
                    <td>
                      <button className="btn btn-danger btn-sm"
                        onClick={() => setPinAction({ kind: 'deleteApprover', payload: { id: a.id }, title: `Hapus @${a.username}` })}>
                        🗑️
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── Section 3: Register Outlet ── */}
        <section className="card" style={{ marginBottom: 20, padding: 16 }}>
          <h2 style={{ fontSize: 16, marginBottom: 4 }}>🏢 Grup Telegram per Outlet</h2>
          <p style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 12 }}>
            Setiap outlet 1 grup Telegram. Generate kode → invite bot ke grup → kirim <code>/register KODE</code> di grup.
          </p>

          <div className="tbl-wrap">
            <table>
              <thead><tr>
                <th>Outlet</th><th>Status</th><th>Grup</th><th>Terdaftar</th><th>Aksi</th>
              </tr></thead>
              <tbody>
                {outlets.length === 0 ? (
                  <tr><td colSpan={5} className="empty-state">⏳ Memuat...</td></tr>
                ) : outlets.map(o => {
                  const linked = !!o.telegram_chat_id;
                  const code = codeInfo[o.id];
                  return (
                    <tr key={o.id}>
                      <td><b>{o.nama}</b></td>
                      <td>{linked
                        ? <span className="badge" style={{ background: 'var(--green-dim)', color: 'var(--green)' }}>✅ Terhubung</span>
                        : <span className="badge" style={{ background: 'var(--yellow-dim)', color: 'var(--yellow)' }}>⚠️ Belum</span>}</td>
                      <td style={{ fontSize: 11 }}>
                        {o.telegram_group_title ?? '—'}
                        {o.telegram_chat_id && <div style={{ fontFamily: 'var(--mono)', color: 'var(--text3)' }}>ID: {o.telegram_chat_id}</div>}
                      </td>
                      <td style={{ fontSize: 11 }}>
                        {o.telegram_registered_at ? new Date(o.telegram_registered_at).toLocaleString('id-ID') : '—'}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {linked ? (
                            <>
                              <button className="btn btn-success btn-sm"
                                onClick={() => setPinAction({ kind: 'testSend', payload: { outletId: o.id }, title: `Test ke ${o.nama}` })}>
                                📤 Test
                              </button>
                              <button className="btn btn-danger btn-sm"
                                onClick={() => setPinAction({ kind: 'unregister', payload: { outletId: o.id }, title: `Unlink ${o.nama}` })}>
                                🔗❌ Unlink
                              </button>
                            </>
                          ) : (
                            <button className="btn btn-primary btn-sm"
                              onClick={() => setPinAction({ kind: 'genCode', payload: { outletId: o.id }, title: `Kode untuk ${o.nama}` })}>
                              🔑 Generate Kode
                            </button>
                          )}
                        </div>
                        {code && (
                          <div style={{ marginTop: 6, padding: 8, background: 'var(--surface2)', borderRadius: 6, fontSize: 11 }}>
                            <div><b>Kode:</b> <code style={{ fontSize: 13, fontWeight: 700, userSelect: 'all' }}>{code.kode}</code></div>
                            <div style={{ marginTop: 4, color: 'var(--text3)' }}>
                              1. Buat grup Telegram baru<br />
                              2. Invite <b>@sistem_gadai_bot</b> ke grup, jadikan admin<br />
                              3. Kirim di grup: <code>/register {code.kode}</code>
                            </div>
                            <div style={{ marginTop: 4, color: 'var(--yellow)' }}>
                              Berlaku sampai {new Date(code.expiresAt).toLocaleTimeString('id-ID')}
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {loading && (
          <div style={{ position: 'fixed', top: 10, right: 10, background: 'var(--surface)', padding: '8px 14px', borderRadius: 6, boxShadow: '0 2px 8px rgba(0,0,0,0.3)', fontSize: 12 }}>
            ⏳ Loading...
          </div>
        )}

        <PinModal
          open={!!pinAction}
          action={pinAction?.title ?? ''}
          onSuccess={(pin) => handlePinSubmit(pin)}
          onCancel={() => setPinAction(null)}
        />
      </div>
    </AppShell>
  );
}
