import React from 'react';
import type { CosmeticCategory } from '@flagora/shared';
import { getCosmeticAssetUrl } from './cosmeticHelpers.js';

export interface CosmeticProtectedImageProps {
  category: CosmeticCategory;
  assetIdOrPath: string | null | undefined;
  alt?: string;
  className?: string;
  animationClass?: string;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}

export function CosmeticProtectedImage({
  category,
  assetIdOrPath,
  alt,
  className = '',
  animationClass = '',
  children,
  style,
}: CosmeticProtectedImageProps) {
  const imageUrl = getCosmeticAssetUrl(category, assetIdOrPath);

  if (!imageUrl) {
    return children ? <>{children}</> : null;
  }

  return (
    <div
      className={`relative overflow-hidden ${className}`}
      role="img"
      aria-label={alt || `${category} cosmetic`}
      data-testid="cosmetic-protected-container"
    >
      <div
        data-testid="cosmetic-protected-image-layer"
        className={`cosmetic-protected-image w-full h-full ${animationClass}`}
        style={{
          backgroundImage: `url("${imageUrl}")`,
          backgroundSize: 'contain',
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'center',
          ...style,
        }}
      />
      {children}
      <div
        data-testid="cosmetic-overlay-guard"
        className="absolute inset-0 pointer-events-auto bg-transparent z-10"
        onContextMenu={(e) => e.preventDefault()}
      />
    </div>
  );
}
