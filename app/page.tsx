import { redirect } from "next/navigation";

/**
 * Root route redirects to the Order-taking page (/order).
 * Requirement 1.5.
 */
export default function Home() {
  redirect("/order");
}
