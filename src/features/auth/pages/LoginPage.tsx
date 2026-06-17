import React, { useState, useEffect } from 'react';
import LoginForm from '../components/LoginForm';
import { Sun, Moon } from 'lucide-react';

const LoginPage: React.FC = () => {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => (localStorage.getItem('milliygo_theme') as 'light' | 'dark') || 'dark');

  useEffect(() => {
    if (theme === 'light') {
      document.body.classList.add('light-theme');
      document.body.classList.remove('dark-theme');
      localStorage.setItem('milliygo_theme', 'light');
    } else {
      document.body.classList.add('dark-theme');
      document.body.classList.remove('light-theme');
      localStorage.setItem('milliygo_theme', 'dark');
    }
  }, [theme]);

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-darkBg overflow-hidden font-Outfit px-4">
      {/* Theme Toggle Button */}
      <div className="absolute top-6 right-6 z-20">
        <button
          onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
          className="p-3 rounded-xl bg-darkCard border border-white/10 text-slate-400 hover:text-white hover:bg-white/5 transition-all duration-300 cursor-pointer shadow-lg flex items-center justify-center"
          aria-label="Toggle Theme"
        >
          {theme === 'light' ? (
            <Moon className="w-5 h-5 text-indigo-400 animate-pulse" />
          ) : (
            <Sun className="w-5 h-5 text-amber-500 animate-spin-slow" />
          )}
        </button>
      </div>

      {/* Premium glowing blobs */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-brand/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-brand/10 blur-[120px] pointer-events-none" />

      {/* Grid background pattern */}
      <div className="absolute inset-0 login-grid-bg bg-[size:40px_40px] pointer-events-none" />

      <div className="relative z-10 w-full flex justify-center items-center">
        <LoginForm />
      </div>
    </div>
  );
};

export default LoginPage;

