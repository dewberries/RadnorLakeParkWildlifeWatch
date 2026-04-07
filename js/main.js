const SUPABASE_URL = "https://jdgpnojuqotiigbsdumk.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_AlHxgdbr_O85ctqrsoiwbA_1RT5VAeU";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const map = L.map("map", {
  zoomControl: true,
  maxBoundsViscosity: 1.0
}).setView([36.0588, -86.8005], 14);

L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
  maxZoom: 20,
  attribution: "&copy; OpenStreetMap contributors &copy; CARTO"
}).addTo(map);

let parkLayer;
let trailsLayer;
let facilitiesLayer;
let waypointFacilitiesLayer;
let sightingsLayer;
let habitatsLayer;
let riverLayer;
let lakeLayer;
let userLocationLayer;

let selectedSightingLatLng = null;
let selectedSightingMarker = null;
let selectedTrailId = null;
let isAddingSighting = false;

let trailLookup = [];
let trailNameById = {};
let uniqueTrailNames = [];
let speciesOptions = [];

let parkBounds = null;
let parkHomeZoom = null;
let previousPanelState = "collapsed";

let selectedSpeciesFilter = "";
let selectedTrailFilter = "";

let currentFilterType = null;
let currentFilterTarget = null;

function showToast(message) {
  const toast = document.getElementById("toast");
  if (!toast) return;

  toast.textContent = message;
  toast.classList.remove("hidden");

  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    toast.classList.add("hidden");
  }, 2500);
}

function closeAllPopups() {
  map.closePopup();
}

function setPanelState(state) {
  const panel = document.getElementById("panel");
  const handle = document.getElementById("drawerHandle");
  if (!panel) return;

  if (state !== "adding") {
    previousPanelState = state;
  }

  panel.classList.remove("collapsed", "expanded", "adding");
  panel.classList.add(state);

  if (handle) {
    handle.textContent = state === "collapsed" ? "▲" : "▼";
  }
}

function setupDrawer() {
  const handle = document.getElementById("drawerHandle");
  const panel = document.getElementById("panel");
  if (!handle || !panel) return;

  handle.addEventListener("click", () => {
    if (panel.classList.contains("collapsed")) {
      setPanelState("expanded");
    } else {
      setPanelState("collapsed");
    }
  });
}

function getMarkerStyle(category) {
  const styles = {
    Bird: { radius: 7, fillColor: "#e0a800" },
    Mammal: { radius: 7, fillColor: "#a1475b" },
    Reptile: { radius: 7, fillColor: "#00897b" },
    Amphibian: { radius: 7, fillColor: "#43a047" },
    Fish: { radius: 7, fillColor: "#1e88e5" },
    Insect: { radius: 7, fillColor: "#8e24aa" }
  };

  const base = styles[category] || {
    radius: 7,
    fillColor: "#546e7a"
  };

  return {
    radius: base.radius,
    color: "#2f3e36",
    fillColor: base.fillColor,
    weight: 2,
    fillOpacity: 1
  };
}

function getTrailColor(blazeColor) {
  const value = (blazeColor || "").toLowerCase();

  if (value.includes("purple")) return "#7e6bbf";
  if (value.includes("blue")) return "#3f7fbf";
  if (value.includes("dark green")) return "#2e6f4f";
  if (value.includes("green")) return "#3f8a5f";
  if (value.includes("red")) return "#c65a5a";
  if (value.includes("yellow")) return "#d1a93a";
  if (value.includes("orange")) return "#c7783a";
  if (value.includes("brown")) return "#8a6a4a";
  if (value.includes("white")) return "#4a4a4a";
  if (value.includes("pink")) return "#d67fa6";

  return "#6b7f75";
}

function getHabitatStyle() {
  return {
    color: "#a44e4e",
    weight: 3,
    dashArray: "8, 5",
    fillColor: "#d98f8f",
    fillOpacity: 0.18
  };
}

function getDistanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (deg) => deg * Math.PI / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function flattenLatLngs(arr) {
  const result = [];

  function walk(item) {
    if (!item) return;
    if (Array.isArray(item)) {
      item.forEach(walk);
    } else if (typeof item.lat === "number" && typeof item.lng === "number") {
      result.push(item);
    }
  }

  walk(arr);
  return result;
}

function getClosestTrail(latlng) {
  if (!trailLookup.length) return null;

  let closest = null;
  let minDistance = Infinity;

  trailLookup.forEach((trail) => {
    trail.latlngs.forEach((pt) => {
      const distance = getDistanceMeters(latlng.lat, latlng.lng, pt.lat, pt.lng);
      if (distance < minDistance) {
        minDistance = distance;
        closest = {
          trail_id: trail.trail_id,
          trail_name: trail.trail_name,
          distance_m: distance
        };
      }
    });
  });

  return closest;
}

function updateSelectedTrailDisplay(trail) {
  const trailDisplay = document.getElementById("selectedTrail");
  if (!trailDisplay) return;

  if (!trail) {
    selectedTrailId = null;
    trailDisplay.textContent = "No trail selected";
    return;
  }

  selectedTrailId = trail.trail_id;
  trailDisplay.textContent = `Closest trail: ${trail.trail_name}`;
}

function toggleNewSpeciesFields() {
  const speciesInput = document.getElementById("sightingSpecies");
  const newSpeciesFields = document.getElementById("newSpeciesFields");

  if (!speciesInput || !newSpeciesFields) return;

  if (speciesInput.value === "__other__") {
    newSpeciesFields.classList.remove("hidden");
  } else {
    newSpeciesFields.classList.add("hidden");
  }
}

function updateFilterButtons() {
  const speciesValue = document.getElementById("speciesFilterValue");
  const trailValue = document.getElementById("trailFilterValue");

  if (speciesValue) {
    speciesValue.textContent = selectedSpeciesFilter || "All species";
  }

  if (trailValue) {
    trailValue.textContent = selectedTrailFilter || "All trails";
  }
}

function updateSightingSpeciesButton() {
  const speciesInput = document.getElementById("sightingSpecies");
  const speciesValue = document.getElementById("sightingSpeciesValue");

  if (!speciesInput || !speciesValue) return;

  if (!speciesInput.value) {
    speciesValue.textContent = "Choose a species";
  } else if (speciesInput.value === "__other__") {
    speciesValue.textContent = "Other / Not listed";
  } else {
    speciesValue.textContent = speciesInput.value;
  }
}

function setupFilterButtons() {
  const speciesBtn = document.getElementById("speciesFilterBtn");
  const trailBtn = document.getElementById("trailFilterBtn");
  const sightingSpeciesBtn = document.getElementById("sightingSpeciesBtn");
  const recentOnly = document.getElementById("recentOnly");

  if (speciesBtn) {
    speciesBtn.addEventListener("click", () => openFilterSheet("species", "filter"));
  }

  if (trailBtn) {
    trailBtn.addEventListener("click", () => openFilterSheet("trail", "filter"));
  }

  if (sightingSpeciesBtn) {
    sightingSpeciesBtn.addEventListener("click", () => openFilterSheet("species", "sighting"));
  }

  if (recentOnly) {
    recentOnly.addEventListener("change", loadSightings);
  }

  updateFilterButtons();
  updateSightingSpeciesButton();
}

function getFilterItems(type) {
  if (type === "species") {
    const baseItems = speciesOptions.map((name) => ({ value: name, label: name }));

    if (currentFilterTarget === "sighting") {
      return [
        { value: "", label: "Choose a species" },
        { value: "__other__", label: "Other / Not listed" },
        ...baseItems
      ];
    }

    return [
      { value: "", label: "All species" },
      ...baseItems
    ];
  }

  if (type === "trail") {
    return [
      { value: "", label: "All trails" },
      ...uniqueTrailNames.map((name) => ({ value: name, label: name }))
    ];
  }

  return [];
}

function getCurrentFilterValue(type) {
  if (type === "species" && currentFilterTarget === "sighting") {
    return document.getElementById("sightingSpecies")?.value || "";
  }

  return type === "species" ? selectedSpeciesFilter : selectedTrailFilter;
}

function renderFilterOptions() {
  const list = document.getElementById("filterOptionsList");
  const input = document.getElementById("filterSearchInput");
  if (!list || !currentFilterType) return;

  const search = (input?.value || "").trim().toLowerCase();
  const items = getFilterItems(currentFilterType).filter((item) =>
    item.label.toLowerCase().includes(search)
  );

  list.innerHTML = "";

  if (!items.length) {
    list.innerHTML = `<div class="filter-option-empty">No matches found</div>`;
    return;
  }

  const selectedValue = getCurrentFilterValue(currentFilterType);

  items.forEach((item) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "filter-option-btn";

    if (item.value === selectedValue) {
      btn.classList.add("is-selected");
    }

    btn.textContent = item.label;
    btn.addEventListener("click", () => setCurrentFilterValue(currentFilterType, item.value));
    list.appendChild(btn);
  });
}

function openFilterSheet(type, target = "filter") {
  currentFilterType = type;
  currentFilterTarget = target;

  const sheet = document.getElementById("filterSheet");
  const title = document.getElementById("filterSheetTitle");
  const subtitle = document.getElementById("filterSheetSubtitle");
  const input = document.getElementById("filterSearchInput");

  if (!sheet || !title || !subtitle || !input) return;

  if (type === "species" && target === "sighting") {
    title.textContent = "Species";
    subtitle.textContent = "Choose a species for this sighting";
    input.placeholder = "Search species";
  } else if (type === "species") {
    title.textContent = "Species";
    subtitle.textContent = "Select a species";
    input.placeholder = "Search species";
  } else {
    title.textContent = "Trails";
    subtitle.textContent = "Select a trail";
    input.placeholder = "Search trails";
  }

  input.value = "";
  sheet.classList.remove("hidden");
  renderFilterOptions();

  setTimeout(() => input.focus(), 50);
}

function closeFilterSheet() {
  const sheet = document.getElementById("filterSheet");
  if (sheet) {
    sheet.classList.add("hidden");
  }
  currentFilterType = null;
  currentFilterTarget = null;
}

function setCurrentFilterValue(type, value) {
  if (type === "species" && currentFilterTarget === "sighting") {
    const speciesInput = document.getElementById("sightingSpecies");
    if (speciesInput) {
      speciesInput.value = value;
    }

    updateSightingSpeciesButton();
    toggleNewSpeciesFields();
    closeFilterSheet();
    return;
  }

  if (type === "species") {
    selectedSpeciesFilter = value;
  } else if (type === "trail") {
    selectedTrailFilter = value;
  }

  updateFilterButtons();
  closeFilterSheet();
  loadSightings();
  setPanelState("collapsed");
}

function setupFilterSheet() {
  const closeBtn = document.getElementById("closeFilterSheetBtn");
  const input = document.getElementById("filterSearchInput");

  if (closeBtn) {
    closeBtn.addEventListener("click", closeFilterSheet);
  }

  if (input) {
    input.addEventListener("input", renderFilterOptions);
  }
}

function setupSplashScreen() {
  const splash = document.getElementById("splashScreen");
  const enterBtn = document.getElementById("enterAppBtn");

  if (!splash || !enterBtn) return;

  const closeSplash = () => splash.classList.add("hidden");

  enterBtn.addEventListener("click", closeSplash);
  enterBtn.addEventListener(
    "touchend",
    (e) => {
      e.preventDefault();
      closeSplash();
    },
    { passive: false }
  );
}

function setupInfoPanel() {
  const infoBtn = document.getElementById("infoBtn");
  const infoPanel = document.getElementById("infoPanel");
  const closeInfoBtn = document.getElementById("closeInfoBtn");

  if (!infoBtn || !infoPanel || !closeInfoBtn) return;

  infoBtn.addEventListener("click", () => {
    infoPanel.classList.remove("hidden");
  });

  closeInfoBtn.addEventListener("click", () => {
    infoPanel.classList.add("hidden");
  });
}

function populateTrailLegend(trails) {
  const container = document.getElementById("trailLegend");
  if (!container) return;

  container.innerHTML = "";
  const seen = new Set();

  trails.forEach((t) => {
    const name = t.trail_name;
    const blaze = t.blaze_color;
    if (!name || seen.has(name)) return;
    seen.add(name);

    const item = document.createElement("div");
    item.className = "legend-item";
    item.innerHTML = `
      <span class="legend-line" style="background:${getTrailColor(blaze)};"></span>
      ${name}
    `;
    container.appendChild(item);
  });
}

async function loadPark() {
  const { data, error } = await supabaseClient
    .from("park")
    .select("park_id, park_name, shape");

  if (error) {
    console.error("Error loading park:", error);
    return;
  }

  const geojson = {
    type: "FeatureCollection",
    features: data
      .filter((row) => row.shape)
      .map((row) => ({
        type: "Feature",
        geometry: row.shape,
        properties: row
      }))
  };

  if (parkLayer) map.removeLayer(parkLayer);

  parkLayer = L.geoJSON(geojson, {
    style: {
      color: "#89b39a",
      weight: 2,
      fillColor: "#5f8f73",
      fillOpacity: 0.08
    },
    onEachFeature: function (feature, layer) {
      layer.on("click", function (e) {
        if (isAddingSighting) return;
      });
    }
  }).addTo(map);

  if (parkLayer.getBounds().isValid()) {
    parkBounds = parkLayer.getBounds().pad(0.08);
    map.setMaxBounds(parkBounds);
    map.fitBounds(parkBounds);

    map.once("zoomend", () => {
      parkHomeZoom = map.getZoom();
      map.setMinZoom(parkHomeZoom);
    });
  }
}

async function loadLake() {
  const { data, error } = await supabaseClient
    .from("lake")
    .select(`
      lake_id,
      park_id,
      area_sq_km,
      shape_len,
      shape_area,
      shape
    `);

  if (error) {
    console.error("Error loading lake:", error);
    return;
  }

  const geojson = {
    type: "FeatureCollection",
    features: data
      .filter((row) => row.shape)
      .map((row) => ({
        type: "Feature",
        geometry: row.shape,
        properties: row
      }))
  };

  if (lakeLayer) {
    map.removeLayer(lakeLayer);
  }

  lakeLayer = L.geoJSON(geojson, {
    style: {
      color: "#5f9fc7",
      weight: 2,
      fillColor: "#9ecfe6",
      fillOpacity: 0.35
    },
    onEachFeature: function (feature, layer) {
      layer.on("click", function (e) {
        if (isAddingSighting) return;

        const p = feature.properties;
      });
    }
  }).addTo(map);
}

async function loadHabitats() {
  const { data, error } = await supabaseClient
    .from("habitat")
    .select(`
      habitat_id,
      park_id,
      name,
      type,
      public_access,
      shape
    `);

  if (error) {
    console.error("Error loading habitats:", error);
    return;
  }

  const geojson = {
    type: "FeatureCollection",
    features: data
      .filter((row) => row.shape)
      .map((row) => ({
        type: "Feature",
        geometry: row.shape,
        properties: row
      }))
  };

  if (habitatsLayer) {
    map.removeLayer(habitatsLayer);
  }

  habitatsLayer = L.geoJSON(geojson, {
    style: getHabitatStyle(),
    onEachFeature: function (feature, layer) {
      layer.on("click", function (e) {
        if (isAddingSighting) return;

        const p = feature.properties;
        layer.bindPopup(`
          <b>Eagle Protection Zone</b><br>
          <b>Status:</b> Restricted Area<br>
          <b>Access:</b> No public entry<br>
          <i>Protected habitat for nesting eagles</i>
        `).openPopup(e.latlng);
      });

      layer.on("mouseover", function () {
        this.setStyle({
          fillOpacity: 0.3
        });
      });

      layer.on("mouseout", function () {
        this.setStyle({
          fillOpacity: 0.18
        });
      });
    }
  }).addTo(map);
}

async function loadRiver() {
  const { data, error } = await supabaseClient
    .from("river")
    .select(`
      river_id,
      park_id,
      length_km,
      shape_len,
      shape
    `);

  if (error) {
    console.error("Error loading river:", error);
    return;
  }

  const geojson = {
    type: "FeatureCollection",
    features: data
      .filter((row) => row.shape)
      .map((row) => ({
        type: "Feature",
        geometry: row.shape,
        properties: row
      }))
  };

  if (riverLayer) {
    map.removeLayer(riverLayer);
  }

  riverLayer = L.geoJSON(geojson, {
    style: {
      color: "#4f88b7",
      weight: 3,
      opacity: 0.35
    },
    onEachFeature: function (feature, layer) {
      layer.on("click", function (e) {
        if (isAddingSighting) return;

        const p = feature.properties;
        layer.bindPopup(`
          <b>River / Stream</b><br>
          <b>Length (km):</b> ${p.length_km ?? "N/A"}<br>
          <b>Shape Length:</b> ${p.shape_len ?? "N/A"}
        `).openPopup(e.latlng);
      });
    }
  }).addTo(map);
}

function getFacilityCategory(p) {
  const name = (p.name || "").trim();

  if (name === "Walter Criley Visitor Center - Park Office") return "Visitor Center";
  if (name === "East Parking Area") return "Parking";
  if (name === "Barbara J. Map Aviary Education Center") return "Education Center";
  if (name === "Dyer Observatory") return "Observatory";
  if (name === "Mileage Waypoint") return "Mileage Waypoint";
  if (name === "Viewable Waypoint") return "Viewable Waypoint";

  return "Facility";
}

function getFacilityStyle(category) {
  switch (category) {
    case "Visitor Center":
      return {
        color: "#6a6f63",
        fillColor: "rgb(197, 196, 119)"
      };

    case "Parking":
      return {
        color: "#6a6f63",
        fillColor: "rgb(197, 196, 119)"
      };

    case "Education Center":
      return {
        color: "#6a6f63",
        fillColor: "rgb(197, 196, 119)"
      };

    case "Observatory":
      return {
        color: "#6a6f63",
        fillColor: "rgb(197, 196, 119)"
      };

    case "Mileage Waypoint":
      return {
        color: "#6a6f63",
        fillColor: "#98d181"
      };

    case "Viewable Waypoint":
      return {
        color: "#6a6f63",
        fillColor: "#75dbac"
      };

    default:
      return {
        color: "#6a6f63",
        fillColor: "rgb(197, 196, 119)"
      };
  }
}

function bindFacilityPopup(feature, layer) {
  layer.on("click", function (e) {
    if (isAddingSighting) return;

    const p = feature.properties;
    layer.bindPopup(`
      <b>${p.name ?? "Facility"}</b><br>
      <b>Restroom:</b> ${p.restroom ?? "No"}<br>
      <b>Information:</b> ${p.information ?? "No"}<br>
      <b>Parking:</b> ${p.parking ?? "No"}<br>
      <b>Trailhead:</b> ${p.trailhead ?? "No"}<br>
      <b>Accessible:</b> ${p.accessible ?? "No"}<br>
      <b>Water Fountain:</b> ${p.water_fountain ?? "No"}<br>
      <b>Bottle Filling Station:</b> ${p.bottle_filling_station ?? "No"}<br>
      <b>EV Charging:</b> ${p.ev_charging ?? "No"}
    `).openPopup(e.latlng);
  });
}

async function loadFacilities() {
  const { data, error } = await supabaseClient
    .from("park_facility")
    .select(`
      facility_id,
      name,
      restroom,
      information,
      parking,
      bottle_filling_station,
      accessible,
      trailhead,
      ev_charging,
      water_fountain,
      shape
    `);

  if (error) {
    console.error("Error loading facilities:", error);
    return;
  }

  const allFacilities = data
    .filter((row) => row.shape)
    .map((row) => ({
      ...row,
      facility_category: getFacilityCategory(row)
    }));

  const regularFacilities = allFacilities.filter(
    (row) =>
      row.facility_category !== "Mileage Waypoint" &&
      row.facility_category !== "Viewable Waypoint"
  );

  const waypointFacilities = allFacilities.filter(
    (row) =>
      row.facility_category === "Mileage Waypoint" ||
      row.facility_category === "Viewable Waypoint"
  );

  const regularGeojson = {
    type: "FeatureCollection",
    features: regularFacilities.map((row) => ({
      type: "Feature",
      geometry: row.shape,
      properties: row
    }))
  };

  const waypointGeojson = {
    type: "FeatureCollection",
    features: waypointFacilities.map((row) => ({
      type: "Feature",
      geometry: row.shape,
      properties: row
    }))
  };

  if (facilitiesLayer) {
    map.removeLayer(facilitiesLayer);
  }

  if (waypointFacilitiesLayer) {
    map.removeLayer(waypointFacilitiesLayer);
  }

  facilitiesLayer = L.geoJSON(regularGeojson, {
    pointToLayer: function (feature, latlng) {
      const style = getFacilityStyle(feature.properties.facility_category);

      return L.marker(latlng, {
        icon: L.divIcon({
          className: "facility-icon-wrapper",
          html: `<div class="facility-icon" style="background:${style.fillColor}; border:2px solid ${style.color};"></div>`,
          iconSize: [12, 12],
          iconAnchor: [6, 6]
        })
      });
    },
    onEachFeature: bindFacilityPopup
  }).addTo(map);

  waypointFacilitiesLayer = L.geoJSON(waypointGeojson, {
    pointToLayer: function (feature, latlng) {
      const style = getFacilityStyle(feature.properties.facility_category);
      const cat = feature.properties.facility_category;
  
      const extraClass =
        cat === "Mileage Waypoint"
          ? "facility-icon-mileage"
          : "facility-icon-viewpoint";
  
      return L.marker(latlng, {
        icon: L.divIcon({
          className: "facility-icon-wrapper",
          html: `<div class="facility-icon ${extraClass}" style="
            background:${style.fillColor};
            border:1.5px solid ${style.color};
          "></div>`,
          iconSize: [10, 10],
          iconAnchor: [5, 5]
        })
      });
    },
    onEachFeature: bindFacilityPopup
  });

  toggleWaypointFacilities();
}

function toggleWaypointFacilities() {
  if (!waypointFacilitiesLayer) return;

  const zoom = map.getZoom();
  const showAtZoom = 16;

  if (zoom >= showAtZoom) {
    if (!map.hasLayer(waypointFacilitiesLayer)) {
      waypointFacilitiesLayer.addTo(map);
    }
  } else {
    if (map.hasLayer(waypointFacilitiesLayer)) {
      map.removeLayer(waypointFacilitiesLayer);
    }
  }
}

async function populateSpeciesOptions() {
  const { data, error } = await supabaseClient
    .from("wildlife_species")
    .select("common_name")
    .order("common_name");

  if (error) {
    console.error("Error loading species options:", error);
    return;
  }

  speciesOptions = data.map((row) => row.common_name);

  updateFilterButtons();
  updateSightingSpeciesButton();
}

async function loadTrails() {
  const { data, error } = await supabaseClient
    .from("trail")
    .select(`
      trail_id,
      trail_name,
      blaze_color,
      trail_surface,
      accessible,
      dogs_allowed,
      bicycles_allowed,
      all_terrain_wheelchair,
      length_mi,
      segment_type,
      shape
    `);

  if (error) {
    console.error("Error loading trails:", error);
    return;
  }

  trailLookup = [];
  trailNameById = {};

  const trailNameSet = new Set();

  const geojson = {
    type: "FeatureCollection",
    features: data
      .filter((row) => row.shape)
      .map((row) => {
        const trailName = row.trail_name || `Trail ${row.trail_id}`;

        trailNameById[row.trail_id] = trailName;
        trailNameSet.add(trailName);

        const layerTemp = L.geoJSON({
          type: "Feature",
          geometry: row.shape,
          properties: {}
        });

        let latlngs = [];
        layerTemp.eachLayer((l) => {
          if (l.getLatLngs) {
            latlngs = flattenLatLngs(l.getLatLngs());
          }
        });

        trailLookup.push({
          trail_id: row.trail_id,
          trail_name: trailName,
          latlngs
        });

        return {
          type: "Feature",
          geometry: row.shape,
          properties: row
        };
      })
  };

  uniqueTrailNames = Array.from(trailNameSet).sort();

  if (trailsLayer) {
    map.removeLayer(trailsLayer);
  }

  trailsLayer = L.geoJSON(geojson, {
    style: function () {
      return {
        color: "#000000",
        weight: 14,
        opacity: 0,
        interactive: true
      };
    },
    onEachFeature: function (feature, layer) {
      const p = feature.properties;

      const visibleTrail = L.geoJSON(feature, {
        style: {
          color: getTrailColor(p.blaze_color),
          weight: 4,
          opacity: 1
        },
        interactive: false
      }).addTo(map);

      layer.on("click", function (e) {
        if (isAddingSighting) return;

        layer.bindPopup(`
          <b>${p.trail_name ?? "Trail"}</b><br>
          <b>Segment Type:</b> ${p.segment_type ?? "N/A"}<br>
          <b>Blaze:</b> ${p.blaze_color ?? "N/A"}<br>
          <b>Surface:</b> ${p.trail_surface ?? "N/A"}<br>
          <b>Accessible:</b> ${p.accessible ?? "No"}<br>
          <b>Dogs Allowed:</b> ${p.dogs_allowed ?? "No"}<br>
          <b>Bicycles Allowed:</b> ${p.bicycles_allowed ?? "No"}<br>
          <b>All Terrain Wheelchair:</b> ${p.all_terrain_wheelchair ?? "No"}<br>
          <b>Length (mi):</b> ${p.length_mi ?? "N/A"}
        `).openPopup(e.latlng);
      });

      layer.on("mouseover", function () {
        visibleTrail.setStyle({ weight: 6 });
      });

      layer.on("mouseout", function () {
        visibleTrail.setStyle({ weight: 4 });
      });
    }
  }).addTo(map);

  populateTrailLegend(data);
  updateFilterButtons();
}

async function loadSightings() {
  const sightingsResult = await supabaseClient
    .from("wildlife_sighting")
    .select(`
      sighting_id,
      species_id,
      sighting_datetime,
      description,
      reported_by,
      latitude,
      longitude,
      trail_id
    `);

  const speciesResult = await supabaseClient
    .from("wildlife_species")
    .select("species_id, common_name, category");

  if (sightingsResult.error || speciesResult.error) {
    console.error(sightingsResult.error || speciesResult.error);
    return;
  }

  const speciesLookup = {};
  speciesResult.data.forEach((row) => {
    speciesLookup[row.species_id] = row;
  });

  const recentChecked = document.getElementById("recentOnly")?.checked || false;

  const now = new Date();
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(now.getDate() - 7);

  const filtered = sightingsResult.data.filter((row) => {
    const speciesName = speciesLookup[row.species_id]?.common_name ?? "";
    const trailName = trailNameById[row.trail_id] ?? "";

    if (selectedSpeciesFilter && speciesName !== selectedSpeciesFilter) {
      return false;
    }

    if (selectedTrailFilter && trailName !== selectedTrailFilter) {
      return false;
    }

    if (recentChecked) {
      const sightingDate = new Date(row.sighting_datetime);
      if (isNaN(sightingDate.getTime()) || sightingDate < sevenDaysAgo) {
        return false;
      }
    }

    return true;
  });

  const geojson = {
    type: "FeatureCollection",
    features: filtered
      .filter((row) => row.longitude !== null && row.latitude !== null)
      .map((row) => ({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [row.longitude, row.latitude]
        },
        properties: {
          ...row,
          common_name: speciesLookup[row.species_id]?.common_name ?? "Unknown",
          category: speciesLookup[row.species_id]?.category ?? "Unknown",
          trail_name: trailNameById[row.trail_id] ?? "Unknown"
        }
      }))
  };

  if (sightingsLayer) {
    map.removeLayer(sightingsLayer);
  }

  sightingsLayer = L.geoJSON(geojson, {
    pointToLayer: function (feature, latlng) {
      return L.circleMarker(latlng, getMarkerStyle(feature.properties.category));
    },
    onEachFeature: function (feature, layer) {
      const p = feature.properties;
      layer.bindPopup(`
        <b>${p.common_name}</b><br>
        <b>Category:</b> ${p.category}<br>
        <b>Trail:</b> ${p.trail_name}<br>
        <b>Date:</b> ${p.sighting_datetime ?? ""}<br>
        <b>Description:</b> ${p.description ?? ""}
      `);
    }
  }).addTo(map);
}

function setupLocateButton() {
  const btn = document.getElementById("locateBtn");
  if (!btn) return;

  let locating = false;

  btn.addEventListener("click", () => {
    if (locating) return;

    locating = true;
    btn.disabled = true;
    showToast("Getting your location...");

    map.locate({
      setView: false,
      maxZoom: 16,
      enableHighAccuracy: true,
      timeout: 10000
    });
  });

  map.on("locationfound", (e) => {
    locating = false;
    btn.disabled = false;

    const inPark = parkBounds && parkBounds.contains(e.latlng);

    if (!inPark) {
      showToast("You are outside the park. Returning to park view.");

      if (parkBounds) {
        map.fitBounds(parkBounds);
      }

      if (userLocationLayer) {
        map.removeLayer(userLocationLayer);
        userLocationLayer = null;
      }

      return;
    }

    if (userLocationLayer) {
      map.removeLayer(userLocationLayer);
    }

    userLocationLayer = L.circleMarker(e.latlng, {
      radius: 8,
      color: "#e7efe9",
      fillColor: "#d7b56d",
      weight: 2,
      fillOpacity: 0.95
    }).addTo(map);

    userLocationLayer.bindPopup("You are here").openPopup();
    map.setView(e.latlng, Math.max(map.getZoom(), parkHomeZoom || 16));
    showToast("Location found");
  });

  map.on("locationerror", (e) => {
    locating = false;
    btn.disabled = false;
    console.error(e);
    showToast("Could not get your location");

    if (parkBounds) {
      map.fitBounds(parkBounds);
    }
  });
}

function openSightingPanel() {
  isAddingSighting = true;
  document.body.classList.add("adding-sighting");

  const defaultContent = document.getElementById("defaultPanelContent");
  const panel = document.getElementById("addSightingPanel");
  const help = document.getElementById("sightingHelp");

  if (defaultContent) defaultContent.classList.add("hidden");
  if (panel) panel.classList.remove("hidden");
  if (help) help.textContent = "Tap the map to place your sighting.";

  setPanelState("adding");
  showToast("Tap the map to choose a location");
}

function closeSightingPanel() {
  isAddingSighting = false;
  document.body.classList.remove("adding-sighting");
  selectedSightingLatLng = null;
  selectedTrailId = null;

  const defaultContent = document.getElementById("defaultPanelContent");
  const panel = document.getElementById("addSightingPanel");
  const species = document.getElementById("sightingSpecies");
  const description = document.getElementById("sightingDescription");
  const selectedLocation = document.getElementById("selectedLocation");
  const selectedTrail = document.getElementById("selectedTrail");
  const newSpeciesFields = document.getElementById("newSpeciesFields");
  const newSpeciesCommonName = document.getElementById("newSpeciesCommonName");
  const newSpeciesScientificName = document.getElementById("newSpeciesScientificName");
  const newSpeciesCategory = document.getElementById("newSpeciesCategory");

  if (defaultContent) defaultContent.classList.remove("hidden");
  if (panel) panel.classList.add("hidden");
  if (species) species.value = "";
  if (description) description.value = "";
  if (selectedLocation) selectedLocation.textContent = "No location selected";
  if (selectedTrail) selectedTrail.textContent = "No trail selected";
  if (newSpeciesFields) newSpeciesFields.classList.add("hidden");
  if (newSpeciesCommonName) newSpeciesCommonName.value = "";
  if (newSpeciesScientificName) newSpeciesScientificName.value = "";
  if (newSpeciesCategory) newSpeciesCategory.value = "";

  updateSightingSpeciesButton();

  if (selectedSightingMarker) {
    map.removeLayer(selectedSightingMarker);
    selectedSightingMarker = null;
  }

  setPanelState("collapsed");
}

async function submitSighting() {
  const speciesName = document.getElementById("sightingSpecies")?.value || "";
  const description = document.getElementById("sightingDescription")?.value.trim() || "";

  const newSpeciesCommonName =
    document.getElementById("newSpeciesCommonName")?.value.trim() || "";
  const newSpeciesScientificName =
    document.getElementById("newSpeciesScientificName")?.value.trim() || "";
  const newSpeciesCategory =
    document.getElementById("newSpeciesCategory")?.value || "";

  if (!selectedSightingLatLng) {
    showToast("Choose a location on the map first");
    return;
  }

  if (!selectedTrailId) {
    showToast("Tap the map to auto-pick the nearest trail");
    return;
  }

  if (!speciesName) {
    showToast("Choose a species");
    return;
  }

  if (!description) {
    showToast("Enter a short description");
    return;
  }

  if (description.length > 200) {
    showToast("Description must be 200 characters or less");
    return;
  }

  let speciesId = null;

  if (speciesName === "__other__") {
    if (!newSpeciesCommonName) {
      showToast("Enter a new species name");
      return;
    }

    if (!newSpeciesCategory) {
      showToast("Choose a category for the new species");
      return;
    }

    const { data: existingSpecies, error: existingError } = await supabaseClient
      .from("wildlife_species")
      .select("species_id")
      .ilike("common_name", newSpeciesCommonName)
      .maybeSingle();

    if (existingError) {
      console.error(existingError);
      showToast("Could not check species list");
      return;
    }

    if (existingSpecies) {
      speciesId = existingSpecies.species_id;
    } else {
      const { data: insertedSpecies, error: insertSpeciesError } = await supabaseClient
        .from("wildlife_species")
        .insert([
          {
            common_name: newSpeciesCommonName,
            scientific_name: newSpeciesScientificName || null,
            category: newSpeciesCategory
          }
        ])
        .select("species_id")
        .single();

      if (insertSpeciesError) {
        console.error(insertSpeciesError);
        showToast("Could not add new species");
        return;
      }

      speciesId = insertedSpecies.species_id;
      await populateSpeciesOptions();
    }
  } else {
    const { data: speciesData, error: speciesError } = await supabaseClient
      .from("wildlife_species")
      .select("species_id")
      .eq("common_name", speciesName)
      .single();

    if (speciesError) {
      console.error(speciesError);
      showToast("Could not find species");
      return;
    }

    speciesId = speciesData.species_id;
  }

  const lat = selectedSightingLatLng.lat;
  const lng = selectedSightingLatLng.lng;

  const { error } = await supabaseClient
    .from("wildlife_sighting")
    .insert([
      {
        park_id: 1,
        trail_id: Number(selectedTrailId),
        species_id: speciesId,
        sighting_datetime: new Date().toISOString(),
        description: description,
        photo_url: null,
        reported_by: "App User",
        latitude: lat,
        longitude: lng,
        shape: `POINT(${lng} ${lat})`
      }
    ]);

  if (error) {
    console.error(error);
    showToast("Could not submit sighting");
    return;
  }

  showToast("Sighting submitted");
  closeSightingPanel();
  await loadSightings();
}

function setupSightingUI() {
  const openBtn = document.getElementById("openSightingBtn");
  const cancelBtn = document.getElementById("cancelSightingBtn");
  const submitBtn = document.getElementById("submitSightingBtn");

  if (openBtn) openBtn.addEventListener("click", openSightingPanel);
  if (cancelBtn) cancelBtn.addEventListener("click", closeSightingPanel);
  if (submitBtn) submitBtn.addEventListener("click", submitSighting);

  map.on("click", (e) => {
    if (!isAddingSighting) return;

    closeAllPopups();

    selectedSightingLatLng = e.latlng;

    if (selectedSightingMarker) {
      map.removeLayer(selectedSightingMarker);
    }

    selectedSightingMarker = L.circleMarker(e.latlng, {
      radius: 8,
      color: "#e7efe9",
      fillColor: "#5f8f73",
      weight: 2,
      fillOpacity: 0.95
    }).addTo(map);

    const selectedLocation = document.getElementById("selectedLocation");
    const help = document.getElementById("sightingHelp");

    if (selectedLocation) {
      selectedLocation.textContent =
        `Location selected: ${e.latlng.lat.toFixed(5)}, ${e.latlng.lng.toFixed(5)}`;
    }

    const closestTrail = getClosestTrail(e.latlng);
    updateSelectedTrailDisplay(closestTrail);

    if (help) {
      help.textContent =
        "Location selected. Closest trail picked automatically. Choose species and submit.";
    }

    setPanelState("expanded");
  });
}

async function init() {
  setupSplashScreen();
  setupInfoPanel();
  setupDrawer();
  setupLocateButton();
  setupSightingUI();
  setupFilterButtons();
  setupFilterSheet();
  setPanelState("collapsed");

  map.on("zoomend", toggleWaypointFacilities);

  await loadPark();
  await loadLake();
  await loadRiver();
  await loadHabitats();
  await loadTrails();
  await loadFacilities();
  await populateSpeciesOptions();
  await loadSightings();
}

init();