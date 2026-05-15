'use client';

// ============================================================
// File: app/wa-inbox/page.tsx
//
// Dashboard WhatsApp Inbox — buka balasan konsumen, set reminder ulang.
// Kasir lihat outlet sendiri, OWNER/ADMIN lihat semua outlet.
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import AppShell from '@/components/ui/AppShell';
import PinModal from '@/components/ui/PinModal';
import { useAuth } from '@/components/auth/AuthProvider';
import { formatDate } from '@/lib/format';

interface Conversation {
  id: number;
  outlet_id: number;
  nomor_pengirim: string;
  nama_nasabah: string | null;
  ref_table: string | null;
  ref_id: string | null;
  no_faktur: string | null;
  message_body: string;
  state: 'NEW' | 'IN_PROGRESS' | 'HANDLED' | 'STALE';
  handled_by: string | null;
  handled_at: string | null;
  reschedule_to: string | null;
  reschedule_reason: string | null;
  received_at: string;
  isStale?: boolean;
  businessHoursElapsed?: number;
}

interface OutletOpt {
  id: number;
  nama: string;
}

interface DetailKontrak {
  id: string;
  no_faktur: string;
  nama: string;
  telp1: string;
  telp2: string | null;
  barang: string;
  status: string;
  reminder_state: string;
  reminder_next_at: string | null;
  tgl_jt: string;
  tgl_sita: string;
  outlet_id: number;
  jumlah_gadai?: number;
  harga_jual?: number;
  harga_buyback?: number;
}

interface DetailResp {
  kontrak: DetailKontrak | null;
  incoming: any[];
  outgoing: any[];
}

const STATE_LABEL: Record<string, { icon: string; color: string }> = {
  NEW: { icon: '🔵', color: 'var(--accent)' },
  IN_PROGRESS: { icon: '🟢', color: 'var(--green)' },
  HANDLED: { icon: '✅', color: 'var(--text3)' },
  STALE: { icon: '⚠️', color: 'var(--red)' },
};

export default function WaInboxPage() {
  const { user, isAdminOrOwner } = useAuth();
  const myOutletId = (user as any)?.outlet_id ?? null;

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [stats, setStats] = useState<any>({ sent: 0, delivered: 0, read: 0, failed: 0, skipped: 0, replied: 0, stale_open: 0 });
  const [outlets, setOutlets] = useState<OutletOpt[]>([]);
  const [filterOutlet, setFilterOutlet] = useState<string>(''); // string id atau '' (all)
  const [filterState, setFilterState] = useState<string>('ALL');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [detail, setDetail] = useState<DetailResp | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // PIN modal for actions
  const [pinOpen, setPinOpen] = useState(false);
  const [pinAction, setPinAction] = useState('');
  const [pendingFn, setPendingFn] = useState<((pin: string) => Promise<void>) | null>(null);

  // Custom tunda input
  const [tundaCustom, setTundaCustom] = useState('');
  const [actionReason, setActionReason] = useState('');

  // Default filter outlet: kasir auto-filter ke outlet sendiri
  useEffect(() => {
    if (!isAdminOrOwner && myOutletId) {
      setFilterOutlet(String(myOutletId));
    }
  }, [isAdminOrOwner, myOutletId]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterOutlet) params.set('outletId', filterOutlet);
      if (filterState !== 'ALL') params.set('state', filterState);
      const res = await fetch('/api/wa/inbox?' + params.toString());
      const json = await res.json();
      if (json.ok) {
        setConversations(json.conversations || []);
        setStats(json.stats || {});
        setOutlets(json.outlets || []);
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [filterOutlet, filterState]);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh tiap 30 detik
  useEffect(() => {
    const intv = setInterval(load, 30000);
    return () => clearInterval(intv);
  }, [load]);

  async function openDetail(c: Conversation) {
    setSelected(c);
    setDetail(null);
    setActionReason('');
    setTundaCustom('');
    if (!c.ref_id) return;
    setLoadingDetail(true);
    try {
      const res = await fetch('/api/wa/inbox?refId=' + encodeURIComponent(c.ref_id));
      const json = await res.json();
      if (json.ok) setDetail({ kontrak: json.kontrak, incoming: json.incoming, outgoing: json.outgoing });
    } catch (e) { console.error(e); }
    setLoadingDetail(false);
  }

  function requestAction(label: string, body: any) {
    setPinAction(label);
    setPendingFn(() => async (pin: string) => {
      try {
        const res = await fetch('/api/wa/reschedule', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin, ...body }),
        });
        const json = await res.json();
        if (!json.ok) { alert(json.msg); return; }
        // Reload list + detail
        await load();
        if (selected) await openDetail(selected);
      } catch (e) {
        alert('Error: ' + (e as Error).message);
      }
    });
    setPinOpen(true);
  }

  function actTunda(days: number) {
    if (!selected) return;
    requestAction(`Tunda ${days} hari — ${selected.nama_nasabah || selected.no_faktur}`, {
      outletId: selected.outlet_id,
      incomingId: selected.id,
      action: 'tunda',
      days,
      reason: actionReason || `Tunda ${days} hari`,
    });
  }

  function actTundaCustom() {
    if (!selected || !tundaCustom) return;
    requestAction(`Tunda custom — ${selected.nama_nasabah}`, {
      outletId: selected.outlet_id,
      incomingId: selected.id,
      action: 'tunda',
      customDate: tundaCustom,
      reason: actionReason || 'Tunda custom',
    });
  }

  function actContacted() {
    if (!selected) return;
    requestAction(`Tandai sudah dihubungi — ${selected.nama_nasabah}`, {
      outletId: selected.outlet_id,
      incomingId: selected.id,
      action: 'contacted',
      reason: actionReason || 'Dihubungi via telepon',
    });
  }

  function actEskalasi() {
    if (!selected) return;
    if (!confirm('Eskalasi ke owner? Auto-reminder akan tetap jalan sebagai tekanan.')) return;
    requestAction(`Eskalasi — ${selected.nama_nasabah}`, {
      outletId: selected.outlet_id,
      incomingId: selected.id,
      action: 'eskalasi',
      reason: actionReason || 'Eskalasi',
    });
  }

  function openWaLink() {
    if (!selected) return;
    const num = selected.nomor_pengirim.replace(/[^0-9]/g, '');
    const text = encodeURIComponent('Halo Pak/Ibu ' + (selected.nama_nasabah ?? '') + ', terkait kontrak ' + (selected.no_faktur ?? '') + ' — ');
    window.open(`https://wa.me/${num}?text=${text}`, '_blank');
  }

  return (
    <AppShell title="💬 WhatsApp Inbox" subtitle="Balasan konsumen & reminder">
      <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
        {/* LEFT: Filter + List */}
        <div style={{ width: 380, minWidth: 380, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
          {/* Stats card */}
          <div style={{ padding: 10, borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, fontSize: 11 }}>
              <StatPill label="Terkirim" value={stats.sent + stats.delivered + stats.read} color="var(--green)" />
              <StatPill label="Balasan" value={stats.replied} color="var(--accent)" />
              <StatPill label="⚠️ Stale" value={stats.stale_open} color="var(--red)" />
            </div>
            <div style={{ fontSize: 9, color: 'var(--text3)', marginTop: 4, textAlign: 'center' }}>Statistik 24 jam terakhir</div>
          </div>

          {/* Filters */}
          <div style={{ padding: 10, borderBottom: '1px solid var(--border)', display: 'flex', gap: 6 }}>
            {isAdminOrOwner && (
              <select value={filterOutlet} onChange={e => setFilterOutlet(e.target.value)} style={{ flex: 1, fontSize: 11, padding: '4px 6px' }}>
                <option value="">Semua Outlet</option>
                {outlets.map(o => <option key={o.id} value={o.id}>{o.nama}</option>)}
              </select>
            )}
            <select value={filterState} onChange={e => setFilterState(e.target.value)} style={{ flex: 1, fontSize: 11, padding: '4px 6px' }}>
              <option value="ALL">Semua Status</option>
              <option value="NEW">🔵 Baru</option>
              <option value="IN_PROGRESS">🟢 Diproses</option>
              <option value="HANDLED">✅ Selesai</option>
              <option value="STALE">⚠️ Stale (lewat 4 jam)</option>
            </select>
          </div>

          {/* Conversation list */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loading ? <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)', fontSize: 12 }}>⏳ Loading...</div>
            : conversations.length === 0 ? <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)', fontSize: 12 }}>Tidak ada balasan</div>
            : conversations.map(c => (
              <ConvCard key={c.id} conv={c} selected={selected?.id === c.id} onClick={() => openDetail(c)} />
            ))}
          </div>
        </div>

        {/* RIGHT: Detail */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {!selected ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)' }}>
              ← Pilih conversation untuk lihat detail
            </div>
          ) : (
            <DetailPanel
              conv={selected}
              detail={detail}
              loading={loadingDetail}
              tundaCustom={tundaCustom}
              setTundaCustom={setTundaCustom}
              actionReason={actionReason}
              setActionReason={setActionReason}
              actTunda={actTunda}
              actTundaCustom={actTundaCustom}
              actContacted={actContacted}
              actEskalasi={actEskalasi}
              openWaLink={openWaLink}
            />
          )}
        </div>
      </div>

      <PinModal open={pinOpen} action={pinAction}
        onSuccess={(pin) => { setPinOpen(false); pendingFn?.(pin); }}
        onCancel={() => setPinOpen(false)} />
    </AppShell>
  );
}

// ─────────────────────────────────────────────────────────────
function StatPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ background: 'var(--surface2)', borderRadius: 6, padding: '6px 4px', textAlign: 'center' }}>
      <div style={{ fontSize: 16, fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 9, color: 'var(--text3)', marginTop: 2 }}>{label}</div>
    </div>
  );
}

function ConvCard({ conv, selected, onClick }: { conv: Conversation; selected: boolean; onClick: () => void }) {
  const state = conv.isStale && conv.state === 'NEW' ? 'STALE' : conv.state;
  const meta = STATE_LABEL[state] || STATE_LABEL.NEW;
  const timeStr = formatTimeAgo(conv.received_at);

  return (
    <div onClick={onClick}
      style={{
        padding: '10px 12px',
        borderBottom: '1px solid var(--border)',
        cursor: 'pointer',
        background: selected ? 'rgba(59,130,246,.08)' : 'transparent',
        borderLeft: selected ? '3px solid var(--accent)' : '3px solid transparent',
      }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            <span style={{ color: meta.color, marginRight: 4 }}>{meta.icon}</span>
            {conv.nama_nasabah || '(tidak match)'}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', marginTop: 2 }}>
            {conv.no_faktur || conv.nomor_pengirim}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {conv.message_body}
          </div>
        </div>
        <div style={{ fontSize: 10, color: 'var(--text3)', whiteSpace: 'nowrap' }}>{timeStr}</div>
      </div>
      {conv.state === 'HANDLED' && conv.reschedule_to && (
        <div style={{ fontSize: 10, color: 'var(--green)', marginTop: 4 }}>
          ⏰ Reminder: {new Date(conv.reschedule_to).toLocaleDateString('id-ID')}
        </div>
      )}
      {conv.isStale && conv.state === 'NEW' && (
        <div style={{ fontSize: 10, color: 'var(--red)', marginTop: 4 }}>
          ⚠️ {conv.businessHoursElapsed} jam belum direspond
        </div>
      )}
    </div>
  );
}

function DetailPanel(props: {
  conv: Conversation;
  detail: DetailResp | null;
  loading: boolean;
  tundaCustom: string;
  setTundaCustom: (v: string) => void;
  actionReason: string;
  setActionReason: (v: string) => void;
  actTunda: (days: number) => void;
  actTundaCustom: () => void;
  actContacted: () => void;
  actEskalasi: () => void;
  openWaLink: () => void;
}) {
  const { conv, detail, loading } = props;
  const handled = conv.state === 'HANDLED';

  return (
    <>
      {/* Header */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>
          {conv.nama_nasabah || '(tidak match kontrak)'} · <span style={{ fontFamily: 'var(--mono)', color: 'var(--text2)' }}>{conv.nomor_pengirim}</span>
        </div>
        {conv.no_faktur && (
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
            Kontrak: <b>{conv.no_faktur}</b>
            {detail?.kontrak && (
              <>
                {' · '}
                {detail.kontrak.barang}
                {' · '}
                JT: {formatDate(detail.kontrak.tgl_jt)}
                {detail.kontrak.reminder_state !== 'AUTO' && (
                  <span style={{ marginLeft: 8, padding: '1px 6px', borderRadius: 8, background: 'var(--surface2)', fontSize: 10 }}>
                    state: {detail.kontrak.reminder_state}
                  </span>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Chat timeline */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 16, background: 'var(--surface2)' }}>
        {loading ? <div style={{ textAlign: 'center', color: 'var(--text3)', padding: 40 }}>⏳ Loading...</div>
        : detail ? (
          <Timeline incoming={detail.incoming} outgoing={detail.outgoing} fallbackMsg={conv.message_body} fallbackTime={conv.received_at} />
        ) : (
          <div style={{ background: 'var(--surface)', padding: 12, borderRadius: 8, maxWidth: '80%' }}>
            <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 4 }}>Konsumen · {new Date(conv.received_at).toLocaleString('id-ID')}</div>
            <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{conv.message_body}</div>
          </div>
        )}
      </div>

      {/* Action bar */}
      <div style={{ borderTop: '1px solid var(--border)', padding: 12, background: 'var(--surface)' }}>
        {handled ? (
          <div style={{ fontSize: 12, color: 'var(--text3)' }}>
            ✅ Sudah ditangani oleh <b>{conv.handled_by}</b> ({conv.handled_at ? new Date(conv.handled_at).toLocaleString('id-ID') : '-'})
            {conv.reschedule_to && <> · Reminder ulang: <b>{new Date(conv.reschedule_to).toLocaleDateString('id-ID')}</b></>}
            {conv.reschedule_reason && <div style={{ fontSize: 11, marginTop: 4, fontStyle: 'italic' }}>"{conv.reschedule_reason}"</div>}
          </div>
        ) : (
          <>
            <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6 }}>Quick action:</div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
              <button className="btn btn-outline btn-sm" onClick={() => props.actTunda(3)}>Tunda 3 hari</button>
              <button className="btn btn-outline btn-sm" onClick={() => props.actTunda(7)}>Tunda 7 hari</button>
              <button className="btn btn-outline btn-sm" onClick={() => props.actTunda(14)}>Tunda 14 hari</button>
              <input
                type="date"
                value={props.tundaCustom}
                onChange={e => props.setTundaCustom(e.target.value)}
                style={{ fontSize: 11, padding: '4px 6px', minWidth: 130 }}
              />
              <button className="btn btn-outline btn-sm" onClick={props.actTundaCustom} disabled={!props.tundaCustom}>Set tgl</button>
            </div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              <button className="btn btn-success btn-sm" onClick={props.actContacted}>✓ Sudah dihubungi</button>
              <button className="btn btn-outline btn-sm" onClick={props.actEskalasi} style={{ color: 'var(--red)' }}>⚠️ Eskalasi</button>
              <button className="btn btn-outline btn-sm" onClick={props.openWaLink}>📱 Buka WhatsApp ↗</button>
            </div>
            <input
              type="text"
              placeholder="Catatan (optional)..."
              value={props.actionReason}
              onChange={e => props.setActionReason(e.target.value)}
              style={{ width: '100%', fontSize: 11, padding: '6px 8px' }}
            />
          </>
        )}
      </div>
    </>
  );
}

function Timeline({ incoming, outgoing, fallbackMsg, fallbackTime }: { incoming: any[]; outgoing: any[]; fallbackMsg: string; fallbackTime: string }) {
  // Merge & sort by timestamp
  const merged = [
    ...(outgoing ?? []).map((o: any) => ({ ...o, _type: 'out', _time: o.created_at })),
    ...(incoming ?? []).map((i: any) => ({ ...i, _type: 'in', _time: i.received_at })),
  ].sort((a, b) => new Date(a._time).getTime() - new Date(b._time).getTime());

  if (merged.length === 0) {
    return (
      <div style={{ background: 'var(--surface)', padding: 12, borderRadius: 8, maxWidth: '80%' }}>
        <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 4 }}>Konsumen · {new Date(fallbackTime).toLocaleString('id-ID')}</div>
        <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{fallbackMsg}</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {merged.map((m: any, idx: number) => (
        <div key={idx} style={{
          alignSelf: m._type === 'in' ? 'flex-start' : 'flex-end',
          maxWidth: '70%',
          background: m._type === 'in' ? 'var(--surface)' : 'rgba(34,197,94,.15)',
          border: m._type === 'in' ? '1px solid var(--border)' : '1px solid rgba(34,197,94,.3)',
          padding: '8px 12px',
          borderRadius: 8,
        }}>
          <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 4 }}>
            {m._type === 'in' ? 'Konsumen' : `Sistem (${m.template_code ?? m.status})`} · {new Date(m._time).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}
            {m._type === 'out' && <> · <span style={{ color: m.status === 'FAILED' ? 'var(--red)' : 'var(--green)' }}>{m.status}</span></>}
          </div>
          <div style={{ fontSize: 12, whiteSpace: 'pre-wrap' }}>{m.message_body}</div>
          {m._type === 'out' && m.error_msg && (
            <div style={{ fontSize: 10, color: 'var(--red)', marginTop: 4 }}>Error: {m.error_msg}</div>
          )}
        </div>
      ))}
    </div>
  );
}

function formatTimeAgo(iso: string): string {
  const d = new Date(iso);
  const diffMin = Math.floor((Date.now() - d.getTime()) / 60000);
  if (diffMin < 1) return 'baru saja';
  if (diffMin < 60) return `${diffMin}m`;
  if (diffMin < 1440) return `${Math.floor(diffMin / 60)}j`;
  return `${Math.floor(diffMin / 1440)}h`;
}
