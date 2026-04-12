'use client';

// ============================================================
// ACEH GADAI SYARIAH - Halaman Laporan Malam
// File: app/laporan/page.tsx
// Migrasi dari laporanmalam.html (GAS)
// ============================================================

import { useState, useCallback } from 'react';
import AppShell from '@/components/ui/AppShell';
import { useOutletId } from '@/components/auth/AuthProvider';
import { formatRp, todayISO, formatDate } from '@/lib/format';

export default function LaporanPage() {
  const outletId = useOutletId();
  const [tgl, setTgl] = useState(todayISO());
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);

  const loadLaporan = useCallback(async () => {
    setLoading(true); setData(null);
    try {
      const res = await fetch(`/api/laporan/harian?tgl=${tgl}&outletId=${outletId}`);
      const json = await res.json();
      if (json.ok) setData(json);
    } catch { /* silent */ }
    setLoading(false);
  }, [tgl, outletId]);

  // Summary calculations
  const gadaiList = data?.gadai || [];
  const tebusList = data?.tebus || [];
  const sjbList = data?.sjb || [];
  const totalGadai = gadaiList.reduce((s: number, r: any) => s + (r.jumlah_gadai || 0), 0);
  const totalTebus = tebusList.filter((r: any) => r.status === 'TEBUS').reduce((s: number, r: any) => s + (r.jumlah_bayar || 0), 0);
  const totalPerpanjang = tebusList.filter((r: any) => r.status === 'PERPANJANG').reduce((s: number, r: any) => s + (r.jumlah_bayar || 0), 0);
  const totalSJB = sjbList.reduce((s: number, r: any) => s + (r.harga_jual || 0), 0);
  const totalUjrah = tebusList.reduce((s: number, r: any) => s + (r.ujrah_berjalan || 0), 0);
  const totalMasuk = totalTebus + totalPerpanjang;
  const saldoCash = data?.saldoCash ?? 0;
  const saldoBank = data?.saldoBank ?? 0;

  return (
    <AppShell title="Laporan Malam" subtitle="Rekap harian transaksi">
      <div style={{ display: 'flex', gap: 20, height: '100%', overflow: 'hidden' }}>
        {/* LEFT */}
        <div style={{ width: 240, minWidth: 240, overflowY: 'auto', padding: '20px 0 20px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .8, color: 'var(--text3)', marginBottom: 10 }}>📋 Laporan Harian</div>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4, fontWeight: 600 }}>Tanggal</div>
              <input type="date" value={tgl} onChange={e => setTgl(e.target.value)} style={{ fontSize: 12, padding: '7px 10px' }} />
            </div>
            <button className="btn btn-primary btn-full btn-sm" onClick={loadLaporan}>📊 Tampilkan</button>
          </div>

          {data && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .8, color: 'var(--text3)', marginBottom: 10 }}>Ringkasan</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {[
                  ['Gadai Keluar', formatRp(totalGadai), 'var(--red)'],
                  ['Akad SJB', formatRp(totalSJB), 'var(--warn)'],
                  ['Tebus Masuk', formatRp(totalTebus), 'var(--green)'],
                  ['Perpanjang', formatRp(totalPerpanjang), 'var(--green)'],
                ].map(([l, v, c]) => (
                  <div key={l as string} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                    <span style={{ color: 'var(--text3)' }}>{l}</span>
                    <span style={{ fontFamily: 'var(--mono)', color: c as string }}>{v}</span>
                  </div>
                ))}
                <div style={{ borderTop: '1px solid var(--border)', margin: '3px 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                  <span style={{ color: 'var(--text3)', fontWeight: 700 }}>📥 Total Masuk</span>
                  <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--green)' }}>{formatRp(totalMasuk)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                  <span style={{ color: 'var(--text3)', fontWeight: 700 }}>💰 Laba Ujrah</span>
                  <span style={{ fontFamily: 'var(--mono)', fontWeight: 900, color: 'var(--green)' }}>{formatRp(totalUjrah)}</span>
                </div>
                <div style={{ borderTop: '1px solid var(--border)', margin: '3px 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                  <span style={{ color: 'var(--text3)' }}>Saldo Cash</span>
                  <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--green)' }}>{formatRp(saldoCash)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                  <span style={{ color: 'var(--text3)' }}>Saldo Bank</span>
                  <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--accent)' }}>{formatRp(saldoBank)}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 20px 0' }}>
          {loading && <div style={{ textAlign: 'center', padding: 40, color: 'var(--text3)' }}>⏳ Memuat laporan...</div>}

          {!loading && !data && (
            <div style={{ textAlign: 'center', padding: 60, color: 'var(--text3)' }}>
              Pilih tanggal dan klik "Tampilkan" untuk melihat laporan
            </div>
          )}

          {data && (
            <>
              {/* Rekap cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 16 }}>
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px' }}>
                  <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 4 }}>💸 Gadai Keluar</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 700, color: 'var(--red)' }}>{formatRp(totalGadai)}</div>
                  <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>{gadaiList.length} transaksi</div>
                </div>
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px' }}>
                  <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 4 }}>📥 Tebus Masuk</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 700, color: 'var(--green)' }}>{formatRp(totalTebus)}</div>
                  <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>{tebusList.filter((r: any) => r.status === 'TEBUS').length} transaksi</div>
                </div>
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px' }}>
                  <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 4 }}>🔄 Perpanjang</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 700, color: 'var(--accent)' }}>{formatRp(totalPerpanjang)}</div>
                  <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>{tebusList.filter((r: any) => r.status === 'PERPANJANG').length} transaksi</div>
                </div>
              </div>

              {/* GADAI KELUAR */}
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 16, overflow: 'hidden' }}>
                <div style={{ padding: '10px 14px', background: 'var(--surface2)', borderBottom: '1px solid var(--border)', fontSize: 12, fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}>
                  <span>💸 Gadai Keluar</span><span style={{ color: 'var(--red)' }}>{formatRp(totalGadai)}</span>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: '7px 10px', textAlign: 'left', fontSize: 10, color: 'var(--text3)', fontWeight: 600 }}>No Faktur</th>
                    <th style={{ padding: '7px 10px', textAlign: 'left', fontSize: 10, color: 'var(--text3)', fontWeight: 600 }}>Nama</th>
                    <th style={{ padding: '7px 10px', textAlign: 'left', fontSize: 10, color: 'var(--text3)', fontWeight: 600 }}>Barang</th>
                    <th style={{ padding: '7px 10px', textAlign: 'right', fontSize: 10, color: 'var(--text3)', fontWeight: 600 }}>Gadai</th>
                    <th style={{ padding: '7px 10px', textAlign: 'left', fontSize: 10, color: 'var(--text3)', fontWeight: 600 }}>Bayar</th>
                  </tr></thead>
                  <tbody>
                    {gadaiList.length === 0 ? (
                      <tr><td colSpan={5} style={{ padding: 20, textAlign: 'center', color: 'var(--text3)' }}>—</td></tr>
                    ) : gadaiList.map((r: any, i: number) => (
                      <tr key={i} style={{ borderBottom: '1px solid rgba(46,51,73,.4)' }}>
                        <td style={{ padding: '7px 10px', fontFamily: 'var(--mono)' }}>{r.no_faktur}</td>
                        <td style={{ padding: '7px 10px' }}>{r.nama}</td>
                        <td style={{ padding: '7px 10px' }}>{r.barang}</td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', fontFamily: 'var(--mono)' }}>{formatRp(r.jumlah_gadai)}</td>
                        <td style={{ padding: '7px 10px' }}><span className={`badge ${(r.payment || '').toLowerCase()}`}>{r.payment}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* TEBUS MASUK */}
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 16, overflow: 'hidden' }}>
                <div style={{ padding: '10px 14px', background: 'var(--surface2)', borderBottom: '1px solid var(--border)', fontSize: 12, fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}>
                  <span>📥 Tebus / Perpanjang / Lainnya</span><span style={{ color: 'var(--green)' }}>{formatRp(totalMasuk)}</span>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: '7px 10px', textAlign: 'left', fontSize: 10, color: 'var(--text3)', fontWeight: 600 }}>No Faktur</th>
                    <th style={{ padding: '7px 10px', textAlign: 'left', fontSize: 10, color: 'var(--text3)', fontWeight: 600 }}>Nama</th>
                    <th style={{ padding: '7px 10px', textAlign: 'left', fontSize: 10, color: 'var(--text3)', fontWeight: 600 }}>Status</th>
                    <th style={{ padding: '7px 10px', textAlign: 'right', fontSize: 10, color: 'var(--text3)', fontWeight: 600 }}>Bayar</th>
                    <th style={{ padding: '7px 10px', textAlign: 'right', fontSize: 10, color: 'var(--text3)', fontWeight: 600 }}>Ujrah</th>
                  </tr></thead>
                  <tbody>
                    {tebusList.length === 0 ? (
                      <tr><td colSpan={5} style={{ padding: 20, textAlign: 'center', color: 'var(--text3)' }}>—</td></tr>
                    ) : tebusList.map((r: any, i: number) => (
                      <tr key={i} style={{ borderBottom: '1px solid rgba(46,51,73,.4)' }}>
                        <td style={{ padding: '7px 10px', fontFamily: 'var(--mono)' }}>{r.no_faktur}</td>
                        <td style={{ padding: '7px 10px' }}>{r.nama_nasabah || r.nama}</td>
                        <td style={{ padding: '7px 10px' }}><span className={`badge ${(r.status || '').toLowerCase()}`}>{r.status}</span></td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', fontFamily: 'var(--mono)' }}>{formatRp(r.jumlah_bayar)}</td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--green)' }}>{formatRp(r.ujrah_berjalan)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* SALDO KAS AKHIR */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
                <div style={{ background: 'var(--surface2)', borderRadius: 6, padding: 10, textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 4 }}>Saldo Cash</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, color: 'var(--green)' }}>{formatRp(saldoCash)}</div>
                </div>
                <div style={{ background: 'var(--surface2)', borderRadius: 6, padding: 10, textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 4 }}>Saldo Bank</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>{formatRp(saldoBank)}</div>
                </div>
                <div style={{ background: 'var(--surface2)', borderRadius: 6, padding: 10, textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 4 }}>Total Saldo</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700 }}>{formatRp(saldoCash + saldoBank)}</div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}
