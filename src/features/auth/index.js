/** Auth feature — sign-up, sign-in, profile updates and email confirmation. */
export { default as authRoutes, PASSWORD_MIN, verifyEmailPage } from "./routes.js";
export { ensureAuthSchema, sendVerificationEmail } from "./verification.js";
export { generatePassword } from "./password.js";
