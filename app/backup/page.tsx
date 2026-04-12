'use client';

// ============================================================
// ACEH GADAI SYARIAH - Backup & Bon Manager
// File: app/backup/page.tsx
// View backup status, browse Storage files, manual trigger
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import AppShell from '@/components/ui/AppShell';
import PinModal from '@/components/ui/PinModal';
import { useAuth } from '@/components/auth/AuthProvider';

interface BackupLog {
  tgl: string; outlet: string; detail: string;
}

interface StorageFile {
  name: string; size: number; created: string; path: string;
}

export default function BackupPage() {
  const { isAdminOrOwner, outletId } = useAuth();

  // State
  const [lastBackup, setLastBackup] = useState<any>(null);
  const [logs, setLogs] = useState<BackupLog[]>([]);
  const [outlets, setOutlets] = useState<string[]>([]);
  const [months, setMonths] = useState<string[]>([]);
  const [files, setFiles] = useState<StorageFile[]>([]);
  const [loading, setLoading] = useState(false);

  // Browser state
  const [selOutlet, setSelOutlet] = useState('');
  const [selMonth, setSelMonth] = useState('');
  const [selSubfolder, setSelSubfolder] = useState('');
  const [subfolders, setSubfolders] = useState<string[]>([]);

  // Manual backup
  const [pinOpen, setPinOpen] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [backupMsg, setBackupMsg] = useState('');

  // Load initial status
  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/backup/list');
      const json = await res.json();
      if (json.ok) {
        setLastBackup(json.lastBackup);
        setLogs(json.logs || []);
        setOutlets(json.outlets || []);
      }
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  // Load months when outlet selected
  useEffect(() => {
    if (!selOutlet) { setMonths([]); return; }
    (async () => {
      const res = await fetch(`/api/backup/list?outletFolder=${selOutlet}`);
      const json = await res.json();
      if (json.ok) setMonths(json.months || []);
    })();
  }, [selOutlet]);

  // Load subfolders when month selected
  useEffect(() => {
    if (!selOutlet || !selMonth) { setSubfolders([]); return; }
    (async () => {
      const folder = `${selOutlet}/${selMonth}`;
      const res = await fetch(`/api/backup/list?folder=${folder}`);
      const json = await res.json();
      if (json.ok) {
        // Filter: subfolders are items with size 0 (folders)
        const subs = (json.files || []).filter((f: any) => !f.name.includes('.')).map((f: any) => f.name);
        const fileItems = (json.files || []).filter((f: any) => f.name.includes('.'));
        setSubfolders(subs.length > 0 ? subs : []);
        setFiles(fileItems);
      }
    })();
  }, [selOutlet, selMonth]);

  // Load files in subfolder
  useEffect(() => {
    if (!selOutlet || !selMonth || !selSubfolder) return;
    (async () => {
      const folder = `${selOutlet}/${selMonth}/${selSubfolder}`;
      const res = await fetch(`/api/backup/list?folder=${folder}`);
      const json = await res.json();
      if (json.ok) setFiles(json.files || []);
    })();
  }, [selOutlet, selMonth, selSubfolder]);

  // Manual backup
  async function doManualBackup(pin: string) {
    setPinOpen(false);
    setBackingUp(true); setBackupMsg('');
    try {
      const res = await fetch('/api/backup/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-outlet-id': String(outletId) },
        body: JSON.stringify({ pin }),
      });
      const json = await res.json();
      if (json.ok) {
        setBackupMsg('✅ Backup berhasil!');
        loadStatus();
      } else {
        setBackupMsg('❌ ' + (json.msg || 'Gagal'));
      }
    } catch (e) { setBackupMsg('❌ Error: ' + (e as Error).message); }
    setBackingUp(false);
  }

  // Format file size
  const fmtSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  };

  if (!isAdminOrOwner) {
    return <AppShell title="💾 Backup & Bon" subtitle=""><div style={{ padding: 60, textAlign: 'center', color: 'var(--text3)' }}>⛔ Hanya Admin/Owner</div></AppShell>;
  }

  return (
    <AppShell title="💾 Backup & Bon Manager" subtitle="Kelola backup otomatis & penyimpanan bon transaksi">
      <div style={{ padding: 24, overflowY: 'auto', height: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Status + Actions Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {/* Backup Status */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .6, color: 'var(--text3)', marginBottom: 12 }}>Status Backup Harian</div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: 'var(--surface2)', borderRadius: 7, marginBottom: 8 }}>
              <div style={{
                width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                background: lastBackup ? 'var(--green)' : 'var(--red)',
                boxShadow: lastBackup ? '0 0 6px var(--green)' : '0 0 6px var(--red)',
              }} />
              <div style={{ flex: 1, fontSize: 12, fontWeight: 600 }}>Vercel Cron (23:00 WIB)</div>
              <div style={{ fontSize: 11, color: 'var(--text2)', fontFamily: 'var(--mono)' }}>
                {lastBackup ? 'AKTIF' : 'BELUM ADA DATA'}
              </div>
            </div>

            {lastBackup && (
              <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 8 }}>
                Backup terakhir: <span style={{ fontFamily: 'var(--mono)', color: 'var(--green)' }}>
                  {new Date(lastBackup.tgl).toLocaleString('id-ID')}
                </span>
                {lastBackup.outlet && <span> — {lastBackup.outlet}</span>}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              <button className="btn btn-outline btn-sm" onClick={() => setPinOpen(true)} disabled={backingUp}>
                {backingUp ? '⏳ Membackup...' : '▶ Backup Sekarang'}
              </button>
              <button className="btn btn-outline btn-sm" onClick={loadStatus}>↻ Refresh</button>
            </div>

            {backupMsg && (
              <div style={{ marginTop: 8, fontSize: 11, color: backupMsg.startsWith('✅') ? 'var(--green)' : 'var(--red)' }}>
                {backupMsg}
              </div>
            )}
          </div>

          {/* Recent Backups */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .6, color: 'var(--text3)', marginBottom: 12 }}>Riwayat Backup Terbaru</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 200, overflowY: 'auto' }}>
              {loading ? <div style={{ color: 'var(--text3)', fontSize: 11 }}>⏳ Memuat...</div>
              : logs.length === 0 ? <div style={{ color: 'var(--text3)', fontSize: 11 }}>Belum ada backup.</div>
              : logs.slice(0, 8).map((l, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', background: 'var(--surface2)', borderRadius: 6, fontSize: 11 }}>
                  <span style={{ fontFamily: 'var(--mono)', color: 'var(--text)' }}>{new Date(l.tgl).toLocaleString('id-ID', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                  <span style={{ color: 'var(--text3)' }}>{l.outlet || 'ALL'}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* File Browser */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .6, color: 'var(--text3)', marginBottom: 12 }}>📂 Browse File Backup (Supabase Storage)</div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <select value={selOutlet} onChange={e => { setSelOutlet(e.target.value); setSelMonth(''); setSelSubfolder(''); setFiles([]); }}
              style={{ padding: '7px 10px', fontSize: 12 }}>
              <option value="">— Pilih Outlet —</option>
              {outlets.map(o => <option key={o} value={o}>{o}</option>)}
            </select>

            {selOutlet && months.length > 0 && (
              <select value={selMonth} onChange={e => { setSelMonth(e.target.value); setSelSubfolder(''); }}
                style={{ padding: '7px 10px', fontSize: 12 }}>
                <option value="">— Bulan —</option>
                {months.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            )}

            {subfolders.length > 0 && (
              <select value={selSubfolder} onChange={e => setSelSubfolder(e.target.value)}
                style={{ padding: '7px 10px', fontSize: 12 }}>
                <option value="">— Subfolder —</option>
                {subfolders.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            )}

            {selOutlet && selMonth && (
              <span style={{ fontSize: 11, color: 'var(--text3)', padding: '8px 0' }}>
                📁 {selOutlet}/{selMonth}{selSubfolder ? '/' + selSubfolder : ''}
              </span>
            )}
          </div>

          {/* File list */}
          {files.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 300, overflowY: 'auto' }}>
              {files.map((f, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', background: 'var(--surface2)', borderRadius: 6 }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text)' }}>
                    {f.name.endsWith('.html') ? '📄' : f.name.endsWith('.json') ? '📋' : '📁'} {f.name}
                  </span>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 10, color: 'var(--text3)' }}>{fmtSize(f.size)}</span>
                    {f.created && <span style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
                      {new Date(f.created).toLocaleDateString('id-ID')}
                    </span>}
                  </div>
                </div>
              ))}
            </div>
          ) : selOutlet && selMonth ? (
            <div style={{ color: 'var(--text3)', fontSize: 11, padding: 8 }}>
              {subfolders.length > 0 ? 'Pilih subfolder di atas' : 'Tidak ada file di folder ini.'}
            </div>
          ) : (
            <div style={{ color: 'var(--text3)', fontSize: 11, padding: 8 }}>Pilih outlet dan bulan untuk browse file.</div>
          )}
        </div>

        {/* Folder Structure Info */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .6, color: 'var(--text3)', marginBottom: 12 }}>📂 Struktur Folder di Supabase Storage</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text2)', lineHeight: 1.9, padding: '10px 14px', background: 'var(--surface2)', borderRadius: 7 }}>
            <span style={{ color: 'var(--gold)' }}>📁 backups/</span><br />
            {'  '}<span style={{ color: 'var(--gold)' }}>📁 LHOKSEUMAWE/</span><br />
            {'    '}<span style={{ color: 'var(--gold)' }}>📁 2026-04/</span><br />
            {'      '}<span style={{ color: 'var(--gold)' }}>📁 kontrak/</span> <span style={{ color: 'var(--text3)', fontSize: 10 }}>← bon per transaksi</span><br />
            {'        '}<span style={{ color: 'var(--green)' }}>📄 SBR-001_20260412.html</span><br />
            {'      '}<span style={{ color: 'var(--gold)' }}>📁 laporan/</span><br />
            {'        '}<span style={{ color: 'var(--green)' }}>📄 laporan_malam_2026-04-12.html</span><br />
            {'      '}<span style={{ color: 'var(--gold)' }}>📁 data/</span><br />
            {'        '}<span style={{ color: 'var(--green)' }}>📄 backup_2026-04-12.json</span><br />
            {'  '}<span style={{ color: 'var(--gold)' }}>📁 LANGSA/</span> <span style={{ color: 'var(--text3)', fontSize: 10 }}>← same structure</span>
          </div>
        </div>

        {/* Restore Instructions */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .6, color: 'var(--text3)', marginBottom: 12 }}>📋 Cara Restore Jika Ada Masalah</div>
          <div style={{ background: 'rgba(59,130,246,.06)', border: '1px solid rgba(59,130,246,.2)', borderRadius: 8, padding: '12px 16px', fontSize: 12, color: 'var(--text2)', lineHeight: 1.7 }}>
            <b>Skenario 1: Data terhapus sebagian</b><br />
            Buka Supabase Dashboard → Table Editor → cari data yang hilang dari backup JSON terdekat.<br /><br />
            <b>Skenario 2: Banyak data hilang</b><br />
            Download file <code style={{ background: 'var(--surface2)', padding: '1px 6px', borderRadius: 3 }}>backup_YYYY-MM-DD.json</code> dari Storage → import ke tabel yang sesuai.<br /><br />
            <b>Skenario 3: Perlu lihat bon transaksi</b><br />
            Browse folder <code style={{ background: 'var(--surface2)', padding: '1px 6px', borderRadius: 3 }}>kontrak/</code> → buka file HTML → print ulang.<br /><br />
            <b>Backup otomatis berjalan setiap malam 23:00 WIB</b> — mencakup JSON dump semua tabel + laporan malam HTML per outlet.
          </div>
        </div>
      </div>

      <PinModal open={pinOpen} action="Backup Manual Sekarang"
        onSuccess={(pin) => doManualBackup(pin)} onCancel={() => setPinOpen(false)} />
    </AppShell>
  );
}
