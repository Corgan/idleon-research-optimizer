// ===== SAVE-IMPORT.JS — Shared save loading for standalone calculator pages =====
// Eliminates boilerplate: JSON parse, loadSaveData, char dropdown population.

import { loadSaveData } from '../save/loader.js';
import { ClassNames } from '../stats/data/game/customlists.js';

/**
 * Parse save JSON from a textarea, call loadSaveData, populate a character
 * dropdown, and invoke a callback on success.
 *
 * @param {object}   opts
 * @param {string}   opts.textareaId  — id of the JSON textarea
 * @param {string}   opts.charSelId   — id of the character <select>
 * @param {string}   opts.msgId       — id of the status message element
 * @param {function} opts.onLoaded    — callback(raw, chars) on success
 */
export function doImport(opts) {
  var msgEl = document.getElementById(opts.msgId);
  try {
    var raw = JSON.parse(document.getElementById(opts.textareaId).value);
    loadSaveData(raw);

    var chars = raw.charNames || [];
    var sel = document.getElementById(opts.charSelId);
    sel.innerHTML = '';
    var data = raw.data || raw;
    chars.forEach(function(name, i) {
      var classId = data['CharacterClass_' + i];
      var className = (ClassNames[classId] || '?').replace(/_/g, ' ');
      var o = document.createElement('option');
      o.value = i;
      o.textContent = i + ': ' + name + ' (' + className + ')';
      sel.appendChild(o);
    });
    sel.disabled = false;

    msgEl.className = 'import-msg ok';
    msgEl.textContent = '\u2713 Loaded ' + chars.length + ' characters.';
    opts.onLoaded(raw, chars);
  } catch (err) {
    msgEl.className = 'import-msg err';
    msgEl.textContent = '\u2717 ' + err.message;
    console.error(err);
  }
}

/**
 * Wire a file input to read JSON into a textarea then trigger import.
 *
 * @param {string}   inputId    — id of the <input type="file">
 * @param {string}   textareaId — id of the JSON textarea
 * @param {function} importFn   — function to call after loading file text
 */
export function wireFileInput(inputId, textareaId, importFn) {
  var el = document.getElementById(inputId);
  if (!el) return;
  el.addEventListener('change', function(e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(ev) {
      document.getElementById(textareaId).value = ev.target.result;
      importFn();
    };
    reader.readAsText(file);
  });
}
