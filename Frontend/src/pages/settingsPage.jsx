import { useState } from 'react';
import SettingsNav from '../components/settings/settingsNav';
import ChangePass from '../components/settings/changePass';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('security');

  return (
    <div className="flex flex-col md:flex-row items-start gap-8 md:gap-16">
      {/* Left Column: Heading and Nav */}
      <div className="w-full md:w-64 shrink-0">
        <div className="mb-6">
          <h1 className="font-serif text-xl md:text-2xl font-bold text-brand-800">Settings</h1>
          <p className="text-[13px] text-brand-400 mt-1 leading-relaxed">
            Manage your account and security preferences.
          </p>
        </div>
        <SettingsNav active={activeTab} onChange={setActiveTab} />
      </div>

      {/* Right Column: Content */}
      <div className="flex-1 min-w-0 w-full">
        {activeTab === 'security' && <ChangePass />}
      </div>
    </div>
  );
}