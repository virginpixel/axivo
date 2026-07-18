import { redirect } from "next/navigation";
import { getCurrentUser } from "@/shared/auth/session";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-secondary via-secondary to-primary/80 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-3xl font-bold text-white">Axivo</h1>
          <p className="mt-1 text-sm text-white/70">IT Operations Platform</p>
        </div>
        <LoginForm />
        <p className="mt-6 text-center text-xs text-white/60">
          Access is restricted to authorized IT portal users.
        </p>
      </div>
    </main>
  );
}
