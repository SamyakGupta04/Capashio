// Fetch wrapper; throws the server's { error } message

export async function api(path, { method = 'GET', body } = {}) {
  const isForm = body instanceof FormData
  const res = await fetch(path, {
    method,
    headers: body && !isForm ? { 'content-type': 'application/json' } : undefined,
    body: isForm ? body : body && JSON.stringify(body),
  })
  if (res.status === 401) api.onUnauthorized()
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw Object.assign(new Error(data.error || res.statusText), { status: res.status })
  }
  return res.json()
}

api.onUnauthorized = () => {}
