import React, { useState } from 'react';
import { supabase } from '../services/supabase';

export const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] =
    useState('');
  const [isLoading, setIsLoading] =
    useState(false);
  const [error, setError] =
    useState<string | null>(null);

  const handleLogin = async (
    event: React.FormEvent
  ) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);

    const { error: loginError } =
      await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

    if (loginError) {
      setError(
        'Email atau password tidak sesuai.'
      );
    }

    setIsLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-gray-800 border border-gray-700 rounded-2xl p-8 shadow-xl">
        <div className="text-center mb-7">
          <div className="text-4xl mb-2">
            🕒
          </div>

          <h1 className="text-3xl font-extrabold text-white">
            LazGo
          </h1>

          <p className="mt-2 text-sm text-sky-300">
            Masuk menggunakan akun staf
          </p>
        </div>

        <form
          onSubmit={handleLogin}
          className="space-y-5"
        >
          <div>
            <label className="block text-sm font-semibold text-gray-200 mb-2">
              Email
            </label>

            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) =>
                setEmail(event.target.value)
              }
              placeholder="email sekolah"
              className="w-full p-3 rounded-lg bg-gray-700 border border-gray-600 text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-200 mb-2">
              Password
            </label>

            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(event) =>
                setPassword(event.target.value)
              }
              placeholder="Masukkan password"
              className="w-full p-3 rounded-lg bg-gray-700 border border-gray-600 text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-red-900/50 text-red-200 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full p-3 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-bold disabled:opacity-50"
          >
            {isLoading
              ? 'Sedang masuk...'
              : 'Masuk ke LazGo'}
          </button>
        </form>
      </div>
    </div>
  );
};
