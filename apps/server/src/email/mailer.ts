import nodemailer from "nodemailer";
import type { Config } from "../config.js";
import type { Logger } from "../transcription/kyutai-transcriber.js";

export interface EmailMessage {
  to: { address: string; name: string };
  /** Nom affiché de l'expéditeur (l'entreprise de l'artisan) ; l'adresse est EMAIL_FROM. */
  fromName: string;
  /** Les réponses du client partent vers l'artisan, pas vers l'adresse d'envoi. */
  replyTo?: string | undefined;
  subject: string;
  html: string;
  text: string;
}

export interface Mailer {
  send(message: EmailMessage): Promise<void>;
}

export class EmailError extends Error {}

/** Mode par défaut : l'e-mail est écrit dans les logs, rien n'est envoyé (dev, tests, équipe sans identifiants). */
export function createLogMailer(logger: Logger): Mailer {
  return {
    async send(message) {
      logger.info(
        { to: message.to.address, replyTo: message.replyTo, subject: message.subject, text: message.text },
        "e-mail NON envoyé (EMAIL_PROVIDER=log)",
      );
    },
  };
}

export interface SmtpOptions {
  host: string;
  port: number;
  login: string;
  password: string;
  /** Adresse d'expédition, sur un domaine authentifié chez le fournisseur SMTP. */
  fromAddress: string;
}

/** Envoi réel par SMTP (Brevo, Gmail, Outlook...). */
export function createSmtpMailer(options: SmtpOptions): Mailer & { verify(): Promise<void> } {
  const transport = nodemailer.createTransport({
    host: options.host,
    port: options.port,
    // 465 = TLS dès la connexion ; 587 = STARTTLS (chiffrement négocié ensuite).
    secure: options.port === 465,
    auth: { user: options.login, pass: options.password },
  });

  return {
    async send(message) {
      try {
        await transport.sendMail({
          from: { name: message.fromName, address: options.fromAddress },
          to: { name: message.to.name, address: message.to.address },
          ...(message.replyTo ? { replyTo: message.replyTo } : {}),
          subject: message.subject,
          html: message.html,
          text: message.text,
        });
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        throw new EmailError(`L'e-mail n'a pas pu être envoyé : ${detail}`);
      }
    },
    async verify() {
      await transport.verify();
    },
  };
}

/** Service d'envoi choisi par EMAIL_PROVIDER. En SMTP, vérifie la connexion au démarrage (sans rien envoyer). */
export function createMailer(config: Config, logger: Logger): Mailer {
  if (config.EMAIL_PROVIDER === "log") return createLogMailer(logger);

  const mailer = createSmtpMailer({
    host: config.SMTP_SERVER,
    port: config.SMTP_PORT,
    login: config.SMTP_LOGIN,
    password: config.SMTP_API_KEY,
    fromAddress: config.EMAIL_FROM,
  });
  mailer.verify().then(
    () => logger.info({ host: config.SMTP_SERVER, from: config.EMAIL_FROM }, "connexion SMTP OK"),
    (err: unknown) =>
      logger.error({ err, host: config.SMTP_SERVER }, "connexion SMTP impossible : les envois échoueront"),
  );
  return mailer;
}
