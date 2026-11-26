(() => {
  "use strict";

  const config = window.WARDROBE_CONFIG || {};
  const BUCKET = config.storageBucket || "wardrobe-images";
  const OWNER_ID = config.ownerId || "00000000-0000-0000-0000-000000000001";
  const THEMES = ["dark", "forest", "midnight", "coffee", "plum", "light", "lime", "sand", "blue"];
  const DARK_THEMES = ["dark", "forest", "midnight", "coffee", "plum", "sand"];
  const ITEM_COLORS = [
    { value: "", label: "Sin especificar", hex: "transparent" },
    { value: "Negro", hex: "#282828" },
    { value: "Blanco", hex: "#f1f1ed" },
    { value: "Gris", hex: "#858984" },
    { value: "Beige", hex: "#c5b696" },
    { value: "Marrón", hex: "#79563e" },
    { value: "Rojo", hex: "#bd5750" },
    { value: "Rosa", hex: "#d99eaa" },
    { value: "Naranja", hex: "#ce7b42" },
    { value: "Amarillo", hex: "#d4b44f" },
    { value: "Verde", hex: "#71865c" },
    { value: "Azul", hex: "#607f99" },
    { value: "Azul marino", hex: "#394759" },
    { value: "Morado", hex: "#87728f" }
  ];
  const HOVER_SOUNDS = {
    chime: { label: "Campanilla suave", type: "sine", start: 720, end: 940, duration: 0.09, volume: 0.018 },
    drop: { label: "Gota", type: "sine", start: 880, end: 510, duration: 0.12, volume: 0.016 },
    wood: { label: "Madera", type: "triangle", start: 390, end: 330, duration: 0.075, volume: 0.014 },
    crystal: { label: "Cristal", type: "sine", start: 1120, end: 1480, duration: 0.065, volume: 0.012 },
    pulse: { label: "Pulso cálido", type: "triangle", start: 520, end: 680, duration: 0.13, volume: 0.015 }
  };
  const $ = (selector, root = document) => root.querySelector(selector);
  const page = $("#page-content");
  const sidebar = $("#sidebar");
  const editorDialog = $("#editor-dialog");
  const detailDialog = $("#detail-dialog");
  const imageDialog = $("#image-dialog");
  const state = {
    client: null,
    profiles: [],
    ownerId: OWNER_ID,
    ownerProfile: null,
    sections: [],
    items: [],
    images: [],
    settings: {},
    returnTheme: "light",
    view: "home",
    search: "",
    sort: "newest",
    filterSection: "",
    filterType: "",
    filterColor: "",
    filterSize: "",
    returnToItemAfterCategory: false,
    hoverAudio: null,
    hoverAudioUnavailable: false,
    signedUrlTimer: null
  };

  function setText(selector, text, error = false) {
    const element = $(selector);
    if (!element) return;
    element.textContent = text || "";
    element.classList.toggle("error", Boolean(error));
  }

  function notify(message, error = false) {
    const toast = $("#app-message");
    toast.textContent = message || "";
    toast.classList.toggle("error", Boolean(error));
    toast.classList.add("visible");
    window.clearTimeout(notify.timeout);
    notify.timeout = window.setTimeout(() => toast.classList.remove("visible"), 4500);
  }

  function hasPublicConfig() {
    let projectUrl = null;
    try {
      projectUrl = new URL(config.supabaseUrl);
    } catch {
      return false;
    }
    return projectUrl.protocol === "https:"
      && projectUrl.pathname === "/"
      && !projectUrl.search
      && !projectUrl.hash
      && config.supabaseAnonKey && !config.supabaseAnonKey.includes("TU_SUPABASE")
      && window.supabase && typeof window.supabase.createClient === "function";
  }

  function profileById(id) {
    return state.profiles.find(profile => profile.id === id);
  }

  function isOwnProfile(id) {
    return Boolean(state.ownerProfile && state.ownerProfile.id === id);
  }

  function canManageItem(item) {
    return Boolean(item && isOwnProfile(item.profile_id));
  }

  function sectionById(id) {
    return state.sections.find(section => section.id === id);
  }

  function setAppChrome() {
    document.body.classList.add("edit-mode");
    sidebar.hidden = false;
    $("#menu-button").hidden = false;
    $("#add-item-button").hidden = !state.ownerProfile || state.view === "settings";
    $("#mobile-add-button").hidden = !state.ownerProfile || state.view === "settings";
  }

  function applyTheme() {
    const theme = THEMES.includes(state.settings.theme) ? state.settings.theme : "dark";
    state.settings.theme = theme;
    if (!DARK_THEMES.includes(theme)) state.returnTheme = theme;
    document.documentElement.dataset.theme = theme;
    $("#theme-button").textContent = DARK_THEMES.includes(theme) ? "☼" : "◐";
  }

  async function loadPublicData() {
    const results = await Promise.all([
      state.client.from("profiles").select("*").order("username"),
      state.client.from("sections").select("*").order("sort_order"),
      state.client.from("items").select("*").order("created_at", { ascending: false }),
      state.client.from("item_images").select("*").order("sort_order"),
      state.client.from("app_settings").select("*")
    ]);
    const failure = results.find(result => result.error);
    if (failure) {
      console.error("Could not load public catalog:", failure.error);
      notify("No se pudo cargar el armario. Ejecuta el schema.sql actualizado en Supabase para habilitar el acceso sin inicio de sesión.", true);
      return false;
    }
    state.profiles = results[0].data || [];
    state.sections = results[1].data || [];
    state.items = results[2].data || [];
    state.images = results[3].data || [];
    state.ownerProfile = state.profiles.find(profile => profile.owner_id === OWNER_ID) || state.profiles[0] || null;
    if (!state.ownerProfile) {
      const { data, error } = await state.client.from("profiles").insert({
        owner_id: OWNER_ID,
        username: "mi_armario",
        display_name: "Mi armario",
        is_public: true
      }).select("*").single();
      if (error) {
        console.error("Could not initialize the wardrobe:", error);
        notify("No se pudo preparar el armario. Revisa las políticas de Supabase y vuelve a cargar.", true);
        return false;
      }
      state.ownerProfile = data;
      state.profiles = [data];
    }
    state.ownerId = state.ownerProfile ? state.ownerProfile.owner_id : OWNER_ID;
    state.settings = Object.fromEntries((results[4].data || [])
      .filter(row => row.owner_id === state.ownerId)
      .map(row => [row.setting_key, row.setting_value]));
    await refreshSignedUrls();
    return true;
  }

  async function loadData() {
    return loadPublicData();
  }

  async function refreshSignedUrls() {
    const paths = [
      ...state.sections.map(section => section.cover_path),
      ...state.images.map(image => image.storage_path)
    ].filter(Boolean);
    const uniquePaths = [...new Set(paths)];
    if (!uniquePaths.length) return;
    const { data, error } = await state.client.storage.from(BUCKET).createSignedUrls(uniquePaths, 900);
    if (error) {
      console.error("Could not sign image URLs:", error);
      notify("No se pudieron abrir algunas imágenes. Revisa las políticas del bucket.", true);
      return;
    }
    const urls = new Map((data || []).map(entry => [entry.path, entry.signedUrl]));
    state.sections.forEach(section => { section.cover_url = urls.get(section.cover_path) || ""; });
    state.images.forEach(image => { image.url = urls.get(image.storage_path) || ""; });
  }

  function startSignedUrlRefresh() {
    if (state.signedUrlTimer) return;
    state.signedUrlTimer = window.setInterval(renewVisibleUrls, 10 * 60 * 1000);
  }

  async function renewVisibleUrls() {
    if (!state.client) return;
    await refreshSignedUrls();
    renderPage();
    if (detailDialog.open && detailDialog.dataset.itemId) {
      const itemId = detailDialog.dataset.itemId;
      detailDialog.close();
      openItemDetail(itemId);
    }
  }

  function goHome() {
    state.search = "";
    state.filterSection = "";
    state.filterType = "";
    state.filterColor = "";
    state.filterSize = "";
    state.view = "home";
    renderPage();
  }

  function setView(view) {
    state.view = view;
    state.search = "";
    state.filterSection = "";
    state.filterType = "";
    state.filterColor = "";
    state.filterSize = "";
    sidebar.classList.remove("open");
    renderPage();
  }

  function renderPage() {
    setAppChrome();
    const labels = {
      home: "INICIO", sections: "CATEGORÍAS", items: "PRENDAS",
      favorites: "FAVORITOS", settings: "CONFIGURACIÓN"
    };
    $("#breadcrumbs").innerHTML = `MI ARMARIO <span>/</span> ${labels[state.view] || "INICIO"}`;
    document.querySelectorAll("[data-nav]").forEach(button => {
      button.classList.toggle("active", button.dataset.nav === state.view);
    });
    if (state.view === "home") renderHome();
    else if (state.view === "sections") renderSections();
    else if (state.view === "items" || state.view === "favorites") renderItemsPage();
    else renderSettings();
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, char => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[char]);
  }

  function createHeading(eyebrow, title, description, actionText, actionName) {
    const heading = document.createElement("section");
    heading.className = "page-heading";
    const copy = document.createElement("div");
    const small = document.createElement("p");
    small.className = "eyebrow";
    small.textContent = eyebrow;
    const h1 = document.createElement("h1");
    h1.textContent = title;
    const desc = document.createElement("p");
    desc.className = "muted";
    desc.textContent = description;
    copy.append(small, h1, desc);
    heading.append(copy);
    if (actionText) {
      const action = document.createElement("button");
      action.className = "button button-outline";
      action.textContent = actionText;
      action.dataset.action = actionName;
      heading.append(action);
    }
    return heading;
  }

  function createEmptyState(title, message, actionText, actionName) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    const heading = document.createElement("h3");
    heading.textContent = title;
    const copy = document.createElement("p");
    copy.textContent = message;
    empty.append(heading, copy);
    if (actionText) {
      const button = document.createElement("button");
      button.className = "button button-outline";
      button.textContent = actionText;
      button.dataset.action = actionName;
      empty.append(button);
    }
    return empty;
  }

  function renderHome() {
    page.replaceChildren();
    const ownItems = state.items.filter(item => isOwnProfile(item.profile_id));
    const ownSections = state.sections.filter(section => isOwnProfile(section.profile_id));
    page.append(createHeading(
      "TU ARMARIO",
      "Mi armario",
      `${ownSections.length} categorías · ${ownItems.length} prendas en tu armario.`,
      "＋ Añadir prenda",
      "new-item"
    ));
    const stats = document.createElement("div");
    stats.className = "stat-grid";
    [
      ["CATEGORÍAS", ownSections.length],
      ["PRENDAS", ownItems.length],
      ["FAVORITOS", ownItems.filter(item => item.is_favorite).length]
    ].forEach(([label, amount]) => {
      const card = document.createElement("div");
      card.className = "stat-card";
      const name = document.createElement("span");
      name.textContent = label;
      const value = document.createElement("strong");
      value.textContent = amount;
      card.append(name, value);
      stats.append(card);
    });
    page.append(stats);
  }

  function createCatalogToolbar() {
    const toolbar = document.createElement("div");
    toolbar.className = "catalog-toolbar";
    const search = document.createElement("label");
    search.className = "search-box";
    search.innerHTML = '<span aria-hidden="true">⌕</span><input id="catalog-search" type="search" placeholder="Buscar prendas…" autocomplete="off">';
    $("#catalog-search", search).value = state.search;
    toolbar.append(search);
    const sections = document.createElement("select");
    sections.id = "section-filter";
    sections.setAttribute("aria-label", "Filtrar por categoría");
    addOption(sections, "", "Todas las categorías");
    state.sections.filter(section => isOwnProfile(section.profile_id))
      .forEach(section => addOption(sections, section.id, section.name));
    sections.value = state.filterSection;
    toolbar.append(sections);
    [
      ["type-filter", "Todos los tipos", "garment_type", state.filterType],
      ["color-filter", "Todos los colores", "color", state.filterColor],
      ["size-filter", "Todas las tallas", "size", state.filterSize]
    ].forEach(([id, label, field, selected]) => {
      const select = document.createElement("select");
      select.id = id;
      select.setAttribute("aria-label", label);
      addOption(select, "", label);
      getDistinctValues(field).forEach(value => addOption(select, value, field === "color" ? getColorLabel(value) : value));
      select.value = selected;
      toolbar.append(select);
    });
    const sort = document.createElement("select");
    sort.id = "sort-order";
    sort.setAttribute("aria-label", "Ordenar prendas");
    [
      ["newest", "Más recientes"], ["oldest", "Más antiguas"],
      ["price-asc", "Precio: menor a mayor"], ["price-desc", "Precio: mayor a menor"],
      ["alpha", "Alfabético"]
    ].forEach(([value, text]) => addOption(sort, value, text));
    sort.value = state.sort;
    toolbar.append(sort);
    return toolbar;
  }

  function getDistinctValues(field) {
    return [...new Set(state.items
      .filter(item => isOwnProfile(item.profile_id))
      .map(item => String(item[field] || "").trim())
      .filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, "es"));
  }

  function addOption(select, value, text) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = text;
    select.append(option);
  }

  function renderSections() {
    page.replaceChildren();
    const ownSections = state.sections.filter(section => isOwnProfile(section.profile_id));
    page.append(createHeading("ORGANIZA TU ARMARIO", "Categorías", "Crea tus propias categorías y organiza ahí las prendas.", "＋ Nueva categoría", "new-section"));
    const list = document.createElement("div");
    list.className = "management-list";
    if (!ownSections.length) list.append(createEmptyState("Aún no hay categorías", "Crea una categoría para poder asignar prendas.", "Nueva categoría", "new-section"));
    else ownSections.forEach((section, index) => {
      const row = document.createElement("article");
      row.className = "management-row";
      const thumb = document.createElement("div");
      thumb.className = "management-thumb";
      if (section.cover_url) {
        const image = document.createElement("img");
        image.src = section.cover_url;
        image.alt = "";
        thumb.append(image);
      } else thumb.textContent = "A";
      const info = document.createElement("div");
      info.className = "management-info";
      const name = document.createElement("strong");
      name.textContent = section.name;
      const meta = document.createElement("span");
      const count = state.items.filter(item => item.section_id === section.id).length;
      meta.textContent = `${count} prendas${section.is_hidden ? " · Oculta" : ""}`;
      info.append(name, meta);
      const controls = document.createElement("div");
      controls.className = "row-controls";
      controls.append(
        controlButton("↑", "move-section-up", section.id, index === 0),
        controlButton("↓", "move-section-down", section.id, index === state.sections.length - 1),
        controlButton(section.is_hidden ? "Mostrar" : "Ocultar", "toggle-section", section.id),
        controlButton("Editar", "edit-section", section.id),
        controlButton("×", "delete-section", section.id)
      );
      row.append(thumb, info, controls);
      list.append(row);
    });
    page.append(list);
  }

  function controlButton(text, action, id, disabled = false) {
    const button = document.createElement("button");
    button.className = "control-button";
    button.textContent = text;
    button.dataset.action = action;
    button.dataset.id = id;
    button.disabled = disabled;
    button.setAttribute("aria-label", text);
    return button;
  }

  function renderItemsPage() {
    page.replaceChildren();
    const favorites = state.view === "favorites";
    const ownItems = state.items.filter(item => isOwnProfile(item.profile_id));
    page.append(createHeading(
      favorites ? "PRENDAS GUARDADAS" : "TU ARMARIO",
      favorites ? "Favoritos" : "Prendas",
      favorites ? "Tus prendas favoritas." : `${ownItems.length} prendas en tu armario.`,
      "＋ Añadir prenda",
      "new-item"
    ));
    page.append(createCatalogToolbar());
    const grid = document.createElement("div");
    grid.id = "catalog-grid";
    grid.className = "item-grid";
    page.append(grid);
    renderItemsGrid();
  }

  function filteredItems() {
    let items = state.items.filter(item => isOwnProfile(item.profile_id));
    if (state.view === "favorites") items = items.filter(item => item.is_favorite);
    if (state.filterSection) items = items.filter(item => item.section_id === state.filterSection);
    if (state.filterType) items = items.filter(item => item.garment_type === state.filterType);
    if (state.filterColor) items = items.filter(item => item.color === state.filterColor);
    if (state.filterSize) items = items.filter(item => item.size === state.filterSize);
    const query = state.search.trim().toLocaleLowerCase("es");
    if (query) items = items.filter(item => item.name.toLocaleLowerCase("es").includes(query));
    items.sort((a, b) => {
      if (state.sort === "oldest") return new Date(a.created_at) - new Date(b.created_at);
      if (state.sort === "price-asc") return (a.price ?? Infinity) - (b.price ?? Infinity);
      if (state.sort === "price-desc") return (b.price ?? -Infinity) - (a.price ?? -Infinity);
      if (state.sort === "alpha") return a.name.localeCompare(b.name, "es");
      return new Date(b.created_at) - new Date(a.created_at);
    });
    return items;
  }

  function renderItemsGrid() {
    const grid = $("#catalog-grid");
    if (!grid) return;
    grid.replaceChildren();
    const items = filteredItems();
    if (!items.length) grid.append(createEmptyState("No hay prendas aquí", "Prueba con otros filtros o añade una prenda.", "Añadir prenda", "new-item"));
    else items.forEach(item => grid.append(createItemCard(item)));
  }

  function itemCover(item) {
    const images = state.images.filter(image => image.item_id === item.id);
    return images.find(image => image.is_primary) || images[0];
  }

  function createItemCard(item) {
    const card = document.createElement("article");
    card.className = "item-card";
    const imageButton = document.createElement("button");
    imageButton.className = "item-image-button";
    imageButton.dataset.action = "open-item";
    imageButton.dataset.id = item.id;
    const imageWrap = document.createElement("span");
    imageWrap.className = "item-image";
    const cover = itemCover(item);
    if (cover && cover.url) {
      const image = document.createElement("img");
      image.src = cover.url;
      image.alt = item.name;
      image.loading = "lazy";
      imageWrap.append(image);
    } else {
      const placeholder = document.createElement("span");
      placeholder.textContent = "Sin imagen";
      imageWrap.append(placeholder);
    }
    imageButton.append(imageWrap);
    if (canManageItem(item)) {
      const favorite = document.createElement("button");
      favorite.className = `favorite-button${item.is_favorite ? " selected" : ""}`;
      favorite.textContent = item.is_favorite ? "♥" : "♡";
      favorite.dataset.action = "toggle-favorite";
      favorite.dataset.id = item.id;
      favorite.setAttribute("aria-label", item.is_favorite ? "Quitar de favoritos" : "Añadir a favoritos");
      card.append(favorite);
      if (!item.is_public) {
        const hidden = document.createElement("span");
        hidden.className = "visibility-badge";
        hidden.textContent = "OCULTA";
        card.append(hidden);
      }
    }
    const meta = document.createElement("div");
    meta.className = "item-card-meta";
    const name = document.createElement("strong");
    name.textContent = item.name;
    const category = document.createElement("span");
    category.textContent = [item.garment_type, (sectionById(item.section_id) || {}).name, getColorLabel(item.color)]
      .filter(Boolean).join(" · ");
    const price = document.createElement("span");
    price.className = "item-price";
    price.textContent = item.price == null ? "" : formatPrice(item.price);
    meta.append(name, category, price);
    card.append(imageButton, meta);
    return card;
  }

  function formatPrice(price) {
    return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(Number(price));
  }

  function getColorChoice(value) {
    const normalized = String(value || "").trim().toLocaleLowerCase("es");
    return ITEM_COLORS.find(color => color.value.toLocaleLowerCase("es") === normalized);
  }

  function getColorLabel(value) {
    if (!value) return "";
    const choice = getColorChoice(value);
    if (choice) return choice.label || choice.value;
    return /^#[0-9a-f]{6}$/i.test(value) ? `Personalizado ${value.toUpperCase()}` : String(value);
  }

  function getColorSwatch(value) {
    const choice = getColorChoice(value);
    if (choice) return choice.hex;
    return /^#[0-9a-f]{6}$/i.test(value) ? value : "#858984";
  }

  function renderSettings() {
    page.replaceChildren();
    page.append(createHeading("PREFERENCIAS", "Configuración", "Ajusta el aspecto de tu armario.", "", ""));
    const panel = document.createElement("section");
    panel.className = "settings-panel";
    const row = document.createElement("div");
    row.className = "settings-row";
    const copy = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = "Tema de la aplicación";
    const desc = document.createElement("p");
    desc.className = "muted";
    desc.textContent = "Elige un aspecto claro u oscuro.";
    copy.append(title, desc);
    const select = document.createElement("select");
    select.id = "theme-select";
    [
      ["dark", "Grafito nocturno"],
      ["forest", "Bosque nocturno"],
      ["midnight", "Azul medianoche"],
      ["coffee", "Café nocturno"],
      ["plum", "Ciruela nocturna"],
      ["sand", "Arena nocturna"],
      ["light", "Claro suave"],
      ["lime", "Lima suave"],
      ["blue", "Azul gris claro"]
    ].forEach(([value, label]) => addOption(select, value, label));
    select.value = THEMES.includes(state.settings.theme) ? state.settings.theme : "dark";
    row.append(copy, select);
    const soundRow = document.createElement("div");
    soundRow.className = "settings-row";
    const soundCopy = document.createElement("div");
    const soundTitle = document.createElement("strong");
    soundTitle.textContent = "Sonido al pasar por botones";
    const soundDescription = document.createElement("p");
    soundDescription.className = "muted";
    soundDescription.textContent = "Un tono breve y suave al entrar con el ratón; se activa tras el primer clic.";
    soundCopy.append(soundTitle, soundDescription);
    const soundLabel = document.createElement("label");
    soundLabel.className = "checkbox-label sound-toggle";
    soundLabel.htmlFor = "hover-sound";
    const soundCheckbox = document.createElement("input");
    soundCheckbox.type = "checkbox";
    soundCheckbox.id = "hover-sound";
    soundCheckbox.checked = state.settings.hover_sound !== false;
    soundLabel.append(soundCheckbox);
    soundRow.append(soundCopy, soundLabel);
    const soundStyleRow = document.createElement("div");
    soundStyleRow.className = "settings-row";
    const soundStyleCopy = document.createElement("div");
    const soundStyleTitle = document.createElement("strong");
    soundStyleTitle.textContent = "Estilo de sonido";
    const soundStyleDescription = document.createElement("p");
    soundStyleDescription.className = "muted";
    soundStyleDescription.textContent = "Elige uno de los cinco tonos suaves.";
    soundStyleCopy.append(soundStyleTitle, soundStyleDescription);
    const soundSelect = document.createElement("select");
    soundSelect.id = "hover-sound-style";
    Object.entries(HOVER_SOUNDS).forEach(([value, preset]) => addOption(soundSelect, value, preset.label));
    soundSelect.value = Object.prototype.hasOwnProperty.call(HOVER_SOUNDS, state.settings.hover_sound_style)
      ? state.settings.hover_sound_style
      : "chime";
    soundStyleRow.append(soundStyleCopy, soundSelect);
    panel.append(row, soundRow, soundStyleRow);
    page.append(panel);
  }

  function openSectionEditor(section = null) {
    if (!state.ownerProfile) {
      notify("No se pudo inicializar el armario. Recarga la página.", true);
      return;
    }
    if (section && !isOwnProfile(section.profile_id)) {
      notify("Solo puedes editar tus propias secciones.", true);
      return;
    }
    editorDialog.className = "dialog editor-dialog";
    editorDialog.innerHTML = `
      <form id="section-form" class="dialog-form">
        <button type="button" class="dialog-close" aria-label="Cerrar">×</button>
        <p class="eyebrow">ORGANIZA TU ARMARIO</p>
        <h2>${section ? "Editar categoría" : "Nueva categoría"}</h2>
        <input name="profile" type="hidden">
        <label>Nombre de categoría<input name="name" maxlength="80" required></label>
        <label>Portada<input name="cover" type="file" accept="image/jpeg,image/png,image/webp"></label>
        <div id="cover-preview" class="cover-preview"></div>
        <label class="checkbox-label"><input name="is_hidden" type="checkbox"> Ocultar categoría del catálogo</label>
        <p class="form-error" role="alert"></p>
        <button class="button button-dark button-wide" type="submit">${section ? "Guardar cambios" : "Crear categoría"}</button>
      </form>`;
    const form = $("#section-form", editorDialog);
    form.elements.profile.value = state.ownerProfile.id;
    if (section) {
      form.elements.profile.value = section.profile_id;
      form.elements.name.value = section.name;
      form.elements.is_hidden.checked = section.is_hidden;
      if (section.cover_url) {
        const image = document.createElement("img");
        image.src = section.cover_url;
        image.alt = "Portada actual";
        $("#cover-preview", editorDialog).append(image);
      }
    }
    form.elements.cover.addEventListener("change", () => previewFile(form.elements.cover.files[0], $("#cover-preview", editorDialog)));
    form.addEventListener("submit", event => saveSection(event, section));
    editorDialog.showModal();
  }

  async function saveSection(event, section) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = $("button[type=submit]", form);
    const errorBox = $(".form-error", form);
    button.disabled = true;
    const name = form.elements.name.value.trim();
    const file = form.elements.cover.files[0];
    try {
      const coverPath = file ? await uploadImage(file, `profiles/${state.ownerProfile.id}/covers`) : section && section.cover_path;
      const record = {
        owner_id: state.ownerId,
        profile_id: state.ownerProfile.id,
        name,
        cover_path: coverPath || null,
        sort_order: section ? section.sort_order : state.sections.filter(value => value.profile_id === state.ownerProfile.id).length,
        is_hidden: form.elements.is_hidden.checked
      };
      const result = section
        ? await state.client.from("sections").update(record).eq("id", section.id)
        : await state.client.from("sections").insert(record);
      if (result.error) throw result.error;
      if (file && section && section.cover_path) await removeStorageFiles([section.cover_path]);
      editorDialog.close();
      await reloadAndRender();
      notify(section ? "Categoría actualizada." : "Categoría creada.");
      if (!section && state.returnToItemAfterCategory) {
        state.returnToItemAfterCategory = false;
        openItemEditor();
      }
    } catch (error) {
      console.error("Could not save section:", error);
      errorBox.textContent = friendlyError(error, "No se pudo guardar la sección.");
      button.disabled = false;
    }
  }

  function openItemEditor(item = null) {
    if (!state.ownerProfile) {
      notify("No se pudo inicializar el armario. Recarga la página.", true);
      return;
    }
    if (item && !canManageItem(item)) {
      notify("Solo puedes editar prendas de tu propio armario.", true);
      return;
    }
    const hasCategories = state.sections.some(section => section.profile_id === state.ownerProfile.id);
    editorDialog.className = "dialog editor-dialog item-editor-dialog";
    editorDialog.innerHTML = `
      <form id="item-form" class="dialog-form">
        <button type="button" class="dialog-close" aria-label="Cerrar">×</button>
        <p class="eyebrow">MI ARMARIO</p>
        <h2>${item ? "Editar prenda" : "Añadir prenda"}</h2>
        <div class="form-grid">
          <input name="profile" type="hidden">
          <label class="span-two">Categoría<select name="section" required></select></label>
          ${!item && !hasCategories ? '<p class="form-hint span-two">Crea una categoría para poder guardar prendas.</p><button type="button" class="text-button span-two" data-action="new-category-from-item">＋ Crear una categoría</button>' : ""}
          <label class="span-two">Nombre<input name="name" maxlength="120" required></label>
          <label>Tipo de prenda<input name="garment_type" list="garment-types" maxlength="80" placeholder="Camiseta, vaqueros…" required></label>
          <div class="color-field">
            <span class="field-label">Color</span>
            <div class="color-picker">
              <input name="color" type="hidden">
              <button id="color-picker-trigger" class="color-picker-trigger" type="button" aria-haspopup="true" aria-expanded="false" aria-controls="color-picker-options">
                <span class="color-swatch" data-selected-color-swatch aria-hidden="true"></span>
                <span data-selected-color-label>Sin especificar</span>
                <span class="color-chevron" aria-hidden="true"></span>
              </button>
              <div id="color-picker-options" class="color-picker-menu" role="group" aria-label="Elige un color" hidden>
                ${ITEM_COLORS.map(color => `<button class="color-option" type="button" data-color-value="${escapeHtml(color.value)}" aria-pressed="false"><span class="color-swatch" style="--swatch-color:${color.hex}" aria-hidden="true"></span><span>${escapeHtml(color.label || color.value)}</span></button>`).join("")}
                <div class="color-option-custom">
                  <span class="color-swatch custom-color-swatch" aria-hidden="true"></span>
                  <span>Elegir otro color</span>
                  <input id="custom-item-color" type="color" value="#858984" aria-label="Elegir un color personalizado">
                </div>
              </div>
            </div>
          </div>
          <label>Talla<input name="size" list="garment-sizes" maxlength="40" placeholder="S, 38, única…"></label>
          <datalist id="garment-types">${getDistinctValues("garment_type").map(value => `<option value="${escapeHtml(value)}"></option>`).join("")}</datalist>
          <datalist id="garment-sizes">${getDistinctValues("size").map(value => `<option value="${escapeHtml(value)}"></option>`).join("")}</datalist>
          <label>Precio (EUR)<input name="price" type="number" min="0" max="99999999" step="0.01" inputmode="decimal"></label>
          <label>Enlace de compra<input name="url" type="url" maxlength="2048" placeholder="https://…" inputmode="url"></label>
          <label class="span-two">Descripción<textarea name="description" rows="3" maxlength="4000"></textarea></label>
          <label class="span-two">Fotografías<input name="photos" type="file" accept="image/jpeg,image/png,image/webp" multiple></label>
        </div>
        <input name="is_public" type="hidden">
        <label class="checkbox-label"><input name="is_favorite" type="checkbox"> Marcar como favorita</label>
        <p class="form-hint">JPG, PNG o WebP · Máximo 15 MB por archivo. Las fotos se optimizan antes de subir.</p>
        <div id="photo-list" class="photo-list"></div>
        <p class="form-error" role="alert"></p>
        <button class="button button-dark button-wide" type="submit">${item ? "Guardar cambios" : "Guardar prenda"}</button>
      </form>`;
    const form = $("#item-form", editorDialog);
    const profileSelect = form.elements.profile;
    profileSelect.value = state.ownerProfile.id;
    const sectionSelect = form.elements.section;
    const updateSections = (selectedId = "") => {
      sectionSelect.replaceChildren();
      const available = state.sections.filter(section => section.profile_id === profileSelect.value);
      available.forEach(section => addOption(sectionSelect, section.id, section.name));
      sectionSelect.value = selectedId && available.some(section => section.id === selectedId) ? selectedId : (available[0] ? available[0].id : "");
    };
    updateSections(item ? item.section_id : "");
    const colorValue = form.elements.color;
    const colorTrigger = $("#color-picker-trigger", editorDialog);
    const colorMenu = $("#color-picker-options", editorDialog);
    const colorLabel = $("[data-selected-color-label]", editorDialog);
    const selectedSwatch = $("[data-selected-color-swatch]", editorDialog);
    const customColor = $("#custom-item-color", editorDialog);
    const updateColor = value => {
      const choice = getColorChoice(value);
      const normalizedValue = choice ? choice.value : String(value || "").trim();
      const label = getColorLabel(normalizedValue) || "Sin especificar";
      colorValue.value = normalizedValue;
      colorLabel.textContent = label;
      selectedSwatch.style.backgroundColor = getColorSwatch(normalizedValue);
      colorTrigger.setAttribute("aria-label", `Color: ${label}`);
      if (/^#[0-9a-f]{6}$/i.test(normalizedValue)) customColor.value = normalizedValue;
      colorMenu.querySelectorAll("[data-color-value]").forEach(option => {
        const selected = option.dataset.colorValue === normalizedValue;
        option.setAttribute("aria-pressed", String(selected));
        option.classList.toggle("selected", selected);
      });
    };
    updateColor(item ? item.color : "");
    colorTrigger.addEventListener("click", () => {
      colorMenu.hidden = !colorMenu.hidden;
      colorTrigger.setAttribute("aria-expanded", String(!colorMenu.hidden));
      if (!colorMenu.hidden) {
        const selectedOption = colorMenu.querySelector('[aria-pressed="true"]') || colorMenu.querySelector("[data-color-value]");
        if (selectedOption) selectedOption.focus();
      }
    });
    colorMenu.addEventListener("click", event => {
      const option = event.target.closest("[data-color-value]");
      if (option) {
        updateColor(option.dataset.colorValue);
        colorMenu.hidden = true;
        colorTrigger.setAttribute("aria-expanded", "false");
        colorTrigger.focus();
      }
    });
    colorMenu.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        colorMenu.hidden = true;
        colorTrigger.setAttribute("aria-expanded", "false");
        colorTrigger.focus();
        return;
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        const options = Array.from(colorMenu.querySelectorAll("[data-color-value], input[type='color']"));
        const currentIndex = options.indexOf(document.activeElement);
        const step = event.key === "ArrowDown" ? 1 : -1;
        const nextIndex = (currentIndex + step + options.length) % options.length;
        event.preventDefault();
        options[nextIndex].focus();
      }
    });
    customColor.addEventListener("change", () => {
      updateColor(customColor.value.toUpperCase());
      colorMenu.hidden = true;
      colorTrigger.setAttribute("aria-expanded", "false");
      colorTrigger.focus();
    });
    const photos = [];
    const photoList = $("#photo-list", editorDialog);
    if (item) {
      form.elements.name.value = item.name;
      form.elements.garment_type.value = item.garment_type || "";
      form.elements.size.value = item.size || "";
      form.elements.price.value = item.price == null ? "" : item.price;
      form.elements.url.value = item.purchase_url || "";
      form.elements.description.value = item.description || "";
      form.elements.is_public.value = String(item.is_public);
      form.elements.is_favorite.checked = item.is_favorite;
      state.images.filter(image => image.item_id === item.id).sort((a, b) => a.sort_order - b.sort_order)
        .forEach(image => photos.push({ id: image.id, path: image.storage_path, url: image.url, primary: image.is_primary }));
    } else {
      form.elements.garment_type.value = "";
      form.elements.is_public.value = "true";
      form.elements.is_favorite.checked = false;
    }
    const renderPhotos = () => renderPhotoEntries(photoList, photos);
    renderPhotos();
    form.elements.photos.addEventListener("change", () => {
      Array.from(form.elements.photos.files || []).forEach(file => {
        if (validateImage(file)) photos.push({ file, url: URL.createObjectURL(file), primary: photos.length === 0 });
      });
      form.elements.photos.value = "";
      renderPhotos();
    });
    photoList.addEventListener("click", event => {
      const button = event.target.closest("[data-photo-action]");
      if (!button) return;
      const index = Number(button.dataset.index);
      if (button.dataset.photoAction === "remove") {
        const [removed] = photos.splice(index, 1);
        if (removed.file) URL.revokeObjectURL(removed.url);
      } else if (button.dataset.photoAction === "up" && index > 0) {
        [photos[index - 1], photos[index]] = [photos[index], photos[index - 1]];
      } else if (button.dataset.photoAction === "down" && index < photos.length - 1) {
        [photos[index + 1], photos[index]] = [photos[index], photos[index + 1]];
      } else if (button.dataset.photoAction === "primary") {
        photos.forEach((photo, photoIndex) => { photo.primary = photoIndex === index; });
      }
      if (photos.length && !photos.some(photo => photo.primary)) photos[0].primary = true;
      renderPhotos();
    });
    form.addEventListener("submit", event => saveItem(event, item, photos));
    editorDialog.showModal();
  }

  function renderPhotoEntries(container, photos) {
    container.replaceChildren();
    if (!photos.length) {
      const hint = document.createElement("p");
      hint.className = "photo-empty";
      hint.textContent = "Todavía no has añadido fotografías.";
      container.append(hint);
      return;
    }
    photos.forEach((photo, index) => {
      const row = document.createElement("div");
      row.className = "photo-entry";
      const image = document.createElement("img");
      image.src = photo.url || "";
      image.alt = `Fotografía ${index + 1}`;
      const label = document.createElement("span");
      label.textContent = `${index + 1}${photo.primary ? " · Principal" : ""}`;
      row.append(image, label);
      if (!photo.primary) row.append(photoControl("★", "primary", index));
      row.append(photoControl("↑", "up", index), photoControl("↓", "down", index), photoControl("×", "remove", index));
      container.append(row);
    });
  }

  function photoControl(text, action, index) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "control-button photo-control";
    button.textContent = text;
    button.dataset.photoAction = action;
    button.dataset.index = index;
    button.setAttribute("aria-label", action);
    return button;
  }

  async function saveItem(event, item, photos) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = $("button[type=submit]", form);
    const errorBox = $(".form-error", form);
    button.disabled = true;
    const name = form.elements.name.value.trim();
    const garmentType = form.elements.garment_type.value.trim();
    const color = form.elements.color.value.trim();
    const size = form.elements.size.value.trim();
    const url = form.elements.url.value.trim();
    const priceText = form.elements.price.value.trim();
    const price = priceText ? Number(priceText) : null;
    if (!name || !garmentType || garmentType.length > 80 || color.length > 80 || size.length > 40 || (price !== null && (!Number.isFinite(price) || price < 0)) || (url && !isSafeWebUrl(url))) {
      errorBox.textContent = "Revisa el nombre, tipo, color, talla, precio y enlace de compra.";
      button.disabled = false;
      return;
    }
    const record = {
      owner_id: state.ownerId,
      profile_id: state.ownerProfile.id,
      section_id: form.elements.section.value,
      name,
      garment_type: garmentType,
      color: color || null,
      size: size || null,
      purchase_url: url || null,
      price,
      description: form.elements.description.value.trim() || null,
      is_favorite: form.elements.is_favorite.checked,
      is_public: form.elements.is_public.value === "true"
    };
    let itemId = item && item.id;
    const uploadedPaths = [];
    try {
      if (item) {
        const result = await state.client.from("items").update(record).eq("id", itemId);
        if (result.error) throw result.error;
      } else {
        const result = await state.client.from("items").insert(record).select("id").single();
        if (result.error) throw result.error;
        itemId = result.data.id;
      }
      const stored = [];
      for (const [index, photo] of photos.entries()) {
        if (photo.file) {
          const path = await uploadImage(photo.file, `profiles/${itemId}/items`);
          uploadedPaths.push(path);
          const inserted = await state.client.from("item_images").insert({
            owner_id: state.ownerId,
            item_id: itemId,
            storage_path: path,
            sort_order: index,
            is_primary: Boolean(photo.primary)
          });
          if (inserted.error) throw inserted.error;
          stored.push({ ...photo, path });
        } else {
          const updated = await state.client.from("item_images")
            .update({ sort_order: index, is_primary: Boolean(photo.primary) }).eq("id", photo.id);
          if (updated.error) throw updated.error;
          stored.push(photo);
        }
      }
      const keep = new Set(stored.filter(photo => photo.id).map(photo => photo.id));
      const removed = item ? state.images.filter(image => image.item_id === itemId && !keep.has(image.id)) : [];
      if (removed.length) {
        const deleted = await state.client.from("item_images").delete().in("id", removed.map(image => image.id));
        if (deleted.error) throw deleted.error;
        await removeStorageFiles(removed.map(image => image.storage_path));
      }
      photos.filter(photo => photo.file).forEach(photo => URL.revokeObjectURL(photo.url));
      editorDialog.close();
      await reloadAndRender();
      notify(item ? "Prenda actualizada." : "Prenda añadida.");
    } catch (error) {
      console.error("Could not save item:", error);
      if (uploadedPaths.length) await removeStorageFiles(uploadedPaths).catch(cleanupError => console.error("Could not clean uploaded images:", cleanupError));
      errorBox.textContent = friendlyError(error, "No se pudo guardar la prenda. Comprueba la conexión e inténtalo de nuevo.");
      button.disabled = false;
      await reloadAndRender();
    }
  }

  function validateImage(file) {
    if (!file || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      notify("Usa una imagen JPG, PNG o WebP.", true);
      return false;
    }
    if (file.size > 15 * 1024 * 1024) {
      notify("La imagen supera el límite de 15 MB.", true);
      return false;
    }
    return true;
  }

  function previewFile(file, container) {
    if (!file || !validateImage(file)) return;
    container.replaceChildren();
    const image = document.createElement("img");
    image.src = URL.createObjectURL(file);
    image.alt = "Vista previa";
    container.append(image);
  }

  async function uploadImage(file, folder) {
    if (!validateImage(file)) throw new Error("Formato de imagen no válido.");
    const optimized = await optimizeImage(file);
    const extension = optimized.type === "image/png" ? "png" : optimized.type === "image/webp" ? "webp" : "jpg";
    const path = `${state.ownerId}/${folder}/${crypto.randomUUID()}.${extension}`;
    const { error } = await state.client.storage.from(BUCKET).upload(path, optimized, { contentType: optimized.type, upsert: false });
    if (error) throw error;
    return path;
  }

  async function optimizeImage(file) {
    if (typeof createImageBitmap !== "function") return file;
    let bitmap;
    try {
      bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob(result => result ? resolve(result) : reject(new Error("No se pudo optimizar la imagen.")), "image/jpeg", 0.84);
      });
      return blob.size < file.size ? blob : file;
    } catch (error) {
      console.warn("Image optimization skipped:", error);
      return file;
    } finally {
      if (bitmap) bitmap.close();
    }
  }

  function friendlyError(error, fallback) {
    const message = String(error && (error.message || error));
    if (/row-level security|permission denied|not authorized/i.test(message)) return "Supabase bloqueó la operación. Vuelve a ejecutar el schema.sql actualizado para activar las políticas sin inicio de sesión.";
    if (/bucket|not found/i.test(message)) return "No se encontró el bucket privado wardrobe-images.";
    if (/duplicate|unique/i.test(message)) return "Ese nombre ya está en uso.";
    return fallback;
  }

  async function removeStorageFiles(paths) {
    if (!paths.length) return;
    const { error } = await state.client.storage.from(BUCKET).remove(paths);
    if (error) throw error;
  }

  function isSafeWebUrl(value) {
    try {
      const parsed = new URL(value);
      return parsed.protocol === "https:" || parsed.protocol === "http:";
    } catch {
      return false;
    }
  }

  async function reloadAndRender() {
    await loadData();
    renderPage();
  }

  async function deleteSection(id) {
    const section = sectionById(id);
    if (!section || !isOwnProfile(section.profile_id)) return;
    const items = state.items.filter(item => item.section_id === id);
    if (!window.confirm(`¿Eliminar «${section.name}» y sus ${items.length} prendas? Esta acción no se puede deshacer.`)) return;
    try {
      const paths = [
        section.cover_path,
        ...state.images.filter(image => items.some(item => item.id === image.item_id)).map(image => image.storage_path)
      ].filter(Boolean);
      await removeStorageFiles(paths);
      const { error } = await state.client.from("sections").delete().eq("id", id);
      if (error) throw error;
      await reloadAndRender();
      notify("Sección eliminada.");
    } catch (error) {
      console.error("Could not delete section:", error);
      notify(friendlyError(error, "No se pudo eliminar la sección."), true);
    }
  }

  async function deleteItem(id) {
    const item = state.items.find(entry => entry.id === id);
    if (!canManageItem(item) || !window.confirm(`¿Eliminar «${item.name}» y todas sus imágenes? Esta acción no se puede deshacer.`)) return;
    try {
      const paths = state.images.filter(image => image.item_id === id).map(image => image.storage_path);
      await removeStorageFiles(paths);
      const { error } = await state.client.from("items").delete().eq("id", id);
      if (error) throw error;
      detailDialog.close();
      await reloadAndRender();
      notify("Prenda eliminada.");
    } catch (error) {
      console.error("Could not delete item:", error);
      notify(friendlyError(error, "No se pudo eliminar la prenda."), true);
    }
  }

  async function toggleSection(id) {
    const section = sectionById(id);
    if (!section || !isOwnProfile(section.profile_id)) return;
    const { error } = await state.client.from("sections").update({ is_hidden: !section.is_hidden }).eq("id", id);
    if (error) {
      console.error("Could not change section visibility:", error);
      notify("No se pudo cambiar la visibilidad.", true);
      return;
    }
    await reloadAndRender();
  }

  async function moveSection(id, offset) {
    const section = sectionById(id);
    if (!section || !isOwnProfile(section.profile_id)) return;
    const list = state.sections.filter(value => value.profile_id === section.profile_id).sort((a, b) => a.sort_order - b.sort_order);
    const index = list.findIndex(value => value.id === id);
    const target = index + offset;
    if (target < 0 || target >= list.length) return;
    [list[index], list[target]] = [list[target], list[index]];
    const results = await Promise.all(list.map((entry, order) =>
      state.client.from("sections").update({ sort_order: order }).eq("id", entry.id)
    ));
    const failure = results.find(result => result.error);
    if (failure) {
      console.error("Could not reorder sections:", failure.error);
      notify("No se pudo guardar el orden.", true);
    } else await reloadAndRender();
  }

  async function toggleFavorite(id) {
    const item = state.items.find(entry => entry.id === id);
    if (!item || !canManageItem(item)) return;
    const { error } = await state.client.from("items").update({ is_favorite: !item.is_favorite }).eq("id", id);
    if (error) {
      console.error("Could not update favorite:", error);
      notify("No se pudo actualizar el favorito.", true);
      return;
    }
    item.is_favorite = !item.is_favorite;
    renderPage();
  }

  function openItemDetail(id) {
    const item = state.items.find(entry => entry.id === id);
    if (!item) return;
    detailDialog.dataset.itemId = id;
    detailDialog.replaceChildren();
    const close = document.createElement("button");
    close.className = "dialog-close";
    close.textContent = "×";
    close.setAttribute("aria-label", "Cerrar");
    const layout = document.createElement("div");
    layout.className = "detail-layout";
    const gallery = document.createElement("div");
    gallery.className = "detail-gallery";
    const images = state.images.filter(image => image.item_id === id).sort((a, b) => a.sort_order - b.sort_order);
    if (!images.length) {
      const empty = document.createElement("div");
      empty.className = "detail-no-image";
      empty.textContent = "Sin fotografías";
      gallery.append(empty);
    } else images.forEach(image => {
      const button = document.createElement("button");
      button.className = "detail-image";
      button.dataset.action = "zoom-image";
      button.dataset.src = image.url || "";
      const img = document.createElement("img");
      img.src = image.url || "";
      img.alt = item.name;
      button.append(img);
      gallery.append(button);
    });
    const info = document.createElement("div");
    info.className = "detail-info";
    const eyebrow = document.createElement("p");
    eyebrow.className = "eyebrow";
    eyebrow.textContent = [
      (sectionById(item.section_id) || {}).name,
      item.garment_type,
      getColorLabel(item.color),
      item.size ? `Talla ${item.size}` : ""
    ].filter(Boolean).join(" · ");
    const title = document.createElement("h2");
    title.textContent = item.name;
    info.append(eyebrow, title);
    if (item.price != null) {
      const price = document.createElement("p");
      price.className = "detail-price";
      price.textContent = formatPrice(item.price);
      info.append(price);
    }
    if (item.description) {
      const description = document.createElement("p");
      description.className = "detail-description";
      description.textContent = item.description;
      info.append(description);
    }
    const date = document.createElement("p");
    date.className = "detail-date";
    date.textContent = `Añadida el ${new Intl.DateTimeFormat("es-ES", { dateStyle: "long" }).format(new Date(item.created_at))}`;
    info.append(date);
    if (item.purchase_url) {
      const link = document.createElement("a");
      link.className = "button button-dark button-wide";
      link.href = item.purchase_url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "Ver artículo original ↗";
      info.append(link);
    }
    if (canManageItem(item)) {
      const actions = document.createElement("div");
      actions.className = "detail-actions";
      actions.append(
        detailAction(item.is_favorite ? "♥ Favorita" : "♡ Favorito", "toggle-favorite-detail", item.id, "button button-outline"),
        detailAction("Editar", "edit-item", item.id, "button button-outline"),
        detailAction("Eliminar", "delete-item", item.id, "button button-danger"),
        detailAction(item.is_public ? "Ocultar del catálogo" : "Mostrar en catálogo", "toggle-item-visibility", item.id, "button button-outline")
      );
      info.append(actions);
    }
    layout.append(gallery, info);
    detailDialog.append(close, layout);
    detailDialog.showModal();
  }

  function detailAction(text, action, id, className) {
    const button = document.createElement("button");
    button.className = className;
    button.textContent = text;
    button.dataset.action = action;
    button.dataset.id = id;
    return button;
  }

  async function toggleItemVisibility(id) {
    const item = state.items.find(entry => entry.id === id);
    if (!canManageItem(item)) return;
    const { error } = await state.client.from("items").update({ is_public: !item.is_public }).eq("id", id);
    if (error) {
      console.error("Could not change item visibility:", error);
      notify("No se pudo cambiar la visibilidad en el catálogo.", true);
      return;
    }
    if (detailDialog.open) detailDialog.close();
    await reloadAndRender();
    openItemDetail(id);
  }

  async function saveSetting(key, value) {
    const { error } = await state.client.from("app_settings").upsert({
      owner_id: state.ownerId,
      setting_key: key,
      setting_value: value
    }, { onConflict: "owner_id,setting_key" });
    if (error) {
      console.error(`Could not save setting "${key}":`, error);
      notify("No se pudo guardar la configuración.", true);
      return false;
    }
    state.settings[key] = value;
    return true;
  }

  async function saveTheme(theme) {
    if (!THEMES.includes(theme)) {
      notify("Ese estilo no está disponible.", true);
      return;
    }
    if (!await saveSetting("theme", theme)) return;
    applyTheme();
  }

  async function saveHoverSound(enabled) {
    const wasEnabled = state.settings.hover_sound !== false;
    if (await saveSetting("hover_sound", enabled)) return;
    const checkbox = $("#hover-sound");
    if (checkbox) checkbox.checked = wasEnabled;
  }

  async function saveHoverSoundStyle(style) {
    if (!Object.prototype.hasOwnProperty.call(HOVER_SOUNDS, style)) {
      notify("Ese sonido no está disponible.", true);
      return;
    }
    const previousStyle = Object.prototype.hasOwnProperty.call(HOVER_SOUNDS, state.settings.hover_sound_style)
      ? state.settings.hover_sound_style
      : "chime";
    if (await saveSetting("hover_sound_style", style)) return;
    const select = $("#hover-sound-style");
    if (select) select.value = previousStyle;
  }

  function initializeHoverAudio() {
    if (state.settings.hover_sound === false || state.hoverAudio || state.hoverAudioUnavailable) return;
    const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextConstructor) {
      state.hoverAudioUnavailable = true;
      console.warn("Web Audio is not available in this browser.");
      notify("Este navegador no permite reproducir el sonido de los botones.", true);
      return;
    }
    try {
      state.hoverAudio = new AudioContextConstructor();
      state.hoverAudio.resume().catch(error => {
        state.hoverAudio = null;
        state.hoverAudioUnavailable = true;
        console.error("Could not resume button hover audio:", error);
        notify("No se pudo activar el sonido de los botones en este navegador.", true);
      });
    } catch (error) {
      state.hoverAudioUnavailable = true;
      console.error("Could not initialize button hover audio:", error);
      notify("No se pudo activar el sonido de los botones en este navegador.", true);
    }
  }

  function playHoverSound() {
    const audio = state.hoverAudio;
    if (state.settings.hover_sound === false || !audio || audio.state !== "running") return;
    const style = Object.prototype.hasOwnProperty.call(HOVER_SOUNDS, state.settings.hover_sound_style)
      ? state.settings.hover_sound_style
      : "chime";
    const preset = HOVER_SOUNDS[style];
    const now = audio.currentTime;
    const tone = audio.createOscillator();
    const volume = audio.createGain();
    tone.type = preset.type;
    tone.frequency.setValueAtTime(preset.start, now);
    tone.frequency.exponentialRampToValueAtTime(preset.end, now + preset.duration * 0.65);
    volume.gain.setValueAtTime(0.0001, now);
    volume.gain.exponentialRampToValueAtTime(preset.volume, now + Math.min(0.012, preset.duration * 0.2));
    volume.gain.exponentialRampToValueAtTime(0.0001, now + preset.duration);
    tone.connect(volume);
    volume.connect(audio.destination);
    tone.start(now);
    tone.stop(now + preset.duration + 0.005);
  }

  async function handleAction(action, id) {
    if (action === "go-home" || action === "home") goHome();
    else if (action === "new-category-from-item") {
      state.returnToItemAfterCategory = true;
      openSectionEditor();
    }
    else if (action === "new-section") openSectionEditor();
    else if (action === "edit-section") openSectionEditor(sectionById(id));
    else if (action === "delete-section") await deleteSection(id);
    else if (action === "toggle-section") await toggleSection(id);
    else if (action === "move-section-up") await moveSection(id, -1);
    else if (action === "move-section-down") await moveSection(id, 1);
    else if (action === "new-item") openItemEditor();
    else if (action === "open-item") openItemDetail(id);
    else if (action === "edit-item") {
      const item = state.items.find(entry => entry.id === id);
      detailDialog.close();
      openItemEditor(item);
    } else if (action === "delete-item") await deleteItem(id);
    else if (action === "toggle-favorite-detail") {
      detailDialog.close();
      await toggleFavorite(id);
      openItemDetail(id);
    } else if (action === "toggle-favorite") await toggleFavorite(id);
    else if (action === "toggle-item-visibility") await toggleItemVisibility(id);
  }

  function installEvents() {
    document.addEventListener("click", event => {
      const zoom = event.target.closest("[data-action=zoom-image]");
      if (zoom) {
        const img = $("img", zoom);
        $("img", imageDialog).src = zoom.dataset.src;
        $("img", imageDialog).alt = img.alt || "Imagen ampliada";
        imageDialog.showModal();
        return;
      }
      const nav = event.target.closest("[data-nav]");
      if (nav) {
        event.preventDefault();
        setView(nav.dataset.nav);
        return;
      }
      const action = event.target.closest("[data-action]");
      if (action) {
        if (action.dataset.action === "new-category-from-item") {
          editorDialog.close();
        }
        handleAction(action.dataset.action, action.dataset.id);
        return;
      }
    });

    $("#add-item-button").addEventListener("click", () => openItemEditor());
    $("#mobile-add-button").addEventListener("click", () => openItemEditor());
    $("#menu-button").addEventListener("click", () => sidebar.classList.toggle("open"));
    $("#theme-button").addEventListener("click", () => {
      const currentTheme = document.documentElement.dataset.theme;
      saveTheme(DARK_THEMES.includes(currentTheme) ? state.returnTheme : "dark");
    });
    document.addEventListener("pointerdown", initializeHoverAudio, { passive: true });
    document.addEventListener("pointerover", event => {
      if (event.pointerType !== "mouse" || !(event.target instanceof Element)) return;
      const target = event.target.closest("button, a");
      if (!target || target.disabled || target.contains(event.relatedTarget)) return;
      playHoverSound();
    });

    page.addEventListener("input", event => {
      if (event.target.id === "catalog-search") {
        state.search = event.target.value;
        renderItemsGrid();
      }
    });
    page.addEventListener("change", event => {
      if (event.target.id === "section-filter") {
        state.filterSection = event.target.value;
        renderItemsPage();
      } else if (event.target.id === "type-filter") {
        state.filterType = event.target.value;
        renderItemsPage();
      } else if (event.target.id === "color-filter") {
        state.filterColor = event.target.value;
        renderItemsPage();
      } else if (event.target.id === "size-filter") {
        state.filterSize = event.target.value;
        renderItemsPage();
      } else if (event.target.id === "sort-order") {
        state.sort = event.target.value;
        renderItemsGrid();
      } else if (event.target.id === "theme-select") saveTheme(event.target.value);
      else if (event.target.id === "hover-sound") saveHoverSound(event.target.checked);
      else if (event.target.id === "hover-sound-style") saveHoverSoundStyle(event.target.value);
    });

    [editorDialog, detailDialog, imageDialog].forEach(dialog => {
      dialog.addEventListener("click", event => {
        if (event.target === dialog) {
          if (dialog === editorDialog && state.returnToItemAfterCategory) state.returnToItemAfterCategory = false;
          dialog.close();
        }
        if (event.target.closest(".dialog-close")) {
          if (dialog === editorDialog && state.returnToItemAfterCategory) state.returnToItemAfterCategory = false;
          dialog.close();
        }
      });
    });
    editorDialog.addEventListener("cancel", () => { state.returnToItemAfterCategory = false; });
    $(".image-close", imageDialog).addEventListener("click", () => imageDialog.close());
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") renewVisibleUrls();
    });
  }

  if (!hasPublicConfig()) {
    page.replaceChildren(createEmptyState(
      "Configura Supabase",
      "Añade la URL y la clave pública de Supabase en config.js para cargar los armarios.",
      "",
      ""
    ));
  } else {
    state.client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
    installEvents();
    loadPublicData().then(loaded => {
      if (!loaded) return;
      state.view = "home";
      applyTheme();
      startSignedUrlRefresh();
      renderPage();
    });
  }
})();
