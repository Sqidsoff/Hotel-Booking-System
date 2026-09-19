const API_URL = "/api";

async function apiRequest(endpoint, options = {}) {
    const response = await fetch(`${API_URL}${endpoint}`, {
        ...options,

        headers: {
            "Content-Type": "application/json",
            ...options.headers
        },
        credentials: "include"
    });

    const contentType = response.headers.get("content-type") || "";

    let result;

    if (response.status !== 204) {
        if (contentType.includes("application/json")) {
            result = await response.json();
        } else {
            result = await response.text();
        }
    }

    if (!response.ok) {
        const error = new Error(
            result?.error ||
            result?.message ||
            `Помилка сервера (${response.status}).`);

        error.status = response.status
        error.response = result;

        throw error;
    }

    return result;
}

async function formRequest(endpoint, fields = {}) {
    const response = await fetch(endpoint, {
        method: "POST",

        headers: {
            "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
        },

        body: new URLSearchParams(fields),

        credentials: "include"
    });

    if (!response.ok) {
        const error = new Error(
            `Помилка сервера (${response.status}).`);

        error.status = response.status

        throw error;
    }

    return {
        legacy: true,
        response,
        text: await response.text()
    };
}

function unwrap(result, key) {
    if (result == null) {
        return result
    }

    if (result[key] !== undefined) {
        return  result[key];
    }

    if (result.data && result.data[key] !== undefined) {
        return result.data[key];
    }

    return result;
}

function createMissingApiError(route, description) {
    const error = new Error(`Backend ще не має: ${description}: GET/POST ${route}`);

    error.code = "missing api"
    return error;
}

async function detectLegacySession() {
    try {
        const adminResponse = await fetch("/admin/bookings/live", {credentials:"include"});

        const adminUrl = new URL(
            adminResponse.url,
            location.origin).pathname;

        const adminContentType = adminResponse.headers.get("content-type") || ";"

        if (adminResponse.ok && adminUrl === "/admin/bookings/live" && adminContentType.includes("application/json")) {
            return {
                role_code: "admin"
            };
        }
    } catch {

    }

    try {
        const guestResponse = await fetch("/my-bookings", {credentials:"include"});

        const guestUrl = new URL(guestResponse.url,
            location.origin).pathname;

        if (guestResponse.ok && guestUrl === "/my-bookings") {
            return {
                role_code: "guest"
            };
        }

    } catch {

    }

    return null;
}

async function getRooms(search = {}) {
    const params = new URLSearchParams();

    if (search.destination) {
        params.set("destination", search.destination);
    }

    if (search.checkIn) {
        params.set("check_in", search.checkIn);
    }

    if (search.checkOut) {
        params.set("check_out", search.checkOut);
    }

    if (search.adults) {
        params.set("adults", search.adults);
    }

    if (search.children) {
        params.set("children", search.children);
    }

    const query = params.toString();
    try {
        const result = await apiRequest(
            `/rooms${query ? `?${query}` : ""}`
        );
        return unwrap(result, "rooms")
    } catch (error) {
        if (error.status === 404) {
            throw createMissingApiError("/api/rooms", "JSON endpoint of api rooms");
        }
        throw error;
    }
}

async function loginUser(email, password) {
    try {
        const result = await apiRequest("/auth/login", {
            method: "POST",

            body: JSON.stringify({
                email,
                password
            })
        });
        return unwrap(result,"user");
    } catch (error) {
        if (error.status !== 404) {
            throw error;
        }

        await formRequest("/login", {
            email,
            password
        });

        const user = await detectLegacySession();

        if (!user) {
            throw new Error("Не вдалося виконати вхід. Перевірте email і пароль.");
        }
        return {
            ...user,
            email
        };
    }
}

async function registerUser(userData) {
    try {
        const result = await apiRequest("/auth/register", {
            method: "POST",

            body: JSON.stringify(userData)
        });
        return unwrap(result,"user");
    } catch (error) {
        if (error.status !== 404) {
            throw error;
        }

        await formRequest("/register", {
            full_name: userData.full_name,
            phone: userData.phone,
            document: userData.document,
            email: userData.email,
            password: userData.password
        });

        return {
            role_code: "guest",
            email: userData.email
        };
    }
}


async function logoutUser() {
    try {
        return await apiRequest("/auth/logout", {
            method: "POST"
        });
    } catch (error) {
        if (error.status !== 404) {
            throw error;
        }

        return formRequest("/logout")
    }
}


async function getCurrentUser() {
    try {
        const result = await apiRequest("/auth/me");
        return unwrap(result);

    } catch (error) {
        if (error.status !== 404) {
            throw error;
        }

        return detectLegacySession();
    }
}

async function getBookings() {
    try {
        const result = await apiRequest("/bookings");
        return unwrap(result,"bookings");
    } catch (error) {
        if (error.status === 404) {
            throw createMissingApiError("/api/bookings", "JSON endpoint of api bookings");
        }
        throw error;
    }
}


async function createBookingRequest(bookingData) {
    try {
        const result = await apiRequest("/bookings", {
            method: "POST",

            body: JSON.stringify(bookingData)
        });
        return {
            booking: unwrap(result,"booking"),
            legacy: false
        }

    } catch (error) {
        if (error.status !== 404) {
            throw error;
        }

        const roomId = bookingData.room_id;

        await formRequest(
            `/book/${roomId}`,
            {
                check_in: bookingData.check_in,
                check_out: bookingData.check_out,
                destination: bookingData.destination || "",
                adults: bookingData.adults,
                children: bookingData.children,
                comment: bookingData.comment || ""
            }
        );

        return {
            legacy: true
        };
    }
}

async function getAdminBookings() {
    try {
        const result = await apiRequest("/admin/bookings");
        return unwrap(result, "bookings");
    } catch (error) {
        if (error.status !== 404) {
            throw error;
        }

        const response = await fetch("/admin/bookings/live", {credentials:"include"});

        const contentType = response.headers.get("content-type") || "";

        const result = contentType.includes("application/json") ? await response.json() : null;
        if (!response.ok || !result) {
            throw new Error("Не вдалося отримати бронювання адм");
        }

        return result.bookings || result;

    }
}
async function getAdminRooms() {
    try {
        const result = await apiRequest("/admin/rooms");
        return unwrap(result,"rooms");
    } catch (error) {
        if (error.status === 404) {
            throw createMissingApiError("/api/admin/rooms", "JSON endpoint of admin rooms");
        }
        throw error;
    }
}


async function updateBookingStatus(bookingId, status) {

    try {
        const result = await apiRequest(`/admin/bookings/${bookingId}/status`, {
            method: "POST",

            body: JSON.stringify({
                status
            })
        });
        return {
            result,
            legacy: false
        };
    } catch (error) {
        if (error.status !== 404) {
            throw error;
        }

        await formRequest(`/admin/bookings/${bookingId}/status`, {status});
        return {
            legacy: true
        };
    }
}

async function getPayments() {
    try {
        const result = await apiRequest("/admin/payments");

        return unwrap(result,"payments");
    } catch (error) {
        if (error.status === 404) {
            throw createMissingApiError("/api/admin/payments", "JSON endpoint of payments")
        }
        throw error;
    }
}


async function createPayment(paymentData) {
    try {
        const result = await apiRequest("/admin/payments", {
            method: "POST",

            body: JSON.stringify(paymentData)
        });
        return {
            result,
            legacy: false
        };
    } catch (error) {
        if (error.status !== 404) {
            throw error
        }
        await formRequest(
            "/admin/payments",
            {
                booking_id:
                paymentData.booking_id,
                amount:
                paymentData.amount,
                method:
                paymentData.method,
                status:
                paymentData.status
            }
        );
        return {
            legacy: true
        };
    }
}

async function updateRoomStatus(roomId, status) {
    try {
        const result = await apiRequest(`/admin/rooms/${roomId}/status`, {
            method: "POST",

            body: JSON.stringify({
                status
            })
        });
        return {
            result,
            legacy: false
        };
    } catch (error) {
        if (error.status !== 404) {
            throw error;
        }

        await formRequest(`/admin/rooms/${roomId}/status`, {status});
        return {
            legacy: true
        };
    }
}