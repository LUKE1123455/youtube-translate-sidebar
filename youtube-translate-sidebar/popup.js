// YouTube Translation Sidebar - Popup Script
document.addEventListener('DOMContentLoaded', () => {
  const engineSelect = document.getElementById('engine');
  const youdaoFields = document.getElementById('youdao-fields');
  const youdaoAppKey = document.getElementById('youdao-app-key');
  const youdaoAppSecret = document.getElementById('youdao-app-secret');
  const btnSave = document.getElementById('btn-save');
  const saveStatus = document.getElementById('save-status');

  // Load settings
  chrome.storage.sync.get({
    engine: 'google',
    youdaoAppKey: '',
    youdaoAppSecret: ''
  }, settings => {
    engineSelect.value = settings.engine;
    youdaoAppKey.value = settings.youdaoAppKey || '';
    youdaoAppSecret.value = settings.youdaoAppSecret || '';
    toggleYoudaoFields();
  });

  // Toggle Youdao fields
  engineSelect.addEventListener('change', toggleYoudaoFields);

  function toggleYoudaoFields() {
    youdaoFields.style.display = engineSelect.value === 'youdao' ? '' : 'none';
  }

  // Save
  btnSave.addEventListener('click', () => {
    const settings = {
      engine: engineSelect.value,
      youdaoAppKey: youdaoAppKey.value.trim(),
      youdaoAppSecret: youdaoAppSecret.value.trim()
    };

    chrome.storage.sync.set(settings, () => {
      saveStatus.textContent = '✓ 已保存';
      saveStatus.className = 'save-status save-success';
      setTimeout(() => {
        saveStatus.textContent = '';
      }, 2000);
    });
  });
});
