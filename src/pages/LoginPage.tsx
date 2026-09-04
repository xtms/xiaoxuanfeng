import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../components/AuthContext';

export function LoginPage() {
  const { login, isLoggedIn } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // 已登录则直接跳转首页
  useEffect(() => {
    if (isLoggedIn) {
      navigate('/', { replace: true });
    }
  }, [isLoggedIn, navigate]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!username.trim() || !password.trim()) {
      setError('请输入用户名和密码');
      return;
    }

    setLoading(true);
    setTimeout(() => {
      const success = login(username.trim(), password);
      setLoading(false);
      if (success) {
        navigate('/', { replace: true });
      } else {
        setError('用户名或密码错误');
      }
    }, 600);
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--vp-c-bg)',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    }}>
      <div style={{
        width: 400,
        padding: '40px 36px',
        background: 'var(--vp-c-bg)',
        border: '1px solid var(--vp-c-divider)',
        borderRadius: '12px',
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 52, height: 52, borderRadius: '12px',
            background: 'rgba(52, 81, 178, 0.08)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.5rem', marginBottom: 16,
          }}>
            🔐
          </div>
          <h1 style={{
            margin: '0 0 6px', padding: 0, border: 'none',
            fontSize: '1.4rem', fontWeight: 700, color: 'var(--vp-c-text-1)',
          }}>
            LLM 推理框架学习指南
          </h1>
          <p style={{ fontSize: '0.88rem', color: 'var(--vp-c-text-3)', margin: 0 }}>
            请登录后查看内容
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 18 }}>
            <label style={{
              display: 'block', fontSize: '0.85rem', fontWeight: 500,
              color: 'var(--vp-c-text-2)', marginBottom: 6,
            }}>
              用户名
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="请输入用户名"
              autoFocus
              autoComplete="username"
              style={{
                width: '100%', padding: '10px 14px',
                fontSize: '0.9rem',
                color: 'var(--vp-c-text-1)',
                background: 'var(--vp-c-bg)',
                border: '1px solid var(--vp-c-divider)',
                borderRadius: '8px',
                outline: 'none',
                boxSizing: 'border-box',
                transition: 'border-color 0.2s',
              }}
              onFocus={(e) => e.target.style.borderColor = 'var(--vp-c-brand)'}
              onBlur={(e) => e.target.style.borderColor = 'var(--vp-c-divider)'}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{
              display: 'block', fontSize: '0.85rem', fontWeight: 500,
              color: 'var(--vp-c-text-2)', marginBottom: 6,
            }}>
              密码
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入密码"
              autoComplete="current-password"
              onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(e); }}
              style={{
                width: '100%', padding: '10px 14px',
                fontSize: '0.9rem',
                color: 'var(--vp-c-text-1)',
                background: 'var(--vp-c-bg)',
                border: '1px solid var(--vp-c-divider)',
                borderRadius: '8px',
                outline: 'none',
                boxSizing: 'border-box',
                transition: 'border-color 0.2s',
              }}
              onFocus={(e) => e.target.style.borderColor = 'var(--vp-c-brand)'}
              onBlur={(e) => e.target.style.borderColor = 'var(--vp-c-divider)'}
            />
          </div>

          {error && (
            <div style={{
              padding: '10px 14px', marginBottom: 18,
              background: '#fef2f2', border: '1px solid #fecaca',
              borderRadius: '8px',
              color: '#dc2626', fontSize: '0.85rem',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span>⚠️</span> {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', padding: '11px 0',
              fontSize: '0.95rem', fontWeight: 600,
              color: '#fff',
              background: loading ? '#8899cc' : 'var(--vp-c-brand)',
              border: 'none', borderRadius: '8px',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'background 0.2s',
            }}
            onMouseEnter={(e) => { if (!loading) e.currentTarget.style.background = 'var(--vp-c-brand-dark)'; }}
            onMouseLeave={(e) => { if (!loading) e.currentTarget.style.background = 'var(--vp-c-brand)'; }}
          >
            {loading ? '登录中...' : '登 录'}
          </button>
        </form>

        {/* Demo accounts */}
        <div style={{
          marginTop: 24, padding: '12px 14px',
          background: 'var(--vp-c-bg-alt)',
          borderRadius: '8px',
          fontSize: '0.8rem', color: 'var(--vp-c-text-3)',
          lineHeight: 1.7,
        }}>
          <p style={{ margin: 0, fontWeight: 600, color: 'var(--vp-c-text-2)', marginBottom: 4 }}>演示账号</p>
          <p style={{ margin: 0 }}>管理员：admin / admin123</p>
          <p style={{ margin: 0 }}>普通用户：user / 123456</p>
        </div>
      </div>
    </div>
  );
}