(() => {
  const cfg = window.DAWK_CONFIG || {};
  const eventKey = "dawk_validation_events_v2";
  const state = { tier: null, sectionSeen: false };
  const form = document.getElementById("interestForm");
  const note = document.getElementById("formNote");
  const submitButton = document.getElementById("submitButton");
  const runtimeBadge = document.getElementById("runtimeBadge");
  const tierField = document.getElementById("tierField");

  const params = new URLSearchParams(location.search);
  const campaign = {
    utm_source: params.get("utm_source") || "",
    utm_medium: params.get("utm_medium") || "",
    utm_campaign: params.get("utm_campaign") || "",
    utm_content: params.get("utm_content") || ""
  };

  function storeLocalEvent(name, meta = {}) {
    let current = [];
    try {
      current = JSON.parse(localStorage.getItem(eventKey) || "[]");
    } catch (_) {
      current = [];
    }
    current.push({ name, meta, at: new Date().toISOString() });
    try {
      localStorage.setItem(eventKey, JSON.stringify(current.slice(-250)));
    } catch (_) {}
  }

  function sendAnalytics(name, meta = {}) {
    storeLocalEvent(name, meta);

    if (!cfg.analyticsEndpoint) return;

    const body = JSON.stringify({
      event: name,
      meta,
      path: location.pathname,
      campaign,
      at: new Date().toISOString()
    });

    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon(
          cfg.analyticsEndpoint,
          new Blob([body], { type: "application/json" })
        );
        return;
      }
    } catch (_) {}

    fetch(cfg.analyticsEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
      credentials: "omit"
    }).catch(() => {});
  }

  function captureConfigured() {
    return cfg.mode === "production" && Boolean(cfg.captureEndpoint);
  }

  function setRuntimeStatus() {
    if (captureConfigured()) {
      runtimeBadge.textContent = "Early access aktif";
      runtimeBadge.classList.add("live");
      return;
    }
    runtimeBadge.textContent = "Preview — data tidak dikirim";
  }

  async function submitInterest(payload) {
    if (!captureConfigured()) {
      return { ok: true, preview: true };
    }

    const headers = { Accept: "application/json" };
    let body;

    if (cfg.captureFormat === "form") {
      headers["Content-Type"] = "application/x-www-form-urlencoded;charset=UTF-8";
      body = new URLSearchParams(payload).toString();
    } else {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(payload);
    }

    const response = await fetch(cfg.captureEndpoint, {
      method: "POST",
      headers,
      body,
      credentials: "omit"
    });

    if (!response.ok) {
      throw new Error("capture_failed");
    }

    return { ok: true, preview: false };
  }

  sendAnalytics("landing_view");

  document.querySelectorAll("[data-track]").forEach((el) => {
    el.addEventListener("click", () => sendAnalytics(el.dataset.track));
  });

  const packageSection = document.querySelector("[data-observe='package_section_view']");
  if (packageSection && "IntersectionObserver" in window) {
    const observer = new IntersectionObserver((entries) => {
      if (state.sectionSeen) return;
      if (entries.some((entry) => entry.isIntersecting)) {
        state.sectionSeen = true;
        sendAnalytics("package_section_view");
        observer.disconnect();
      }
    }, { threshold: 0.25 });
    observer.observe(packageSection);
  }

  const box = document.getElementById("interestBox");
  const selected = document.getElementById("selectedTier");

  document.querySelectorAll(".select-tier").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.tier = btn.dataset.tier;
      selected.textContent = state.tier;
      tierField.value = state.tier;
      box.hidden = false;
      sendAnalytics("choose_" + state.tier.toLowerCase(), { tier: state.tier });
      box.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  });

  document.querySelectorAll("details[data-faq]").forEach((detail) => {
    detail.addEventListener("toggle", () => {
      if (detail.open) {
        sendAnalytics("faq_expand", { faq: detail.dataset.faq });
      }
    });
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const fd = new FormData(form);
    const contact = String(fd.get("contact") || "").trim();
    const consent = fd.get("consent") === "on";
    const honeypot = String(fd.get("website") || "").trim();

    note.className = "form-note";

    if (honeypot) {
      note.textContent = "Terima kasih.";
      return;
    }

    if (!state.tier) {
      note.textContent = "Pilih paket terlebih dahulu.";
      return;
    }

    if (contact.length < 3) {
      note.textContent = "Isi email atau WhatsApp yang bisa dihubungi.";
      return;
    }

    if (!consent) {
      note.textContent = "Persetujuan penggunaan kontak diperlukan untuk daftar early access.";
      return;
    }

    const payload = {
      name: String(fd.get("name") || "").trim(),
      contact,
      tier: state.tier,
      consent: "yes",
      privacy_version: cfg.privacyVersion || "",
      utm_source: campaign.utm_source,
      utm_medium: campaign.utm_medium,
      utm_campaign: campaign.utm_campaign,
      utm_content: campaign.utm_content,
      page_url: location.href,
      submitted_at: new Date().toISOString()
    };

    submitButton.disabled = true;
    submitButton.textContent = "Mengirim...";
    note.textContent = "";

    try {
      const result = await submitInterest(payload);

      if (result.preview) {
        sendAnalytics("early_access_preview_submit", { tier: state.tier });
        note.textContent = "Preview berhasil. Data pribadi tidak dikirim ke server.";
      } else {
        sendAnalytics("early_access_submit", { tier: state.tier });
        note.textContent = "Minat early access sudah tercatat. Terima kasih.";
        note.classList.add("success");
        form.reset();
      }
    } catch (_) {
      sendAnalytics("early_access_submit_error", { tier: state.tier });
      note.textContent = "Belum berhasil mengirim. Coba lagi beberapa saat.";
      note.classList.add("error");
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = captureConfigured()
        ? "Daftar minat early access"
        : "Simulasikan daftar early access";
    }
  });

  setRuntimeStatus();
  submitButton.textContent = captureConfigured()
    ? "Daftar minat early access"
    : "Simulasikan daftar early access";

  window.DAWKValidation = {
    exportEvents() {
      try {
        return JSON.parse(localStorage.getItem(eventKey) || "[]");
      } catch (_) {
        return [];
      }
    },
    clearEvents() {
      localStorage.removeItem(eventKey);
    },
    config() {
      return {
        mode: cfg.mode || "preview",
        captureConfigured: captureConfigured(),
        analyticsConfigured: Boolean(cfg.analyticsEndpoint),
        privacyVersion: cfg.privacyVersion || ""
      };
    }
  };
})();
