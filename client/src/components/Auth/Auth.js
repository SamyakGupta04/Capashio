import React, { useState } from 'react';
import { GoogleLogin, GoogleOAuthProvider } from '@react-oauth/google';
import './style.css';

const Auth = () => {
  const handleSubmit = (event) => {
    event.preventDefault();
  };

  const [showPassword, setShowPassword] = useState(false);
  const [isSignup, setIsSignup] = useState(false);

  const handleShowPassword = () => {
    setShowPassword(!showPassword);
  };

  const handleChange = () => {
    // Handle change logic here
  };

  const switchMode = () => {
    setIsSignup((prevIsSignup) => !prevIsSignup);
    setShowPassword(false);
  };

  return (
    <div className="container">
      <div className="paper">
        <div className="avatar">
          <i className="lock-icon">🔒</i>
        </div>
        <h1>{isSignup ? 'Sign up' : 'Sign in'}</h1>
        <form className="form" onSubmit={handleSubmit}>
          <div className="grid-container">
            {isSignup && (
              <div className="nameinput">
                <div className="input-half">
                  <label>First Name</label>
                  <input name="firstName" autoFocus onChange={handleChange} />
                </div>
                <div className="input-half">
                  <label>Last Name</label>
                  <input name="lastName" onChange={handleChange} />
                </div>
              </div>
            )}
            <div className="input-full">
              <label>Email Address</label>
              <input name="email" type="email" onChange={handleChange} />
            </div>
            <div className="input-full">
              <label>Password</label>
              <input
                name="password"
                type={showPassword ? 'text' : 'password'}
                onChange={handleChange}
              />
              <button type="button" onClick={handleShowPassword}>
                {showPassword ? 'Hide' : 'Show'} Password
              </button>
            </div>
            {isSignup && (
              <div className="input-full">
                <label>Repeat Password</label>
                <input name="confirmPassword" type="password" onChange={handleChange} />
              </div>
            )}
          </div>
          <button type="submit" className="submit-button">
            {isSignup ? 'Sign Up' : 'Sign In'}
          </button>
          <GoogleOAuthProvider clientId="564033717568-e5p23rhvcs4i6kffgsbci1d64r8hp6fn.apps.googleusercontent.com">
            <GoogleLogin
              render={(renderProps) => (
                <button
                  className="googleButton"
                  onClick={renderProps.onClick}
                  disabled={renderProps.disabled}
                >
                  <span className="icon">
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 48 48"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        fill="#EA4335"
                        d="M24 9.5c3.69 0 6.63 1.52 8.71 3.94L38.6 8.57C34.98 5.25 30.04 3 24 3 14.95 3 7.5 9.05 4.72 17.07l7.74 5.98C13.7 20.32 18.45 16 24 16z"
                      />
                      <path
                        fill="#4285F4"
                        d="M46.5 24.5c0-1.45-.12-2.88-.35-4.28H24v8.08h12.75c-.58 2.96-2.32 5.52-4.89 7.23l7.43 5.73C43.42 37.36 46.5 31.45 46.5 24.5z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M13.73 27.03l-7.73-5.98C4.09 23.99 3.5 28.42 3.5 33c0 2.65.52 5.19 1.47 7.5l7.71-5.98C11.33 32.56 10.9 30.41 10.9 28c0-.34.1-.66.2-.97z"
                      />
                      <path
                        fill="#34A853"
                        d="M24 46c6.04 0 10.98-2.25 14.6-5.97l-7.43-5.73C29.1 36.67 26.65 38 24 38c-4.68 0-8.61-3.1-9.92-7.4l-7.72 5.98C7.58 42.91 15.24 46 24 46z"
                      />
                      <path fill="none" d="M0 0h48v48H0z" />
                    </svg>
                  </span>
                  Google Sign In
                </button>
              )}
            />
          </GoogleOAuthProvider>
          <button type="button" onClick={switchMode}>
            {isSignup
              ? 'Already have an account? Sign in'
              : "Don't have an account? Sign Up"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Auth;
