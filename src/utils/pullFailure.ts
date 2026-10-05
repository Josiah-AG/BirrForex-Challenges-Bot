/** Credential failures require a password update, never a generic batch retry. */
export function isNonCredentialPullFailure(status: string | null | undefined): boolean {
  return !!status && !['success', 'ready', 'never_pulled', 'pending_verify',
    'password_changed', 'invalid_credentials'].includes(status);
}
