/*
 * KiddieSketch Personalizer — Phase 1 (upload-only)
 * Vanilla JS. No framework, no build step.
 * Activates any element with [data-ks-personalizer].
 * Inject line-item properties into the product form before Add-to-Cart submits.
 */
(function () {
  'use strict';

  var MAX_BYTES = 10 * 1024 * 1024; // 10 MB
  var ALLOWED = ['image/png', 'image/jpeg', 'image/webp'];

  function initAll() {
    var nodes = document.querySelectorAll('[data-ks-personalizer]');
    if (!nodes.length) return;
    nodes.forEach(initOne);
  }

  function initOne(root) {
    if (root.__ksInitialized) return;
    root.__ksInitialized = true;

    var state = {
      apiBase: (root.getAttribute('data-api-base') || '').replace(/\/$/, ''),
      shop: root.getAttribute('data-merchant-shop') || '',
      productId: root.getAttribute('data-product-id') || '',
      productHandle: root.getAttribute('data-product-handle') || '',
      artUrl: '',
      artFilename: '',
      kidName: '',
      message: ''
    };

    var tabs = root.querySelectorAll('[data-ks-tab]');
    var panels = {
      upload: root.querySelector('#ks-tab-upload-' + root.closest('section').id.replace(/^shopify-section-/, '')),
      ai: root.querySelector('#ks-tab-ai-' + root.closest('section').id.replace(/^shopify-section-/, ''))
    };
    // Fall back to first matching panel if section-id lookup fails (edge case in older themes)
    if (!panels.upload) panels.upload = root.querySelector('.ks-personalizer__panel');
    if (!panels.ai) panels.ai = root.querySelectorAll('.ks-personalizer__panel')[1] || null;

    tabs.forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (btn.disabled || btn.classList.contains('is-disabled')) return;
        var name = btn.getAttribute('data-ks-tab');
        tabs.forEach(function (b) {
          var active = b === btn;
          b.classList.toggle('is-active', active);
          b.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        Object.keys(panels).forEach(function (k) {
          if (!panels[k]) return;
          var active = k === name;
          panels[k].classList.toggle('is-active', active);
          panels[k].hidden = !active;
        });
      });
    });

    // Dropzone behavior
    var dropzone = root.querySelector('[data-ks-dropzone]');
    var fileInput = root.querySelector('[data-ks-file-input]');
    var emptyView = root.querySelector('[data-ks-dropzone-empty]');
    var previewView = root.querySelector('[data-ks-dropzone-preview]');
    var previewImg = root.querySelector('[data-ks-preview-img]');
    var removeBtn = root.querySelector('[data-ks-remove]');
    var statusEl = root.querySelector('[data-ks-status]');
    var kidNameEl = root.querySelector('[data-ks-kid-name]');
    var messageEl = root.querySelector('[data-ks-message]');

    if (dropzone) {
      ['dragenter', 'dragover'].forEach(function (evt) {
        dropzone.addEventListener(evt, function (e) {
          e.preventDefault();
          e.stopPropagation();
          dropzone.classList.add('is-drag-over');
        });
      });
      ['dragleave', 'drop'].forEach(function (evt) {
        dropzone.addEventListener(evt, function (e) {
          e.preventDefault();
          e.stopPropagation();
          dropzone.classList.remove('is-drag-over');
        });
      });
      dropzone.addEventListener('drop', function (e) {
        var files = e.dataTransfer && e.dataTransfer.files;
        if (files && files[0]) handleFile(files[0]);
      });
    }

    if (fileInput) {
      fileInput.addEventListener('change', function (e) {
        var f = e.target.files && e.target.files[0];
        if (f) handleFile(f);
      });
    }

    if (removeBtn) {
      removeBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        resetUpload();
      });
    }

    if (kidNameEl) {
      kidNameEl.addEventListener('input', function () {
        state.kidName = kidNameEl.value.trim().slice(0, 40);
        syncHiddenInputs();
      });
    }

    if (messageEl) {
      messageEl.addEventListener('input', function () {
        state.message = messageEl.value.trim().slice(0, 120);
        syncHiddenInputs();
      });
    }

    function setStatus(text, kind) {
      if (!statusEl) return;
      statusEl.textContent = text || '';
      statusEl.classList.remove('is-error', 'is-success', 'is-loading');
      if (kind) statusEl.classList.add('is-' + kind);
    }

    function resetUpload() {
      state.artUrl = '';
      state.artFilename = '';
      if (fileInput) fileInput.value = '';
      if (previewImg) previewImg.removeAttribute('src');
      if (emptyView) emptyView.style.display = '';
      if (previewView) previewView.hidden = true;
      syncHiddenInputs();
      setStatus('');
    }

    function handleFile(file) {
      if (!file) return;
      if (ALLOWED.indexOf(file.type) === -1) {
        setStatus('Please upload a PNG, JPG, or WEBP image.', 'error');
        return;
      }
      if (file.size > MAX_BYTES) {
        setStatus('That file is too big — max 10 MB.', 'error');
        return;
      }

      // Local preview
      var reader = new FileReader();
      reader.onload = function (ev) {
        if (previewImg) previewImg.src = ev.target.result;
        if (emptyView) emptyView.style.display = 'none';
        if (previewView) previewView.hidden = false;
      };
      reader.readAsDataURL(file);

      // Upload to API
      setStatus('Uploading your drawing', 'loading');
      uploadToApi(file).then(function (result) {
        state.artUrl = result.url;
        state.artFilename = result.filename || file.name;
        syncHiddenInputs();
        setStatus('Ready to add to cart!', 'success');
      }).catch(function (err) {
        console.error('[KS Personalizer] upload failed', err);
        setStatus('Upload failed — please try again or use a smaller image.', 'error');
        resetUpload();
      });
    }

    function uploadToApi(file) {
      if (!state.apiBase) {
        return Promise.reject(new Error('Personalizer API not configured'));
      }
      var form = new FormData();
      form.append('file', file, file.name);
      form.append('shop', state.shop);
      form.append('product_id', state.productId);
      form.append('product_handle', state.productHandle);

      return fetch(state.apiBase + '/upload-art', {
        method: 'POST',
        body: form,
        credentials: 'omit'
      }).then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      }).then(function (data) {
        if (!data || !data.url) throw new Error('Bad response — missing url');
        return data;
      });
    }

    // Hidden inputs injected into the nearest product form so properties[_xyz]
    // gets submitted with the Add-to-Cart POST.
    function syncHiddenInputs() {
      var form = findProductForm(root);
      if (!form) return;

      setHidden(form, 'properties[_custom_art_url]', state.artUrl);
      setHidden(form, 'properties[_custom_art_filename]', state.artFilename);
      setHidden(form, 'properties[_custom_art_type]', state.artUrl ? 'upload' : '');
      setHidden(form, 'properties[_kid_name]', state.kidName);
      setHidden(form, 'properties[_message_to_mum]', state.message);
    }

    function setHidden(form, name, value) {
      var input = form.querySelector('input[name="' + name + '"][data-ks-injected]');
      if (!value) {
        if (input) input.remove();
        return;
      }
      if (!input) {
        input = document.createElement('input');
        input.type = 'hidden';
        input.name = name;
        input.setAttribute('data-ks-injected', 'true');
        form.appendChild(input);
      }
      input.value = value;
    }

    function findProductForm(el) {
      // Prefer the closest form with data-product-form, then form[action*="/cart/add"]
      var node = el;
      while (node && node !== document.body) {
        node = node.parentElement;
        if (!node) break;
        var f = node.querySelector('form[action*="/cart/add"]');
        if (f) return f;
      }
      return document.querySelector('form[action*="/cart/add"]');
    }

    // Block Add-to-Cart if upload is in-flight. Graceful: if there's no upload
    // at all, cart proceeds as normal (personalization is optional).
    var productForm = findProductForm(root);
    if (productForm) {
      productForm.addEventListener('submit', function (e) {
        if (statusEl && statusEl.classList.contains('is-loading')) {
          e.preventDefault();
          setStatus("Hang on — we're still uploading your drawing.", 'error');
        }
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }

  // Shopify section reloads in the theme editor trigger this event.
  document.addEventListener('shopify:section:load', function (e) {
    var root = e.target && e.target.querySelector && e.target.querySelector('[data-ks-personalizer]');
    if (root) initOne(root);
  });
})();
