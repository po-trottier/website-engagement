/* ============================================
   RSVP Admin Dashboard
   ============================================ */

(function () {
  "use strict";

  var SAVE_ICON = '<svg class="icon" viewBox="0 0 24 24"><path d="M15,9H5V5H15M12,19A3,3 0 0,1 9,16A3,3 0 0,1 12,13A3,3 0 0,1 15,16A3,3 0 0,1 12,19M17,3H5C3.89,3 3,3.9 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V7L17,3Z"/></svg>';
  var NEW_PREFIX = "__new__";
  var PAGE_SIZE = 20;

  var rsvps = [];
  var pendingNew = [];
  var password = "";
  var adminEmail = "";
  var sortCol = "createdAt";
  var sortAsc = false;
  var selected = new Set();
  var dirty = new Set();
  var currentPage = 1;

  var loginEl = document.getElementById("login");
  var dashboardEl = document.getElementById("dashboard");
  var loginBtn = document.getElementById("login-btn");
  var loginError = document.getElementById("login-error");
  var passwordInput = document.getElementById("password");
  var cardsEl = document.getElementById("cards");
  var tableHead = document.getElementById("table-head");
  var tableBody = document.getElementById("table-body");
  var batchCount = document.getElementById("batch-count");
  var batchEmailBtn = document.getElementById("batch-email-btn");
  var batchDeleteBtn = document.getElementById("batch-delete-btn");
  var saveBtn = document.getElementById("save-btn");
  var addBtn = document.getElementById("add-btn");
  var exportBtn = document.getElementById("export-btn");
  var exportMenu = document.getElementById("export-menu");
  var exportCsv = document.getElementById("export-csv");
  var paginationEl = document.getElementById("pagination");
  var logoutBtn = document.getElementById("logout-btn");

  // ---------- API ----------
  function api(action, extra) {
    return fetch("/.netlify/functions/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.assign({ password: password, action: action }, extra || {})),
    }).then(function (res) { return res.json(); });
  }

  // ---------- Login ----------
  function login() {
    password = passwordInput.value;
    if (!password) return;

    loginBtn.disabled = true;
    loginBtn.textContent = "Loading...";
    loginError.style.display = "none";

    api("list").then(function (data) {
      if (data.error) {
        loginError.style.display = "block";
        loginBtn.disabled = false;
        loginBtn.textContent = "View RSVPs";
        password = "";
        return;
      }

      rsvps = data.rsvps;
      adminEmail = data.adminEmail || "";
      loginEl.style.display = "none";
      dashboardEl.style.display = "block";
      logoutBtn.style.display = "";
      renderCards();
      renderTable();
    }).catch(function () {
      loginError.textContent = "Could not reach server.";
      loginError.style.display = "block";
      loginBtn.disabled = false;
      loginBtn.textContent = "View RSVPs";
      password = "";
    });
  }

  loginBtn.addEventListener("click", login);
  passwordInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") login();
  });

  // ---------- Logout ----------
  logoutBtn.addEventListener("click", function () {
    password = "";
    rsvps = [];
    pendingNew = [];
    dirty.clear();
    selected.clear();
    dashboardEl.style.display = "none";
    logoutBtn.style.display = "none";
    loginEl.style.display = "";
    loginBtn.disabled = false;
    loginBtn.textContent = "View RSVPs";
    passwordInput.value = "";
    passwordInput.focus();
  });

  // ---------- Action bar state ----------
  function updateActionBar() {
    var count = selected.size;
    batchCount.textContent = count;
    batchEmailBtn.disabled = count === 0;
    batchDeleteBtn.disabled = count === 0;
    var totalDirty = dirty.size + pendingNew.length;
    saveBtn.disabled = totalDirty === 0;
    saveBtn.innerHTML = totalDirty > 0 ? SAVE_ICON + " " + totalDirty : SAVE_ICON;
  }

  // ---------- All rows (saved + pending) ----------
  function allRows() {
    return pendingNew.concat(rsvps);
  }

  // ---------- Summary cards ----------
  function renderCards() {
    var rows = allRows();
    var total = rows.length;
    var attending = rows.filter(function (r) { return r.attending; }).length;
    var declined = rows.filter(function (r) { return !r.attending; }).length;
    var plusOnes = rows
      .filter(function (r) { return r.attending; })
      .reduce(function (sum, r) { return sum + (r.plusOnes || 0); }, 0);

    cardsEl.innerHTML = [
      { value: total, label: "Responses" },
      { value: attending, label: "Attending" },
      { value: declined, label: "Declined" },
      { value: plusOnes, label: "Plus Ones" },
      { value: attending + plusOnes, label: "Total Guests" },
    ].map(function (c) {
      return '<div class="card"><div class="card-value">' + c.value + '</div><div class="card-label">' + c.label + '</div></div>';
    }).join("");
  }

  // ---------- Table ----------
  var columns = [
    { key: "name", label: "Name" },
    { key: "email", label: "Email" },
    { key: "phone", label: "Phone" },
    { key: "attending", label: "Attending" },
    { key: "plusOnes", label: "+1s" },
    { key: "createdAt", label: "Date" },
  ];

  function renderTable() {
    var rows = allRows();
    var allChecked = rows.length > 0 && selected.size === rows.length;

    tableHead.innerHTML =
      '<tr><th class="select-col"><input type="checkbox" id="select-all"' + (allChecked ? " checked" : "") + '></th>' +
      columns.map(function (col) {
        return '<th data-col="' + col.key + '">' + col.label + (sortCol === col.key ? (sortAsc ? " ▲" : " ▼") : "") + "</th>";
      }).join("") + "</tr>";

    // Pending new rows first (unsorted), then sorted saved rows
    var sorted = rsvps.slice().sort(function (a, b) {
      var av = a[sortCol], bv = b[sortCol];
      if (typeof av === "string") av = av.toLowerCase();
      if (typeof bv === "string") bv = bv.toLowerCase();
      if (typeof av === "boolean") { av = av ? 1 : 0; bv = bv ? 1 : 0; }
      if (av < bv) return sortAsc ? -1 : 1;
      if (av > bv) return sortAsc ? 1 : -1;
      return 0;
    });

    var all = pendingNew.concat(sorted);
    var totalPages = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
    if (currentPage > totalPages) currentPage = totalPages;
    var start = (currentPage - 1) * PAGE_SIZE;
    var display = all.slice(start, start + PAGE_SIZE);

    tableBody.innerHTML = display.map(function (r) {
      var isNew = r.id.indexOf(NEW_PREFIX) === 0;
      var checked = selected.has(r.id) ? " checked" : "";
      var isDirty = isNew || dirty.has(r.id);
      var rowClass = isNew ? ' class="row-new"' : "";
      var dateStr = isNew ? "New" : new Date(r.createdAt).toLocaleDateString();

      return '<tr data-id="' + esc(r.id) + '"' + rowClass + '>' +
        '<td class="select-col"><input type="checkbox" class="row-check"' + checked + '></td>' +
        '<td><input class="edit-field' + (isDirty ? " dirty" : "") + '" data-field="name" value="' + escAttr(r.name) + '"' + (isNew ? ' autofocus' : '') + '></td>' +
        '<td><input class="edit-field' + (isDirty ? " dirty" : "") + '" data-field="email" value="' + escAttr(r.email || "") + '"></td>' +
        '<td><input class="edit-field' + (isDirty ? " dirty" : "") + '" data-field="phone" value="' + escAttr(r.phone || "") + '"></td>' +
        '<td><select class="edit-field' + (isDirty ? " dirty" : "") + '" data-field="attending"><option value="true"' + (r.attending ? " selected" : "") + '>Yes</option><option value="false"' + (!r.attending ? " selected" : "") + '>No</option></select></td>' +
        '<td><input class="edit-field edit-field-small' + (isDirty ? " dirty" : "") + '" type="number" data-field="plusOnes" min="0" max="10" value="' + (r.plusOnes || 0) + '"></td>' +
        '<td class="td-date">' + dateStr + '</td></tr>';
    }).join("");

    renderPagination(all.length, totalPages);
    bindTableEvents(rows);
    updateActionBar();
  }

  function renderPagination(total, totalPages) {
    if (totalPages <= 1) {
      paginationEl.innerHTML = "";
      return;
    }

    // Show max 7 page buttons with ellipsis
    var pages = [];
    if (totalPages <= 7) {
      for (var pg = 1; pg <= totalPages; pg++) pages.push(pg);
    } else {
      pages.push(1);
      if (currentPage > 3) pages.push("...");
      for (var pg = Math.max(2, currentPage - 1); pg <= Math.min(totalPages - 1, currentPage + 1); pg++) {
        pages.push(pg);
      }
      if (currentPage < totalPages - 2) pages.push("...");
      pages.push(totalPages);
    }

    var html = '<button class="button button-icon" id="page-prev"' + (currentPage <= 1 ? " disabled" : "") + '><svg class="icon" viewBox="0 0 24 24"><path d="M15.41,16.58L10.83,12L15.41,7.41L14,6L8,12L14,18L15.41,16.58Z"/></svg></button>';

    for (var i = 0; i < pages.length; i++) {
      if (pages[i] === "...") {
        html += '<span class="pagination-ellipsis">&hellip;</span>';
      } else {
        html += '<button class="page-num' + (pages[i] === currentPage ? " active" : "") + '" data-page="' + pages[i] + '">' + pages[i] + '</button>';
      }
    }

    html += '<button class="button button-icon" id="page-next"' + (currentPage >= totalPages ? " disabled" : "") + '><svg class="icon" viewBox="0 0 24 24"><path d="M8.59,16.58L13.17,12L8.59,7.41L10,6L16,12L10,18L8.59,16.58Z"/></svg></button>';
    html += '<div class="pagination-info">' + total + ' total</div>';

    paginationEl.innerHTML = html;

    document.getElementById("page-prev").addEventListener("click", function () {
      if (currentPage > 1) { currentPage--; renderTable(); }
    });

    document.getElementById("page-next").addEventListener("click", function () {
      if (currentPage < totalPages) { currentPage++; renderTable(); }
    });

    paginationEl.querySelectorAll(".page-num").forEach(function (btn) {
      btn.addEventListener("click", function () {
        currentPage = parseInt(btn.dataset.page);
        renderTable();
      });
    });
  }

  function bindTableEvents(rows) {
    // Select all
    document.getElementById("select-all").addEventListener("change", function () {
      var check = this.checked;
      selected.clear();
      if (check) rows.forEach(function (r) { selected.add(r.id); });
      tableBody.querySelectorAll(".row-check").forEach(function (cb) { cb.checked = check; });
      updateActionBar();
    });

    // Row checkboxes
    tableBody.querySelectorAll(".row-check").forEach(function (cb) {
      cb.addEventListener("change", function () {
        var id = cb.closest("tr").dataset.id;
        if (cb.checked) selected.add(id); else selected.delete(id);
        document.getElementById("select-all").checked = selected.size === rows.length;
        updateActionBar();
      });
    });

    // Dirty tracking
    tableBody.querySelectorAll(".edit-field").forEach(function (field) {
      function markDirty() {
        var id = field.closest("tr").dataset.id;
        if (id.indexOf(NEW_PREFIX) === 0) return; // already tracked as new
        dirty.add(id);
        field.closest("tr").querySelectorAll(".edit-field").forEach(function (f) {
          f.classList.add("dirty");
        });
        updateActionBar();
      }
      field.addEventListener("input", markDirty);
      field.addEventListener("change", markDirty);
    });

    // Sort
    tableHead.querySelectorAll("th[data-col]").forEach(function (th) {
      th.addEventListener("click", function () {
        var col = th.dataset.col;
        if (sortCol === col) sortAsc = !sortAsc;
        else { sortCol = col; sortAsc = true; }
        renderTable();
      });
    });
  }

  // ---------- Read fields from a row ----------
  function readRowFields(tr) {
    var fields = {};
    tr.querySelectorAll(".edit-field").forEach(function (input) {
      var field = input.dataset.field;
      var value = input.value;
      if (field === "attending") value = value === "true";
      if (field === "plusOnes") value = parseInt(value) || 0;
      fields[field] = value;
    });
    return fields;
  }

  // ---------- Validate fields ----------
  function validateFields(fields) {
    if (!fields.name || fields.name.trim().split(/\s+/).length < 2) {
      return "Please enter a first and last name.";
    }
    if (fields.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email)) {
      return "Invalid email: " + fields.email;
    }
    if (fields.phone && fields.phone.replace(/\D/g, "").length < 10) {
      return "Invalid phone number.";
    }
    return null;
  }

  // ---------- Save ----------
  saveBtn.addEventListener("click", async function () {
    var totalDirty = dirty.size + pendingNew.length;
    if (totalDirty === 0) return;

    // Validate all dirty/new rows first
    var allIds = Array.from(dirty).concat(pendingNew.map(function (r) { return r.id; }));
    for (var v = 0; v < allIds.length; v++) {
      var tr = tableBody.querySelector('tr[data-id="' + allIds[v] + '"]');
      if (!tr) continue;
      var err = validateFields(readRowFields(tr));
      if (err) {
        alert(err);
        tr.querySelector('.edit-field[data-field="name"]').focus();
        return;
      }
    }

    saveBtn.disabled = true;
    saveBtn.innerHTML = SAVE_ICON + " ...";

    // Save existing dirty rows
    var dirtyIds = Array.from(dirty);
    for (var i = 0; i < dirtyIds.length; i++) {
      var id = dirtyIds[i];
      var tr = tableBody.querySelector('tr[data-id="' + id + '"]');
      if (!tr) continue;
      var fields = readRowFields(tr);

      try {
        var data = await api("update", { id: id, fields: fields });
        if (data.rsvp) {
          var idx = rsvps.findIndex(function (r) { return r.id === id; });
          if (idx !== -1) rsvps[idx] = data.rsvp;
        }
      } catch { /* continue */ }
    }

    // Create pending new rows
    var newRows = pendingNew.slice();
    for (var j = 0; j < newRows.length; j++) {
      var newId = newRows[j].id;
      var tr = tableBody.querySelector('tr[data-id="' + newId + '"]');
      if (!tr) continue;
      var fields = readRowFields(tr);

      try {
        var data = await api("create", { fields: fields });
        if (data.rsvp) rsvps.unshift(data.rsvp);
      } catch { /* continue */ }
    }

    pendingNew = [];
    dirty.clear();
    renderCards();
    renderTable();
  });

  // ---------- Add guest (inline) ----------
  addBtn.addEventListener("click", function () {
    currentPage = 1;
    var tempId = NEW_PREFIX + Date.now();
    pendingNew.push({
      id: tempId,
      name: "",
      email: "",
      phone: "",
      attending: true,
      plusOnes: 0,
      createdAt: new Date().toISOString(),
    });
    renderCards();
    renderTable();

    // Focus the name field of the new row
    var newRow = tableBody.querySelector('tr[data-id="' + tempId + '"]');
    if (newRow) newRow.querySelector('.edit-field[data-field="name"]').focus();
  });

  // ---------- Batch email ----------
  batchEmailBtn.addEventListener("click", function () {
    var emails = [];
    allRows().forEach(function (r) {
      if (selected.has(r.id) && r.email) emails.push(r.email);
    });

    if (emails.length === 0) {
      alert("None of the selected guests have an email address.");
      return;
    }

    var to = encodeURIComponent(adminEmail || "");
    var bcc = encodeURIComponent(emails.join(","));
    var subject = encodeURIComponent("P-O & Athena's Engagement Party");
    window.location.href = "mailto:" + to + "?bcc=" + bcc + "&subject=" + subject;
  });

  // ---------- Batch delete ----------
  batchDeleteBtn.addEventListener("click", async function () {
    var count = selected.size;
    if (!confirm("Delete " + count + " selected RSVP(s)? This cannot be undone.")) return;

    batchDeleteBtn.disabled = true;
    var ids = Array.from(selected);

    for (var i = 0; i < ids.length; i++) {
      var id = ids[i];
      // Remove pending new rows locally
      if (id.indexOf(NEW_PREFIX) === 0) {
        pendingNew = pendingNew.filter(function (r) { return r.id !== id; });
        continue;
      }
      // Delete saved rows via API
      try {
        await api("delete", { id: id });
        rsvps = rsvps.filter(function (r) { return r.id !== id; });
      } catch { /* continue */ }
    }

    selected.clear();
    dirty = new Set(Array.from(dirty).filter(function (id) {
      return rsvps.some(function (r) { return r.id === id; });
    }));
    renderCards();
    renderTable();
  });

  // ---------- Export popover ----------
  exportBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    exportMenu.classList.toggle("open");
  });

  document.addEventListener("click", function () {
    exportMenu.classList.remove("open");
  });

  exportCsv.addEventListener("click", function () {
    exportMenu.classList.remove("open");
    var header = "Name,Email,Phone,Attending,Plus Ones,Date";
    var rows = rsvps.map(function (r) {
      return [
        csvField(r.name),
        csvField(r.email || ""),
        csvField(r.phone || ""),
        r.attending ? "Yes" : "No",
        r.attending ? r.plusOnes || 0 : 0,
        new Date(r.createdAt).toISOString().slice(0, 10),
      ].join(",");
    });
    var csv = header + "\n" + rows.join("\n");
    var blob = new Blob([csv], { type: "text/csv" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "rsvps.csv";
    a.click();
    URL.revokeObjectURL(url);
  });

  // ---------- Helpers ----------
  function esc(str) {
    var d = document.createElement("div");
    d.textContent = str;
    return d.innerHTML;
  }

  function escAttr(str) {
    return str.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function csvField(val) {
    if (val.includes(",") || val.includes('"') || val.includes("\n")) {
      return '"' + val.replace(/"/g, '""') + '"';
    }
    return val;
  }
})();
