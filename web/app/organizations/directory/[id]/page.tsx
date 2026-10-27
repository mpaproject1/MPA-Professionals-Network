import { redirect } from "next/navigation";

/** Public organization profiles are not part of the public discovery experience. */
export default function PublicOrganizationProfileRedirect(): never {
  redirect("/services");
}
