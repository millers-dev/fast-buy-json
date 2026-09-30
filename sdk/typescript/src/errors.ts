export interface FastBuyProblemBody {
  type: string;
  title: string;
  status: number;
  code: string;
  detail?: string;
  instance?: string;
  errors?: Array<{ field: string; message: string }>;
}

export class FastBuyProblemError extends Error {
  readonly status: number;
  readonly code: string;
  readonly problem: FastBuyProblemBody;

  constructor(problem: FastBuyProblemBody) {
    super(problem.detail || problem.title);
    this.name = "FastBuyProblemError";
    this.status = problem.status;
    this.code = problem.code;
    this.problem = problem;
  }
}
