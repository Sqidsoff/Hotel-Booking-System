import { api } from "./api.js";

const state = { user: null, adminRefreshing: false, adminTimer: null };

export function dateDiff(start, end) {
  return Math.ceil((new Date(`${end}T00:00:00Z`) - new Date(`${start}T00:00:00Z`)) / 86400000);
}

export function normalizeRoom(room) {
  return { id: Number(room.room_id), number: room.room_number, type: room.room_type, price: Number(room.nightly_price), capacity: Number(room.capacity), status: room.status };
}

export function normalizeBooking(booking) {
  return {
    id: Number(booking.booking_id),
    checkIn: String(booking.check_in_date).slice(0, 10),
    checkOut: String(booking.check_out_date).slice(0, 10),
    status: booking.status,
    totalPrice: Number(booking.total_price),
    paidAmount: Number(booking.paid_amount || 0),
    roomNumber: booking.room_number,
    roomType: booking.room_type,
    guestName: booking.guest_name
  };
}

export function bookingPayload(roomId, search, comment) {
  return { room_id: roomId, check_in: search.checkIn, check_out: search.checkOut, adults: search.adults, children: search.children, comment: comment.trim() };
}

export function canCancelBooking(booking, now = new Date()) {
  return ["pending", "confirmed"].includes(booking.status) && new Date(`${booking.checkIn}T00:00:00Z`).getTime() - now.getTime() >= 86400000;
}

export function errorMessage(error) {
  const messages = {
    invalid_credentials: "Невірний email або пароль.", required: "Заповніть усі обов'язкові поля.", short_password: "Пароль повинен містити щонайменше 6 символів.",
    duplicate: "Користувач з таким email або документом вже існує.", invalid_dates: "Дата виїзду повинна бути пізніше дати заїзду.", invalid_guests: "Перевірте кількість гостей.",
    room_unavailable: "Номер зараз недоступний.", room_overlap: "Номер уже зайнятий на вибрані дати.", too_late: "До заїзду залишилося менше 24 годин.",
    not_cancellable: "Це бронювання не можна скасувати.", invalid_payment: "Перевірте суму, метод і статус платежу.", not_found: "Запис не знайдено."
  };
  if (messages[error?.code]) return messages[error.code];
  if (error?.status >= 500 || !error?.status) return "Сервіс тимчасово недоступний.";
  return "Не вдалося виконати операцію.";
}

const escapeHtml = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
const money = (value) => `${Number(value || 0).toFixed(2)} грн`;
const userRole = () => state.user?.role_code || null;

function showToast(message, type = "info") {
  document.querySelector(".toast")?.remove();
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  if (type === "success") toast.style.borderLeft = "4px solid #22c55e";
  if (type === "danger") toast.style.borderLeft = "4px solid #ef4444";
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

function setBusy(form, busy) {
  const button = form?.querySelector('button[type="submit"]');
  if (!button) return;
  if (busy) button.dataset.label = button.textContent;
  button.disabled = busy;
  button.textContent = busy ? "Зачекайте..." : button.dataset.label || button.textContent;
}

async function loadSession() {
  try { state.user = (await api.me()).user; }
  catch (error) { if (error.status !== 401) showToast(errorMessage(error), "danger"); state.user = null; }
}

function setupNavigation() {
  const toggle = document.querySelector("[data-nav-toggle]");
  const menu = document.querySelector("[data-nav-menu]");
  const actions = document.querySelector(".nav-actions");
  toggle?.addEventListener("click", () => { menu?.classList.toggle("is-open"); actions?.classList.toggle("is-open"); });
}

function renderHeader() {
  const actions = document.querySelector(".nav-actions");
  if (!actions) return;
  if (!state.user) {
    actions.innerHTML = '<a class="nav-link-button" href="/login">Увійти</a><a class="button button-small" href="/register">Реєстрація</a>';
    return;
  }
  const link = userRole() === "admin" ? '<a class="nav-link-button" href="/admin">Адмінка</a>' : '<a class="nav-link-button" href="/bookings">Мої бронювання</a>';
  actions.innerHTML = `${link}<button class="button button-outline" type="button" data-logout>Вийти</button>`;
  actions.querySelector("[data-logout]").addEventListener("click", async () => { try { await api.logout(); } catch {} location.href = "/"; });
}

function setTodayDefaults() {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const format = (date) => date.toISOString().slice(0, 10);
  const checkIn = document.querySelector("#check-in");
  const checkOut = document.querySelector("#check-out");
  if (checkIn && !checkIn.value) checkIn.value = format(today);
  if (checkOut && !checkOut.value) checkOut.value = format(tomorrow);
}

function getSearchParams() {
  const params = new URLSearchParams(location.search);
  return { destination: params.get("destination") || "", checkIn: params.get("check_in") || "", checkOut: params.get("check_out") || "", adults: Number(params.get("adults") || 1), children: Number(params.get("children") || 0) };
}

function setupSearchForm() {
  const form = document.querySelector("#search-form");
  if (!form) return;
  const search = getSearchParams();
  form.elements.destination.value = search.destination;
  form.elements.check_in.value = search.checkIn;
  form.elements.check_out.value = search.checkOut;
  form.elements.adults.value = search.adults;
  form.elements.children.value = search.children;
  form.addEventListener("submit", (event) => {
    if (dateDiff(form.elements.check_in.value, form.elements.check_out.value) <= 0) { event.preventDefault(); showToast("Дата виїзду повинна бути пізніше дати заїзду.", "danger"); }
  });
}

async function renderRooms() {
  const container = document.querySelector("#rooms-container");
  const empty = document.querySelector("#rooms-empty");
  const count = document.querySelector("#results-count");
  if (!container || !empty || !count) return;
  const search = getSearchParams();
  if (!search.checkIn || !search.checkOut) { empty.textContent = "Оберіть дати, щоб побачити доступні номери."; return; }
  const nights = dateDiff(search.checkIn, search.checkOut);
  if (nights <= 0 || search.adults < 1 || search.children < 0) { empty.textContent = "Перевірте дати та кількість гостей."; return; }
  try {
    const result = await api.rooms({ destination: search.destination, check_in: search.checkIn, check_out: search.checkOut, capacity: search.adults + search.children });
    const rooms = result.rooms.map(normalizeRoom);
    count.textContent = `${rooms.length} варіантів`;
    empty.hidden = rooms.length > 0;
    if (!rooms.length) { container.innerHTML = ""; empty.textContent = "На вибрані дати вільних номерів немає."; return; }
    container.innerHTML = rooms.map((room) => `<article class="room-card"><div class="room-card-top"><div><p class="room-kicker">${escapeHtml(room.type)}</p><h3>Номер ${escapeHtml(room.number)}</h3></div><span class="pill">до ${room.capacity} осіб</span></div><div class="room-price">${money(room.price)} <span>/ ніч</span></div><p class="room-meta">${nights} ночі · орієнтовна сума ${money(room.price * nights)}</p>${userRole() === "guest" ? `<form class="room-book-form" data-book-room="${room.id}"><input type="text" name="comment" placeholder="Коментар до бронювання"><button class="button" type="submit">Забронювати</button></form>` : userRole() === "admin" ? '<div class="empty-inline">Бронювання від імені гостя недоступне в адмін-режимі.</div>' : '<a class="button" href="/login">Увійти для бронювання</a>'}</article>`).join("");
    container.querySelectorAll("[data-book-room]").forEach((form) => form.addEventListener("submit", async (event) => {
      event.preventDefault(); setBusy(form, true);
      try { await api.createBooking(bookingPayload(Number(form.dataset.bookRoom), search, form.elements.comment.value)); showToast("Бронювання створено.", "success"); setTimeout(() => { location.href = "/bookings"; }, 350); }
      catch (error) { showToast(errorMessage(error), "danger"); setBusy(form, false); }
    }));
  } catch (error) { empty.hidden = false; empty.textContent = errorMessage(error); }
}

function setupLogin() {
  const form = document.querySelector("#login-form");
  if (!form) return;
  form.addEventListener("submit", async (event) => {
    event.preventDefault(); setBusy(form, true);
    try { const result = await api.login(form.elements.email.value.trim().toLowerCase(), form.elements.password.value); showToast("Ви успішно увійшли.", "success"); setTimeout(() => { location.href = result.role === "admin" ? "/admin" : "/"; }, 300); }
    catch (error) { showToast(errorMessage(error), "danger"); setBusy(form, false); }
  });
}

function setupRegister() {
  const form = document.querySelector("#register-form");
  if (!form) return;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (form.elements.password.value.length < 6) { showToast("Пароль повинен містити щонайменше 6 символів.", "danger"); return; }
    setBusy(form, true);
    try {
      await api.register({ full_name: form.elements.full_name.value.trim(), phone: form.elements.phone.value.trim(), document: form.elements.document.value.trim(), email: form.elements.email.value.trim().toLowerCase(), password: form.elements.password.value });
      showToast("Акаунт створено.", "success"); setTimeout(() => { location.href = "/"; }, 300);
    } catch (error) { showToast(errorMessage(error), "danger"); setBusy(form, false); }
  });
}

async function setupBookingsPage() {
  const container = document.querySelector("#bookings-container");
  if (!container) return;
  if (userRole() !== "guest") { location.href = "/login"; return; }
  try {
    const bookings = (await api.bookings()).bookings.map(normalizeBooking);
    if (!bookings.length) { container.innerHTML = '<div class="empty-state">У Вас поки що немає бронювань.</div>'; return; }
    container.innerHTML = `<div class="table-card"><table class="data-table"><thead><tr><th>ID</th><th>Номер</th><th>Період</th><th>Статус</th><th>Сума</th><th>Оплачено</th><th>Дія</th></tr></thead><tbody>${bookings.map((booking) => `<tr><td>${booking.id}</td><td>${escapeHtml(booking.roomNumber)} / ${escapeHtml(booking.roomType)}</td><td>${escapeHtml(booking.checkIn)} - ${escapeHtml(booking.checkOut)}</td><td><span class="status-pill status-${booking.status}">${booking.status}</span></td><td>${money(booking.totalPrice)}</td><td>${money(booking.paidAmount)}</td><td>${canCancelBooking(booking) ? `<button class="button button-small" type="button" data-cancel-booking="${booking.id}">Скасувати</button>` : "—"}</td></tr>`).join("")}</tbody></table></div>`;
    container.querySelectorAll("[data-cancel-booking]").forEach((button) => button.addEventListener("click", async () => {
      if (!confirm(`Скасувати бронювання #${button.dataset.cancelBooking}?`)) return;
      button.disabled = true;
      try { await api.cancelBooking(Number(button.dataset.cancelBooking)); showToast("Бронювання скасовано.", "success"); await setupBookingsPage(); }
      catch (error) { showToast(errorMessage(error), "danger"); button.disabled = false; }
    }));
  } catch (error) { container.innerHTML = `<div class="empty-state">${escapeHtml(errorMessage(error))}</div>`; }
}

function renderAdminOverview(result) {
  const rooms = result.rooms.map(normalizeRoom);
  const bookings = result.bookings.map(normalizeBooking);
  const payments = result.payments || [];
  document.querySelector("#stat-rooms").textContent = rooms.length;
  document.querySelector("#stat-bookings").textContent = bookings.filter((booking) => !["cancelled", "completed"].includes(booking.status)).length;
  document.querySelector("#stat-guests").textContent = Number(result.stats?.guest_count || 0);
  document.querySelector("#stat-paid").textContent = money(result.stats?.paid_total);
  document.querySelector("#admin-bookings-body").innerHTML = bookings.length ? bookings.map((booking) => `<tr><td>${booking.id}</td><td>${escapeHtml(booking.guestName || "Невідомо")}</td><td>${escapeHtml(booking.roomNumber)}</td><td>${booking.checkIn} - ${booking.checkOut}</td><td><span class="status-pill status-${booking.status}">${booking.status}</span></td><td>${money(booking.totalPrice)}</td><td><form class="inline-form" data-booking-status="${booking.id}"><select name="status">${["pending", "confirmed", "cancelled", "completed"].map((status) => `<option value="${status}" ${booking.status === status ? "selected" : ""}>${status}</option>`).join("")}</select><button class="button button-small" type="submit">Зберегти</button></form></td></tr>`).join("") : '<tr><td colspan="7">Бронювань поки немає.</td></tr>';
  document.querySelector("#admin-rooms-body").innerHTML = rooms.length ? rooms.map((room) => `<tr><td>${room.id}</td><td>${escapeHtml(room.number)}</td><td>${escapeHtml(room.type)}</td><td>${money(room.price)}</td><td><span class="status-pill status-${room.status}">${room.status}</span></td><td><form class="inline-form" data-room-status="${room.id}"><select name="status">${["available", "maintenance", "inactive"].map((status) => `<option value="${status}" ${room.status === status ? "selected" : ""}>${status}</option>`).join("")}</select><button class="button button-small" type="submit">Зберегти</button></form></td></tr>`).join("") : '<tr><td colspan="6">Номерів поки немає.</td></tr>';
  document.querySelector("#admin-payments-body").innerHTML = payments.length ? payments.map((payment) => `<tr><td>${payment.payment_id}</td><td>${payment.booking_id}</td><td>${money(payment.amount)}</td><td>${escapeHtml(payment.method)}</td><td><span class="status-pill status-${payment.status}">${payment.status}</span></td></tr>`).join("") : '<tr><td colspan="5">Платежів поки немає.</td></tr>';
}

function bindAdminActions() {
  document.querySelectorAll("[data-booking-status]").forEach((form) => form.addEventListener("submit", async (event) => { event.preventDefault(); setBusy(form, true); try { await api.setBookingStatus(Number(form.dataset.bookingStatus), form.elements.status.value); showToast("Статус бронювання оновлено.", "success"); setBusy(form, false); await refreshAdmin(); } catch (error) { showToast(errorMessage(error), "danger"); setBusy(form, false); } }));
  document.querySelectorAll("[data-room-status]").forEach((form) => form.addEventListener("submit", async (event) => { event.preventDefault(); setBusy(form, true); try { await api.setRoomStatus(Number(form.dataset.roomStatus), form.elements.status.value); showToast("Статус номера оновлено.", "success"); setBusy(form, false); await refreshAdmin(); } catch (error) { showToast(errorMessage(error), "danger"); setBusy(form, false); } }));
}

async function refreshAdmin(silent = false) {
  if (state.adminRefreshing || document.querySelector(".inline-form button:disabled")) return;
  state.adminRefreshing = true;
  try { renderAdminOverview(await api.adminOverview()); bindAdminActions(); }
  catch (error) { if (!silent) showToast(errorMessage(error), "danger"); }
  finally { state.adminRefreshing = false; }
}

async function setupAdminPage() {
  const page = document.querySelector("[data-admin-page]");
  if (!page) return;
  if (userRole() !== "admin") { location.href = "/login"; return; }
  await refreshAdmin();
  state.adminTimer = setInterval(() => refreshAdmin(true), 5000);
}

function setupPaymentForm() {
  const form = document.querySelector("#payment-form");
  if (!form) return;
  form.addEventListener("submit", async (event) => {
    event.preventDefault(); setBusy(form, true);
    try { await api.addPayment(Number(form.elements.booking_id.value), { amount: Number(form.elements.amount.value), method: form.elements.method.value, status: form.elements.status.value }); form.reset(); showToast("Платіж додано.", "success"); await refreshAdmin(); }
    catch (error) { showToast(errorMessage(error), "danger"); setBusy(form, false); }
  });
}

async function init() {
  setupNavigation(); setTodayDefaults(); await loadSession(); renderHeader(); setupSearchForm(); setupLogin(); setupRegister(); setupPaymentForm();
  await Promise.all([renderRooms(), setupBookingsPage(), setupAdminPage()]);
}

if (typeof document !== "undefined") document.addEventListener("DOMContentLoaded", init);
