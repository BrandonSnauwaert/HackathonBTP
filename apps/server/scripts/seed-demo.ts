/**
 * (Ré)initialise le compte de démo avec une entreprise fictive, des clients et des devis
 * dans différents statuts. Relancer avant chaque démo pour repartir d'un état propre.
 *
 *   npm run seed:demo
 *
 * Toutes les données sont fictives (SIRET, assureur, clients...).
 */
import "dotenv/config";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { hashPassword } from "../src/auth/password.js";
import { config } from "../src/config.js";
import { execute, openDatabase, queryAll } from "../src/db/database.js";
import { createUser, findUserByEmail } from "../src/repositories/users.js";
import { updateCompany } from "../src/repositories/companies.js";
import { createClient } from "../src/repositories/clients.js";
import { updateQuote, insertEvent } from "../src/repositories/quotes.js";
import { createQuoteService } from "../src/services/quote-service.js";
import type { QuoteStatus } from "../src/domain/quote-status.js";
import type { LineInput } from "../src/repositories/quotes.js";

export const DEMO_EMAIL = "demo@artisan.test";
export const DEMO_PASSWORD = "demo1234";

const db = openDatabase(config.DATABASE_PATH);
const quotes = createQuoteService(db, { followUpAfterDays: config.FOLLOW_UP_AFTER_DAYS, clipsDir: config.CLIPS_DIR });

const existing = findUserByEmail(db, DEMO_EMAIL);
if (existing) {
  // Les fichiers audio des dictées ne sont pas supprimés par la cascade SQL.
  const audioFiles = queryAll(
    db,
    z.object({ audio_file: z.string() }),
    "SELECT c.audio_file FROM clips c JOIN quotes q ON q.id = c.quote_id WHERE q.user_id = :id",
    { id: existing.id },
  );
  await Promise.all(audioFiles.map((f) => rm(join(config.CLIPS_DIR, f.audio_file), { force: true })));
  execute(db, "DELETE FROM users WHERE id = :id", { id: existing.id });
}

const user = createUser(db, DEMO_EMAIL, await hashPassword(DEMO_PASSWORD));
updateCompany(db, user.id, {
  name: "Martin Rénovation",
  legalForm: "SARL au capital de 10 000 €",
  address: "14 rue des Artisans\n69007 Lyon",
  phone: "04 78 00 00 00",
  email: "contact@martin-renovation.test",
  siret: "123 456 789 00012",
  vatNumber: "FR12 123456789",
  vatExempt: false,
  insurerName: "Mutuelle Fictive du Bâtiment",
  insurancePolicyNumber: "DEC-2026-004213",
  insuranceCoverage: "France métropolitaine",
  defaultValidityDays: 30,
  defaultPaymentTerms: "Acompte de 30 % à la signature, solde à la réception des travaux.",
});

const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(Date.now() - days * DAY_MS);

interface DemoQuote {
  client: { name: string; email: string; phone: string; address: string };
  title: string;
  siteAddress: string;
  lines: LineInput[];
  /** Historique à rejouer : [statut, il y a N jours, acteur] */
  history: [QuoteStatus, number, "artisan" | "client"][];
}

const demoQuotes: DemoQuote[] = [
  {
    client: { name: "Mme Sophie Durand", email: "sophie.durand@example.com", phone: "06 12 34 56 78", address: "8 place Bellecour\n69002 Lyon" },
    title: "Rénovation salle de bain",
    siteAddress: "8 place Bellecour, 69002 Lyon",
    lines: [
      { description: "Dépose de la baignoire et évacuation", room: "Salle de bain", quantity: 1, unit: "forfait", unitPriceCents: 35000, vatRateBp: 1000 },
      { description: "Fourniture et pose d'un receveur de douche extra-plat", room: "Salle de bain", quantity: 1, unit: "u", unitPriceCents: 89000, vatRateBp: 1000 },
      { description: "Faïence murale, fourniture et pose", room: "Salle de bain", quantity: 14, unit: "m2", unitPriceCents: 8500, vatRateBp: 1000 },
    ],
    history: [["ready", 12, "artisan"], ["sent", 12, "artisan"], ["viewed", 11, "client"], ["accepted", 9, "client"]],
  },
  {
    client: { name: "M. Karim Benali", email: "karim.benali@example.com", phone: "06 98 76 54 32", address: "22 cours Gambetta\n69003 Lyon" },
    title: "Peinture séjour et couloir",
    siteAddress: "22 cours Gambetta, 69003 Lyon",
    lines: [
      { description: "Préparation des supports (rebouchage, ponçage)", room: "Séjour", quantity: 42, unit: "m2", unitPriceCents: 800, vatRateBp: 1000 },
      { description: "Peinture acrylique mate, 2 couches", room: "Séjour", quantity: 42, unit: "m2", unitPriceCents: 1800, vatRateBp: 1000 },
      { description: "Peinture acrylique satinée, 2 couches", room: "Couloir", quantity: 18, unit: "m2", unitPriceCents: 1900, vatRateBp: 1000 },
    ],
    history: [["ready", 9, "artisan"], ["sent", 9, "artisan"], ["viewed", 8, "client"]],
  },
  {
    client: { name: "SCI Les Tilleuls", email: "gestion@sci-tilleuls.example.com", phone: "04 72 11 22 33", address: "5 avenue Jean Jaurès\n69007 Lyon" },
    title: "Isolation des combles",
    siteAddress: "17 chemin des Tilleuls, 69130 Écully",
    lines: [
      { description: "Isolation des combles perdus, laine soufflée R = 7", room: "Combles", quantity: 65, unit: "m2", unitPriceCents: 3200, vatRateBp: 550 },
      { description: "Pose de trappe d'accès isolée", room: "Combles", quantity: 1, unit: "u", unitPriceCents: 28000, vatRateBp: 550 },
    ],
    history: [["ready", 3, "artisan"], ["sent", 3, "artisan"]],
  },
  {
    client: { name: "M. et Mme Lefèvre", email: "lefevre.famille@example.com", phone: "06 55 44 33 22", address: "3 impasse des Lilas\n69300 Caluire" },
    title: "Cuisine : porte et sol",
    siteAddress: "3 impasse des Lilas, 69300 Caluire",
    lines: [
      { description: "Remplacement de la porte de cuisine", room: "Cuisine", quantity: 1, unit: "u", unitPriceCents: 45000, vatRateBp: 1000 },
      { description: "Ragréage du sol avant pose de carrelage", room: "Cuisine", quantity: 12, unit: "m2", unitPriceCents: null, vatRateBp: 1000, source: "dictation" },
    ],
    history: [],
  },
];

for (const demo of demoQuotes) {
  const client = createClient(db, user.id, demo.client);
  const quote = quotes.create(user.id, { clientId: client.id, title: demo.title, siteAddress: demo.siteAddress });
  for (const line of demo.lines) quotes.addLine(user.id, quote.id, line);

  // Rejoue l'historique directement en base, avec des dates dans le passé.
  let from: QuoteStatus = "draft";
  execute(db, "UPDATE quote_events SET created_at = :at WHERE quote_id = :id", {
    at: daysAgo(demo.history[0]?.[1] ?? 0).toISOString(),
    id: quote.id,
  });
  for (const [to, ago, actor] of demo.history) {
    const at = daysAgo(ago);
    updateQuote(db, quote.id, to === "sent" ? { status: to, sentAt: at.toISOString() } : { status: to });
    insertEvent(db, quote.id, { type: "status_changed", actor, fromStatus: from, toStatus: to, at });
    from = to;
  }
}

// Applique les statuts automatiques (ex. « à relancer ») comme le ferait une lecture.
for (const summary of quotes.list(user.id)) {
  console.log(`${summary.number}  ${summary.statusLabel.padEnd(15)} ${summary.client.name}`);
}
console.log(`\nCompte de démo prêt : ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
