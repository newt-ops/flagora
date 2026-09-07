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
      className="fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] inset-x-0 mx-auto z-40 flex w-[calc(100%-2.5rem)] max-w-[300px] items-center justify-around rounded-full border border-tg-separator/80 bg-tg-section/80 p-1.5 shadow-xl shadow-black/10 backdrop-blur-xl"
    >
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;

        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            className={`relative flex flex-1 items-center justify-center gap-1.5 rounded-full py-2 text-xs font-bold transition-all duration-200 active:scale-95 ${
              isActive
                ? 'bg-tg-button text-tg-button-text shadow-sm'
                : 'text-tg-hint hover:text-tg-text'
            }`}
          >
            <Icon className={`h-4 w-4 transition-transform ${isActive ? 'scale-110' : ''}`} />
            <span>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
