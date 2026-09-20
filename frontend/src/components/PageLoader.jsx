import { APP_NAME, AppLogo } from "./AppLogo";

export default function PageLoader() {
  return (
    <div className="goppo-loader" role="status" aria-label={`Loading ${APP_NAME}`}>
      <AppLogo size={260} className="loader-logo" />
      <div className="loader-track" aria-hidden="true"><span /></div>
    </div>
  );
}
