export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) { super(message); this.status = status }
}

export async function visitApi<T>(path: string, body?: unknown): Promise<T> {
  let headers: Record<string, string> = {}
  if (body !== undefined) {
    const tokenResponse = await fetch('/api/auth/csrf', { credentials: 'same-origin', cache: 'no-store' })
    if (!tokenResponse.ok) throw new ApiError('Cannot prepare the request. Check the backend.', tokenResponse.status)
    const { csrf_token } = await tokenResponse.json()
    headers = { 'Content-Type': 'application/json', 'X-CSRFToken': csrf_token }
  }
  const response = await fetch(`/api${path}`, {
    method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store', headers,
    ...(body !== undefined && { body: JSON.stringify(body) }),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new ApiError(result.error || 'Could not complete the request. Please try again.', response.status)
  return result as T
}
