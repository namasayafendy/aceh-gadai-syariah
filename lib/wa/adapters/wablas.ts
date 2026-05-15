// ============================================================
// File: lib/wa/adapters/wablas.ts
// Adapter untuk provider Wablas (https://wablas.com/)
//
// API docs: https://wablas.com/dokumentasi
// Endpoint: POST https://{server}.wablas.com/api/send-message
// Auth: Authorization: <api_token>  (NO "Bearer " prefix)
// Body: { phone, message }
// ============================================================

import type { AdapterResult, AdapterSendArgs } from '../types';

const DEFAULT_BASE = 'https://pati.wablas.com'; // default server, bisa di-override via api_base_url

export async function wablasSend(args: AdapterSendArgs): Promise<AdapterResult> {
  const { config, toNumber, message } = args;
  const base = (config.api_base_url || DEFAULT_BASE).replace(/\/$/, '');
  const url = `${base}/api/send-message`;

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': config.api_key, // wablas: token saja, no "Bearer"
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        phone: toNumber,
        message: message,
      }).toString(),
    });

    const txt = await resp.text();
    let json: any;
    try { json = JSON.parse(txt); } catch { json = { raw: txt }; }

    // Wablas response shape:
    // { status: true/false, message: "Success/Error", data: { id, ... } }
    const ok = resp.ok && (json?.status === true || json?.status === 'true');
    if (!ok) {
      return {
        ok: false,
        error: `Wablas error: HTTP ${resp.status} — ${json?.message ?? txt}`,
        rawResponse: json,
      };
    }

    return {
      ok: true,
      providerMsgId: String(json?.data?.messages?.[0]?.id ?? json?.data?.id ?? ''),
      rawResponse: json,
    };
  } catch (e) {
    return {
      ok: false,
      error: 'Wablas network error: ' + (e as Error).message,
    };
  }
}
