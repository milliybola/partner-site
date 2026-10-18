import React from 'react';
import { Navigate } from 'react-router-dom';
import LoginForm from '../components/LoginForm';
import { getToken } from '../../../core/lib/session';

const LoginPage: React.FC = () => {
  // Already signed in -> straight to the app.
  if (getToken()) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen bg-canvas flex flex-col">
      <div className="h-1.5 bg-gradient-to-r from-brand via-brand-bright to-gold" aria-hidden />
      <main className="flex-1 flex items-center justify-center px-4 py-10 pt-[calc(40px+var(--safe-top))] pb-[calc(40px+var(--safe-bottom))]">
        <LoginForm />
      </main>
    </div>
  );
};

export default LoginPage;
