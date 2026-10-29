/**
 * Where accounts live and how people sign in (ADR 0015). The accounts module
 * only talks to this interface; `ct-identity.ts` implements it with
 * commercetools customers and its OAuth password flow. Another commerce
 * platform implements the same methods with its own customer accounts (ADR
 * 0013). Tests use an in-memory fake.
 */
export type Account = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  emailVerified: boolean;
  /** False for records made without a password (for example by an older import); they can't sign in. */
  hasPassword: boolean;
};

export type Tokens = {
  accessToken: string;
  /** Absent after a refresh: the platform keeps the original refresh token valid. */
  refreshToken?: string;
  /** Epoch milliseconds. */
  expiresAt: number;
};

export type NewAccount = { email: string; password: string; firstName: string; lastName: string; companyName?: string };

export type IdentityProvider = {
  /** Creates an unverified account, or reports that the email is taken. */
  register(account: NewAccount): Promise<{ account: Account } | { duplicate: true }>;
  findByEmail(email: string): Promise<Account | null>;
  getAccount(id: string): Promise<Account | null>;
  /** A one-time email verification token, valid for `ttlMinutes`; older tokens stop working. */
  createEmailToken(accountId: string, ttlMinutes: number): Promise<string>;
  /** Marks the email verified. Null when the token is unknown, used or expired. */
  confirmEmail(token: string): Promise<Account | null>;
  /** Null when the email or password is wrong. Works before verification; the caller checks. */
  signIn(email: string, password: string): Promise<{ accountId: string; tokens: Tokens } | null>;
  /** Null when the refresh token is no longer valid. */
  refresh(refreshToken: string): Promise<Tokens | null>;
  /** The account an access token belongs to, or null when it isn't active. */
  verifyAccessToken(accessToken: string): Promise<{ accountId: string } | null>;
  /** Revokes whichever tokens are given. */
  signOut(tokens: { accessToken?: string; refreshToken?: string }): Promise<void>;
};
