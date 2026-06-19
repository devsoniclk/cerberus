import { Command } from 'commander';
import { CerberusGuard, PolicyViolation } from './guard.js';
import { KillSwitch } from './killswitch.js';
import { AuditLog } from './audit.js';
import { createProxy } from './proxy.js';

const program = new Command();

program
  .name('cerberus')
  .description('x402 payment firewall for AI agents')
  .version('0.1.0');

program
  .command('report')
  .description('Show audit log summary')
  .option('--since <duration>', 'Time window (e.g. 24h, 7d)', '24h')
  .option('--log <path>', 'Audit log path', 'cerberus-audit.jsonl')
  .action((opts) => {
    const ms = parseDuration(opts.since);
    const since = Date.now() - ms;
    const log = new AuditLog(opts.log);
    const report = log.report({ since });

    console.log(`\n🛡️  Cerberus Audit Report (last ${opts.since})\n`);
    console.log(`  Total payments:       ${report.total}`);
    console.log(`  Allowed:              ${report.allowed}`);
    console.log(`  Blocked:              ${report.blocked}`);
    console.log(`  Requires approval:    ${report.requires_approval}`);
    console.log(`  Flagged by detectors: ${report.flagged}`);
    console.log(`  Total allowed amount: $${report.totalAmount.toFixed(2)}`);

    if (report.blockedReasons.length > 0) {
      console.log(`\n  Block reasons:`);
      const counts = new Map<string, number>();
      for (const r of report.blockedReasons) {
        counts.set(r, (counts.get(r) ?? 0) + 1);
      }
      for (const [reason, count] of counts) {
        console.log(`    [${count}x] ${reason}`);
      }
    }
    console.log('');
  });

program
  .command('freeze')
  .description('Emergency freeze all payments')
  .option('--reason <reason>', 'Freeze reason', 'Manual CLI freeze')
  .option('--state <path>', 'Kill switch state file', '.cerberus-killswitch')
  .action((opts) => {
    const ks = new KillSwitch();
    ks.freeze(opts.reason);
    console.log('🔴 Kill switch ACTIVATED — all payments frozen');
    console.log(`   Reason: ${opts.reason}`);
  });

program
  .command('resume')
  .description('Resume after freeze')
  .option('--auth <token>', 'Authorization token')
  .option('--state <path>', 'Kill switch state file', '.cerberus-killswitch')
  .action((opts) => {
    const ks = new KillSwitch();
    try {
      ks.resume(opts.auth ?? 'cli-resume');
      console.log('🟢 Kill switch deactivated — payments resumed');
    } catch (err: any) {
      console.error(`❌ ${err.message}`);
      process.exit(1);
    }
  });

program
  .command('proxy')
  .description('Run transparent x402 proxy')
  .option('--policy <path>', 'Policy YAML file')
  .option('--upstream <url>', 'Upstream facilitator URL', 'http://localhost:3000')
  .option('--port <port>', 'Listen port', '8787')
  .option('--log <path>', 'Audit log path', 'cerberus-audit.jsonl')
  .action((opts) => {
    const server = createProxy({
      port: parseInt(opts.port),
      upstream: opts.upstream,
      policy: opts.policy,
      auditLog: opts.log,
    });
    server.listen(opts.port, () => {
      console.log(`🛡️  Cerberus proxy listening on :${opts.port}`);
      console.log(`   Upstream: ${opts.upstream}`);
      console.log(`   Policy: ${opts.policy ?? 'default'}`);
    });
  });

program
  .command('check <address>')
  .description('Quick policy check for an address')
  .option('--policy <path>', 'Policy YAML file')
  .action((address, opts) => {
    const guard = new CerberusGuard({ policy: opts.policy });
    const config = guard.policy.getConfig();
    const lower = address.toLowerCase();

    if (config.recipients.deny.map(a => a.toLowerCase()).includes(lower)) {
      console.log(`🔴 ${address} is on DENY list`);
    } else if (config.recipients.allow.map(a => a.toLowerCase()).includes(lower)) {
      console.log(`🟢 ${address} is on ALLOW list`);
    } else {
      console.log(`🟡 ${address} not in any list (first_seen_hold: ${config.recipients.first_seen_hold})`);
    }
  });

function parseDuration(s: string): number {
  const match = s.match(/^(\d+)([mhd])$/);
  if (!match) return 24 * 3600_000;
  const n = parseInt(match[1]);
  switch (match[2]) {
    case 'm': return n * 60_000;
    case 'h': return n * 3600_000;
    case 'd': return n * 86400_000;
    default: return 24 * 3600_000;
  }
}

program.parse();
