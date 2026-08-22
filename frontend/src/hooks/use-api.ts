import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, apiHandler, type ApiRequest } from '@/lib/api-handler';

/** Feeds PageRenderer directly. */
export type RequestStatus = 'idle' | 'loading' | 'error' | 'success';

export interface UseApiResult<TData> {
  data: TData | null;
  error: ApiError | null;
  status: RequestStatus;
  /** True only for the first load, so a refresh does not blank the screen. */
  isInitialLoading: boolean;
  isRefreshing: boolean;
  refetch: () => Promise<void>;
  setData: (next: TData | null) => void;
}

interface UseApiOptions {
  /** Skip the request until a dependency is ready. */
  enabled?: boolean;
  /** Re-runs the request when any of these change. */
  deps?: unknown[];
}

/**
 * Reads data for a page.
 *
 * Deliberately small: one request, one status, one retry. The alternative was a
 * data-fetching library, which would be the right call in a real app but would
 * bury the loading and error handling the brief asks to see.
 */
export function useApi<TData>(request: ApiRequest, options: UseApiOptions = {}): UseApiResult<TData> {
  const { enabled = true, deps = [] } = options;

  const [data, setData] = useState<TData | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [status, setStatus] = useState<RequestStatus>(enabled ? 'loading' : 'idle');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const hasLoadedOnce = useRef(false);
  // Kept in a ref so a changing request object does not retrigger the effect;
  // `deps` is the explicit signal for that.
  const requestRef = useRef(request);
  requestRef.current = request;

  const run = useCallback(
    async (isRefresh: boolean, signal?: AbortSignal) => {
      if (isRefresh) setIsRefreshing(true);
      else setStatus('loading');

      try {
        const result = await apiHandler<TData>({ ...requestRef.current, ...(signal ? { signal } : {}) });

        if (signal?.aborted) return;

        setData(result);
        setError(null);
        setStatus('success');
        hasLoadedOnce.current = true;
      } catch (caught) {
        if (signal?.aborted) return;

        setError(caught instanceof ApiError ? caught : new ApiError('UNKNOWN_ERROR', 0, String(caught)));
        setStatus('error');
      } finally {
        if (!signal?.aborted) setIsRefreshing(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!enabled) {
      setStatus('idle');
      return;
    }

    const controller = new AbortController();
    void run(hasLoadedOnce.current, controller.signal);

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, run, ...deps]);

  const refetch = useCallback(() => run(hasLoadedOnce.current), [run]);

  return {
    data,
    error,
    status,
    isInitialLoading: status === 'loading' && !hasLoadedOnce.current,
    isRefreshing,
    refetch,
    setData,
  };
}
