import { useI18n } from "../i18n/LanguageContext";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { RegisterRequest } from "../types/billing";
import { register, captureError, errorMessage } from "../services/api";
import { ValidationError } from "../security/validation";
import AuthLayout from "./layout/AuthLayout";
import Icon from "./ui/Icon";
import PasswordField from "./ui/PasswordField";
export default function Register() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [form, setForm] = useState<RegisterRequest>({
    username: "",
    email: "",
    password: "",
    confirm: "",
    address: "",
  });
  const [loading, setLoading] = useState(false);
  const [failure, setError] = useState<unknown>(null);
  const error = failure ? errorMessage(failure) : "";
  const request = useRef<AbortController | null>(null);
  const submitting = useRef(false);
  useEffect(() => () => request.current?.abort(), []);
  function update(key: keyof RegisterRequest, value: string) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    setError("");
    if (!form.username.trim()) {
      setError(new ValidationError("validation.username"));
      return;
    }
    if (form.password !== form.confirm) {
      setError(new ValidationError("validation.passwordMatch"));
      return;
    }
    submitting.current = true;
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    try {
      await register(
        {
          ...form,
          username: form.username.trim(),
          email: form.email.trim(),
          address: form.address.trim(),
        },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      // 注册返回安全用户信息；回到登录页建立会话。
      navigate("/login", { replace: true, state: { registered: true } });
    } catch (error) {
      if (!controller.signal.aborted) setError(captureError(error));
    } finally {
      submitting.current = false;
      if (!controller.signal.aborted) {
        setForm((previous) => ({ ...previous, password: "", confirm: "" }));
        setLoading(false);
      }
    }
  }
  return (
    <AuthLayout>
      <h2>{t("auth.start")}</h2>
      <form className="auth-form" onSubmit={submit}>
        <label>
          {t("field.username")}
          <input
            autoComplete="nickname"
            required
            maxLength={100}
            value={form.username}
            onChange={(event) => update("username", event.target.value)}
            placeholder={t("auth.usernamePlaceholder")}
          />
        </label>
        <label>
          {t("field.email")}
          <input
            type="email"
            autoComplete="username"
            required
            maxLength={254}
            value={form.email}
            onChange={(event) => update("email", event.target.value)}
            placeholder="you@example.com"
          />
        </label>
        <label>
          {t("field.address")}{" "}
          <span className="optional">{t("common.optional")}</span>
          <input
            autoComplete="street-address"
            maxLength={250}
            value={form.address}
            onChange={(event) => update("address", event.target.value)}
            placeholder={t("auth.addressPlaceholder")}
          />
        </label>
        <div className="form-row">
          <PasswordField
            label={t("field.password")}
            autoComplete="new-password"
            minLength={8}
            maxLength={128}
            required
            value={form.password}
            onChange={(event) => update("password", event.target.value)}
            placeholder={t("auth.setPassword")}
          />
          <PasswordField
            label={t("field.confirmPassword")}
            autoComplete="new-password"
            minLength={8}
            maxLength={128}
            required
            value={form.confirm}
            onChange={(event) => update("confirm", event.target.value)}
            placeholder={t("auth.repeatPassword")}
          />
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="button primary" disabled={loading}>
          {loading ? (
            <>
              <span className="spinner" />
              {t("auth.creating")}
            </>
          ) : (
            <>
              {t("auth.register")}
              <Icon name="arrow" />
            </>
          )}
        </button>
      </form>
      <p className="auth-switch">
        {t("auth.hasAccount")}
        <Link to="/login">{t("auth.login")}</Link>
      </p>
    </AuthLayout>
  );
}
