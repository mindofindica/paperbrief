import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createSessionCookie, verifyMagicToken } from "../../../lib/auth";

type VerifyPageProps = {
  searchParams: { token?: string };
};

export default async function VerifyPage({ searchParams }: VerifyPageProps) {
  const token = searchParams?.token;
  if (!token) {
    return (
      <div className="min-h-screen bg-gray-950 text-gray-100 flex items-center justify-center px-6 py-12">
        <div className="max-w-md w-full text-center space-y-4">
          <h1 className="text-2xl font-semibold">Invalid link</h1>
          <p className="text-gray-400">Missing token. Please request a new magic link.</p>
        </div>
      </div>
    );
  }

  const result = await verifyMagicToken(token);
  if (!result.valid || !result.userId) {
    return (
      <div className="min-h-screen bg-gray-950 text-gray-100 flex items-center justify-center px-6 py-12">
        <div className="max-w-md w-full text-center space-y-4">
          <h1 className="text-2xl font-semibold">Link expired</h1>
          <p className="text-gray-400">This magic link is invalid or expired.</p>
        </div>
      </div>
    );
  }

  const sessionCookie = createSessionCookie(result.userId);
  const cookieStore = cookies();
  cookieStore.set("pb_session", sessionCookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 30 * 24 * 60 * 60,
    path: "/",
  });

  redirect("/dashboard");
}
