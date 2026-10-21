'use client';

import { useState } from 'react';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);

  const beginGoogleLogin = () => {
    setLoading(true);
    window.location.href = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/auth/google`;
  };

  const handlePasswordSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNotice('Password sign-in is not configured. Continue with Google to access your workspace.');
  };

  return (
    <main className="ri-login-page">
      <section className="ri-login-card" aria-labelledby="login-heading">
        <h1 id="login-heading">Login</h1>

        <button
          type="button"
          className="ri-google-button"
          onClick={beginGoogleLogin}
          disabled={loading}
        >
          <svg aria-hidden="true" className="ri-google-mark" viewBox="0 0 48 48">
            <path fill="#FFC107" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11c-.5 2.5-2 4.6-4.2 6v5.1h6.8c4-3.7 6-9 6-14.8Z" />
            <path fill="#FF3D00" d="M24 44c5.5 0 10.1-1.8 13.5-4.8l-6.8-5.1c-1.8 1.2-4 1.9-6.7 1.9-5.2 0-9.6-3.5-11.2-8.2H5.8v5.2A20 20 0 0 0 24 44Z" />
            <path fill="#4CAF50" d="M12.8 27.8a12 12 0 0 1 0-7.6V15H5.8a20 20 0 0 0 0 18Z" />
            <path fill="#1976D2" d="M24 12c3 0 5.7 1 7.8 3.1l5.8-5.8A19.5 19.5 0 0 0 24 4 20 20 0 0 0 5.8 15l7 5.2C14.4 15.5 18.8 12 24 12Z" />
          </svg>
          <span>{loading ? 'Redirecting to Google…' : 'Login with Google'}</span>
        </button>

        <div className="ri-login-divider"><span>or sign up through email</span></div>

        <form onSubmit={handlePasswordSubmit} className="ri-login-form">
          <label className="sr-only" htmlFor="login-email">Email ID</label>
          <input
            id="login-email"
            autoComplete="email"
            type="email"
            placeholder="Email ID"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <label className="sr-only" htmlFor="login-password">Password</label>
          <input
            id="login-password"
            autoComplete="current-password"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          {notice && <p className="ri-login-notice" role="status">{notice}</p>}
          <button type="submit" className="ri-login-submit">
            Login
          </button>
        </form>
      </section>
    </main>
  );
}
