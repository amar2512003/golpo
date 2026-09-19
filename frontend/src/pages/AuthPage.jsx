import { AuthActionPanel } from "../components/auth/AuthActionPanel";
import AuthHeader from "../components/auth/AuthHeader";
import { AuthHeroPanel } from "../components/auth/AuthHeroPanel";

function AuthPage() {
  return (
    <div className="auth-page box-border flex h-dvh flex-col overflow-y-auto p-3 sm:p-5 md:p-8">
      <div className="auth-shell mx-auto flex w-full max-w-368 flex-1 flex-col overflow-hidden rounded-3xl border border-border bg-background text-foreground">
        <AuthHeader />

        <main className="relative flex flex-1 flex-col overflow-hidden md:flex-row">
          <AuthHeroPanel />
          <AuthActionPanel />
        </main>
      </div>
    </div>
  );
}
export default AuthPage;
