import axios, { AxiosError, AxiosInstance } from "axios";
import { toast } from "sonner";

import { tNow } from "@/i18n/now";

interface ApiErrorResponse {
  message?: string;
  error?: string;
  errorKey?: string;
  errorParams?: Record<string, string | number>;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status?: number,
    public data?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const api: AxiosInstance = axios.create({
  baseURL: "/api",
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiErrorResponse>) => {
    const data = error.response?.data;
    const message =
      (data?.errorKey ? tNow(data.errorKey, data.errorParams) : null) ||
      data?.error ||
      data?.message ||
      error.message ||
      tNow("toasts.common.unexpectedError");

    if (error.response?.status !== 401) {
      toast.error(message);
    }

    return Promise.reject(
      new ApiError(message, error.response?.status, error.response?.data)
    );
  }
);
