
import React, { useState } from 'react';
import Card from '../common/Card';
import Button from '../common/Button';
import { THEME_OPTIONS } from '../../constants';
import type { Theme, ThemeOption } from '../../types';
import { CheckCircleIcon } from '@heroicons/react/24/solid';

interface SettingsViewProps {
    currentTheme: Theme;
    onThemeChange: (theme: Theme) => void;
}

const ThemeCard: React.FC<{ option: ThemeOption; isSelected: boolean; onSelect: () => void; }> = ({ option, isSelected, onSelect }) => {
    return (
        <Card onClick={onSelect} className={`relative border-2 ${isSelected ? 'border-cyan-400' : 'border-slate-700'}`}>
            {isSelected && (
                <div className="absolute top-2 right-2 bg-cyan-400 rounded-full p-1">
                    <CheckCircleIcon className="h-5 w-5 text-slate-900"/>
                </div>
            )}
            <div className="p-4">
                <div className="flex items-center gap-3 mb-3">
                    <div className={`w-8 h-8 rounded-full ${option.primaryColor}`}></div>
                    <h3 className="text-lg font-bold text-white">{option.name}</h3>
                </div>
                <p className="text-sm text-slate-400">{option.description}</p>
            </div>
        </Card>
    );
};

const SettingsView: React.FC<SettingsViewProps> = ({ currentTheme, onThemeChange }) => {
  const [activeTab, setActiveTab] = useState('appearance');

  const renderContent = () => {
    switch(activeTab) {
      case 'appearance':
        return (
          <div>
            <h2 className="text-2xl font-bold text-white mb-4">Theme Customization</h2>
            <p className="text-slate-400 mb-6">Select a preset theme to change the launcher's look and feel.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {THEME_OPTIONS.map(option => (
                <ThemeCard 
                    key={option.id} 
                    option={option} 
                    isSelected={currentTheme === option.id}
                    onSelect={() => onThemeChange(option.id)}
                />
              ))}
            </div>
          </div>
        );
      case 'accounts':
        return <p className="text-slate-400">Account management UI goes here.</p>;
      case 'java':
        return <p className="text-slate-400">Java version and memory allocation settings go here.</p>;
      default:
        return null;
    }
  };

  const tabs = [
      { id: 'appearance', label: 'Appearance' },
      { id: 'accounts', label: 'Accounts' },
      { id: 'java', label: 'Java' },
  ];

  return (
    <div>
      <h1 className="text-3xl font-extrabold text-white mb-6">Settings</h1>
      <div className="flex border-b border-slate-700 mb-6">
        {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`px-4 py-2 text-sm font-semibold transition-colors ${activeTab === tab.id ? 'text-cyan-400 border-b-2 border-cyan-400' : 'text-slate-400 hover:text-white'}`}>
                {tab.label}
            </button>
        ))}
      </div>
      <div>{renderContent()}</div>
    </div>
  );
};

export default SettingsView;
