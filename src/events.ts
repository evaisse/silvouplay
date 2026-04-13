import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export function appendEvent(eventsFile: string, event: Record<string, unknown>): void {
  mkdirSync(path.dirname(eventsFile), { recursive: true });
  appendFileSync(
    eventsFile,
    `${JSON.stringify({ at: new Date().toISOString(), ...event })}\n`,
    'utf8',
  );
}

export function writeRunSnapshot(
  runsDir: string,
  runId: string,
  payload: Record<string, unknown>,
): void {
  mkdirSync(runsDir, { recursive: true });
  writeFileSync(
    path.join(runsDir, `${runId}.json`),
    `${JSON.stringify(payload, null, 2)}\n`,
    'utf8',
  );
}
