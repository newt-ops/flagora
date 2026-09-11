import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ShopCatalogItem } from '@flagora/shared';
import { fetchShopCatalog, purchaseCosmeticItem, equipCosmeticItem } from '../api/client.js';
import { triggerHaptic } from '../telegram/haptics.js';

export function useShop(sessionToken: string | null) {
  const queryClient = useQueryClient();
  const [activeActionItemId, setActiveActionItemId] = useState<string | null>(null);

  const catalogQuery = useQuery({
    queryKey: ['shopCatalog', sessionToken],
    queryFn: async () => {
      const response = await fetchShopCatalog(sessionToken!);
      return response.items;
    },
    enabled: Boolean(sessionToken),
    staleTime: 30_000,
  });

  const purchaseMutation = useMutation({
    mutationFn: async (itemId: string) => {
      setActiveActionItemId(itemId);
      return purchaseCosmeticItem(sessionToken!, itemId);
    },
    onSuccess: async () => {
      triggerHaptic('success');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['shopCatalog'] }),
        queryClient.invalidateQueries({ queryKey: ['profile'] }),
      ]);
    },
    onSettled: () => {
      setActiveActionItemId(null);
    },
  });

  const equipMutation = useMutation({
    mutationFn: async (itemId: string) => {
      setActiveActionItemId(itemId);
      return equipCosmeticItem(sessionToken!, itemId);
    },
    onSuccess: async () => {
      triggerHaptic('success');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['shopCatalog'] }),
        queryClient.invalidateQueries({ queryKey: ['profile'] }),
      ]);
    },
    onSettled: () => {
      setActiveActionItemId(null);
    },
  });

  const catalog: ShopCatalogItem[] = catalogQuery.data ?? [];
  const isLoading = catalogQuery.isLoading;
  const error =
    catalogQuery.error instanceof Error
      ? catalogQuery.error.message
      : purchaseMutation.error instanceof Error
      ? purchaseMutation.error.message
      : equipMutation.error instanceof Error
      ? equipMutation.error.message
      : null;

  const clearError = () => {
    purchaseMutation.reset();
    equipMutation.reset();
  };

  return {
    catalog,
    isLoading,
    error,
    activeActionItemId,
    isPurchasing: purchaseMutation.isPending,
    isEquipping: equipMutation.isPending,
    purchase: purchaseMutation.mutateAsync,
    equip: equipMutation.mutateAsync,
    refetchCatalog: catalogQuery.refetch,
    clearError,
  };
}
