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
