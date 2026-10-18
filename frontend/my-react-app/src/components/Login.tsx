import { useI18n } from "../i18n/LanguageContext";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { login, captureError, errorMessage } from "../services/api";
import { useSession } from "../context/SessionContext";
import AuthLayout from "./layout/AuthLayout";
import Icon from "./ui/Icon";
import { safeReturnPath } from "../security/validation";
import PasswordField from "./ui/PasswordField";

export default function Login() {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [failure, setError] = useState<unknown>(null);
  const error = failure ? errorMessage(failure) : "";
  const { signIn, startDemo } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const request = useRef<AbortController | null>(null);
  const submitting = useRef(false);
  useEffect(() => () => request.current?.abort(), []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    const controller = new AbortController();
    request.current = controller;
    setError("");
    setLoading(true);
    try {
      const user = await login(email, password, controller.signal);
      if (controller.signal.aborted) return;
      setPassword("");
      signIn(user);
      navigate(safeReturnPath(location.state), { replace: true });
    } catch (error) {
      if (!controller.signal.aborted) setError(captureError(error));
    } finally {
      submitting.current = false;
      if (!controller.signal.aborted) {
        setPassword("");
        setLoading(false);
      }
    }
  }
  return (
    <AuthLayout>
      <h2>{t("auth.welcome")}</h2>
      {location.state?.registered && (
        <p className="success-message" role="status">
          {t("auth.registered")}
        </p>
      )}
      <form className="auth-form" onSubmit={submit}>
        <label>
          {t("field.email")}
          <input
            type="email"
            autoComplete="username"
            required
            maxLength={254}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
          />
        </label>
        <PasswordField
          label={t("field.password")}
          autoComplete="current-password"
          required
          maxLength={128}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder={t("auth.passwordPlaceholder")}
        />
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="button primary" disabled={loading}>
          {loading ? (
            <>
              <span className="spinner" />
              {t("auth.signingIn")}
            </>
          ) : (
            <>
              {t("auth.login")}
              <Icon name="arrow" />
            </>
          )}
        </button>
      </form>
      <p className="auth-switch">
        {t("auth.noAccount")}
        <Link to="/register">{t("auth.register")}</Link>
      </p>
      <button
        className="button secondary demo-entry"
        onClick={() => {
          startDemo();
          navigate("/home/homepage");
        }}
      >
        {t("demo.start")}
        <Icon name="arrow" />
      </button>
    </AuthLayout>
  );
}
