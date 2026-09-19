const STORAGE_KEY = "hotelbook_data_v1";
const API_URL = "http://127.0.0.1:5050";
const defaultData = {
  currentUser: null,
  users: [
    {
      id: 1,
      fullName: "Адміністратор",
      phone: "+380 44 000 00 00",
      document: "",
      email: "admin@hotel.local",
      password: "admin123",
      role: "admin"
    }
  ],
  rooms: [
    { id: 1, number: "101", type: "Standard", price: 1800, capacity: 2, status: "available" },
    { id: 2, number: "102", type: "Standard", price: 1900, capacity: 2, status: "available" },
    { id: 3, number: "201", type: "Comfort", price: 2400, capacity: 3, status: "available" },
    { id: 4, number: "202", type: "Comfort", price: 2600, capacity: 3, status: "available" },
    { id: 5, number: "301", type: "Lux", price: 3500, capacity: 4, status: "available" },
    { id: 6, number: "302", type: "Lux", price: 4200, capacity: 4, status: "available" },
    { id: 7, number: "401", type: "Family", price: 3900, capacity: 5, status: "available" },
    { id: 8, number: "402", type: "Family", price: 4500, capacity: 6, status: "maintenance" }
  ],
  bookings: [],
  payments: []
};

function loadData() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return structuredClone(defaultData);
  try {
    return { ...structuredClone(defaultData), ...JSON.parse(saved) };
  } catch {
    return structuredClone(defaultData);
  }
}

let data = loadData();

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function nextId(items) {
  return items.length ? Math.max(...items.map(x => x.id)) + 1 : 1;
}

function getUser() {
  return data.currentUser;
}

function money(value) {
  return `${Number(value).toFixed(2)} грн`;
}

function dateDiff(start, end) {
  const a = new Date(`${start}T00:00:00`);
  const b = new Date(`${end}T00:00:00`);
  return Math.ceil((b - a) / 86400000);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showToast(message, type = "info") {
  const old = document.querySelector(".toast");
  if (old) old.remove();
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  if (type === "success") toast.style.borderLeft = "4px solid #22c55e";
  if (type === "danger") toast.style.borderLeft = "4px solid #ef4444";
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function setTodayDefaults() {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const format = d => d.toISOString().slice(0, 10);

  const checkIn = document.querySelector("#check-in");
  const checkOut = document.querySelector("#check-out");

  if (checkIn && !checkIn.value) checkIn.value = format(today);
  if (checkOut && !checkOut.value) checkOut.value = format(tomorrow);
}

function setupNavigation() {
  const navToggle = document.querySelector("[data-nav-toggle]");
  const navMenu = document.querySelector("[data-nav-menu]");
  const navActions = document.querySelector(".nav-actions");

  if (!navToggle || !navMenu || !navActions) return;

  navToggle.addEventListener("click", () => {
    navMenu.classList.toggle("is-open");
    navActions.classList.toggle("is-open");
  });
}

function renderHeader() {
  const actions = document.querySelector(".nav-actions");
  if (!actions) return;

  const user = getUser();

  if (!user) {
    actions.innerHTML = `
      <a class="nav-link-button" href="login.html">Увійти</a>
      <a class="button button-small" href="register.html">Реєстрація</a>
    `;
    return;
  }

  actions.innerHTML = `
    ${user.role === "guest"
      ? '<a class="nav-link-button" href="bookings.html">Мої бронювання</a>'
      : '<a class="nav-link-button" href="admin.html">Адмінка</a>'}
    <button class="button button-outline" type="button" data-logout>Вийти</button>
  `;

  actions.querySelector("[data-logout]").addEventListener("click", () => {
    data.currentUser = null;
    saveData();
    location.href = "index.html";
  });
}

function setupFlash() {
  document.querySelectorAll("[data-flash]").forEach(item => {
    setTimeout(() => {
      item.style.opacity = "0";
      item.style.transform = "translateY(-6px)";
      setTimeout(() => item.remove(), 180);
    }, 3800);
  });
}

function getSearchParams() {
  const params = new URLSearchParams(location.search);
  return {
    destination: params.get("destination") || "",
    checkIn: params.get("check_in") || "",
    checkOut: params.get("check_out") || "",
    adults: Number(params.get("adults") || 1),
    children: Number(params.get("children") || 0)
  };
}

function renderRooms() {
  const container = document.querySelector("#rooms-container");
  const empty = document.querySelector("#rooms-empty");
  const count = document.querySelector("#results-count");
  if (!container || !empty || !count) return;

  const search = getSearchParams();
  const searched = Boolean(search.checkIn && search.checkOut);

  if (!searched) {
    container.innerHTML = "";
    empty.textContent = "Оберіть дати, щоб побачити доступні номери.";
    empty.hidden = false;
    count.textContent = "";
    return;
  }

  const nights = dateDiff(search.checkIn, search.checkOut);

  if (nights <= 0) {
    container.innerHTML = "";
    empty.textContent = "Дата виїзду повинна бути пізніше дати заїзду.";
    empty.hidden = false;
    count.textContent = "";
    return;
  }

  if (search.adults < 1) {
    container.innerHTML = "";
    empty.textContent = "Кількість дорослих повинна бути не менше 1.";
    empty.hidden = false;
    count.textContent = "";
    return;
  }

  const totalGuests = search.adults + search.children;
  const destination = search.destination.toLowerCase();

  const rooms = data.rooms.filter(room => {
    if (room.status !== "available") return false;
    if (room.capacity < totalGuests) return false;

    if (destination) {
      const matchesNumber = room.number.toLowerCase().includes(destination);
      const matchesType = room.type.toLowerCase().includes(destination);
      if (!matchesNumber && !matchesType) return false;
    }

    // Treat overlapping confirmed/pending bookings as unavailable.
    const overlaps = data.bookings.some(booking => {
      if (booking.roomId !== room.id) return false;
      if (["cancelled", "completed"].includes(booking.status)) return false;
      return search.checkIn < booking.checkOut && search.checkOut > booking.checkIn;
    });

    return !overlaps;
  });

  count.textContent = `${rooms.length} варіантів`;
  empty.hidden = rooms.length > 0;

  if (!rooms.length) {
    container.innerHTML = "";
    empty.textContent = "На вибрані дати вільних номерів немає.";
    return;
  }

  container.innerHTML = rooms.map(room => `
    <article class="room-card">
      <div class="room-card-top">
        <div>
          <p class="room-kicker">${escapeHtml(room.type)}</p>
          <h3>Номер ${escapeHtml(room.number)}</h3>
        </div>
        <span class="pill">до ${room.capacity} осіб</span>
      </div>

      <div class="room-price">${money(room.price)} <span>/ ніч</span></div>
      <p class="room-meta">${nights} ночі · орієнтовна сума ${money(room.price * nights)}</p>

      ${getUser()?.role === "guest"
        ? `
          <form class="room-book-form" data-book-room="${room.id}">
            <input type="text" name="comment" placeholder="Коментар до бронювання">
            <button class="button" type="submit">Забронювати</button>
          </form>
        `
        : getUser()?.role === "admin"
          ? `<div class="empty-inline">Бронювання від імені гостя недоступне в адмін-режимі.</div>`
          : `<a class="button" href="login.html">Увійти для бронювання</a>`
      }
    </article>
  `).join("");

  container.querySelectorAll("[data-book-room]").forEach(form => {
    form.addEventListener("submit", event => {
      event.preventDefault();
      createBooking(Number(form.dataset.bookRoom), form.elements.comment.value);
    });
  });
}

function createBooking(roomId, comment) {
  const user = getUser();

  if (!user || user.role !== "guest") {
    location.href = "login.html";
    return;
  }

  const search = getSearchParams();
  const nights = dateDiff(search.checkIn, search.checkOut);
  const room = data.rooms.find(r => r.id === roomId);

  if (!room || nights <= 0) {
    showToast("Неможливо створити бронювання.", "danger");
    return;
  }

  const booking = {
    id: nextId(data.bookings),
    userId: user.id,
    roomId,
    checkIn: search.checkIn,
    checkOut: search.checkOut,
    adults: search.adults,
    children: search.children,
    comment: comment.trim(),
    totalPrice: room.price * nights,
    status: "pending",
    createdAt: new Date().toISOString()
  };

  data.bookings.push(booking);
  saveData();
  showToast("Бронювання створено.", "success");

  setTimeout(() => {
    location.href = "bookings.html";
  }, 500);
}

function setupSearchForm() {
  const form = document.querySelector("#search-form");
  if (!form) return;

  const params = getSearchParams();

  form.elements.destination.value = params.destination;
  form.elements.check_in.value = params.checkIn;
  form.elements.check_out.value = params.checkOut;
  form.elements.adults.value = params.adults;
  form.elements.children.value = params.children;

  form.addEventListener("submit", event => {
    const checkIn = form.elements.check_in.value;
    const checkOut = form.elements.check_out.value;

    if (dateDiff(checkIn, checkOut) <= 0) {
      event.preventDefault();
      showToast("Дата виїзду повинна бути пізніше дати заїзду.", "danger");
    }
  });
}

function setupLogin() {
  const form = document.querySelector("#login-form");
  if (!form) return;

  form.addEventListener("submit", event => {
    event.preventDefault();

    const email = form.elements.email.value.trim().toLowerCase();
    const password = form.elements.password.value;

    const user = data.users.find(
      u => u.email.toLowerCase() === email && u.password === password
    );

    if (!user) {
      showToast("Невірний email або пароль.", "danger");
      return;
    }

    data.currentUser = {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role
    };

    saveData();
    showToast("Ви успішно увійшли.", "success");

    setTimeout(() => {
      location.href = user.role === "admin" ? "admin.html" : "index.html";
    }, 400);
  });
}

function setupRegister() {
  const form = document.querySelector("#register-form");
  if (!form) return;

  form.addEventListener("submit", event => {
    event.preventDefault();

    const fullName = form.elements.full_name.value.trim();
    const phone = form.elements.phone.value.trim();
    const documentNumber = form.elements.document.value.trim();
    const email = form.elements.email.value.trim().toLowerCase();
    const password = form.elements.password.value;

    if (password.length < 6) {
      showToast("Пароль повинен містити щонайменше 6 символів.", "danger");
      return;
    }

    if (data.users.some(u => u.email.toLowerCase() === email)) {
      showToast("Користувач з таким email вже існує.", "danger");
      return;
    }

    const user = {
      id: nextId(data.users),
      fullName,
      phone,
      document: documentNumber,
      email,
      password,
      role: "guest"
    };

    data.users.push(user);
    data.currentUser = {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role
    };

    saveData();
    showToast("Акаунт створено.", "success");

    setTimeout(() => {
      location.href = "index.html";
    }, 400);
  });
}

function setupBookingsPage() {
  const container = document.querySelector("#bookings-container");
  if (!container) return;

  const user = getUser();

  if (!user || user.role !== "guest") {
    container.innerHTML = `
      <div class="empty-state">
        Увійдіть як гість, щоб переглянути свої бронювання.
        <br><br>
        <a class="button button-small" href="login.html">Увійти</a>
      </div>
    `;
    return;
  }

  const bookings = data.bookings.filter(b => b.userId === user.id);

  if (!bookings.length) {
    container.innerHTML = `<div class="empty-state">У Вас поки що немає бронювань.</div>`;
    return;
  }

  container.innerHTML = `
    <div class="table-card">
      <table class="data-table">
        <thead>
          <tr>
            <th>ID</th><th>Номер</th><th>Період</th><th>Статус</th>
            <th>Сума</th><th>Оплачено</th>
          </tr>
        </thead>
        <tbody>
          ${bookings.map(booking => {
            const room = data.rooms.find(r => r.id === booking.roomId);
            const paid = data.payments
              .filter(p => p.bookingId === booking.id && p.status === "paid")
              .reduce((sum, p) => sum + Number(p.amount), 0);

            return `
              <tr>
                <td>${booking.id}</td>
                <td>${room ? `${escapeHtml(room.number)} / ${escapeHtml(room.type)}` : "—"}</td>
                <td>${escapeHtml(booking.checkIn)} - ${escapeHtml(booking.checkOut)}</td>
                <td><span class="status-pill status-${booking.status}">${booking.status}</span></td>
                <td>${money(booking.totalPrice)}</td>
                <td>${money(paid)}</td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function setupAdminPage() {
  const page = document.querySelector("[data-admin-page]");
  if (!page) return;

  const user = getUser();

  if (!user || user.role !== "admin") {
    page.innerHTML = `
      <div class="empty-state">
        Доступ до адмін-панелі мають лише адміністратори.
        <br><br>
        <a class="button button-small" href="login.html">Увійти</a>
      </div>
    `;
    return;
  }

  renderAdmin();
}

function renderAdmin() {
  const activeBookings = data.bookings.filter(
    b => !["cancelled", "completed"].includes(b.status)
  ).length;

  const paidTotal = data.payments
    .filter(p => p.status === "paid")
    .reduce((sum, p) => sum + Number(p.amount), 0);

  document.querySelector("#stat-rooms").textContent = data.rooms.length;
  document.querySelector("#stat-bookings").textContent = activeBookings;
  document.querySelector("#stat-guests").textContent =
    data.users.filter(u => u.role === "guest").length;
  document.querySelector("#stat-paid").textContent = money(paidTotal);

  const bookingsBody = document.querySelector("#admin-bookings-body");

  bookingsBody.innerHTML = data.bookings.length
    ? data.bookings.map(booking => {
        const guest = data.users.find(u => u.id === booking.userId);
        const room = data.rooms.find(r => r.id === booking.roomId);

        return `
          <tr>
            <td>${booking.id}</td>
            <td>${escapeHtml(guest?.fullName || "Невідомо")}</td>
            <td>${escapeHtml(room?.number || "—")}</td>
            <td>${escapeHtml(booking.checkIn)} - ${escapeHtml(booking.checkOut)}</td>
            <td><span class="status-pill status-${booking.status}">${booking.status}</span></td>
            <td>${money(booking.totalPrice)}</td>
            <td>
              <form class="inline-form" data-booking-status="${booking.id}">
                <select name="status">
                  ${["pending","confirmed","cancelled","completed"].map(s =>
                    `<option value="${s}" ${booking.status === s ? "selected" : ""}>${s}</option>`
                  ).join("")}
                </select>
                <button class="button button-small" type="submit">Зберегти</button>
              </form>
            </td>
          </tr>
        `;
      }).join("")
    : `<tr><td colspan="7">Бронювань поки немає.</td></tr>`;

  document.querySelectorAll("[data-booking-status]").forEach(form => {
    form.addEventListener("submit", event => {
      event.preventDefault();
      const booking = data.bookings.find(b => b.id === Number(form.dataset.bookingStatus));
      if (!booking) return;
      booking.status = form.elements.status.value;
      saveData();
      renderAdmin();
      showToast("Статус бронювання оновлено.", "success");
    });
  });

  const roomsBody = document.querySelector("#admin-rooms-body");

  roomsBody.innerHTML = data.rooms.map(room => `
    <tr>
      <td>${room.id}</td>
      <td>${escapeHtml(room.number)}</td>
      <td>${escapeHtml(room.type)}</td>
      <td>${money(room.price)}</td>
      <td><span class="status-pill status-${room.status}">${room.status}</span></td>
      <td>
        <form class="inline-form" data-room-status="${room.id}">
          <select name="status">
            ${["available","maintenance","inactive"].map(s =>
              `<option value="${s}" ${room.status === s ? "selected" : ""}>${s}</option>`
            ).join("")}
          </select>
          <button class="button button-small" type="submit">Зберегти</button>
        </form>
      </td>
    </tr>
  `).join("");

  document.querySelectorAll("[data-room-status]").forEach(form => {
    form.addEventListener("submit", event => {
      event.preventDefault();
      const room = data.rooms.find(r => r.id === Number(form.dataset.roomStatus));
      if (!room) return;
      room.status = form.elements.status.value;
      saveData();
      renderAdmin();
      showToast("Статус номера оновлено.", "success");
    });
  });

  const paymentsBody = document.querySelector("#admin-payments-body");

  paymentsBody.innerHTML = data.payments.length
    ? data.payments.map(payment => `
      <tr>
        <td>${payment.id}</td>
        <td>${payment.bookingId}</td>
        <td>${money(payment.amount)}</td>
        <td>${escapeHtml(payment.method)}</td>
        <td><span class="status-pill status-${payment.status}">${payment.status}</span></td>
      </tr>
    `).join("")
    : `<tr><td colspan="5">Платежів поки немає.</td></tr>`;
}

function setupPaymentForm() {
  const form = document.querySelector("#payment-form");
  if (!form) return;

  form.addEventListener("submit", event => {
    event.preventDefault();

    const bookingId = Number(form.elements.booking_id.value);
    const amount = Number(form.elements.amount.value);
    const method = form.elements.method.value;
    const status = form.elements.status.value;

    const booking = data.bookings.find(b => b.id === bookingId);

    if (!booking) {
      showToast("Бронювання з таким ID не знайдено.", "danger");
      return;
    }

    if (amount < 0) {
      showToast("Сума не може бути від'ємною.", "danger");
      return;
    }

    data.payments.push({
      id: nextId(data.payments),
      bookingId,
      amount,
      method,
      status,
      createdAt: new Date().toISOString()
    });

    saveData();
    form.reset();
    renderAdmin();
    showToast("Платіж додано.", "success");
  });
}

function setupResetDemo() {
  const button = document.querySelector("[data-reset-demo]");
  if (!button) return;

  button.addEventListener("click", () => {
    if (!confirm("Очистити локальні дані HotelBook і повернути демо-стан?")) return;
    localStorage.removeItem(STORAGE_KEY);
    location.reload();
  });
}

function init() {
  setupNavigation();
  renderHeader();
  setupFlash();
  setTodayDefaults();

  setupSearchForm();
  renderRooms();

  setupLogin();
  setupRegister();
  setupBookingsPage();

  setupAdminPage();
  setupPaymentForm();
  setupResetDemo();
}

document.addEventListener("DOMContentLoaded", init);
