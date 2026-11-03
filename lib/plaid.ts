import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";

export const plaidEnv = (process.env.PLAID_ENV ?? "sandbox") as keyof typeof PlaidEnvironments;

export function plaidConfigured() {
  return Boolean(process.env.PLAID_CLIENT_ID && process.env.PLAID_SECRET);
}

export function plaid() {
  return new PlaidApi(
    new Configuration({
      basePath: PlaidEnvironments[plaidEnv],
      baseOptions: {
        headers: {
          "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID!,
          "PLAID-SECRET": process.env.PLAID_SECRET!,
        },
      },
    })
  );
}

export function webhookUrl() {
  return `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://myownhome.propmatrix.ai"}/api/plaid/webhook`;
}

// Plaid (axios) errors carry the API error in response.data; anything else falls back to the JS message.
export function plaidError(e: any): { code?: string; message: string } {
  return { code: e?.response?.data?.error_code, message: e?.response?.data?.error_message ?? e?.message ?? "Plaid request failed" };
}
