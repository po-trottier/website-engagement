/* ============================================
   Engagement Party RSVP — Frontend Logic
   ============================================ */

(function () {
  "use strict";

  // ---------- RSVP deadline check ----------
  const RSVP_DEADLINE = new Date("2026-06-02T00:00:00-07:00");

  const rsvpActive = document.getElementById("rsvp-active");
  const rsvpExpired = document.getElementById("rsvp-expired");

  if (new Date() >= RSVP_DEADLINE) {
    rsvpActive.style.display = "none";
    rsvpExpired.style.display = "block";
  }

  // ---------- Countdown ----------
  const EVENT_DATE = new Date("2026-07-26T11:00:00-07:00");
  const countdownEl = document.getElementById("countdown");
  const countdownInner = document.getElementById("countdown-inner");
  const countdownMessage = document.getElementById("countdown-message");
  const countdownLegend = document.getElementById("countdown-legend");
  const cdDays = document.getElementById("cd-days");
  const cdHours = document.getElementById("cd-hours");
  const cdMinutes = document.getElementById("cd-minutes");
  const cdSeconds = document.getElementById("cd-seconds");
  let countdownExpired = false;

  function updateCountdown() {
    if (countdownExpired) return;

    const diff = EVENT_DATE - new Date();

    if (diff <= 0) {
      countdownExpired = true;
      countdownInner.style.display = "none";
      countdownMessage.style.display = "block";
      countdownLegend.textContent = "The day is here";
      countdownEl.removeAttribute("href");
      countdownEl.style.pointerEvents = "none";
      return;
    }

    cdDays.textContent = Math.floor(diff / 86400000);
    cdHours.textContent = Math.floor((diff % 86400000) / 3600000);
    cdMinutes.textContent = Math.floor((diff % 3600000) / 60000);
    cdSeconds.textContent = Math.floor((diff % 60000) / 1000);
  }

  updateCountdown();
  setInterval(updateCountdown, 1000);

  // ---------- Calendar dropdown ----------
  const calendarLink = document.getElementById("calendar-link");
  const calendarDropdown = document.getElementById("calendar-dropdown");

  if (calendarLink && calendarDropdown) {
    calendarLink.addEventListener("click", function (e) {
      e.preventDefault();
      calendarDropdown.classList.toggle("open");
    });

    document.addEventListener("click", function (e) {
      if (!e.target.closest("#calendar-trigger")) {
        calendarDropdown.classList.remove("open");
      }
    });
  }

  // ---------- Hamburger menu ----------
  const hamburger = document.getElementById("hamburger");
  const mobileOverlay = document.getElementById("mobile-overlay");

  function openMenu() {
    hamburger.classList.add("open");
    hamburger.setAttribute("aria-expanded", "true");
    mobileOverlay.classList.add("open");
  }

  function closeMenu() {
    hamburger.classList.remove("open");
    hamburger.setAttribute("aria-expanded", "false");
    mobileOverlay.classList.remove("open");
  }

  hamburger.addEventListener("click", function () {
    if (mobileOverlay.classList.contains("open")) {
      closeMenu();
    } else {
      openMenu();
    }
  });

  mobileOverlay.querySelectorAll("a").forEach(function (link) {
    link.addEventListener("click", function () {
      closeMenu();
    });
  });

  // ---------- Scroll animations (Intersection Observer) ----------
  const fadeEls = document.querySelectorAll(".fade-up");

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 }
    );
    fadeEls.forEach((el) => observer.observe(el));
  } else {
    // Fallback: just show everything
    fadeEls.forEach((el) => el.classList.add("visible"));
  }

  // ---------- Sticky nav background ----------
  const nav = document.getElementById("navigation");

  window.addEventListener("scroll", () => {
    if (window.scrollY > 60) {
      nav.classList.add("scrolled");
    } else {
      nav.classList.remove("scrolled");
    }
  }, { passive: true });

  // ---------- Attending toggle → show/hide +1s ----------
  const attendingYes = document.getElementById("attending-yes");
  const attendingNo = document.getElementById("attending-no");
  const plusOnesGroup = document.getElementById("plus-ones-group");

  function updatePlusOnes() {
    if (attendingYes.checked) {
      plusOnesGroup.classList.add("visible");
    } else {
      plusOnesGroup.classList.remove("visible");
    }
  }

  attendingYes.addEventListener("change", updatePlusOnes);
  attendingNo.addEventListener("change", updatePlusOnes);

  // ---------- Phone formatting ----------
  const phoneInput = document.getElementById("phone");

  function formatPhone(value) {
    const digits = value.replace(/\D/g, "").slice(0, 10);
    if (digits.length === 0) return "";
    if (digits.length <= 3) return "(" + digits;
    if (digits.length <= 6) return "(" + digits.slice(0, 3) + ") " + digits.slice(3);
    return "(" + digits.slice(0, 3) + ") " + digits.slice(3, 6) + "-" + digits.slice(6);
  }

  phoneInput.addEventListener("input", function () {
    const pos = this.selectionStart;
    const prevLen = this.value.length;
    this.value = formatPhone(this.value);
    const newLen = this.value.length;
    this.setSelectionRange(pos + (newLen - prevLen), pos + (newLen - prevLen));
  });

  // ---------- Validation helpers ----------
  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function isValidPhone(phone) {
    return phone.replace(/\D/g, "").length >= 10;
  }

  // ---------- Form submission ----------
  const form = document.getElementById("rsvp-form");
  const submitBtn = document.getElementById("submit-btn");
  const messageEl = document.getElementById("form-message");

  function showMessage(text, type) {
    messageEl.textContent = text;
    messageEl.className = "form-message " + type;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    // Validate
    const name = form.fullname.value.trim();
    const email = form.email.value.trim();
    const phone = form.phone.value.trim();
    const attending = form.attending.value;

    if (!name || name.split(/\s+/).length < 2) {
      showMessage("Please enter your first and last name.", "error");
      return;
    }

    if (email && !isValidEmail(email)) {
      showMessage("Please enter a valid email address.", "error");
      return;
    }

    if (phone && !isValidPhone(phone)) {
      showMessage("Please enter a valid 10-digit phone number.", "error");
      return;
    }

    if (!attending) {
      showMessage("Please let us know if you'll be attending.", "error");
      return;
    }

    // Disable button
    submitBtn.disabled = true;
    submitBtn.textContent = "Sending...";
    messageEl.className = "form-message";

    const data = {
      name,
      email: form.email.value.trim(),
      phone: form.phone.value.trim(),
      attending: attending === "yes",
      plusOnes: parseInt(form.plusOnes.value) || 0,
    };

    try {
      const res = await fetch("/.netlify/functions/rsvp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      const result = await res.json();

      if (res.ok && result.success) {
        // Submit to hidden Netlify Form for email notification
        const formData = new URLSearchParams({
          "form-name": "rsvp-notifications",
          name: data.name,
          attending: data.attending ? "Yes" : "No",
          plusOnes: String(data.plusOnes),
          email: data.email,
          phone: data.phone,
        });
        fetch("/", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: formData.toString(),
        }).catch(function () {}); // notification failure is non-blocking

        const msg = data.attending
          ? "Thank you! We can't wait to celebrate with you!"
          : "We're sorry you can't make it. Thank you for letting us know!";
        showMessage(msg, "success");
        form.style.display = "none";
        const banner = document.querySelector(".rsvp-deadline-banner");
        if (banner) banner.style.display = "none";
      } else {
        showMessage(result.error || "Something went wrong. Please try again.", "error");
        submitBtn.disabled = false;
        submitBtn.textContent = "Send RSVP";
      }
    } catch {
      showMessage("Could not reach the server. Please try again.", "error");
      submitBtn.disabled = false;
      submitBtn.textContent = "Send RSVP";
    }
  });
})();
