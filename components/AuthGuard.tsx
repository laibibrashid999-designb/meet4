import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { motion } from 'framer-motion';
import { LogIn, UserPlus, Loader } from 'lucide-react';

interface AuthGuardProps {
  children: React.ReactNode;
}

const AuthGuard: React.FC<AuthGuardProps> = ({ children }) => {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showSignUp, setShowSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    // Check current session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setError('');

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
    }
    setAuthLoading(false);
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setError('');

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        }
      }
    });

    if (error) {
      setError(error.message);
    } else {
      setError('Check your email for the confirmation link!');
    }
    setAuthLoading(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <motion.div 
          className="w-full max-w-md p-8 space-y-8 bg-white/30 dark:bg-black/20 backdrop-blur-xl rounded-2xl shadow-2xl border border-slate-300 dark:border-slate-700"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="text-center">
            <h1 className="text-4xl font-bold text-gray-900 dark:text-white">Meetboard by Prodai</h1>
            <p className="mt-2 text-lg text-gray-600 dark:text-gray-400">
              {showSignUp ? 'Create your Prodai account' : 'Sign in to your Prodai account'}
            </p>
          </div>
          
          <form onSubmit={showSignUp ? handleSignUp : handleSignIn} className="space-y-4">
            {showSignUp && (
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Full Name"
                required
                className="w-full px-4 py-3 text-gray-900 dark:text-white bg-white/50 dark:bg-slate-800/50 border-transparent rounded-lg focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-gray-600 dark:placeholder:text-gray-400"
              />
            )}
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              required
              className="w-full px-4 py-3 text-gray-900 dark:text-white bg-white/50 dark:bg-slate-800/50 border-transparent rounded-lg focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-gray-600 dark:placeholder:text-gray-400"
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              required
              className="w-full px-4 py-3 text-gray-900 dark:text-white bg-white/50 dark:bg-slate-800/50 border-transparent rounded-lg focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-gray-600 dark:placeholder:text-gray-400"
            />
            
            {error && <p className="text-sm text-red-500">{error}</p>}
            
            <motion.button
              type="submit"
              disabled={authLoading}
              className="w-full px-4 py-3 font-semibold text-white bg-primary rounded-lg shadow-md hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-hover dark:focus:ring-offset-gray-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {authLoading ? (
                <Loader className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  {showSignUp ? <UserPlus className="w-5 h-5" /> : <LogIn className="w-5 h-5" />}
                  {showSignUp ? 'Sign Up' : 'Sign In'}
                </>
              )}
            </motion.button>
          </form>
          
          <div className="text-center">
            <button
              onClick={() => setShowSignUp(!showSignUp)}
              className="text-primary hover:text-primary-hover font-semibold"
            >
              {showSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return <>{children}</>;
};

export default AuthGuard;