/**
 * Propriété du balayage — le contrat, sans runtime Forge.
 *
 * Ce que ces tests verrouillent :
 *   1. le produit est lu depuis l'ARI de contexte (les scopes ne discriminent
 *      pas : mesuré le 14 novembre 2026, les deux installations du site ont
 *      les mêmes 37 scopes Confluence) ;
 *   2. une installation Jira **ne balaye pas** — c'est le doublon mesuré
 *      (deux séries de 5 min entrelacées, registre écrit deux fois) ;
 *   3. un contexte illisible ou inconnu **balaye** (fail-open assumé, voir
 *      l'en-tête de `installation.ts`) : jamais une perte silencieuse du
 *      balayage pour une raison de forme ;
 *   4. la décision est **dite** dans le journal, avec le produit et l'ARI.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type RuntimeFake = { contextAri?: string };

let runtime: RuntimeFake = {};
const getRuntimeMock = vi.fn((): RuntimeFake => runtime);

vi.mock('@forge/api', () => ({
  __getRuntime: () => getRuntimeMock(),
}));

const { doitBalayer, installationProfil, journalBalayage, produitDepuisAri } =
  await import('./installation.js');

const ARI_CONFLUENCE = 'ari:cloud:confluence::site/5f423966-db58-4fe6-b277-b6828aee8db2';
const ARI_JIRA = 'ari:cloud:jira::site/5f423966-db58-4fe6-b277-b6828aee8db2';

let journaux: string[];

beforeEach(() => {
  runtime = {};
  getRuntimeMock.mockClear();
  journaux = [];
  vi.spyOn(console, 'info').mockImplementation((...args: unknown[]) => {
    journaux.push(args.join(' '));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('produitDepuisAri — la lecture du contexte', () => {
  it('confluence et jira se distinguent par le segment produit', () => {
    expect(produitDepuisAri(ARI_CONFLUENCE)).toBe('confluence');
    expect(produitDepuisAri(ARI_JIRA)).toBe('jira');
  });

  it('un ARI absent ou difforme donne « inconnu », jamais une exception', () => {
    expect(produitDepuisAri(undefined)).toBe('inconnu');
    expect(produitDepuisAri(null)).toBe('inconnu');
    expect(produitDepuisAri('nimporte-quoi')).toBe('inconnu');
    expect(produitDepuisAri('ari:cloud:ecosystem::installation/268bea73')).toBe('ecosystem');
  });
});

describe('doitBalayer — un seul propriétaire par site', () => {
  it("l'installation Confluence balaye", () => {
    expect(doitBalayer({ produit: 'confluence', ari: ARI_CONFLUENCE })).toBe(true);
  });

  it("l'installation Jira ne balaye pas (doublon mesuré le 14 novembre 2026)", () => {
    expect(doitBalayer({ produit: 'jira', ari: ARI_JIRA })).toBe(false);
  });

  it('un produit inconnu balaye quand même : fail-open, pas de perte silencieuse', () => {
    expect(doitBalayer({ produit: 'inconnu', ari: '' })).toBe(true);
  });
});

describe('installationProfil — le runtime Forge', () => {
  it('lit contextAri du runtime', () => {
    runtime = { contextAri: ARI_JIRA };
    expect(installationProfil()).toEqual({ produit: 'jira', ari: ARI_JIRA });
  });

  it("un runtime qui jette donne « inconnu » (hors Forge, tests, cold start)", () => {
    getRuntimeMock.mockImplementationOnce(() => {
      throw new Error('no runtime');
    });
    expect(installationProfil()).toEqual({ produit: 'inconnu', ari: '' });
  });

  it('un contexte absent du runtime donne « inconnu »', () => {
    runtime = {};
    expect(installationProfil().produit).toBe('inconnu');
  });
});

describe('journalBalayage — la décision est dite', () => {
  it("le refus nomme le produit, l'ARI et le propriétaire", () => {
    const autorise = journalBalayage({ produit: 'jira', ari: ARI_JIRA }, 'incrémental');
    expect(autorise).toBe(false);
    expect(journaux.join('\n')).toContain('incrémental : ignoré');
    expect(journaux.join('\n')).toContain('jira');
    expect(journaux.join('\n')).toContain(ARI_JIRA);
    expect(journaux.join('\n')).toContain('Confluence');
  });

  it("l'acceptation journalise le produit porteur", () => {
    expect(journalBalayage({ produit: 'confluence', ari: ARI_CONFLUENCE }, 'passe complète')).toBe(true);
    expect(journaux.join('\n')).toContain("balayage conduit par l'installation confluence");
  });
});
