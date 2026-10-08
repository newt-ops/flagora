import React, { forwardRef } from 'react';
import { HugeiconsIcon, type HugeiconsProps } from '@hugeicons/react';
import type { IconSvgElement } from '@hugeicons/react';
import {
  TrophyIcon as HugeTrophyIcon,
  Award01Icon as HugeAwardIcon,
  FlashIcon as HugeFlashIcon,
  SparklesIcon as HugeSparklesIcon,
  FireIcon as HugeFireIcon,
  Calendar03Icon as HugeCalendarIcon,
  SwordsIcon as HugeSwordsIcon,
  Share01Icon as HugeShareIcon,
  Copy01Icon as HugeCopyIcon,
  Tick01Icon as HugeCheckIcon,
  CheckmarkCircle01Icon as HugeCheckCircleIcon,
  ArrowLeft01Icon as HugeArrowLeftIcon,
  Loading03Icon as HugeLoaderIcon,
  UserIcon as HugeUserIcon,
  UserGroupIcon as HugeUsersIcon,
  GameController01Icon as HugeGamepadIcon,
  ShoppingBag01Icon as HugeShoppingBagIcon,
  PlayIcon as HugePlayIcon,
  Clock01Icon as HugeClockIcon,
  AlertCircleIcon as HugeAlertCircleIcon,
  Cancel01Icon as HugeCancelIcon,
  Globe02Icon as HugeGlobeIcon,
  Timer01Icon as HugeTimerIcon,
  Flag01Icon as HugeFlagIcon,
  LockIcon as HugeLockIcon,
  ReloadIcon as HugeReloadIcon,
  ExternalLinkIcon as HugeExternalLinkIcon,
  Coins01Icon as HugeCoinsIcon,
  SlidersHorizontalIcon as HugeSlidersIcon,
  GiftIcon as HugeGiftIcon,
  CrownIcon as HugeCrownIcon,
  HistoryIcon as HugeHistoryIcon,
  PinIcon as HugePinIcon,
  RocketIcon as HugeRocketIcon,
  ShieldCheckIcon as HugeShieldCheckIcon,
  PlusSignIcon as HugePlusIcon,
  PaletteIcon as HugePaletteIcon,
  SquareAsteriskIcon as HugeSquareAsteriskIcon,
  Image01Icon as HugeImageIcon,
  Tag01Icon as HugeTagIcon,
  CursorPointer01Icon as HugeCursorPointerIcon,
  Shield01Icon as HugeShieldIcon,
  Medal01Icon as HugeMedalIcon,
  Diamond01Icon as HugeGemIcon,
  WifiOff01Icon as HugeWifiOffIcon,
} from '@hugeicons/core-free-icons';

export interface IconProps extends Omit<HugeiconsProps, 'icon'> {
  className?: string;
  size?: number | string;
  color?: string;
  strokeWidth?: number;
}

export type HugeIcon = React.ForwardRefExoticComponent<IconProps & React.RefAttributes<SVGSVGElement>>;

export function createHugeIcon(iconData: IconSvgElement): HugeIcon {
  return forwardRef<SVGSVGElement, IconProps>(function HugeIconComponent(
    { size = 20, strokeWidth = 1.5, color = 'currentColor', className, ...rest },
    ref
  ) {
    return (
      <HugeiconsIcon
        ref={ref}
        icon={iconData}
        size={size}
        strokeWidth={strokeWidth}
        color={color}
        className={className}
        {...rest}
      />
    );
  });
}

export const Trophy = createHugeIcon(HugeTrophyIcon);
export const Award = createHugeIcon(HugeAwardIcon);
export const Zap = createHugeIcon(HugeFlashIcon);
export const Sparkles = createHugeIcon(HugeSparklesIcon);
export const Flame = createHugeIcon(HugeFireIcon);
export const Calendar = createHugeIcon(HugeCalendarIcon);
export const Swords = createHugeIcon(HugeSwordsIcon);
export const Share2 = createHugeIcon(HugeShareIcon);
export const Copy = createHugeIcon(HugeCopyIcon);
export const Check = createHugeIcon(HugeCheckIcon);
export const CheckCircle2 = createHugeIcon(HugeCheckCircleIcon);
export const ArrowLeft = createHugeIcon(HugeArrowLeftIcon);
export const Loader2 = createHugeIcon(HugeLoaderIcon);
export const User = createHugeIcon(HugeUserIcon);
export const Users = createHugeIcon(HugeUsersIcon);
export const Gamepad2 = createHugeIcon(HugeGamepadIcon);
export const ShoppingBag = createHugeIcon(HugeShoppingBagIcon);
export const Play = createHugeIcon(HugePlayIcon);
export const Clock = createHugeIcon(HugeClockIcon);
export const AlertCircle = createHugeIcon(HugeAlertCircleIcon);
export const X = createHugeIcon(HugeCancelIcon);
export const Globe = createHugeIcon(HugeGlobeIcon);
export const Timer = createHugeIcon(HugeTimerIcon);
export const Flag = createHugeIcon(HugeFlagIcon);
export const Lock = createHugeIcon(HugeLockIcon);
export const RotateCcw = createHugeIcon(HugeReloadIcon);
export const ExternalLink = createHugeIcon(HugeExternalLinkIcon);
export const Coins = createHugeIcon(HugeCoinsIcon);
export const Pins = Coins;
export const Sliders = createHugeIcon(HugeSlidersIcon);
export const Gift = createHugeIcon(HugeGiftIcon);
export const Crown = createHugeIcon(HugeCrownIcon);
export const History = createHugeIcon(HugeHistoryIcon);
export const Pin = createHugeIcon(HugePinIcon);
export const Rocket = createHugeIcon(HugeRocketIcon);
export const ShieldCheck = createHugeIcon(HugeShieldCheckIcon);
export const Plus = createHugeIcon(HugePlusIcon);
export const Palette = createHugeIcon(HugePaletteIcon);
export const SquareAsterisk = createHugeIcon(HugeSquareAsteriskIcon);
export const Image = createHugeIcon(HugeImageIcon);
export const Tag = createHugeIcon(HugeTagIcon);
export const MousePointerClick = createHugeIcon(HugeCursorPointerIcon);
export const Shield = createHugeIcon(HugeShieldIcon);
export const Medal = createHugeIcon(HugeMedalIcon);
export const Gem = createHugeIcon(HugeGemIcon);
export const WifiOff = createHugeIcon(HugeWifiOffIcon);
