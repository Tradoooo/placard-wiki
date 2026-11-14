/**
 * Propriété du balayage — quelle installation du site le conduit.
 *
 * ⚠ Mesuré le 14 novembre 2026 (`forge install list --verbose`, app
 * dc47d23f-e4cd-4681-bb64-14ac02ea1c98, site one-atlas-cndz.atlassian.net) :
 * l'app est installée **deux fois sur le même site**, une installation
 * Confluence (`ari:cloud:confluence::site/5f423966-…`) et une installation
 * Jira (`ari:cloud:jira::site/` **le même cloudId**). Chacune porte son
 * déclencheur `fiveMinute` : deux séries entrelacées dans les journaux
 * (13:40:14, 13:43:57, 13:45:12, 13:48:56, 13:50:13, 13:53:56, 13:55:13),
 * chacune avec sa propre clé HMAC ⇒ le registre est écrit en double et le
 * site est balayé deux fois.
 *
 * Le discriminant n'est **pas** la liste des scopes : les deux installations
 * reçoivent les 37 scopes Confluence et les 3 scopes Jira (même relevé).
 * C'est l'ARI de contexte de l'invocation, lu dans le runtime Forge
 * (`__getRuntime().contextAri`, exposé par `@forge/api` 8.5.0).
 *
 * Règle : le balayage n'appartient qu'à l'installation **Confluence** — seule
 * celle-là a des espaces à lire. L'installation Jira reste installée : c'est
 * elle qui porte `write:jira-work` pour le ticket de réparation (§9, PW-13).
 *
 * Repli délibéré (fail-open) : un contexte illisible ou d'un produit inconnu
 * **balaye quand même**. Perdre le balayage parce qu'Atlassian a changé la
 * forme d'un ARI serait pire que le doublon dénoncé ici ; le produit et l'ARI
 * sont journalisés à chaque passe, donc un changement de forme se voit.
 */

import { __getRuntime } from '@forge/api';

/** Le produit d'un ARI de contexte : `ari:cloud:<produit>::site/<cloudId>`. */
export function produitDepuisAri(ari: string | undefined | null): string {
  const segment = /^ari:cloud:([a-z0-9-]+)::/.exec(ari ?? '');
  return segment?.[1] ?? 'inconnu';
}

/** Profil d'une installation, tel que le runtime le révèle. */
export interface ProfilInstallation {
  /** Produit du contexte : « confluence », « jira », ou « inconnu ». */
  produit: string;
  /** L'ARI brut, pour le journal (aucune donnée sensible : c'est un identifiant). */
  ari: string;
}

/** Lit le contexte de l'invocation courante ; jamais d'exception (voir fail-open). */
export function installationProfil(): ProfilInstallation {
  try {
    const runtime = __getRuntime() as { contextAri?: string };
    const ari = typeof runtime.contextAri === 'string' ? runtime.contextAri : '';
    return { produit: produitDepuisAri(ari), ari };
  } catch {
    return { produit: 'inconnu', ari: '' };
  }
}

/** L'installation doit-elle conduire le balayage ? */
export function doitBalayer(profil: ProfilInstallation): boolean {
  return profil.produit === 'confluence' || profil.produit === 'inconnu';
}

/**
 * Journalise la décision puis la rend (une ligne par passe, mesurable) :
 * l'installation non propriétaire dit **pourquoi** elle ne fait rien.
 */
export function journalBalayage(profil: ProfilInstallation, entree: string): boolean {
  const autorise = doitBalayer(profil);
  if (autorise) {
    console.info(`[placard] ${entree} : balayage conduit par l'installation ${profil.produit}.`);
    return true;
  }
  console.info(
    `[placard] ${entree} : ignoré — installation ${profil.produit} (${profil.ari}) ; `
    + "le balayage appartient à l'installation Confluence du même site "
    + '(deux installations sinon écrivent le registre en double).',
  );
  return false;
}
