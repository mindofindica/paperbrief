/**
 * /admin — PaperBrief admin dashboard
 *
 * Client-side page auth-gated by ADMIN_SECRET.
 * Secret is stored in sessionStorage so it persists across page refreshes
 * within the same browser tab but clears when the tab is closed.
 */
import type { Metadata } from "next";
import AdminDashboard from "./AdminDashboard";

export const metadata: Metadata = {
  title: "Admin — PaperBrief",
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return <AdminDashboard />;
}
