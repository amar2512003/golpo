import { AppLogo } from "../AppLogo";

export function AuthHeroPanel() {
  return (
    <section className="auth-hero">
      <div className="auth-hero-content">
        <AppLogo size={300} className="auth-hero-logo" />
        <h2>More than <span>just chats</span></h2>
        <p>Real Conversations. Real People.</p>
      </div>
      <div className="auth-hero-footer" aria-hidden="true">
        <span>Chat. Share.<br />Connect. Belong. <i>♡</i></span>
        <span>Same adda.<br />New stories.</span>
      </div>
    </section>
  );
}
