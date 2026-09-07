import { Gamepad2, Trophy, User } from 'lucide-react';

export type NavTab = 'play' | 'leaderboard' | 'profile';

interface BottomNavProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
}

export function BottomNav({ activeTab, onTabChange }: BottomNavProps) {
  const tabs: { id: NavTab; label: string; icon: typeof Gamepad2 }[] = [
    { id: 'play', label: 'Play', icon: Gamepad2 },
    { id: 'leaderboard', label: 'Ranks', icon: Trophy },
    { id: 'profile', label: 'Profile', icon: User },
  ];

  return (
    <nav
      aria-label="Bottom Navigation"
      className="fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] inset-x-0 mx-auto z-40 flex w-fit items-center gap-1.5 rounded-full border border-tg-separator bg-tg-section/90 p-1.5 shadow-lg shadow-black/10 backdrop-blur-xl transition-all duration-300"
    >
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;

        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            className={`relative flex items-center justify-center rounded-full py-2 transition-all duration-300 active:scale-95 ${
              isActive
                ? 'bg-tg-button text-tg-button-text px-4 shadow-sm font-semibold'
                : 'text-tg-hint hover:text-tg-text px-3'
            }`}
            title={tab.label}
          >
            <Icon className={`h-5 w-5 transition-transform duration-300 ${isActive ? 'scale-105' : 'hover:scale-110'}`} />
            <span
              className={`overflow-hidden whitespace-nowrap text-xs font-semibold transition-all duration-300 ease-out ${
                isActive
                  ? 'max-w-[100px] opacity-100 ml-1.5'
                  : 'max-w-0 opacity-0 ml-0'
              }`}
            >
              {tab.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
