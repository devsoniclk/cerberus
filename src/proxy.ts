import http from 'node:http';
import { CerberusGuard, type PaymentRequest } from './guard.js';
import type { PolicyConfig } from './policy.js';

export interface ProxyOptions {
  port: number;
  upstream: string;
  policy?: string | PolicyConfig;
  auditLog?: string;
}

export function createProxy(opts: ProxyOptions): http.Server {
  const guard = new CerberusGuard({ policy: opts.policy, auditLog: opts.auditLog });

  const server = http.createServer(async (req, res) => {
    if (req.method !== 'POST' || !req.url?.startsWith('/settle')) {
      // Pass through non-settle requests to upstream
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found. Use POST /settle for x402 payments.' }));
      return;
    }

    let body = '';
    for await (const chunk of req) {
      body += chunk;
    }

    let payment: PaymentRequest;
    try {
      payment = JSON.parse(body);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON body' }));
      return;
    }

    try {
      const result = await guard.pay(payment);

      if (result.decision === 'allowed') {
        // Forward to upstream facilitator
        try {
          const upstreamRes = await fetch(`${opts.upstream}/settle`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payment),
          });
          const upstreamBody = await upstreamRes.text();
          res.writeHead(upstreamRes.status, { 'Content-Type': 'application/json' });
          res.end(upstreamBody);
        } catch (err) {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Upstream facilitator unreachable' }));
        }
      } else {
        // requires_approval
        res.writeHead(202, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'requires_approval', result }));
      }
    } catch (err: any) {
      // PolicyViolation
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Blocked by Cerberus', reason: err.message }));
    }
  });

  return server;
}
