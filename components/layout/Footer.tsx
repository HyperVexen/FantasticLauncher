import React, { useState, useRef, useEffect } from 'react';
import { ChevronUpIcon, UserPlusIcon, ArrowRightOnRectangleIcon } from '@heroicons/react/24/solid';
import type { User, GameInstance } from '../../types';
import Button from '../common/Button';

interface FooterProps {
  user: User;
  accounts: User[];
  onAccountSwitch: (user: User) => void;
  selectedInstance: Pick<GameInstance, 'name' | 'minecraftVersion' | 'loader'>;
}

const Footer: React.FC<FooterProps> = ({ user, accounts, onAccountSwitch, selectedInstance }) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleSelectAccount = (account: User) => {
    onAccountSwitch(account);
    setIsMenuOpen(false);
  };
  
  return (
    <footer className="flex-shrink-0 bg-slate-900/50 border-t border-slate-700/50 px-6 py-4 flex items-center justify-between backdrop-blur-sm">
      <div className="relative" ref={menuRef}>
        {isMenuOpen && (
          <div className="absolute bottom-full mb-3 w-64 bg-slate-800 border border-slate-700 rounded-lg shadow-2xl animate-fade-in" style={{ animationDuration: '150ms' }}>
            <div className="p-2">
              {accounts.map((account) => (
                <button
                  key={account.name}
                  onClick={() => handleSelectAccount(account)}
                  disabled={account.name === user.name}
                  className="w-full flex items-center gap-3 p-2 rounded-md text-left transition-colors hover:bg-slate-700/50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <img src={account.avatarUrl} alt={account.name} className="h-8 w-8 rounded-full" />
                  <span className="font-semibold text-white">{account.name}</span>
                </button>
              ))}
            </div>
            <div className="border-t border-slate-700 p-2 space-y-1">
              <button className="w-full flex items-center gap-3 p-2 rounded-md text-left transition-colors text-slate-300 hover:bg-slate-700/50 hover:text-white">
                <UserPlusIcon className="h-5 w-5" />
                <span>Add Account</span>
              </button>
              <button className="w-full flex items-center gap-3 p-2 rounded-md text-left transition-colors text-red-400 hover:bg-red-500/10 hover:text-red-300">
                <ArrowRightOnRectangleIcon className="h-5 w-5" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        )}
        <button
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className="flex items-center gap-4 p-2 rounded-lg hover:bg-slate-700/50 transition-colors"
        >
          <img src={user.avatarUrl} alt={user.name} className="h-12 w-12 rounded-full border-2 border-slate-600" />
          <div>
            <p className="font-semibold text-white text-left">{user.name}</p>
            <p className="text-xs text-slate-400 text-left">Online</p>
          </div>
          <ChevronUpIcon className={`h-5 w-5 text-slate-400 transition-transform duration-200 ${isMenuOpen ? 'rotate-0' : 'rotate-180'}`} />
        </button>
      </div>

      <div className="flex items-center gap-6">
        <div className="text-right">
          <p className="font-bold text-lg text-white">{selectedInstance.name}</p>
          <p className="text-sm text-slate-400">{selectedInstance.loader} {selectedInstance.minecraftVersion}</p>
        </div>
        <Button size="lg" className="min-w-[200px] text-xl font-black tracking-wider shadow-lg shadow-emerald-500/30 hover:shadow-emerald-400/40 transform hover:scale-105">
          PLAY
        </Button>
      </div>
    </footer>
  );
};

export default Footer;