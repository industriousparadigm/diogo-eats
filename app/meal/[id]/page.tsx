import { notFound } from "next/navigation";
import { getMeal } from "@/lib/db";
import { EditPage } from "./edit-page";

// Server-fetched meal detail/edit page. Lives at /meal/{id}. The home
// route navigates here when a card is tapped — replaces the old modal
// edit sheet that leaked the underlying page on iOS.
export default async function MealRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const meal = await getMeal(id);
  if (!meal) notFound();
  return <EditPage meal={meal} />;
}
