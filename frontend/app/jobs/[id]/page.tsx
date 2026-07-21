import { redirect } from "next/navigation";

/** Phase 1 route, kept so old links/bookmarks don't 404. */
export default async function JobRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/activity/${id}`);
}
