const SUPABASE_URL = "https://jdgpnojuqotiigbsdumk.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_AlHxgdbr_O85ctqrsoiwbA_1RT5VAeU";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const map = L.map("map", {
  zoomControl: true,
  maxBoundsViscosity: 1.0
}).setView([36.0588, -86.8005], 14);

L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
  maxZoom: 20,
  attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
}).addTo(map);

let parkLayer;
let trailsLayer;
let facilitiesLayer;
let waypointFacilitiesLayer;
let sightingsLayer;
let userLocationLayer;
let parkBounds = null;
let parkHomeZoom = null;

let selectedSightingLatLng = null;
let selectedSightingMarker = null;
let selectedTrailId = null;
let isAddingSighting = false;

let trailLookup = [];
let trailNameById = {};
let uniqueTrailNames = [];

let habitatsLayer;
let riverLayer;
let lakeLayer;

function showToast(message) {
  const toast = document.getElementById("toast");
  if (!toast) return;

  toast.textContent = message;
  toast.classList.remove("hidden");

  setTimeout(() => {
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



function getHabitatStyle(habitatType) {
  return {
    color: "#a44e4e",
    weight: 3,
    dashArray: "8, 5",
    fillColor: "#d98f8f",
    fillOpacity: 0.18
  };
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
    style: function (feature) {
      return getHabitatStyle(feature.properties.habitat_type);
    },
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
        layer.on("mouseover", function () {
          this.setStyle({
            fillOpacity: 0.35
          });
        });
        
        layer.on("mouseout", function () {
          this.setStyle({
            fillOpacity: 0.25
          });
        });
      });
    }
  }).addTo(map);
}

function setupSplashScreen() {
  const splash = document.getElementById("splashScreen");
  const enterBtn = document.getElementById("enterAppBtn");

  if (!splash || !enterBtn) return;

  enterBtn.addEventListener("click", () => {
    splash.classList.add("hidden");
  });
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



async function loadRiver() {
  const { data, error } = await supabaseClient
    .from("river")
    .select(`
      river_id,
      park_id,
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
      opacity: .35
    },
    onEachFeature: function (feature, layer) {
      layer.on("click", function (e) {
        if (isAddingSighting) return;

        const p = feature.properties;
      });
    }
  }).addTo(map);
}

async function loadLake() {
  const { data, error } = await supabaseClient
    .from("lake")
    .select(`
      lake_id,
      park_id,
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

function getMarkerStyle(category) {

  const styles = {
    "Bird": {
      radius: 5,
      fillColor: "#c9a44b"
    },
    "Mammal": {
      radius: 5,
      fillColor: "#4f7d64"
    },
    "Reptile": {
      radius: 5,
      fillColor: "#5f8f95"
    },
    "Amphibian": {
      radius: 5,
      fillColor: "#6aa84f"
    },
    "Fish": {
      radius: 5,
      fillColor: "#4a90e2"
    },
    "Insect": {
      radius: 5,
      fillColor: "#b57edc"
    }
  };

  const baseStyle = styles[category] || {
    radius: 5,
    fillColor: "#7a9e8b"
  };

  return {
    radius: baseStyle.radius,
    color: "#2f3e36",        
    fillColor: baseStyle.fillColor,
    weight: 1.5,
    fillOpacity: 0.95
  };
}

function getTrailColor(color) {
  switch ((color || "").toLowerCase()) {
    case "purple": return "#7e6bbf";
    case "blue": return "#3f7fbf";
    case "dark green": return "#2e6f4f";
    case "red": return "#c65a5a";
    case "yellow": return "#d1a93a";
    case "orange": return "#c7783a";
    case "brown": return "#8a6a4a";
    case "white": return "#4a4a4a";
    case "pink": return "#d67fa6";
    default: return "#6b7f75";
  }
}

function toggleNewSpeciesFields() {
  const speciesSelect = document.getElementById("sightingSpecies");
  const newSpeciesFields = document.getElementById("newSpeciesFields");

  if (!speciesSelect || !newSpeciesFields) return;

  if (speciesSelect.value === "__other__") {
    newSpeciesFields.classList.remove("hidden");
  } else {
    newSpeciesFields.classList.add("hidden");
  }
}

function getDistanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (deg) => deg * Math.PI / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);

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

  if (parkLayer) {
    map.removeLayer(parkLayer);
  }

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

function populateTrailLegend(trails) {
  const container = document.getElementById("trailLegend");
  if (!container) return;

  container.innerHTML = "";

  const seen = new Set();

  trails.forEach((t) => {
    const name = t.trail_name;
    const color = t.blaze_color;

    if (!name || seen.has(name)) return;
    seen.add(name);

    const item = document.createElement("div");
    item.className = "legend-item";

    item.innerHTML = `
      <span class="legend-line" style="background:${getTrailColor(color)};"></span>
      ${name}
    `;

    container.appendChild(item);
  });
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
      shape
    `);

  if (error) {
    console.error("Error loading trails:", error);
    return;
  }

  trailLookup = [];
  trailNameById = {};

  populateTrailLegend(data);

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
    style: function (feature) {
      return {
        color: getTrailColor(feature.properties.blaze_color),
        weight: 3,
        opacity: 0.95
      };
    },
    onEachFeature: function (feature, layer) {
      layer.on("click", function (e) {
        if (isAddingSighting) return;

        const p = feature.properties;
        layer.bindPopup(`
          <b>${p.trail_name ?? "Trail"}</b><br>
          <b>Blaze:</b> ${p.blaze_color ?? "N/A"}<br>
          <b>Surface:</b> ${p.trail_surface ?? "N/A"}<br>
          <b>Accessible:</b> ${p.accessible ?? "No"}<br>
          <b>Dogs Allowed:</b> ${p.dogs_allowed ?? "No"}<br>
          <b>Bicycles Allowed:</b> ${p.bicycles_allowed ?? "No"}<br>
          <b>All Terrain Wheelchair:</b> ${p.all_terrain_wheelchair ?? "No"}<br>
          <b>Length (mi):</b> ${p.length_mi ?? "N/A"}
        `).openPopup(e.latlng);
      });
    }
  }).addTo(map);

  populateTrailFilter();
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

function getFacilityStyle(category) {
  switch (category) {
    case "Visitor Center":
      return { color: "#4b5a52", fillColor: "#cbbd8f" };
    case "Parking":
      return { color: "#4b5a52", fillColor: "#a7b7be" };
    case "Education Center":
      return { color: "#4b5a52", fillColor: "#b0a4c9" };
    case "Observatory":
      return { color: "#4b5a52", fillColor: "#9fb9c7" };
    case "Mileage Waypoint":
    case "Viewable Waypoint":
      return { color: "#5d6a63", fillColor: "#d5ddd8" };
    default:
      return { color: "#4b5a52", fillColor: "#b7c3bc" };
  }
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
          html: `<div class="facility-icon"></div>`,
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

      return L.marker(latlng, {
        icon: L.divIcon({
          className: "facility-icon-wrapper",
          html: `<div class="facility-icon facility-icon-waypoint" style="
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

async function populateSpeciesFilter() {
  const { data, error } = await supabaseClient
    .from("wildlife_species")
    .select("common_name")
    .order("common_name");

  if (error) {
    console.error("Error loading species filter:", error);
    return;
  }

  const filterSelect = document.getElementById("speciesFilter");
  const sightingSelect = document.getElementById("sightingSpecies");
  const recentOnly = document.getElementById("recentOnly");

  if (!filterSelect || !sightingSelect) return;

  filterSelect.innerHTML = `<option value="">All species</option>`;
  sightingSelect.innerHTML = `
    <option value="">Choose a species</option>
    <option value="__other__">Other / Not listed</option>
  `;

  data.forEach((row) => {
    const option1 = document.createElement("option");
    option1.value = row.common_name;
    option1.textContent = row.common_name;
    filterSelect.appendChild(option1);

    const option2 = document.createElement("option");
    option2.value = row.common_name;
    option2.textContent = row.common_name;
    sightingSelect.appendChild(option2);
  });

  filterSelect.onchange = loadSightings;
  sightingSelect.onchange = toggleNewSpeciesFields;

  if (recentOnly) {
    recentOnly.onchange = loadSightings;
  }
}

function populateTrailFilter() {
  const trailFilter = document.getElementById("trailFilter");
  if (!trailFilter) return;

  trailFilter.innerHTML = `<option value="">All trails</option>`;

  uniqueTrailNames.forEach((name) => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    trailFilter.appendChild(option);
  });

  trailFilter.onchange = loadSightings;
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

  const selectedSpecies = document.getElementById("speciesFilter")?.value || "";
  const selectedTrail = document.getElementById("trailFilter")?.value || "";
  const recentChecked = document.getElementById("recentOnly")?.checked || false;

  const now = new Date();
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(now.getDate() - 7);

  const filtered = sightingsResult.data.filter((row) => {
    const speciesName = speciesLookup[row.species_id]?.common_name ?? "";
    const trailName = trailNameById[row.trail_id] ?? "";

    if (selectedSpecies && speciesName !== selectedSpecies) {
      return false;
    }

    if (selectedTrail && trailName !== selectedTrail) {
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

  btn.addEventListener("click", () => {
    map.locate({ setView: false, maxZoom: 16 });
  });

  map.on("locationfound", (e) => {
    const inPark = parkBounds && parkBounds.contains(e.latlng);

    if (!inPark) {
      showToast("You are outside the park.");

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

    userLocationLayer.bindPopup("You are here");
    map.setView(e.latlng, Math.max(map.getZoom(), parkHomeZoom || 16));
    showToast("Location found");
  });

  map.on("locationerror", (e) => {
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

  const panel = document.getElementById("addSightingPanel");
  const help = document.getElementById("sightingHelp");

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

  const panel = document.getElementById("addSightingPanel");
  const species = document.getElementById("sightingSpecies");
  const description = document.getElementById("sightingDescription");
  const selectedLocation = document.getElementById("selectedLocation");
  const selectedTrail = document.getElementById("selectedTrail");
  const newSpeciesFields = document.getElementById("newSpeciesFields");
  const newSpeciesCommonName = document.getElementById("newSpeciesCommonName");
  const newSpeciesScientificName = document.getElementById("newSpeciesScientificName");
  const newSpeciesCategory = document.getElementById("newSpeciesCategory");

  if (panel) panel.classList.add("hidden");
  if (species) species.value = "";
  if (description) description.value = "";
  if (selectedLocation) selectedLocation.textContent = "No location selected";
  if (selectedTrail) selectedTrail.textContent = "No trail selected";
  if (newSpeciesFields) newSpeciesFields.classList.add("hidden");
  if (newSpeciesCommonName) newSpeciesCommonName.value = "";
  if (newSpeciesScientificName) newSpeciesScientificName.value = "";
  if (newSpeciesCategory) newSpeciesCategory.value = "";

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
  await populateSpeciesFilter();
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
      help.textContent = "Location selected. Closest trail picked automatically. Choose species and submit.";
    }

    setPanelState("adding");
  });
}

async function init() {
  await loadPark();
  await loadLake();
  await loadRiver();
  await loadHabitats();
  await loadTrails();
  await loadFacilities();
  await populateSpeciesFilter();
  await loadSightings();
  setupLocateButton();
  setupSightingUI();
  setupDrawer();
  setupSplashScreen();
  setupInfoPanel();
  setPanelState("collapsed");
  map.on("zoomend", toggleWaypointFacilities);
}

init();