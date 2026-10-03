// Thème clair par défaut ; applique le thème mémorisé avant le premier rendu (évite le flash clair/sombre).
(function () {
  try {
    var t = localStorage.getItem('tf.theme');
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  } catch (e) { /* stockage indisponible : thème par défaut */ }
})();
