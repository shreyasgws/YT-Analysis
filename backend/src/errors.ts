import type { Response } from 'express'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export function sendError(res: Response, err: unknown): void {
  const isApi = err instanceof ApiError
  res.status(isApi ? err.status : 500).json({
    error: isApi ? err.message : 'Internal server error.',
  })
}
