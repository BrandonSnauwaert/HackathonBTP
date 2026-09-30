import { z } from "zod";
import { buildSet, execute, queryOne, type Database } from "../db/database.js";
import type { PatchOf } from "../types.js";

export interface Company {
  name: string;
  legalForm: string;
  address: string;
  phone: string;
  email: string;
  siret: string;
  vatNumber: string;
  vatExempt: boolean;
  insurerName: string;
  insurancePolicyNumber: string;
  insuranceCoverage: string;
  defaultValidityDays: number;
  defaultPaymentTerms: string;
  /** Taux horaire HT, en centimes : prix proposé d'office pour les lignes en heures. */
  hourlyRateCents: number | null;
  /** Logo (fichier dans PHOTOS_DIR) ; absent : logo par défaut, aux initiales de l'entreprise. */
  logoFile: string | null;
  logoMime: string | null;
  updatedAt: string;
}

const CompanyRow = z
  .object({
    name: z.string(),
    legal_form: z.string(),
    address: z.string(),
    phone: z.string(),
    email: z.string(),
    siret: z.string(),
    vat_number: z.string(),
    vat_exempt: z.number(),
    insurer_name: z.string(),
    insurance_policy_number: z.string(),
    insurance_coverage: z.string(),
    default_validity_days: z.number(),
    default_payment_terms: z.string(),
    hourly_rate_cents: z.number().nullable(),
    logo_file: z.string().nullable(),
    logo_mime: z.string().nullable(),
    updated_at: z.string(),
  })
  .transform((r): Company => ({
    name: r.name,
    legalForm: r.legal_form,
    address: r.address,
    phone: r.phone,
    email: r.email,
    siret: r.siret,
    vatNumber: r.vat_number,
    vatExempt: r.vat_exempt === 1,
    insurerName: r.insurer_name,
    insurancePolicyNumber: r.insurance_policy_number,
    insuranceCoverage: r.insurance_coverage,
    defaultValidityDays: r.default_validity_days,
    defaultPaymentTerms: r.default_payment_terms,
    hourlyRateCents: r.hourly_rate_cents,
    logoFile: r.logo_file,
    logoMime: r.logo_mime,
    updatedAt: r.updated_at,
  }));

export function getCompany(db: Database, userId: string): Company {
  const company = queryOne(db, CompanyRow, "SELECT * FROM companies WHERE user_id = :userId", { userId });
  if (!company) throw new Error(`profil entreprise manquant pour l'utilisateur ${userId}`);
  return company;
}

export type CompanyUpdate = PatchOf<Omit<Company, "updatedAt">>;

export function updateCompany(db: Database, userId: string, update: CompanyUpdate): Company {
  const set = buildSet({
    name: update.name,
    legal_form: update.legalForm,
    address: update.address,
    phone: update.phone,
    email: update.email,
    siret: update.siret,
    vat_number: update.vatNumber,
    vat_exempt: update.vatExempt === undefined ? undefined : Number(update.vatExempt),
    insurer_name: update.insurerName,
    insurance_policy_number: update.insurancePolicyNumber,
    insurance_coverage: update.insuranceCoverage,
    default_validity_days: update.defaultValidityDays,
    default_payment_terms: update.defaultPaymentTerms,
    hourly_rate_cents: update.hourlyRateCents,
    logo_file: update.logoFile,
    logo_mime: update.logoMime,
    updated_at: new Date().toISOString(),
  });
  execute(db, `UPDATE companies SET ${set.sql} WHERE user_id = :userId`, { ...set.params, userId });
  return getCompany(db, userId);
}

/** Informations manquantes pour éditer un devis conforme (mentions obligatoires). */
export function companyIssues(company: Company): string[] {
  const issues: string[] = [];
  if (!company.name) issues.push("Profil entreprise : nom ou raison sociale manquant");
  if (!company.address) issues.push("Profil entreprise : adresse manquante");
  if (!company.siret) issues.push("Profil entreprise : SIRET manquant");
  if (!company.vatExempt && !company.vatNumber)
    issues.push("Profil entreprise : numéro de TVA intracommunautaire manquant");
  if (!company.insurerName) issues.push("Profil entreprise : assurance décennale manquante");
  return issues;
}
