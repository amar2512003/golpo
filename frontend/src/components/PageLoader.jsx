import { ImageIcon, MessageCircleIcon, SmileIcon, UsersIcon } from "lucide-react";
import { APP_NAME, AppLogo } from "./AppLogo";

export default function PageLoader() {
  return (
    <div className="goppo-loader" role="status" aria-label={`Loading ${APP_NAME}`}>
      <div className="loader-orbit loader-orbit-top" aria-hidden="true" />
      <div className="loader-orbit loader-orbit-bottom" aria-hidden="true" />
      <div className="loader-content">
        <AppLogo size={320} className="loader-logo" />
        <h1>Getting things ready...</h1>
        <p>Real conversations are just a moment away <span>♥</span></p>
        <div className="loader-track" aria-hidden="true"><span /></div>
        <div className="loader-features" aria-hidden="true">
          <span><MessageCircleIcon />Chats</span>
          <span><UsersIcon />People</span>
          <span><ImageIcon />Photos</span>
          <span><SmileIcon />Reactions</span>
        </div>
      </div>
      <p className="loader-quote">“Good conversations<br />make a better tomorrow” <span>♡</span></p>
    </div>
  );
}
