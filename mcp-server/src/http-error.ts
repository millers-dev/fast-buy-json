/**
 * Format FastBuyJSON HTTP failures for MCP tool text.
 *
 * Problem documents (RFC 9457 / schemas/error.json), including additive
 * members such as checkoutUrl, are appended so agents can read them.
 * Anything else keeps the Axios or Error message.
 */

const PROBLEM_FIELDS = ['type', 'title', 'detail', 'status', 'code'] as const;

function isProblemDocument(data: unknown): data is Record<string, unknown> {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return false;
  }

  const body = data as Record<string, unknown>;
  return PROBLEM_FIELDS.some((field) => Object.prototype.hasOwnProperty.call(body, field));
}

function responseData(error: unknown): unknown {
  if (error === null || typeof error !== 'object') {
    return undefined;
  }

  const response = (error as { response?: unknown }).response;
  if (response === null || typeof response !== 'object') {
    return undefined;
  }

  return (response as { data?: unknown }).data;
}

function fallbackMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

function problemJson(body: Record<string, unknown>): string | undefined {
  try {
    return JSON.stringify(body);
  } catch {
    return undefined;
  }
}

/**
 * Build `<action> failed: …` for an adapter catch block.
 * When the response body looks like a problem document, the JSON is appended
 * so detail, checkoutUrl, and any other members stay in the Error message.
 */
export function formatHttpError(action: string, error: unknown): string {
  const fallback = fallbackMessage(error);
  const data = responseData(error);
  if (!isProblemDocument(data)) {
    return `${action} failed: ${fallback}`;
  }

  const body = problemJson(data);
  if (body === undefined) {
    return `${action} failed: ${fallback}`;
  }

  return `${action} failed: ${fallback}: ${body}`;
}

export function throwHttpError(action: string, error: unknown): never {
  const message = formatHttpError(action, error);
  if (error instanceof Error) {
    throw new Error(message, { cause: error });
  }
  throw new Error(message);
}
