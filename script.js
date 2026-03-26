// --- Firebase (Firestore for storing spots) ---
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { 
  getFirestore, collection, addDoc, getDocs, serverTimestamp, doc, updateDoc, getDoc 
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js';

const firebaseConfig = {
  apiKey: "AIzaSyBqUaNlFlKcyl86kaDDN196eRTGOJtlxkY",
  authDomain: "urbex-alberta-test.firebaseapp.com",
  projectId: "urbex-alberta-test",
  storageBucket: "urbex-alberta-test.firebasestorage.app",
  messagingSenderId: "324527243889",
  appId: "1:324527243889:web:9d506e8ecd4d00330791d0"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);
const SPOTS_COLLECTION = 'spots';

let userRole = null;
let map; // Global map variable

// Marker icon factory for different classes
function getSpotIcon(spotClass) {
  let overlay = '';
  // Overlap emoji about 60% over the house icon
  if (spotClass === 'confirmed') overlay = '<span style="position:absolute;top:1px;left:60%;transform:translate(-50%, 0);font-size:1rem;z-index:2;">✅</span>';
  else if (spotClass === 'risky') overlay = '<span style="position:absolute;top:1px;left:60%;transform:translate(-50%, 0);font-size:1.4rem;z-index:2;">⚠️</span>';
  else if (spotClass === 'unsure') overlay = '<span style="position:absolute;top:1px;left:60%;transform:translate(-50%, 0);font-size:1.4rem;z-index:2;">❓</span>';
  return L.divIcon({
    className: 'derelict-marker',
    html: `<div style="position:relative;width:36px;height:36px;">${overlay}<span style="font-size:2rem;">🏚️</span></div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 36],
    popupAnchor: [0, -36]
  });
}
// Custom derelict house emoji marker icon
const derelictIcon = L.divIcon({
  className: 'derelict-marker',
  html: '<span style="font-size:2rem;">🏚️</span>',
  iconSize: [36, 36],
  iconAnchor: [18, 36],
  popupAnchor: [0, -36]
});

async function loadSpots() {
  try {
    const snapshot = await getDocs(collection(db, SPOTS_COLLECTION));
    snapshot.forEach((docSnap) => {
      const d = docSnap.data();
      const lat = d.lat ?? d.latitude;
      const lng = d.lng ?? d.longitude;
      if (lat == null || lng == null) return;
      const spotClass = d.spotClass || 'default';
      const m = L.marker([lat, lng], { draggable: false, icon: getSpotIcon(spotClass) }).addTo(map);
      m._spotId = docSnap.id;
      m.bindPopup(createSpotPopup({ marker: m, spotId: docSnap.id, name: d.name || 'Unnamed spot', desc: d.description || '', imageUrl: d.imageUrl || '', editMode: false }), { minWidth: 220 });
    });
  } catch (err) {
    console.warn('Could not load spots from Firestore:', err);
  }
}

let addMode = false;

async function verifyKey() {
  const key = document.getElementById("keyInput").value;

  if (!key.trim()) {
    document.getElementById("gateError").textContent = 'Please enter a key';
    document.getElementById("gateError").style.display = 'block';
    return;
  }

  document.getElementById("gateError").style.display = 'none';

  try {
    let resolvedRole = null;

    // Fetch role from Firestore keys collection (no hardcoded keys in client code)
    const docRef = doc(db, "keys", key);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      resolvedRole = docSnap.data().role || null;
    }

    if (resolvedRole) {
      userRole = resolvedRole;
      sessionStorage.setItem('mapUnlocked', '1');
      sessionStorage.setItem('userRole', userRole);
      document.getElementById("gate").style.display = 'none';
      if (!map) runMapApp();
    } else {
      document.getElementById("gateError").textContent = 'Invalid key';
      document.getElementById("gateError").style.display = 'block';
    }
  } catch (error) {
    document.getElementById("gateError").textContent = 'Error: ' + error.message;
    document.getElementById("gateError").style.display = 'block';
  }
}

// Expose to global scope for onclick handler
window.verifyKey = verifyKey;

function runMapApp() {
  if (!window.L) throw new Error('Leaflet failed to load. Check internet or blocked unpkg.com');

  // Create the map
  map = L.map('map').setView([53.5444, -113.4909], 12);

  // Street
  const street = L.tileLayer(
    'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    { attribution: '© OpenStreetMap contributors' }
  );

  // Satellite
  const satellite = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    { attribution: 'Tiles © Esri' }
  );

  // Roads overlay
  const roads = L.tileLayer(
    'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}',
    { attribution: 'Roads © Esri' }
  );

  // Town / city names
  const places = L.tileLayer(
    'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
    { attribution: 'Places © Esri' }
  );

  // Hybrid = satellite + roads + places
  const hybrid = L.layerGroup([satellite, roads, places]);

  // Default view
  hybrid.addTo(map);

  // Layer switcher
  const baseMaps = {
    "Street Map": street,
    "Satellite": satellite,
    "Hybrid": hybrid
  };

  L.control.layers(baseMaps, null, {
    position: 'topright'
  }).addTo(map);

  // Add Street View control to map (plugin)
  if (window.L && typeof L.control.streetView === 'function') {
    setTimeout(() => {
      L.control.streetView().addTo(map);
    }, 500);
  }

  // Load spots
  loadSpots();

  // Add spot button handler (only for non-visitors)
  if (userRole !== 'visitor') {
    document.getElementById("addSpotBtn").onclick = () => {
      addMode = true;
      alert("Click on the map to add a spot");
    };
  } else {
    // Hide add button for visitors
    document.getElementById("addSpotBtn").style.display = 'none';
  }

  // Map click handler
  map.on("click", async function (e) {
    if (userRole === 'visitor' || !addMode) return;
    const newMarker = L.marker(e.latlng, { draggable: true, icon: getSpotIcon('default') }).addTo(map);
    const wrap = document.createElement('div');
    wrap.innerHTML = `<strong>New Spot</strong><br>
      <select id="spotClass" style="margin:4px 0;width:100%;box-sizing:border-box;">
        <option value="default">No Class</option>
        <option value="confirmed">✅ Confirmed</option>
        <option value="risky">⚠️ Risky</option>
        <option value="unsure">❓ Unsure</option>
      </select>
      <input type="text" id="spotName" placeholder="Name" style="margin:4px 0;width:100%;box-sizing:border-box;">
      <input type="file" id="spotImage" accept="image/*" style="display:none">
      <div id="spotDesc" contenteditable style="min-height:40px;margin:4px 0;border:1px solid #ccc;padding:4px;font-size:12px;"></div>
      <button type="button" id="saveSpotBtn">Save to cloud</button>
      <p id="saveStatus" style="margin:4px 0;font-size:12px;"></p>`;
    addDescToolbar(wrap.querySelector('#spotDesc'), wrap.querySelector('#spotImage'));
    newMarker.bindPopup(wrap, { minWidth: 240 }).openPopup();
    wrap.querySelector('#spotClass').onchange = function() {
      newMarker.setIcon(getSpotIcon(this.value));
    };
    wrap.querySelector('#saveSpotBtn').onclick = async () => {
      const name = (wrap.querySelector('#spotName').value.trim()) || 'Unnamed spot';
      const desc = wrap.querySelector('#spotDesc').innerHTML;
      const pos = newMarker.getLatLng();
      const fileInput = wrap.querySelector('#spotImage');
      const spotClass = wrap.querySelector('#spotClass').value;
      try {
        const ref = await addDoc(collection(db, SPOTS_COLLECTION), { lat: pos.lat, lng: pos.lng, name, description: desc, spotClass, createdAt: serverTimestamp() });
        let imageUrl = '';
        if (fileInput.files[0]) {
          imageUrl = await uploadSpotImage(ref.id, fileInput.files[0]);
          await updateDoc(doc(db, SPOTS_COLLECTION, ref.id), { imageUrl });
        }
        newMarker._spotId = ref.id;
        newMarker.dragging.disable();
        newMarker.setIcon(getSpotIcon(spotClass));
        newMarker.getPopup().setContent(createSpotPopup({ marker: newMarker, spotId: ref.id, name, desc, imageUrl, editMode: false }));
        wrap.querySelector('#saveStatus').textContent = 'Saved!';
        wrap.querySelector('#saveStatus').style.color = 'green';
      } catch (err) {
        wrap.querySelector('#saveStatus').textContent = 'Error: ' + (err.code || err.message || String(err));
        wrap.querySelector('#saveStatus').style.color = 'red';
      }
    };
    addMode = false;
  });
}

async function uploadSpotImage(spotId, file) {
  const r = ref(storage, `spots/${spotId}/image`);
  await uploadBytes(r, file);
  return await getDownloadURL(r);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Toolbar: B, U, Img. Img = open file picker for spot image (pass fileInput). el = contenteditable
function addDescToolbar(el, spotImageInput) {
  const bar = document.createElement('div');
  bar.style.cssText = 'margin:4px 0;font-size:11px;';
  bar.innerHTML = '<button type="button">B</button> <button type="button">U</button> <button type="button">Img</button>';
  bar.querySelectorAll('button')[0].onclick = () => { el.focus(); document.execCommand('bold'); };
  bar.querySelectorAll('button')[1].onclick = () => { el.focus(); document.execCommand('underline'); };
  bar.querySelectorAll('button')[2].onclick = () => { if (spotImageInput) spotImageInput.click(); else { const u = prompt('Image URL:'); if (u) { el.focus(); document.execCommand('insertHTML', false, '<img src="'+u+'" style="max-width:100%">'); } } };
  el.before(bar);
}

function showImageOverlay(url) {
  const el = document.getElementById('imageOverlay');
  el.querySelector('img').src = url;
  el.style.display = 'flex';
  el.onclick = () => { el.style.display = 'none'; el.onclick = null; };
}


function createSpotPopup({ marker, spotId, name, desc, imageUrl, editMode }) {
  const wrap = document.createElement('div');
  wrap.className = 'spot-popup-view';
  if (!editMode) {
    const thumbHtml = imageUrl ? `<img class="spot-thumb" src="${escapeHtml(imageUrl)}" alt="">` : '';
    const editButtonHtml = userRole !== 'visitor' ? '<button type="button" class="edit-spot-btn">Edit</button>' : '';
    wrap.innerHTML = `<div class="spot-popup-title-row">${editButtonHtml}<strong>${escapeHtml(name)}</strong>${thumbHtml}</div><div class="spot-desc">${desc || ''}</div>`;

    if (userRole !== 'visitor') {
      const editBtn = wrap.querySelector('.edit-spot-btn');
      if (editBtn) {
        editBtn.onclick = e => {
          e.preventDefault(); e.stopPropagation();
          marker.getPopup().setContent(createSpotPopup({ marker, spotId, name, desc, imageUrl, editMode: true }));
          marker.getPopup().openPopup();
          marker.dragging.enable();
          marker.once('dragstart', () => marker.getPopup().closePopup());
        };
      }
    }

    const thumb = wrap.querySelector('.spot-thumb');
    if (thumb) thumb.onclick = e => { e.stopPropagation(); showImageOverlay(imageUrl); };
  } else {
    // Add spot class selector
    wrap.innerHTML = `<input class="spot-edit-name" value="${escapeHtml(name)}" type="text">
      <select class="spot-edit-class">
        <option value="default">No Class</option>
        <option value="confirmed">✅ Confirmed</option>
        <option value="risky">⚠️ Risky</option>
        <option value="unsure">❓ Unsure</option>
      </select>
      <input type="file" class="spot-edit-image" accept="image/*" style="display:none">
      <div class="spot-edit-desc" contenteditable>${desc || ''}</div>
      <button type="button" class="save-edit-spot-btn">Save</button>
      <button type="button" class="delete-edit-spot-btn">Delete</button>
      <p class="edit-status"></p>`;
    // Set current class
    const classSel = wrap.querySelector('.spot-edit-class');
    // Try to infer from marker icon html
    let currentClass = 'default';
    if (marker.options.icon && marker.options.icon.options && marker.options.icon.options.html) {
      if (marker.options.icon.options.html.includes('✅')) currentClass = 'confirmed';
      else if (marker.options.icon.options.html.includes('⚠️')) currentClass = 'risky';
      else if (marker.options.icon.options.html.includes('❓')) currentClass = 'unsure';
    }
    classSel.value = currentClass;
    const descEl = wrap.querySelector('.spot-edit-desc');
    addDescToolbar(descEl, wrap.querySelector('.spot-edit-image'));
    wrap.querySelector('.save-edit-spot-btn').onclick = async () => {
      const newName = (wrap.querySelector('.spot-edit-name').value.trim()) || 'Unnamed spot';
      const newClass = classSel.value;
      const fileInput = wrap.querySelector('.spot-edit-image');
      let newImageUrl = imageUrl || '';
      try {
        if (fileInput.files[0]) newImageUrl = await uploadSpotImage(spotId, fileInput.files[0]);
        await updateDoc(doc(db, SPOTS_COLLECTION, spotId), { lat: marker.getLatLng().lat, lng: marker.getLatLng().lng, name: newName, description: descEl.innerHTML, imageUrl: newImageUrl, spotClass: newClass, updatedAt: serverTimestamp() });
        marker.dragging.disable();
        marker.setIcon(getSpotIcon(newClass));
        marker.getPopup().setContent(createSpotPopup({ marker, spotId, name: newName, desc: descEl.innerHTML, imageUrl: newImageUrl, editMode: false }));
      } catch (err) {
        wrap.querySelector('.edit-status').textContent = 'Error: ' + (err.code || err.message || String(err));
        wrap.querySelector('.edit-status').style.color = 'red';
      }
    };
    wrap.querySelector('.delete-edit-spot-btn').onclick = async () => {
      if (!confirm('Are you sure you want to delete this spot?')) return;
      try {
        const { deleteDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        await deleteDoc(doc(db, SPOTS_COLLECTION, spotId));
        map.removeLayer(marker);
      } catch (err) {
        alert('Failed to delete spot: ' + (err.code || err.message || String(err)));
      }
    };
  }
  return wrap;
}

function switchSpotToEditMode(marker, spotId, currentName, currentDesc, currentImageUrl) {
  const wrap = document.createElement('div');
  wrap.innerHTML = `<input type="text" class="spot-edit-name" value="${escapeHtml(currentName)}" style="margin:4px 0;width:100%;box-sizing:border-box;">
    <input type="file" class="spot-edit-image" accept="image/*" style="display:none">
    <div class="spot-edit-desc" contenteditable style="min-height:40px;margin:4px 0;border:1px solid #ccc;padding:4px;font-size:12px;">${currentDesc || ''}</div>
    <button type="button" class="save-edit-spot-btn">Save</button>
    <button type="button" class="delete-edit-spot-btn" style="margin-left:8px;background:#e66;color:#fff;border:1px solid #c00;border-radius:3px;padding:4px 8px;">Delete</button>
    <p class="edit-status" style="margin:4px 0;font-size:12px;"></p>`;
  const descEl = wrap.querySelector('.spot-edit-desc');
  addDescToolbar(descEl, wrap.querySelector('.spot-edit-image'));
  wrap.querySelector('.save-edit-spot-btn').onclick = async () => {
    const name = (wrap.querySelector('.spot-edit-name').value.trim()) || 'Unnamed spot';
    const fileInput = wrap.querySelector('.spot-edit-image');
    let imageUrl = currentImageUrl || '';
    try {
      if (fileInput.files[0]) imageUrl = await uploadSpotImage(spotId, fileInput.files[0]);
      await updateDoc(doc(db, SPOTS_COLLECTION, spotId), { lat: marker.getLatLng().lat, lng: marker.getLatLng().lng, name, description: descEl.innerHTML, imageUrl, updatedAt: serverTimestamp() });
      marker.dragging.disable();
      marker.getPopup().setContent(makeSpotPopupView(marker, spotId, name, descEl.innerHTML, imageUrl));
    } catch (err) { console.error(err); const msg = err.code || err.message || String(err); wrap.querySelector('.edit-status').textContent = 'Error: ' + msg; wrap.querySelector('.edit-status').style.color = 'red'; }
  };
  wrap.querySelector('.delete-edit-spot-btn').onclick = async () => {
    if (!confirm('Are you sure you want to delete this spot?')) return;
    try {
    deleteDoc(doc(db, SPOTS_COLLECTION, spotId));
      map.removeLayer(marker);
    } catch (err) {
      alert('Failed to delete spot: ' + (err.code || err.message || String(err)));
    }
  };
  marker.getPopup().setContent(wrap);
  marker.getPopup().openPopup();
  marker.dragging.enable();
  marker.once('dragstart', () => marker.getPopup().closePopup());
}

// Check if already unlocked
if (sessionStorage.getItem('mapUnlocked') === '1') {
  document.getElementById("gate").style.display = 'none';
  runMapApp();
}