// ============================================================
// File: lib/wa/adapters/fonnte.ts
// Adapter untuk provider Fonnte (https://fonnte.com/)
//
// API docs: https://docs.fonnte.com/send-message-api/
// Endpoint: POST https://api.fonnte.com/send
// Auth: Authorization: <api_token>  (NO "Bearer " prefix)
// Body: { target, message }
// ============================================================

import type { AdapterResult, AdapterSendArgs } from '../types';

const DEFAULT_BASE = 'https://api.fonnte.com';

export async function fonnteSend(args: AdapterSendArgs): Promise<AdapterResult> {
  const { config, toNumber, message } = args;
  const base = (config.api_base_url || DEFAULT_BASE).replace(/\/$/, '');
  const url = `${base}/send`;

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': config.api_key,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        target: toNumber,
        message: message,
        countryCode: '62',
      }).toString(),
    });

    const txt = await resp.text();
    let json: any;
    try { json = JSON.parse(txt); } catch { json = { raw: txt }; }

    // Fonnte response: { status: true, detail: "...", id: [...], target: [...], process: "..." }
    const ok = resp.ok && (json?.status === true || json?.status === 'true');
    if (!ok) {
      return {
        ok: false,
        error: `Fonnte error: HTTP ${resp.status} — ${json?.reason ?? json?.detail ?? txt}`,
        rawResponse: json,
      };
    }

    return {
      ok: true,
      providerMsgId: String(json?.id?.[0] ?? ''),
      rawResponse: json,
    };
  } catch (e) {
    return {
      ok: false,
      error: 'Fonnte network error: ' + (e as Error).message,
    };
  }
}
