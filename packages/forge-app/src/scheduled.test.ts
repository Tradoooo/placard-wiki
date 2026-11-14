/**
 * Les déclencheurs planifiés — un seul propriétaire du balayage par site.
 *
 * Ce que ces tests verrouillent : sur une installation **Jira** du même site,
 * `incrementalSweep` et `fullSweep` ne font **rien** (aucun appel à Confluence,
 * aucune mise en file) et le disent au journal. C'est le doublon mesuré le
 * 14 novembre 2026 : les deux installations du site portaient chacune leur
 * déclencheur `fiveMinute` et écrivaient le registre deux fois, chacune avec
 * sa propre clé HMAC.
 *
 * Aucun réseau, aucun SDK Forge : les ports sont simulés.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

type RuntimeFake = { contextAri?: string };

const ARI_CONFLUENCE = 'ari:cloud:confluence::site/5f423966-db58-4fe6-b277-b6828aee8db2';
const ARI_JIRA = 'ari:cloud:jira::site/5f423966-db58-4fe6-b277-b6828aee8db2';

let runtime: RuntimeFake = { contextAri: ARI_JIRA };
let journaux: string[] = [];

const runSweepMock = vi.fn();
const pushMock = vi.fn();
const contextMock = vi.fn();

vi.mock('@forge/api', () => ({ __getRuntime: () => runtime }));
vi.mock('./runtime/context', () => ({
  getServiceContext: (...args: unknown[]) => contextMock(...args),
}));
vi.mock('./runtime/queue', () => ({
  pushSweepEvent: (...args: unknown[]) => pushMock(...args),
}));
vi.mock('./services/index', () => ({ runSweep: (...args: unknown[]) => runSweepMock(...args) }));

const { fullSweep, incrementalSweep } = await import('./scheduled.js');

beforeEach(() => {
  runtime = { contextAri: ARI_JIRA };
  runSweepMock.mockReset();
  pushMock.mockReset();
  contextMock.mockReset();
  journaux = [];
  vi.spyOn(console, 'info').mockImplementation((...args: unknown[]) => {
    journaux.push(args.join(' '));
  });
});

describe('installation Jira du même site — rien n’est fait', () => {
  it('incrementalSweep : ni balayage, ni file, ni contexte', async () => {
    await incrementalSweep();
    expect(runSweepMock).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
    expect(contextMock).not.toHaveBeenCalled();
    expect(journaux.join('\n')).toContain('incrémental : ignoré');
  });

  it('fullSweep : aucune tranche poussée', async () => {
    await fullSweep();
    expect(pushMock).not.toHaveBeenCalled();
    expect(journaux.join('\n')).toContain('passe complète : ignoré');
  });
});

describe('installation Confluence — le balayage part normalement', () => {
  it('incrementalSweep appelle runSweep une fois (tranche directe)', async () => {
    runtime = { contextAri: ARI_CONFLUENCE };
    contextMock.mockResolvedValue({ store: 'ctx' });
    runSweepMock.mockResolvedValue({
      pagesScanned: 0, foyersTouched: 0, done: true, blindSpots: [], nextCursor: null,
    });

    await incrementalSweep();

    expect(runSweepMock).toHaveBeenCalledTimes(1);
    expect(journaux.join('\n')).toContain("balayage conduit par l'installation confluence");
  });

  it('fullSweep pousse la tranche « site » sur la file', async () => {
    runtime = { contextAri: ARI_CONFLUENCE };
    pushMock.mockResolvedValue({ ok: true });

    await fullSweep();

    expect(pushMock).toHaveBeenCalledWith({ mode: 'full', scope: 'site' });
  });
});

describe('contexte illisible (hors Forge, cold start) — fail-open', () => {
  it('un runtime sans contexte balaye quand même, sans exception muette', async () => {
    runtime = {};
    contextMock.mockResolvedValue({});
    runSweepMock.mockResolvedValue({
      pagesScanned: 0, foyersTouched: 0, done: true, blindSpots: [], nextCursor: null,
    });

    await incrementalSweep();

    expect(runSweepMock).toHaveBeenCalledTimes(1);
  });
});
