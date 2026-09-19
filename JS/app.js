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

  if (old) {
    old.remove();
  }

  const toast = document.createElement("div");

  toast.className = "toast";
  toast.textContent = message;

  if (type === "success") {
    toast.style.borderLeft = "4px solid #22c55e";
  }
  if (type === "danger") {
    toast.style.borderLeft = "4px solid #ef4444";
  }

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.remove();
    }, 3000);
}

let currentUser = null;

function getUser() {
  return currentUser;
}

async function loadCurrentUser() {
  try {
    currentUser = await getCurrentUser();
  } catch {
    currentUser = null;
  }
}

function normalizeRoom(room) {
  return {
    id: room.room_id ?? room.id,
    number: room.room_number ?? room.number ?? "",
    type: room.room_type ?? room.type ?? "",
    capacity: Number(room.capacity ?? 0),
    price: Number(room.nightly_price
        ?? room.price
        ?? room.base_price
        ?? 0),
    nights: Number(room.nights ?? 0),
    previewTotal: Number(room.preview_total ?? 0),
    status: room.status ?? "available"
  };
}

function normalizeBooking(booking) {
  return {
    id: booking.booking_id ?? booking.id,
    userId: booking.user_id ?? booking.userId,
    checkIn: booking.check_in_date ?? booking.checkIn ?? "",
    checkOut: booking.check_out_date ?? booking.checkOut ?? "",
    status: booking.status ?? "pending",
    adults: Number(booking.adults ?? 1),
    children: Number(booking.children ?? 0),
    nightlyRate: (booking.nightly_rate ?? 0),
    totalPrice: Number(booking.total_price ?? booking.totalPrice ?? 0),
    comment: booking.comment ?? "",
    guestName: booking.guest_name ?? booking.guest?.fullName ?? "Невідомо",
    roomNumber: booking.room_number ?? booking.room?.number ?? "---",
    roomType: booking.room_type ?? booking.room?.type ?? "---",
    paidAmount: Number(booking.paid_amount ?? booking.paidAmount ?? 0)
  };
}

function normalizePayment(payment) {
  return {
    id: payment.payment_id ?? payment.id,
    bookingId: payment.booking_id ?? payment.bookingId,
    amount: Number(payment.amount ?? 0),
    method: payment.method ?? "",
    status: payment.status ?? "pending"
  };
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
    ${getUser()?.role_code === "guest"
      ? '<a class="nav-link-button" href="bookings.html">Мої бронювання</a>'
      : '<a class="nav-link-button" href="admin.html">Адмінка</a>'}
    <button class="button button-outline" type="button" data-logout>Вийти</button>
  `;

  actions.querySelector("[data-logout]").addEventListener("click", async() => {
    try {
      await logoutUser();
      currentUser = null;
      location.href = "index.html";
    } catch (error) {
      showToast(error.message, "danger")
    }
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

async function renderRooms() {
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
  try {
    const rawRooms = await getRooms(search);
    const rooms = rawRooms.map(normalizeRoom);

    count.textContent =
        `${rooms.length} варіантів`;

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
  
        ${getUser()?.role_code === "guest"
        ? `
            <form class="room-book-form" data-book-room="${room.id}">
              <input type="text" name="comment" placeholder="Коментар до бронювання">
              <button class="button" type="submit">Забронювати</button>
            </form>
          `
        : getUser()?.role_code === "admin"
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
  } catch (error) {
    container.innerHTML = "";
    empty.textContent = "Не вдалося хавантажити  номери.";
    empty.hidden = false;
    count.textContent = "";
    showToast(error.message, "danger");
  }
}

async function createBooking(roomId, comment) {
  const user = getUser();

  if (!user || user.role_code !== "guest") {
    location.href = "login.html";
    return;
  }

  const search = getSearchParams();
  const nights = dateDiff(search.checkIn, search.checkOut);

  if (nights <= 0) {
    showToast("Неможливо створити бронювання.", "danger");
    return;
  }

  try {
    const result = await createBookingRequest({
      room_id: roomId,
      check_in: search.checkIn,
      check_out: search.checkOut,
      adults: search.adults,
      children: search.children,
      comment: comment.trim()
    });

    if (result?.legacy) {
      showToast(
          "Запит на бронювання відправлено.",
          "success"
      );

      return;
    }
    showToast("Бронювання створено.", "success")

    setTimeout(() => {
      location.href = "bookings.html"
    }, 500);
  } catch (error) {
    showToast(error.message, "danger");
  }
}

function setupLogin() {
  const form = document.querySelector("#login-form");
  if (!form) return;

  form.addEventListener("submit", async event => {
    event.preventDefault();

    const email = form.elements.email.value.trim().toLowerCase();
    const password = form.elements.password.value;

    try {
      const result = await loginUser(email,password);

      currentUser = result;
      showToast("Ви успішно увійшли","success")
      setTimeout(() => {
        location.href =
            currentUser.role_code === "admin" ? "admin.html" : "index.html";
      }, 400)
    } catch (error) {
      showToast(error.message, "danger")
    }
  });
}

function setupRegister() {
  const form = document.querySelector("#register-form");
  if (!form) return;

  form.addEventListener("submit", async event => {
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

    try {
      const result = await registerUser({
        full_name: fullName,
        phone,
        document: documentNumber,
        email,
        password
      });

      currentUser = result;

      showToast("Акканут створено.","success");

      setTimeout(() => {
        location.href ="index.html";
      },400)

    } catch (error) {
      showToast(error.message, "danger")
    }
  });
}

async function setupBookingsPage() {
  const container = document.querySelector("#bookings-container");
  if (!container) return;

  const user = getUser();

  if (!user || user.role_code !== "guest") {
    container.innerHTML = `
      <div class="empty-state">
        Увійдіть як гість, щоб переглянути свої бронювання.
        <br><br>
        <a class="button button-small" href="login.html">Увійти</a>
      </div>
    `;
    return;
  }

  try {
    const rawBookings = await getBookings();
    const bookings = rawBookings.map(normalizeBooking);

    if (!bookings.length) {
      container.innerHTML = `
        <div class="empty-state">
          У Вас поки що немає бронювань.
        </div>
      `;
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
              const paid = booking.paidAmount ?? 0;
  
              return `
                <tr>
                  <td>${booking.id}</td>
                  <td>${escapeHtml(booking.roomNumber)} / ${escapeHtml(booking.roomType)}</td>
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
  } catch (error) {
      container.innerHTML = `
        <div class="empty-state">
            Не вдалося завантажити бронювання.
        </div>
      `;

      showToast(error.message, "damger");
  }


}

async function setupAdminPage() {
  const page = document.querySelector("[data-admin-page]");
  if (!page) return;

  const user = getUser();

  if (!user || user.role_code !== "admin") {
    page.innerHTML = `
      <div class="empty-state">
        Доступ до адмін-панелі мають лише адміністратори.
        <br><br>
        <a class="button button-small" href="login.html">Увійти</a>
      </div>
    `;
    return;
  }

  await renderAdmin();
}

async function renderAdmin() {

  let bookings = [];
  let rooms = [];
  let payments = [];

  try {
    const rawBookings = await getAdminBookings();
    bookings = rawBookings.map(normalizeBooking);
  } catch (error) {
    showToast(error.message,"danger")
  }
  try {
    const rawRooms = await getAdminRooms();
    rooms = rawRooms.map(normalizeRoom);
  } catch (error) {
    showToast(error.message,"danger");
  }
  try {
    const rawPayments = await getPayments();
    payments = rawPayments.map(normalizePayment);
  } catch (error) {
    showToast(error.message, "danger")
  }
    const activeBookings = bookings.filter(
        b => !["cancelled", "completed"]
            .includes(b.status)).length

    const paidTotal = payments.filter(p => p.status === "paid")
        .reduce((sum,p) => sum + Number(p.amount), 0);



    document.querySelector("#stat-rooms").textContent = rooms.length.toString();
    document.querySelector("#stat-bookings").textContent = activeBookings.toString();

    const uniqueGuests = new Set(bookings.map(b => b.userId)).size;

    document.querySelector("#stat-guests").textContent = uniqueGuests.toString();
    document.querySelector("#stat-paid").textContent = money(paidTotal);

    const bookingsBody = document.querySelector("#admin-bookings-body");
    bookingsBody.innerHTML = bookings.length
        ? bookings.map(booking => {
          return `
            <tr>
              <td>${booking.id}</td>
              <td>${escapeHtml(booking.guestName || "Невідомо")}</td>
              <td>${escapeHtml(booking.roomNumber || "—")}</td>
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
        }).join("") : `<tr><td colspan="7">Бронювань поки немає</td>></tr>`;

    document.querySelectorAll("[data-booking-status]").forEach(form => {
      form.addEventListener("submit", async event => {
        event.preventDefault();

        const bookingId = Number(form.dataset.bookingStatus);

        const status = form.elements.status.value;

        try {
          const result = await updateBookingStatus(bookingId,status);
          if (result?.legacy) {
            showToast("Статус бронювання оновлено.", "success");
          } else {
            showToast("Статус бронювання оновлено.", "success");
          }

          await renderAdmin();
        } catch (error) {
          showToast(error.message, "danger");
        }
      });
    });
    const roomsBody = document.querySelector("#admin-rooms-body");
    roomsBody.innerHTML = rooms.map(room => `
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
      form.addEventListener("submit", async event => {
        event.preventDefault();

        const roomId = Number(form.dataset.roomStatus);
        const status = form.elements.status.value;
        try {
          const result = await updateRoomStatus(roomId, status);
          if (result?.legacy) {
            showToast("Запит на зміну статусу номера відправлено.", "success");
          } else {
          showToast("Статус номера оновлено.", "success");
          }

          await renderAdmin();
        } catch (error) {
          showToast(error.message,"danger");
        }
      });
    });

    const paymentsBody = document.querySelector("#admin-payments-body");
    paymentsBody.innerHTML = payments.length
        ? payments.map(payment => `
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

  form.addEventListener("submit", async event => {
    event.preventDefault();

    const bookingId = Number(form.elements.booking_id.value);
    const amount = Number(form.elements.amount.value);
    const method = form.elements.method.value;
    const status = form.elements.status.value;

    if (!Number.isFinite(amount)) {
      showToast("Сума платежу вказана неправильно.", "danger")
      return;
    }

    if (amount < 0) {
      showToast("Сума не може бути від'ємною.", "danger");
      return;
    }
    try {
      const result = await createPayment({
        booking_id: bookingId,
        amount,
        method,
        status});

      form.reset();

      if (result?.legacy) {
          showToast("Платіж відправлено.", "success");
      } else {
          showToast("Платіж додано.", "success");
      }

      await renderAdmin();

    } catch (error) {
      showToast(error.message, "danger");
    }

  });
}

async function init() {
  setupNavigation();
  setupFlash();
  setTodayDefaults();

  await loadCurrentUser();
  renderHeader();

  setupSearchForm();
  await renderRooms();

  setupLogin();
  setupRegister();
  await setupBookingsPage();


  await setupAdminPage();
  setupPaymentForm();
}

document.addEventListener("DOMContentLoaded", init);
