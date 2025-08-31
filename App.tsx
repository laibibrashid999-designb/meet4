
import React, { useState, useEffect } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import AuthGuard from './components/AuthGuard';
import HomePage from './pages/HomePage';
import RoomPage from './pages/RoomPage';
import LeavingPage from './pages/LeavingPage';

const App: React.FC = () => {
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark');

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prevTheme => {
      const newTheme = prevTheme === 'light' ? 'dark' : 'light';
      // Dispatch a custom event so other components can react to theme changes
      window.dispatchEvent(new CustomEvent('themeChanged', { detail: { theme: newTheme } }));
      return newTheme;
    });
  };

  return (
    <div className="text-gray-900 dark:text-gray-100 transition-colors duration-300">
       <button 
        onClick={toggleTheme} 
        className="fixed top-4 right-4 z-50 p-2 rounded-full bg-white/20 dark:bg-slate-800/50 backdrop-blur-lg border border-slate-300 dark:border-slate-700 hover:bg-white/30 dark:hover:bg-slate-700/80 transition-colors"
        aria-label="Toggle theme"
      >
        {theme === 'light' ? 
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg> :
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
        }
      </button>
      <AuthGuard>
        <HashRouter>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/room/:roomId" element={<RoomPage />} />
            <Route path="/leaving" element={<LeavingPage />} />
          </Routes>
        </HashRouter>
      </AuthGuard>
    </div>
  );
};

export default App;