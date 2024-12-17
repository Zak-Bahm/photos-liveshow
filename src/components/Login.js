import React from 'react';

const Login = () => {
  return (
    <div className="container mt-5">
      <div className="card p-4 text-center">
        <h2 className="mb-3">Welcome to Photos Liveshow</h2>
        <p>Click below to log in using Google OAuth.</p>
        <a
          className="btn btn-primary"
          href="/auth/google/login"
        >
          Log in with Google
        </a>
      </div>
    </div>
  );
};

export default Login;
