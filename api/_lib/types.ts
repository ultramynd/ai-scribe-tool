export type HeaderValue = string | string[] | undefined;

export interface ApiRequestLike {
  method?: string;
  body?: unknown;
  headers?: Record<string, HeaderValue>;
  socket?: {
    remoteAddress?: string;
  };
}

export interface ApiResponseLike {
  status: (code: number) => ApiResponseLike;
  json: (body: unknown) => ApiResponseLike | void;
  send: (body: unknown) => ApiResponseLike | void;
  end: (body?: unknown) => ApiResponseLike | void;
  setHeader: (name: string, value: string) => void;
}
