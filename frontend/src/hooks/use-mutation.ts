import { useCallback, useState } from 'react';
import { ApiError, apiHandler, type ApiRequest } from '@/lib/api-handler';

export interface UseMutationResult<TVariables, TData> {
  mutate: (variables: TVariables) => Promise<TData>;
  isPending: boolean;
  error: ApiError | null;
  reset: () => void;
}

/**
 * Writes: login, create a campaign, fund one, start a purchase.
 *
 * mutate resolves with the response and rejects with an ApiError, so a caller
 * can either await it or read `error` for inline display — the funding form
 * needs the error next to the field, not in a toast.
 */
export function useMutation<TVariables, TData>(
  build: (variables: TVariables) => ApiRequest,
): UseMutationResult<TVariables, TData> {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const mutate = useCallback(
    async (variables: TVariables): Promise<TData> => {
      setIsPending(true);
      setError(null);

      try {
        return await apiHandler<TData>(build(variables));
      } catch (caught) {
        const apiError =
          caught instanceof ApiError ? caught : new ApiError('UNKNOWN_ERROR', 0, String(caught));
        setError(apiError);
        throw apiError;
      } finally {
        setIsPending(false);
      }
    },
    [build],
  );

  const reset = useCallback(() => setError(null), []);

  return { mutate, isPending, error, reset };
}
