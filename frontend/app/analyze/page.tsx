import { redirect } from "next/navigation";

/** Phase 1 route, kept so old links/bookmarks don't 404. */
export default function AnalyzeRedirectPage() {
  redirect("/download/preview");
}
