/* ==== HFD Unified Bundle (with embedded PHOTO_UPLOAD_FOLDERS map) ====
   - JSON/iOS-safe save & upload
   - Enforces exact Sheet header names (keeps trailing colons)
   - Includes default PHOTO_UPLOAD_FOLDERS from your archive; overrideable via window.PHOTO_UPLOAD_FOLDERS
*/

;(()=>{
  'use strict';

  function req(cond, msg){ if(!cond) throw new Error(msg); }
  const log = (...a)=>console.log("[HFD]", ...a);
  const warn = (...a)=>console.warn("[HFD]", ...a);
  const err  = (...a)=>console.error("[HFD]", ...a);

  req(typeof window !== "undefined", "window not available");
  req(!!window.WEBAPP_URL, "WEBAPP_URL is not defined. Set window.WEBAPP_URL='https://script.google.com/.../exec' BEFORE loading this bundle.");

  // ---- Default folder map (from your repo) ----
  const DEFAULT_PHOTO_UPLOAD_FOLDERS = {
  "Photo:": "1a-g1z9wQmo5wSr8oIidoLg2wLt4BTwxO",
  "Roof Access Photo:": "1tlRVFlcBoWSG7jhs9uScwO93yE2qLccw",
  "Alarm Photo:": "1lAEJdYGwhPbAIUToHRnGvoz8X4hOJqOb",
  "Elevator Shutoff Photo:": "1eUFsCFkjbpzSnoUf2DK_lyMQyt3vG8Q3",
  "Gas Shutoff Photo:": "1grghRBy6VsryKhWephqeuJs_Uixq-sJE",
  "Electrical Shutoff Photo:": "1YlVxc0h6dj0wp5oCeV-0aB8sWGtO_vfm",
  "Water Shutoff Photo:": "1zGqySR-Sks_YpDCj-C4lnhPM595TWivg",
  "Sprinkler Shutoff Photo:": "1p7aFq3gviIN4Bh8S7iQm-eDS6HaDNmK_",
  "Fire Pump Photo:": "1KKfbSQdha4NiKSQlNRTigUZPypE7RKNN",
  "Tanks Photo:": "1p2kmKIzyB_8PKwM8sqhAK9W6P75f5bQS",
  "Combustibles Photo:": "1-bvhTaL0en9zNsC8ZaLR6kdFWD5xw0ty",
  "Hazmat Photo:": "1eq2NtwoCga_o8s-A6Tc_QagCB2G-e2pQ"
};

  // Allow override, but default to embedded map
  const PHOTO_UPLOAD_FOLDERS = Object.assign({}, DEFAULT_PHOTO_UPLOAD_FOLDERS, (window.PHOTO_UPLOAD_FOLDERS || {}));

  function ensureHeaderExact(field){
    if (typeof field !== "string") throw new Error("field must be a string");
    if (!/:$/.test(field)) {
      if (/(photo|alarm|roof|elevator|shutoff|fdc|sprinkler|panel|knox|roof access)/i.test(field)) {
        const withColon = field.trim().replace(/\s*:?$/, ":");
        warn(`Field "{field}" normalized to "{withColon}" (added ":")`);
        return withColon;
      }
    }
    return field;
  }

  async function postJSON(url, body){
    const res = await fetch(url, { method:"POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify(body) });
    const ct = res.headers.get("content-type") || "";
    let data = null;
    try{ data = ct.includes("application/json") ? await res.json() : await res.text(); }catch(e){ err("parse error", e); }
    if(!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(data)}`);
    return data;
  }
  async function getJSON(url){
    const res = await fetch(url, { method:"GET", headers: {"Accept":"application/json"} });
    const ct = res.headers.get("content-type") || "";
    const data = ct.includes("application/json") ? await res.json() : await res.text();
    if(!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(data)}`);
    return data;
  }

  const api = {
    async getRows(){
      const u = new URL(window.WEBAPP_URL);
      u.searchParams.set("fn", "rows");
      return await getJSON(u.toString());
    },
    async saveRow(payload){
      req(payload && typeof payload === "object", "payload object required");
      const out = await postJSON(window.WEBAPP_URL, { fn:"save", payload });
      log("saveRow ok", out);
      return out;
    },
    async uploadPhoto({field, filename, dataUrl}){
      req(field, "field required"); req(filename, "filename required");
      req(dataUrl && /^data:image\//.test(dataUrl), "dataUrl must be data:image/*");
      const normalizedField = ensureHeaderExact(field);
      const folderId = PHOTO_UPLOAD_FOLDERS[normalizedField];
      if(!folderId) warn(`No folderId found for "${normalizedField}". Ensure server maps this field.`);
      const out = await postJSON(window.WEBAPP_URL, { fn:"upload", field: normalizedField, filename, dataUrl });
      log("uploadPhoto ok", out);
      return out;
    }
  };

  const dom = {
    collectFormPayload(form){
      const payload = {};
      const fields = form.querySelectorAll("[data-field]");
      fields.forEach(el=>{
        const key = el.getAttribute("data-field");
        if(!key) return;
        if (el.type === "checkbox") payload[key] = !!el.checked ? "TRUE" : "";
        else payload[key] = (el.value ?? "").toString();
      });
      return payload;
    },
    bindSave(formEl, saveBtnEl, onDone){
      saveBtnEl?.addEventListener("click", async (e)=>{
        e.preventDefault();
        try{ await api.saveRow(dom.collectFormPayload(formEl)); onDone?.(true); }
        catch(ex){ err("Save failed", ex); alert("Save failed: " + ex.message); onDone?.(false, ex); }
      });
    },
    bindUploads(containerEl){
      const buttons = containerEl.querySelectorAll("[data-upload-field]");
      buttons.forEach(btn=>{
        const field = btn.getAttribute("data-upload-field");
        const inputSel = btn.getAttribute("data-upload-input") || "input[type=file]";
        const input = containerEl.querySelector(inputSel);
        if(!input){ warn("No file input for", field); return; }
        btn.addEventListener("click", async (e)=>{
          e.preventDefault();
          if(!input.files || !input.files[0]){ alert("Choose a file first"); return; }
          const file = input.files[0];
          const filename = file.name || "upload.jpg";
          const fr = new FileReader();
          fr.onerror = () => alert("File read error");
          fr.onload = async () => {
            try{ await api.uploadPhoto({ field, filename, dataUrl: fr.result }); alert("Upload complete"); }
            catch(ex){ err("Upload failed", ex); alert("Upload failed: " + ex.message); }
            finally{ input.value = ""; }
          };
          fr.readAsDataURL(file);
        });
      });
    }
  };

  window.HFD = Object.assign(window.HFD || {}, { api, dom, PHOTO_UPLOAD_FOLDERS });
})();
