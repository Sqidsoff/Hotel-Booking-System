export class ApiError extends Error {
  constructor(status, code, message) {
    super(message || code || "request_failed");
    this.name = "ApiError";
    this.status = status;
    this.code = code || "request_failed";
  }
}

export function createApiClient(fetchImpl = fetch) {
  async function request(path, options = {}) {
    const requestOptions = {
      credentials: "same-origin",
      ...options,
      headers: { ...(options.headers || {}) }
    };

    if (options.body !== undefined && typeof options.body !== "string") {
      requestOptions.headers["Content-Type"] = "application/json";
      requestOptions.body = JSON.stringify(options.body);
    }

    const response = await fetchImpl(path, requestOptions);
    const payload = response.status === 204 ? {} : await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new ApiError(response.status, payload.error, payload.message);
    }
    return payload;
  }

  return {
    request,
    me: () => request("/api/auth/me"),
    login: (email, password) => request("/api/auth/login", { method: "POST", body: { email, password } }),
    register: (body) => request("/api/auth/register", { method: "POST", body }),
    logout: () => request("/api/auth/logout", { method: "POST" }),
    rooms: (params = {}) => request(`/api/rooms?${new URLSearchParams(params)}`),
    bookings: () => request("/api/bookings"),
    createBooking: (body) => request("/api/bookings", { method: "POST", body }),
    cancelBooking: (bookingId) => request(`/api/bookings/${bookingId}/cancel`, { method: "POST" }),
    setBookingStatus: (bookingId, status) => request(`/api/bookings/${bookingId}/status`, { method: "POST", body: { status } }),
    setRoomStatus: (roomId, status) => request(`/api/rooms/${roomId}/status`, { method: "POST", body: { status } }),
    addPayment: (bookingId, body) => request(`/api/bookings/${bookingId}/pay`, { method: "POST", body }),
    adminOverview: () => request("/api/admin/overview")
  };
}

export const api = createApiClient();
