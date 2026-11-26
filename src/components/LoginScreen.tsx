import { useState, type FormEvent } from "react";
import { AlertTriangle } from "lucide-react";
import { loginWithPassword, ApiError } from "../api/client";
import type { AuthStatus } from "../types";

interface LoginScreenProps {
  authStatus: AuthStatus;
  onSuccess: () => void;
}

export function LoginScreen({ authStatus, onSuccess }: LoginScreenProps) {
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!password.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await loginWithPassword(password);
      onSuccess();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("登录请求失败，请检查网络连接后重试。");
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (authStatus.misconfigured) {
    return (
      <div className="center-screen">
        <div className="login-card">
          <div className="login-badge">
            <AlertTriangle size={22} />
          </div>
          <h1>尚未完成安全配置</h1>
          <p className="login-subtitle">
            为避免私有笔记被意外公开，服务端检测到尚未设置 <code>ACCESS_PASSWORD</code> 密钥。
          </p>
          <div className="error-banner">
            请在项目目录执行 <code>npx wrangler secret put ACCESS_PASSWORD</code>（本地开发请在{" "}
            <code>.dev.vars</code> 中设置）后刷新本页。
          </div>
        </div>
      </div>
    );
  }

  if (authStatus.authMode === "cloudflare-access") {
    return (
      <div className="center-screen">
        <div className="login-card">
          <img
            src="/icon-192.png"
            alt={authStatus.siteTitle}
            className="login-logo"
            width={56}
            height={56}
          />
          <h1>{authStatus.siteTitle}</h1>
          <p className="login-subtitle">
            当前知识库已启用 Cloudflare Access 零信任认证，未检测到有效的访问凭证。请确认已通过绑定
            Access 策略的域名访问。
          </p>
          <button
            type="button"
            className="primary-btn"
            style={{ width: "100%" }}
            onClick={() => window.location.reload()}
          >
            重新验证
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="center-screen">
      <div className="login-card">
        <img
          src="/icon-192.png"
          alt={authStatus.siteTitle}
          className="login-logo"
          width={56}
          height={56}
        />
        <h1>{authStatus.siteTitle}</h1>
        <p className="login-subtitle">输入私密访问口令以查阅你的 Cloudflare R2 Obsidian 笔记库。</p>

        <form className="login-form" onSubmit={handleSubmit}>
          <label className="input-label">
            访问口令
            <input
              type="password"
              className="text-input"
              placeholder="请输入访问口令"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              autoComplete="current-password"
            />
          </label>

          {error && <div className="error-banner">{error}</div>}

          <button type="submit" className="primary-btn" disabled={submitting || !password.trim()}>
            {submitting ? "正在验证..." : "进入知识库"}
          </button>
        </form>
      </div>
    </div>
  );
}
