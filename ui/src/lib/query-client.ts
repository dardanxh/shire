import { MutationCache, QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { extractErrorMessage } from "@/lib/api";

/**
 * Single QueryClient for the app. The `MutationCache.onError` here is the ONE
 * place mutation errors are surfaced to the user — it pulls the BE `detail`
 * through `extractErrorMessage` and toasts it. Feature code must NOT add its
 * own per-mutation `onError` toast (it would double-fire).
 */
export const queryClient = new QueryClient({
  mutationCache: new MutationCache({
    onError: (error) => {
      toast.error(extractErrorMessage(error));
    },
  }),
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});
