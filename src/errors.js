/**
 * RFC 9457 problem details helpers for FastBuyJSON demo servers.
 */

const PROBLEM_BASE = "https://fastbuyjson.org/problems";

export function codeToSlug(code) {
  return code.toLowerCase().replace(/_/g, "-");
}

export function problemTypeForCode(code) {
  return `${PROBLEM_BASE}/${codeToSlug(code)}`;
}

/**
 * @param {import('express').Response} res
 * @param {{
 *   status: number;
 *   code: string;
 *   title: string;
 *   detail?: string;
 *   instance?: string;
 *   errors?: Array<{ field: string; message: string }>;
 * }} problem
 */
export function sendProblem(res, problem) {
  const { status, code, title, detail, instance, errors } = problem;
  res.set("Content-Type", "application/problem+json");
  if (status === 401) {
    res.set("WWW-Authenticate", "Bearer");
  }
  const body = {
    type: problemTypeForCode(code),
    title,
    status,
    code,
  };
  if (detail) {
    body.detail = detail;
  }
  if (instance) {
    body.instance = instance;
  }
  if (errors?.length) {
    body.errors = errors;
  }
  return res.status(status).json(body);
}
