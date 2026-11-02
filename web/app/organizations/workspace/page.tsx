import { redirect } from "next/navigation";

type WorkspaceRedirectProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

export default function OrganizationWorkspaceCompatibilityRedirect({
  searchParams = {},
}: WorkspaceRedirectProps) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) value.forEach((item) => query.append(key, item));
    else if (typeof value === "string") query.set(key, value);
  }
  const suffix = query.toString();
  redirect(`/organizations${suffix ? `?${suffix}` : ""}`);
}
