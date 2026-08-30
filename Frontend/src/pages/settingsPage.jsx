import { useState } from 'react';
import SettingsNav from '../components/settings/settingsNav';
import ChangePass from '../components/settings/changePass';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('security');

  return (
    <div className="w-full">
      {/* Single unified card: shared header on top, then nav + content
          side by side so both columns line up and share the same box —
          instead of the nav floating loose next to a separate card. */}
      <div className="bg-white border border-brand-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 md:px-7 py-5 border-b border-brand-100">
          <h1 className="font-serif text-xl md:text-2xl font-bold text-brand-800">Settings</h1>
          <p className="text-[13px] text-brand-400 mt-1 leading-relaxed">
            Manage your account and security preferences.
          </p>
        </div>

        <div className="flex flex-col md:flex-row">
          {/* Nav column */}
          <div className="w-full md:w-56 shrink-0 border-b md:border-b-0 md:border-r border-brand-100 bg-brand-50/50 p-3 md:p-4">
            <SettingsNav active={activeTab} onChange={setActiveTab} />
          </div>

          {/* Content column */}
          <div className="flex-1 min-w-0 p-5 md:p-8">
            {activeTab === 'security' && <ChangePass />}
          </div>
        </div>
      </div>
    </div>
  );
}