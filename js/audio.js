(function () {
  const sounds = {
    hover: 'assets/audio/hover.wav',
    click: 'assets/audio/click.wav',
    create: 'assets/audio/create.wav',
    join: 'assets/audio/join.wav',
    key: 'assets/audio/key.wav',
    message: 'assets/audio/message.wav',
    start: 'assets/audio/start.wav',
    success: 'assets/audio/success.wav',
    warning: 'assets/audio/warning.wav',
    deny: 'assets/audio/deny.wav',
    download: 'assets/audio/download.wav',
    check: 'assets/audio/check.wav',
    card: 'assets/audio/card.wav',
    draw: 'assets/audio/draw.wav',
    uno: 'assets/audio/uno.wav',
    theme: 'assets/audio/unoplay-theme.wav'
  };

  const roomPrefix = '../assets/audio/';
  let muted = localStorage.getItem('playuno_sound_muted') === '1';
  let theme = null;
  let unlocked = false;

  function path(name) {
    const base = location.pathname.includes('/room/') ? roomPrefix : 'assets/audio/';
    return base + name + '.wav';
  }

  function play(name, volume = 0.55) {
    if (muted || !sounds[name] || name === 'theme') return;
    try {
      const audio = new Audio(path(name));
      audio.volume = volume;
      audio.play().catch(() => {});
    } catch {}
  }

  function unlock() {
    unlocked = true;
  }

  function toggleMute() {
    muted = !muted;
    localStorage.setItem('playuno_sound_muted', muted ? '1' : '0');
    if (muted) stopTheme();
    return muted;
  }

  function startTheme() {
    if (muted || theme || !unlocked) return;
    try {
      theme = new Audio(path('unoplay-theme'));
      theme.loop = true;
      theme.volume = 0.12;
      theme.play().catch(() => { theme = null; });
    } catch {}
  }

  function stopTheme() {
    if (!theme) return;
    theme.pause();
    theme.currentTime = 0;
    theme = null;
  }

  function bind(root = document) {
    root.querySelectorAll('[data-sound]').forEach((el) => {
      if (el.dataset.soundBound) return;
      el.dataset.soundBound = '1';
      el.addEventListener('pointerenter', () => {
        unlock();
        if (el.dataset.sound === 'hover') play('hover', 0.20);
      });
      el.addEventListener('click', () => {
        unlock();
        const sound = el.dataset.sound;
        if (sound && sound !== 'hover') play(sound);
        if (!muted) startTheme();
      });
    });
  }

  document.addEventListener('pointerdown', () => {
    unlock();
    if (!muted) startTheme();
  }, { once: true });

  window.PlayUnoAudio = Object.freeze({
    play,
    bind,
    toggleMute,
    startTheme,
    stopTheme,
    isMuted: () => muted
  });

  document.addEventListener('DOMContentLoaded', () => bind());
})();
