import { redirect } from "next/navigation";

/** Public organization discovery is intentionally disabled. Organization details
 * belong to authorized organization workspaces; public attribution is shown only
 * on eligible published services, jobs, and mentorship programs.
 */
export default function OrganizationDirectoryRedirect(): never {
  redirect("/services");
}
