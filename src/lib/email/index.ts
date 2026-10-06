import "server-only";
import { serverEnv } from "@/lib/env.server";
import { logger } from "@/lib/observability/logger";

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Non-sensitive context for logs. */
  tag: string;
  /** Dev-only: link to print when using the console provider. */
  devLink?: string;
}

export interface EmailProvider {
  send(message: EmailMessage): Promise<{ delivered: boolean }>;
}

class ConsoleEmailProvider implements EmailProvider {
  async send(message: EmailMessage) {
    const env = serverEnv();
    logger.info("email_not_sent_console_provider", {
      tag: message.tag,
      recipientDomain: message.to.split("@")[1],
    });
    if (env.NODE_ENV !== "production" && message.devLink) {
      // Development convenience only: lets developers follow invitation links locally.
      console.info(`[dev email] ${message.tag} → ${message.to}: ${message.devLink}`);
    }
    return { delivered: false };
  }
}

class ResendEmailProvider implements EmailProvider {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(message: EmailMessage) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: this.from,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      logger.error("email_send_failed", { tag: message.tag, status: response.status });
      return { delivered: false };
    }
    return { delivered: true };
  }
}

export function getEmailProvider(): EmailProvider {
  const env = serverEnv();
  if (env.EMAIL_PROVIDER === "resend") {
    if (!env.RESEND_API_KEY) throw new Error("RESEND_API_KEY is required when EMAIL_PROVIDER=resend");
    return new ResendEmailProvider(env.RESEND_API_KEY, env.EMAIL_FROM);
  }
  return new ConsoleEmailProvider();
}

export async function sendEmail(message: EmailMessage): Promise<{ delivered: boolean }> {
  try {
    return await getEmailProvider().send(message);
  } catch (error) {
    logger.error("email_provider_error", { tag: message.tag, error });
    return { delivered: false };
  }
}
