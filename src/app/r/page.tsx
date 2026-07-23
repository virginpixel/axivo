import { redirect } from "next/navigation";

/** The public request index moved to the site root; /r stays as an alias. */
export default function PublicFormsIndexAlias() {
  redirect("/");
}
