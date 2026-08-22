import axios, { AxiosError, type AxiosRequestConfig, type Method } from 'axios';
import { clearSession, readToken } from './session';

/**
 * Every request in the app goes through apiHandler.
 *
 * Callers give it an endpoint, and optionally params and a payload. They never
 * deal with the base URL, the Authorization header, or the shape of an error
 * response — which means adding a header or changing error handling is one edit
 * here rather than one per call site.
 */

export const API_BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:4000/api';

const client = axios.create({
  baseURL: API_BASE_URL,
  timeout: 20_000,
  headers: { 'Content-Type': 'application/json' },
});

client.interceptors.request.use((config) => {
  const token = readToken();

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

/** Field-level detail from the API's zod validation errors. */
export interface ApiFieldError {
  field: string;
  message: string;
}

/**
 * A failed request, normalised.
 *
 * `code` is the backend's stable error code — INSUFFICIENT_CREDITS,
 * CURRENCY_NOT_ALLOWED_FOR_MODULE, and so on. The UI branches on that, never on
 * the message, so wording can change server-side without breaking a screen.
 */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly fieldErrors: ApiFieldError[];

  constructor(code: string, status: number, message: string, fieldErrors: ApiFieldError[] = []) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.fieldErrors = fieldErrors;
  }

  /** True when retrying might work: a timeout, a dropped connection, a 5xx. */
  get isRetryable(): boolean {
    return this.status === 0 || this.status >= 500;
  }
}

export interface ApiRequest {
  endpoint: string;
  method?: Method;
  /** Query string values. Undefined and null entries are dropped. */
  params?: Record<string, string | number | boolean | undefined | null>;
  /** Request body. */
  payload?: unknown;
  /** Extra headers, e.g. an Idempotency-Key on a purchase. */
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

interface ApiErrorBody {
  error?: { code?: string; message?: string; details?: ApiFieldError[] };
}

function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;

  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<ApiErrorBody>;
    const status = axiosError.response?.status ?? 0;
    const body = axiosError.response?.data?.error;

    if (status === 0) {
      return new ApiError(
        'NETWORK_ERROR',
        0,
        'Could not reach the server. Check that the API is running on ' + API_BASE_URL + '.',
      );
    }

    return new ApiError(
      body?.code ?? 'UNKNOWN_ERROR',
      status,
      body?.message ?? axiosError.message,
      body?.details ?? [],
    );
  }

  return new ApiError('UNKNOWN_ERROR', 0, error instanceof Error ? error.message : String(error));
}

/**
 * Called when a request comes back 401 — the token expired or was revoked.
 * App-level code registers a handler so the session can be cleared and the user
 * sent to the login screen from one place.
 */
type UnauthorizedHandler = () => void;
let onUnauthorized: UnauthorizedHandler | null = null;

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  onUnauthorized = handler;
}

export async function apiHandler<TResponse>(request: ApiRequest): Promise<TResponse> {
  const { endpoint, method = 'GET', params, payload, headers, signal } = request;

  const config: AxiosRequestConfig = {
    url: endpoint.startsWith('/') ? endpoint : `/${endpoint}`,
    method,
    ...(params ? { params: stripEmpty(params) } : {}),
    ...(payload !== undefined ? { data: payload } : {}),
    ...(headers ? { headers } : {}),
    ...(signal ? { signal } : {}),
  };

  try {
    const response = await client.request<TResponse>(config);
    return response.data;
  } catch (error) {
    const apiError = toApiError(error);

    // A cancelled request is the caller unmounting, not a failure to report.
    if (axios.isCancel(error)) throw apiError;

    if (apiError.status === 401) {
      clearSession();
      onUnauthorized?.();
    }

    throw apiError;
  }
}

function stripEmpty(
  params: Record<string, string | number | boolean | undefined | null>,
): Record<string, string | number | boolean> {
  return Object.fromEntries(
    Object.entries(params).filter(
      (entry): entry is [string, string | number | boolean] =>
        entry[1] !== undefined && entry[1] !== null && entry[1] !== '',
    ),
  );
}
