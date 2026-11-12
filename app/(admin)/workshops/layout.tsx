// AdminLayout already verifies admin membership. Admins do not need a veteran
// profile or optional military/education fields to manage workshops.
export default function WorkshopsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
