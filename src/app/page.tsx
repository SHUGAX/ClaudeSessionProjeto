import { redirect } from "next/navigation";
import { postLoginDestination } from "@/lib/auth/post-login";
import { getSessionUser } from "@/lib/auth/session";

export default async function RootPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  redirect(await postLoginDestination(null));
}
