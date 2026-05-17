import { notFound, redirect } from "next/navigation";
import { getMeal } from "@/lib/db";
import { getCurrentUser } from "@/lib/supabase/server";
import { EditPage } from "./edit-page";

// Server-fetched meal detail/edit page. Lives at /meal/{id}. Verifies
// that the requesting user owns the meal before rendering — anonymous
// users get redirected to /login, cross-user access gets 404
// (intentionally vague — don't confirm a meal exists for another user).
export default async function MealRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const meal = await getMeal(id);
  if (!meal) notFound();
  if ((meal as { user_id?: string }).user_id !== user.id) notFound();
  return <EditPage meal={meal} />;
}
