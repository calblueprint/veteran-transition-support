/** Resolve the jobs layout only after checking the current signed-in account. */
export async function jobAdminAccess(
  userId: string | undefined,
  checkMembership: () => PromiseLike<{ data: unknown; error: unknown }>,
) {
  if (!userId) return { redirect: "/login" } as const;
  const { data, error } = await checkMembership();
  if (error) return { failed: true } as const;
  if (data !== true) return { redirect: "/profile" } as const;
  return { admin: userId } as const;
}
