import React from 'react';
import LoginForm from '../components/LoginForm';

const LoginPage: React.FC = () => {
  return (
    <div className="relative min-h-screen flex items-center justify-center bg-darkBg overflow-hidden font-Outfit px-4">
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
