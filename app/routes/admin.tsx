import { Link, Outlet } from "react-router";

import type { Route } from "./+types/admin";
import { requireAdmin } from "~/lib/access.server";

export async function loader({ request }: Route.LoaderArgs) {
  const { email } = await requireAdmin(request);
  return { email };
}

export default function AdminLayout({ loaderData }: Route.ComponentProps) {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <header className="mb-10 flex items-baseline justify-between border-b border-[var(--border)] pb-4">
        <Link to="/admin" className="text-lg font-semibold">
          Admin
        </Link>
        <span className="text-sm text-[var(--muted)]">{loaderData.email}</span>
      </header>
      <Outlet />
    </div>
  );
}
