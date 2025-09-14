import React, { useState, useEffect, useCallback } from 'react';
import { HomeIcon, CubeTransparentIcon, Cog6ToothIcon, SquaresPlusIcon } from '@heroicons/react/24/outline';

import type { View, Theme, NavItem, User } from './types';
import { MOCK_ACCOUNTS, MOCK_SELECTED_INSTANCE } from './constants';
import Sidebar from './components/layout/Sidebar';
import Header from './components/layout/Header';
import Footer from './components/layout/Footer';
import HomeView from './components/views/HomeView';
import InstancesView from './components/views/InstancesView';
import ModsView from './components/views/ModsView';
import SettingsView from './components/views/SettingsView';

const App: React.FC = () => {
  const [view, setView] = useState<View>('home');
  const [theme, setTheme] = useState<Theme>('dark-modern');
  const [isInitialized, setIsInitialized] = useState<boolean>(false);
  const [currentUser, setCurrentUser] = useState<User>(MOCK_ACCOUNTS[0]);

  useEffect(() => {
    document.documentElement.classList.add('dark');
    // Simulate initial loading
    const timer = setTimeout(() => setIsInitialized(true), 500);
    return () => clearTimeout(timer);
  }, []);
  
  const handleThemeChange = useCallback((newTheme: Theme) => {
    // In a real app, this would involve more complex logic,
    // like loading different CSS variables or styles.
    setTheme(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
  }, []);

  const renderView = () => {
    switch (view) {
      case 'home':
        return <HomeView user={currentUser} />;
      case 'instances':
        return <InstancesView />;
      case 'mods':
        return <ModsView />;
      case 'settings':
        return <SettingsView currentTheme={theme} onThemeChange={handleThemeChange} />;
      default:
        return <HomeView user={currentUser} />;
    }
  };
  
  const navItems: NavItem[] = [
    { id: 'home', label: 'Home', icon: HomeIcon },
    { id: 'instances', label: 'Instances', icon: CubeTransparentIcon },
    { id: 'mods', label: 'Mods', icon: SquaresPlusIcon },
    { id: 'settings', label: 'Settings', icon: Cog6ToothIcon },
  ];

  return (
    <div className={`theme-${theme} font-sans antialiased text-slate-300`}>
      <div className="flex h-screen bg-slate-900 overflow-hidden">
        <Sidebar currentView={view} setView={setView} navItems={navItems} />
        <main className="flex-1 flex flex-col transition-all duration-300 ease-in-out">
          <Header />
          <div className="flex-1 overflow-y-auto p-8 bg-slate-800/50" style={{
            backgroundImage: 'radial-gradient(circle at top left, rgba(30, 41, 59, 0.5), transparent 30%)',
          }}>
             {isInitialized ? (
              <div className="animate-fade-in">
                {renderView()}
              </div>
            ) : (
              <div className="flex items-center justify-center h-full">
                {/* Loading spinner or placeholder */}
              </div>
            )}
          </div>
          <Footer 
            user={currentUser} 
            accounts={MOCK_ACCOUNTS}
            onAccountSwitch={setCurrentUser}
            selectedInstance={MOCK_SELECTED_INSTANCE} 
          />
        </main>
      </div>
    </div>
  );
};

export default App;