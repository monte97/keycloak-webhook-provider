// Helpers that drive Keycloak admin REST API to generate events. The webhook
// dispatch path is asynchronous, so callers should poll for delivery via the
// consumer fixture rather than waitForTimeout.

export async function createUser(
  keycloakUrl: string,
  adminToken: string,
  usernamePrefix = 'e2e-user',
): Promise<string> {
  const username = `${usernamePrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const res = await fetch(`${keycloakUrl}/admin/realms/demo/users`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${adminToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      username,
      enabled: true,
      credentials: [{ type: 'password', value: 'temp123', temporary: false }],
    }),
  });
  if (!res.ok) throw new Error(`createUser failed: HTTP ${res.status}`);
  const location = res.headers.get('location');
  if (!location) throw new Error('createUser: missing Location header');
  const userId = location.split('/').pop();
  if (!userId) throw new Error('createUser: malformed Location header');
  return userId;
}

export async function deleteUser(
  keycloakUrl: string,
  adminToken: string,
  userId: string,
): Promise<void> {
  const res = await fetch(`${keycloakUrl}/admin/realms/demo/users/${userId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  if (!res.ok) throw new Error(`deleteUser failed: HTTP ${res.status}`);
}

/**
 * Create then immediately delete a user. Triggers two admin events
 * (USER_CREATED, USER_DELETED) which the webhook provider will dispatch.
 */
export async function triggerUserCycle(
  keycloakUrl: string,
  adminToken: string,
  usernamePrefix?: string,
): Promise<void> {
  const id = await createUser(keycloakUrl, adminToken, usernamePrefix);
  await deleteUser(keycloakUrl, adminToken, id);
}

/** Trigger N user cycles serially. */
export async function triggerUserCycles(
  keycloakUrl: string,
  adminToken: string,
  n: number,
): Promise<void> {
  for (let i = 0; i < n; i++) {
    await triggerUserCycle(keycloakUrl, adminToken);
  }
}
