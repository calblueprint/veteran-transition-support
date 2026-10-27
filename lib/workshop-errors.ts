type DatabaseError = { code: string; message: string };

export function workshopErrorMessage(
  error: DatabaseError,
  fallback: string,
): string {
  switch (error.code) {
    case "23505":
      return "You’re already registered for this workshop.";
    case "23503":
      return "The workshop or participant profile is no longer available. Refresh the page and check your profile.";
    case "42501":
      return "You don’t have permission to do this. Please check that you’re logged in with the correct account.";
    case "22P02":
    case "P0002":
      return "Workshop not found or you don’t have access to it.";
    case "P1001":
      return "This workshop is full. Registration is closed.";
    case "P1002":
      return "Capacity cannot be lower than the number of active registrations.";
    case "P1003":
      return "This workshop has registration records and cannot be deleted, including cancelled registrations.";
    case "23514":
      return "Please check the workshop details. Capacity must be a non-negative whole number.";
    default:
      return fallback;
  }
}
