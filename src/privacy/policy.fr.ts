import { menuPath, type PolicyFacts, type PrivacyPolicy } from './types'

// French typography: a non-breaking space (\u00a0) before : ? ! and inside « », as in fr.ts.

export function frPolicy({ m, operator, passphraseMin, expenseDays, billDays, keepDays, sync, push }: PolicyFacts): PrivacyPolicy {
  const settings = m.settings.title
  const reminders = m.settings.reminders
  const { name, email } = operator
  const features = [sync && 'la synchro', push && 'les rappels quand l’application est fermée'].filter(Boolean).join(' ou ')

  return {
    intro:
      features
        ? 'Till garde votre argent sur votre appareil. Cette page explique ce qui en sort, quand, qui peut le voir, et comment le supprimer. En bref\u00a0: rien ne sort si vous n’activez pas ' + features + (sync ? ', et les données synchronisées sont chiffrées de bout en bout\u00a0: personne d’autre ne peut les lire, pas même les personnes qui gèrent Till.' : '.')
        : 'Till garde votre argent sur votre appareil. Cette page explique ce qui y reste et comment le supprimer. En bref\u00a0: rien ne quitte votre appareil.',
    sections: [
      ...(email || name
        ? [
            {
              title: 'Qui gère Till',
              blocks: [
                [name && `Till est géré par ${name}, responsable des données décrites ici.`, email && `Pour toute question ou demande sur vos données, écrivez à ${email}.`].filter(Boolean).join(' '),
              ],
            },
          ]
        : []),
      {
        title: 'Sur votre appareil',
        blocks: [
          'Tout ce que vous saisissez (portefeuilles, transactions, factures, budgets, objectifs, dettes, notes et réglages) est enregistré dans ce navigateur, sur cet appareil. ' + (features ? `Rien n’est envoyé si vous n’activez pas ${features}.` : 'Rien n’est envoyé.'),
          'Le code PIN du verrouillage reste sur cet appareil, enregistré sous forme d’empreinte salée, jamais les chiffres. Le déverrouillage par empreinte digitale ou par le visage passe par le système de votre appareil\u00a0: Till ne les reçoit jamais.',
          'Les sauvegardes, les exports en tableur et les imports sont faits sur votre appareil. Les fichiers vont là où vous les enregistrez ou les envoyez.',
          'Effacer les données de ce site dans votre navigateur supprime tout ce qui est ici\u00a0: faites une sauvegarde de temps en temps' + (sync ? ', ou activez la synchro.' : '.'),
        ],
      },
      {
        title: 'Aucun pistage',
        blocks: ['Till n’a ni publicité, ni statistiques d’audience, ni traceurs, ni cookies tiers. Vos données ne sont ni vendues, ni louées, ni partagées, et ne servent qu’au fonctionnement de l’application.'],
      },
      ...(sync
        ? [
            {
              title: `${m.sync.title} (facultatif)`,
              blocks: [
                'Se connecter avec Google crée un compte à votre nom dans le projet Firebase de Till (un service Google). Il contient votre adresse e-mail, le nom et le lien de photo de profil que Google partage, et les dates de création et de dernière connexion. Google gère lui-même la connexion, selon sa propre politique de confidentialité.',
                `Avant que quoi que ce soit parte en ligne, votre appareil le chiffre avec une clé verrouillée par votre phrase secrète (au moins ${passphraseMin}\u00a0caractères) et par une clé de récupération que vous gardez. Votre phrase secrète et votre clé de récupération ne quittent jamais votre appareil. Personne d’autre ne peut lire vos données synchronisées\u00a0: ni Google, ni les personnes qui gèrent Till.`,
                'En ligne, on ne peut voir que\u00a0:',
                [
                  'votre adresse e-mail et les informations de connexion ci-dessus',
                  'des identifiants d’apparence aléatoire pour vos enregistrements',
                  'la date du dernier enregistrement de chacun',
                  'à peu près combien d’enregistrements vous avez, et leur taille',
                ],
                'Si vous oubliez votre phrase secrète et perdez votre clé de récupération, personne ne peut ouvrir votre copie en ligne, pas même les personnes qui gèrent Till. Vos appareils gardent leurs propres copies.',
                'Les données synchronisées sont stockées dans les centres de données de Google (Cloud Firestore et Firebase Authentication), qui peuvent se trouver hors de votre pays.',
              ],
            },
          ]
        : []),
      ...(push
        ? [
            {
              title: 'Rappels quand l’application est fermée (facultatif)',
              blocks: [
                `Si vous activez ${menuPath(settings, reminders.title, reminders.push)}, cet appareil s’inscrit auprès du serveur de rappels de Till (un Cloudflare Worker) sous un identifiant d’appareil aléatoire, et lui envoie\u00a0:`,
                [
                  'l’adresse de notification que votre navigateur lui donne',
                  'votre fuseau horaire et votre langue',
                  'le jour et l’heure de votre rappel hebdomadaire, et la semaine où vous en avez écarté un',
                  'si la configuration est terminée, et le jour où vous avez commencé',
                  `les dates (pas les montants) des dépenses saisies à la main ces ${expenseDays}\u00a0derniers jours`,
                  `les échéances des factures impayées des ${billDays}\u00a0prochains jours`,
                ],
                'Le nom et le montant des factures sont scellés sur votre appareil avec une clé qui ne le quitte jamais. Le serveur les garde et les transmet sans pouvoir les lire, et votre appareil les ouvre à l’arrivée du rappel.',
                'La notification est acheminée par le service de notifications de votre navigateur (Google, Mozilla ou Apple), chiffrée pour qu’il ne puisse pas la lire.',
                `Désactiver l’option supprime ces informations du serveur. Un appareil qui ne s’est pas manifesté depuis ${keepDays}\u00a0jours est supprimé automatiquement.`,
              ],
            },
          ]
        : []),
      {
        title: 'Serveurs et journaux',
        blocks: [
          'Comme pour tout site web, les services qui diffusent Till (Firebase Hosting, Google Cloud et Cloudflare) voient votre adresse IP et les informations de votre navigateur, pour livrer l’application et la protéger des abus.' + (push ? ' Le serveur de rappels garde de courts journaux techniques, par exemple un envoi raté, avec l’identifiant d’appareil aléatoire.' : '') + ' Till ne s’en sert pas pour vous identifier ni vous suivre.',
        ],
      },
      {
        title: 'Vos choix',
        blocks: [
          [
            `Obtenir une copie\u00a0: ${menuPath(settings, m.data.title, m.data.exportBackup)}, ou ${m.data.exportCsv}.`,
            `Corriger quoi que ce soit\u00a0: modifiez-le dans l’application${sync ? ', la synchro transmet le changement' : ''}.`,
            ...(sync ? [`Arrêter la synchro\u00a0: ${menuPath(settings, m.settings.syncTitle, m.sync.signOut)}. Vos données restent sur votre appareil et en ligne.`] : []),
            ...(sync ? [`Supprimer votre copie en ligne\u00a0: ${menuPath(settings, m.settings.syncTitle, m.sync.deleteOnline)}. Vos données chiffrées, votre clé verrouillée et votre compte de connexion sont retirés du projet Firebase de Till.`] : []),
            `Tout supprimer, sur cet appareil${sync ? ' et en ligne' : ''}\u00a0: ${menuPath(settings, m.data.title, m.data.reset)}.`,
            ...(push ? [`Arrêter les rappels quand l’application est fermée\u00a0: désactivez «\u00a0${reminders.push}\u00a0».`] : []),
            ...(email
              ? [`Savoir ce qui est conservé sur vous, ou en demander la suppression\u00a0: écrivez à ${email}.${sync ? ' Les données synchronisées étant chiffrées, les personnes qui gèrent Till ne peuvent ni les lire ni vous les rendre, mais elles peuvent les supprimer.' : ''}`]
              : []),
          ],
        ],
      },
      {
        title: 'Modifications',
        blocks: ['Si cette politique change, la nouvelle version est publiée ici avec une nouvelle date en haut.'],
      },
    ],
  }
}
